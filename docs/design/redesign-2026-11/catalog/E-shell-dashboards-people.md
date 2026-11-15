# E — App shell, global tools, dashboards, admin, people

Catalogue ahead of the visual redesign. Read-only pass over the worktree at `main` = `eac5a928` (14/11/2026). Nothing was run, no table was counted: every statement is from code or docs, with `file:line`. "Not verified" = not checked.

Tags: **[BROKEN]** does not work / shows wrong · **[MISSING]** · **[EXTRA]** dead / unreachable / duplicated · **[INCONSISTENT]** · **[LOCKED]** locked owner decision (CLAUDE.md), do not propose changing.

Contents: A navigation map · B people · C per page / tool (C1 shell, C2 login, C3 shared UI helpers, C4 session / version / offline, C5 command palette, C6 command center, C7 notifications, C8 «Πίνακας Ελέγχου», C9 settings / trash / error log, then «Πίνακας Διοίκησης», «Η Απόδοσή μου», «Έλεγχος Μετρήσεων», `core/metrics.js`, «Ιστορικό Ενεργειών», assistant) · D design system as coded · E cross-app inconsistencies.

---

## A. Navigation map

Source: `NAV` in `core/router.js:23-102`, the `switch` in `navigate()` `core/router.js:362-460`, client permission matrix `PERMS` in `config.js:353-366`, `can()` in `core/auth.js:76-78`.

### A1. Client permission matrix (what the browser hides; the Worker enforces separately)

| perm key | owner | dispatcher | management | accountant | warehouse |
|---|---|---|---|---|---|
| planning | full | full | view | view | view |
| orders | full | full | view | view | view |
| clients | full | full | full | full | none |
| maintenance | full | view | full | view | none |
| drivers | full | view | full | full | none |
| costs | full | none | view | full | none |
| settings | full | none | full | none | none |
| performance | full | view | view | view | none |
| ceo_dashboard | full | none | none | none | none |

Gate rule: a group shows if `can(group.perm) !== 'none'` or one of its items has its own perm the role holds; an item shows if its `role` matches (when set) and its own perm, else the group perm, is not `'none'` (`core/router.js:144-157`). `navigate()` repeats the perm check and refuses with a red toast «Δεν έχετε πρόσβαση σε αυτή τη σελίδα» (`core/router.js:277-291`).

### A2. Menu

| # | Group (perm) | Item label | Page id | Render function | Gate (who sees it) | Status | `file:line` |
|---|---|---|---|---|---|---|---|
| 1 | Σχεδιασμός (planning) | Πίνακας Ελέγχου | `dashboard` | `renderDashboard()` | all 5 roles | live | `router.js:25`, `:364` |
| | | Εβδομαδιαίο Διεθνών | `weekly_intl` | `renderWeeklyIntl()` | all 5 | live (v4 board, `FEATURES.WI_V2:'on'` `config.js:417`) | `router.js:26`, `:365` |
| | | Εβδομαδιαίο Εθνικών | `weekly_natl` | `renderWeeklyNatl()` | all 5 | live (v5 board, `WN_V5:'on'`; `WN_ROAD`, `WN_COMPOSE` = pilot) | `router.js:27`, `:366` |
| 2 | Ημερήσια Λειτουργία (planning) | Ημερήσιο Πλάνο | `daily_ops` | `renderDailyOps()` | all 5 | live | `router.js:37`, `:367` |
| | | Πίνακας Ράμπας | `daily_ramp` | `renderDailyRamp()` | all 5 | live | `router.js:38`, `:368` |
| 3 | Παραγγελίες (orders) | Παραγγελίες | `orders` | `renderOrders()` | all 5 | live; old ids `orders_intl`, `orders_natl`, `invoicing` are aliases into this hub (`router.js:265-275`) | `router.js:44`, `:370` |
| | | Τοποθεσίες | `locations` | `renderLocations()` | all 5 | live | `router.js:45`, `:371` |
| 4 | Πελάτες & Συνεργάτες (clients) | Πελάτες | `clients` | `renderEntity('clients')` | all but warehouse | live | `router.js:48`, `:373` |
| | | Συνεργάτες | `partners` | `renderEntity('partners')` | all but warehouse | live | `router.js:49`, `:374` |
| 5 | Οδηγοί (drivers) | Οδηγοί | `drivers` | `renderEntity('drivers')` | all but warehouse | live | `router.js:52`, `:387` |
| | | Μισθοδοσία Οδηγών | `payroll` | `renderPayroll()` | item perm `costs`: owner, accountant, management | live | `router.js:56`, `:391` |
| 6 | Συντήρηση (maintenance) | Επισκόπηση Στόλου | `maint_dash` | `renderMaintDash()` | all but warehouse | live | `router.js:59`, `:377` |
| | | Εντολές Εργασίας | `maint_req` | `renderMaintRequests()` | all but warehouse | live | `router.js:60`, `:378` |
| | | Λήξεις Εγγράφων | `maint_expiry` | `renderExpiryAlerts()` | all but warehouse | live | `router.js:61`, `:379` |
| | | Ιστορικό Service | `maint_svc` | `renderServiceRecords()` | all but warehouse | live | `router.js:62`, `:380` |
| 7 | Στόλος (maintenance) | Φορτηγά | `trucks` | `renderEntity('trucks')` | all but warehouse | live | `router.js:65`, `:384` |
| | | Ρυμούλκες | `trailers` | `renderEntity('trailers')` | all but warehouse | live | `router.js:66`, `:385` |
| | | Συνεργεία | `workshops` | `renderEntity('workshops')` | all but warehouse | live | `router.js:67`, `:383` |
| | | Ιστορικό Φορτηγών | `maint_trucks` | `renderTrucksHistory()` | all but warehouse | live | `router.js:68`, `:381` |
| | | Ιστορικό Ρυμουλκών | `maint_trailers` | `renderTrailersHistory()` | all but warehouse | live | `router.js:69`, `:382` |
| 8 | Οικονομικά (orders) | Ισοζύγιο Παλετών | `pallet_ledger` | `renderPalletLedger()` | all 5 (group perm `orders`) | live | `router.js:72`, `:375` |
| | | Έξοδα Δρομολογίων | `expenses` | `renderExpenses()` | item perm `costs`: owner, accountant, management | live | `router.js:76`, `:393` |
| | | TRIP PnL | `costs` | `renderTripPnl()` | `role:'owner'` | live | `router.js:77`, `:403` |
| 9 | Ανάλυση (ceo_dashboard) | Πίνακας Διοίκησης | `ceo_dashboard` | `renderCEODashboard()` | owner | live | `router.js:80`, `:410` |
| | | Η Απόδοσή μου | `performance` | `renderPerformance()` | item perm `performance`: all but warehouse | live | `router.js:84`, `:412` |
| 10 | Διαχείριση (settings) | Ρυθμίσεις | `settings` | `showComingSoon('Ρυθμίσεις', …)` | owner, management (`can('settings')==='full'`) | **coming soon** — placeholder text only | `router.js:87`, `:414-421` |
| | | Έλεγχος Μετρήσεων | `metrics_audit` | `renderMetricsAudit()` | `role:'owner'` (+ role check in the route) | live | `router.js:90`, `:433-439` |
| | | Κάδος | `trash` | `renderTrashViewer()` (`core/utils.js:1875`) | owner, management | live (this browser's deletions only) | `router.js:91`, `:422-425` |
| | | Καταγραφή Σφαλμάτων | `error_log` | `renderErrorLog()` (`core/utils.js:1133`) | `role:'owner'` | live (this browser's errors only) | `router.js:92`, `:426-432` |
| | | Ιστορικό Ενεργειών | `audit_trail` | `renderAuditTrail()` | menu: owner, management (group perm); route has no `can()` gate, the module checks the role | live | `router.js:95`, `:445-449` |
| | | Ειδοποιήσεις | `notifications` | `renderNotifications()` | item perm `planning`: all 5 | live | `router.js:100`, `:440-444` |

### A3. Routes that exist but are not in the menu

| Page id | What it renders | Reachable from | Status | `file:line` |
|---|---|---|---|---|
| `costs_dash` | `showComingSoon('Πίνακας Κόστους', …)` | hash / stale `tms_page` only; no caller in `modules/` or `core/` | hidden, coming soon | `router.js:398-402` |
| `pl` | `showComingSoon('Κερδοφορία', …)` | same | hidden, coming soon | `router.js:404-408` |
| `orders_intl`, `orders_natl`, `invoicing` | alias → `orders` with preset scope/view | dashboard buttons, bell alerts, bookmarks | live alias | `router.js:265-275` |
| any other id (e.g. removed `weekly_pickups`) | «Άγνωστη σελίδα» + «Δεν έχει υλοποιηθεί ακόμη» + «Ζητήθηκε: `id` — ο σύνδεσμος είναι λάθος ή η σελίδα καταργήθηκε.» | hash, stale `tms_page` | fallback | `router.js:28-34`, `:451-459` |

Menu behaviour: groups collapse per browser (`tms_nav_grp_<i>_collapsed`), first group open by default, the group of the current page always open (`router.js:111-123`, `:176-185`); sidebar collapse to icons persists (`tms_sidebar_collapsed`, `:205-212`); ≤768px the sidebar is an off-canvas drawer with backdrop and closes after each navigation (`:216-229`, `:300-314`); topbar shows «group / label» (`:342-347`); page id is mirrored in the URL hash and `tms_page` (`:293-298`); nav items are real `<a href="app.html#id">` so middle-click / new tab work (`:164-173`).

### A4. Findings — navigation

| Tag | Finding | Evidence |
|---|---|---|
| [BROKEN] | The command palette lists items the role cannot open: it checks the group perm and `item.role` but not `item.perm`. A dispatcher finds «Μισθοδοσία Οδηγών» and «Έξοδα Δρομολογίων» there and gets the red no-access toast; and it drops whole groups by group perm, so «Η Απόδοσή μου» and «Ειδοποιήσεις» (item perms the role holds) are missing for dispatcher / accountant / warehouse. | `core/command-palette.js:21-27` vs `core/router.js:144-157` |
| [EXTRA] | «Ρυθμίσεις» is a menu entry that opens a placeholder («Δεν έχει υλοποιηθεί ακόμη … Οθόνη ρυθμίσεων δεν έχει προγραμματιστεί»). | `router.js:87`, `:414-421` |
| [EXTRA] | `costs_dash` and `pl` routes: no menu entry, no caller; two coming-soon bodies nobody reaches. The `item.soon` pill «σύντομα» is coded but no NAV item sets `soon`. | `router.js:398-408`, `:172` |
| [INCONSISTENT] | Menu is Greek, but the first sidebar control is English: «Quick jump…», tooltip "Quick jump (⌘K)", sidebar toggle title "Collapse". | `router.js:132-135`, `app.html:30` |
| [INCONSISTENT] | «TRIP PnL» is the only English menu label — deliberate (owner's term, comment says do not translate). Treat as [LOCKED] naming. | `router.js:20-21`, `:77` |
| [INCONSISTENT] | Icons repeat inside the menu: `truck` for Φορτηγά and Ρυμούλκες, `coins` for three money pages, `clock` for three history pages, `layout_grid` for both dashboards, `list_checks` twice, `alert_triangle` twice, `tool` twice. In the collapsed (icon-only) sidebar these are indistinguishable except by tooltip. | `router.js:25-100` |
| [INCONSISTENT] | «Ισοζύγιο Παλετών» sits under «Οικονομικά» with group perm `orders`, so warehouse sees a finance group containing one item. | `router.js:71-72`, `config.js:365` |
| [INCONSISTENT] | Three different gates for the admin group's items: `can('settings')` (settings, trash), `role==='owner'` in NAV plus `can('settings')` in the route plus a second role check inside the renderer (error log), module-internal role check (audit trail). | `router.js:414-449`, `core/utils.js:1136` |
| [INCONSISTENT] | Footer injected 2 s after every navigation says «v2.0 · year»; the login page says «v1.0 · Petras Group TMS · 2026». Neither is the real build (`SW_VERSION`). | `router.js:469-474`, `index.html:310`, `sw.js:10` |
| [MISSING] | No "you are here" for alias routes: a bell alert that opens `invoicing` lands on «Παραγγελίες» with a preset view; the topbar shows only «Παραγγελίες / Παραγγελίες»-level breadcrumb (label equals section → single word). | `router.js:343-347` |

---
## B. The people

Sources: `docs/` only (plus `CLAUDE.md`). Anything not stated in a document is marked "(inference)". First names only.

### B1. People table

| Person | App role | Real job | Working hours | Pages used daily | What they do there | Device / context | Go-live in app | Source |
|---|---|---|---|---|---|---|---|---|
| Δημήτρης (owner) | owner | Owner / founder: "approval & strategy". Not a developer; judges results, not code. Merges PRs, runs DB migrations and Worker deploys. | not found in docs (runs risky changes after 15:00, often evenings) | Not stated as a daily list. Only user of TRIP PnL and P&L prints; owner-only: Έλεγχος Μετρήσεων, Καταγραφή Σφαλμάτων. Πίνακας Ελέγχου "how are we doing" (premortem wording). | Reviews, approves designs one question at a time, prints trip result (P&L) sheets. | Πίνακας Ελέγχου is "the only page with a real mobile use case (glance outside the office)" per a design audit, person not named (inference that this is the owner). | n/a | `docs/prompts/HANDOFF.md:14-22`; `docs/data-audit/2026-09/2026-09-08-company-handbook.md:65-66`; `docs/design/prints-pnl-week-2026-11-03.md:85-89,118`; `docs/data-audit/2026-09/2026-09-03-fix-round.md` (13/9 block, nav owner-only); `docs/design/DEEP_AUDIT_2026-08-04/dashboard.md:125-129`; `docs/premortems/PreMortem-dashboard.md:28-31` |
| Δημήτρης (dispatcher, not the owner) | dispatcher | International dispatcher; "Master Planner" in the target org chart. | Team 05:30–14:30; his morning actions mapped from the audit log window 05:00–10:00. | Παραγγελίες (international), Τοποθεσίες, Εβδομαδιαίο Διεθνών | New international orders with multiple stops, Veroia Switch, national groupage, edit/copy/print; creates locations; on the weekly board assigns truck/driver/partner, matches import to export, groups, moves weeks, prints. Morning job: assign the day's unassigned export loadings. | not found in docs | In production with real data from 12/8/2026 (team-level; "pilot with dispatchers only" on 8/9) | `docs/data-audit/2026-09/2026-09-14-dispatchers-morning.md:3-29`; `docs/data-audit/2026-09/2026-09-08-company-handbook.md:58,65-73`; `CLAUDE.md` (module status) |
| Παντελής | dispatcher | Daily control ("Control Tower" in the target org chart). | Team 05:30–14:30; 29/77 order updates fall in 05:00–10:00. | Ημερήσιο Πλάνο, Πίνακας Ράμπας, Εβδομαδιαίο Διεθνών (assignments, routes, adding imports to loads); also asked for Service entry (Συντήρηση) for dispatchers. | Stamps "Φορτώθηκε / Παραδόθηκε" per stop, "Καθυστέρησε" with reason, day change, ETA; ramp times and "Ολοκληρώθηκε"; partner assignments; reads the printed weekly sheet and annotates it. | Desktop browser (inference from right-click → new tab request). Sends feedback as WhatsApp screenshots with red marks. Printed A4 weekly sheet. | same as above (12/8/2026, team-level) | `docs/data-audit/2026-09/2026-09-14-dispatchers-morning.md:11-17`; `docs/design/2026-09-15-pantelis-daily-ops-brief.md:1-27`; `docs/DECISION_LOG.md:1442-1444,1906-1908,2133-2140,2992-2993,6243-6249`; `docs/design/week-print/README.md:26-38`; `docs/audit-findings/PANTELIS_NOTES_2026-08-25.md` |
| Σωτήρης | dispatcher | National dispatcher, "Chief Ops". | Team 05:30–14:30; national notifications land "at 05:30". | Εβδομαδιαίο Εθνικών (v5 board: Πίνακας Βέροιας, assignment); reads the printed international weekly sheet. | Enters national orders, composes loads, assigns trucks/partners to ΚΑΘΟΔΟΣ/ΑΝΟΔΟΣ and to the national leg of Veroia Switch loads; sends reports of problems (report of 8/11). | Worked from a weekly Excel plan before; prints. Device not found in docs. | Did not enter anything in Aug–Sep ("we started with international only"). National v5 start day ("L") set to 24/10/2026; his entries appear in the audit log by 31/10. Exact personal start date: not found in docs. | `docs/data-audit/2026-08/00_INVENTORY.md:256-259`; `docs/data-audit/2026-09/2026-09-03-fix-round.md:801`; `docs/DECISION_LOG.md:4600,4717-4718,6139,6244`; `docs/national-v5/usability-test-2026-11-02.md:1-13`; `docs/sessions/2026-10-28-dimitris-v5-real-user-test.md:3`; `docs/sessions/2026-10-31-dimitris-081-executed.md:9` |
| Θοδωρής | management | Fleet / equipment + HR ("εξοπλισμός + HR"); enters driver payroll and payments. | not found in docs (team hours) (inference) | Συντήρηση (Επισκόπηση Στόλου, Εντολές Εργασίας, Λήξεις Εγγράφων, Ιστορικό Service), Στόλος (Φορτηγά, Ρυμούλκες, Συνεργεία), Οδηγοί, Μισθοδοσία Οδηγών. Planning pages are read-only for him. | Work orders (create → complete), document expiry dates, service history, driver payroll entries and bulk payment; wants action lists ("what do I do"), not showcase screens. | Desktop browser; one finding traced to a browser set to English (US) showing dates month-first. Driver on the road phones him, does not open the app. | 14/9/2026 | `docs/data-audit/2026-09/2026-09-03-fix-round.md:761-799`; `docs/design/2026-09-15-thodoris-screens-brief.md:1-30`; `docs/data-audit/2026-09/2026-09-27-expiry-dates-check.md:3,16`; `docs/premortems/PreMortem-maint_req.md:25`; `docs/premortems/PreMortem-maint_dash.md:35`; `docs/DECISION_LOG.md:1513-1517,1617` |
| Αλεξία | accountant | Accounting: pallet exchange (fully hers) + trip expenses entry (fuel, tolls, partner freight, DKV import). | not found in docs | Ισοζύγιο Παλετών (incl. weekly view and "Ελέγχθηκε" tick), Έξοδα Δρομολογίων; Παραγγελίες › "Χωρίς τιμή" and quick correction. | Confirms pallet movements, uploads loading slips that come back with the paperwork, enters costs per round trip, imports the fuel-card files, weekly check of the pallet week. | Desktop (inference). Paper slips arrive physically. Sent requirements as a file plus messages. | 8/9/2026 | `docs/DECISION_LOG.md:1048,1626,1765-1767,4305`; `docs/PALLETS_F2_FEEDERS.md:106-119`; `docs/design/pallets-weekly-view-2026-11-02.md:178,321`; `docs/data-audit/2026-10/2026-10-27-alexia-pallets.md:4`; `docs/superpowers/specs/2026-09-07-trip-expenses-design.md:3`; `docs/sessions/2026-10-20-dimitris-invoice-without-slips.md:4` |
| Ειρήνη | accountant (same role as Αλεξία; the app does not separate the two jobs) | Invoicing accountant. The ERP issues invoices; she records the invoice number/date in the app. | Daily, mornings (stated rhythm); weekly close on Monday; monthly partner invoices. | Παραγγελίες (Τιμολόγηση / "Προς τιμολόγηση", Εβδομάδα view), Πελάτες, Συνεργάτες; reads Ισοζύγιο Παλετών. | What was delivered yesterday → has a price? → pallet slips OK? → issues invoice in the ERP → enters number/date, self-delivery tick, price correction; asks dispatchers about missing prices. | Two systems side by side: ERP + app (inference: desktop). Reminders/collections are outside the app. | Readiness check 21/9/2026; invoicing start planned 28/9/2026. | `docs/data-audit/2026-09/2026-09-21-eirini-readiness.md:1-11,60-76`; `docs/data-audit/2026-09/2026-09-22-eirini-workflow.md:14-20,63`; `docs/data-audit/2026-09/2026-09-22-pallet-gate-queue-alexia.md:1`; `docs/DECISION_LOG.md:2333-2347,3853`; `docs/sessions/2026-11-03-dimitris-week-invoice-edit.md:3` |
| unnamed (warehouse / ramp) | warehouse | Ramp supervisor / warehouse worker at the Veroia cross-dock. | not found in docs | Πίνακας Ράμπας (intended) | Intended: see what comes in and leaves today, times, pallets. In practice the ramp page is operated by a dispatcher (Παντελής). | Design audits assume a tablet, standing next to the dock door. No active warehouse account existed (0 of 2 active on ~22/9; "today no active account" on ~5/10). | not live | `docs/design/DEEP_AUDIT_2026-08-04/daily_ramp.md:8-13`; `docs/premortems/2026-08-03/daily_ramp.md:5-9`; `docs/grok-bot/01-σημερινή-κατάσταση.md:122`; `docs/DECISION_LOG.md:2713-2715`; `docs/data-audit/2026-09/2026-09-14-dispatchers-morning.md:14-15` |
| Nick | owner (test account, since 16/10) | External consultant / developer (ValueDriven); builds quick wins from user walkthroughs, keeps a nightly DB dump. | not found in docs | none daily; tests every page | Development and testing, not operations. | On site 12–16/10 (inference from session files dated 12–19/10; the on-site week itself is not in docs). | n/a | `docs/sessions/2026-10-16-vd-nick-quick-wins-5.md:4`; `docs/sessions/2026-10-12-vd-nick-session-rules-v2.md:3`; `docs/SESSION.md:148-150` |
| Drivers | none (no login) | Truck drivers, own fleet and partners. | n/a | none | Receive a printed order sheet or a WhatsApp message generated from the weekly board; phone the office for breakdowns. | Phone (WhatsApp, coordinates copied into GPS); may view the order sheet on a phone instead of paper. | n/a | `docs/DECISION_LOG.md:2930-2948,3869-3881`; `docs/design/DEEP_AUDIT_2026-08-04/print.md:97-98`; `docs/premortems/PreMortem-maint_req.md:25` |

Account count for context (about 22/9/2026): 18 accounts, 7 active: dispatcher 3, accountant 2, management 1, owner 1, warehouse 0 (`docs/grok-bot/01-σημερινή-κατάσταση.md:122`). The third active dispatcher matches Σωτήρης (inference).

### B2. Team-level facts

- **Working hours:** the team works 05:30–14:30 (`CLAUDE.md` principle 7; `docs/DECISION_LOG.md:523,2684,4504`; `docs/prompts/HANDOFF.md:17-19`). "If it breaks, trucks stop."
- **Risky changes:** only after 15:00 (DB migrations after a dry run, Worker deploys, feature switches "outside 05:30–14:30") (`CLAUDE.md` session rule 5 and Worker section; `docs/weekly-natl-redesign/PLAN.md:907`; `docs/tms-auditor/06-ενεργοποίηση-επαλήθευση-απενεργοποίηση.md:3`).
- **Rollout order:** real data from 12/8/2026 (`CLAUDE.md`); "pilot with dispatchers only, full in one month" (owner 8/9, `docs/data-audit/2026-09/2026-09-08-company-handbook.md:58-60`); then accountant 8/9, management 14/9, invoicing 21–28/9, national late October.
- **Week definition:** Saturday → Friday, one shared definition (`TmsWeek`) for Weekly Διεθνών, Weekly Εθνικών and Παραγγελίες; export counted by delivery day, import by loading day (`docs/DECISION_LOG.md:1099,1893-1894,2342,2367,4206`). ISO week numbers existed earlier and disagreed (`docs/design/DEEP_AUDIT_2026-08-04/_WAVE1_PR.md:23`).
- **Wednesday cutoff:** export orders accepted until Wednesday for weekend delivery (`CLAUDE.md` business concepts); the app cannot measure late entries against it (`docs/design/WEEKLY_DEEP_2026-08/02_BASELINE_W20-22.md:71`). Which days next week is built: not found in docs.
- **Morning rhythm (from audit log 31/8–13/9):** 05:00–10:00 is the peak for stop stamps, ramp sync and assignments (`docs/data-audit/2026-09/2026-09-14-dispatchers-morning.md:5-17`). Invoicing: daily mornings, weekly close on Monday, monthly partner invoices (`docs/data-audit/2026-09/2026-09-22-eirini-workflow.md:14-20`).
- **Still outside the app:**
  - Weekly Excel plan: was the source of truth for national work and for yearly figures; national rows were typed from it into the v5 board on 28/10 (`docs/design/WEEKLY_NATL_2026-08/SPEC.md:5,23,101`; `docs/sessions/2026-10-28-dimitris-v5-real-user-test.md:3`; `docs/data-audit/2026-09/2026-09-08-company-handbook.md:43-49`).
  - ERP: issues all invoices; the app only records number/date (`CLAUDE.md` locked decisions; `docs/data-audit/2026-09/2026-09-21-eirini-readiness.md:9-11`).
  - WhatsApp: driver/partner messages are generated by the app and sent by hand; staff feedback reaches the owner as WhatsApp screenshots (`docs/DECISION_LOG.md:1908,2930-2948,3869`; `docs/design/2026-09-15-pantelis-daily-ops-brief.md:3`).
  - Phone: drivers call for breakdowns (`docs/premortems/PreMortem-maint_req.md:25`).
  - Paper: pallet loading slips come back with the truck paperwork (`docs/PALLETS_F2_FEEDERS.md:119`); payment reminders/collections are outside the app (`docs/data-audit/2026-09/2026-09-22-eirini-workflow.md:20`).
- **Printing:**
  - Order / driver sheet per load and per trip from the weekly board (`docs/DECISION_LOG.md:3153,3237,3277`).
  - Week sheet, A4 landscape, for Weekly Διεθνών and Weekly Εθνικών, since 10/11; the international sheet is also read by the national dispatcher; after the first print the dispatcher asked for days next to each point and the trailer (`docs/DECISION_LOG.md:6226-6249`; `docs/design/week-print/README.md:26-38`).
  - Payroll A4 and CSV (`docs/DECISION_LOG.md:1619`); work orders and expiries have CSV/print, service history asked for it (`docs/design/2026-09-15-thodoris-screens-brief.md:22-24`).
  - Trip result (P&L) prints: owner only; invoicing week print: same roles as the screen (`docs/design/prints-pnl-week-2026-11-03.md:85-89`; `docs/DECISION_LOG.md:5941`).
  - On paper there is no colour, so meaning needs a word as well as a colour (`docs/DECISION_LOG.md:1915`); no codes or English on paper (`docs/design/prints-pnl-week-2026-11-03.md:112`).
- **Owner's stated design preferences:**
  - Weekly Διεθνών is the design reference; first critic question is "does it look like our Weekly?" (`docs/national-v5/relax-leg-place-design-2026-11-02.md:186`; `docs/national-v5/transfer-figma-2026-11-02.md:27`; `docs/DECISION_LOG.md:4038`).
  - "Top-tier, professional/formal"; ledger table, not pills/hero; one word per concept in the header, not per cell; one big number then the rest; no internal identifier on screen; navy only for the main button/selection; Syne titles + DM Sans body (`docs/design/2026-09-15-thodoris-screens-brief.md:3-13`).
  - Fewer words (`docs/superpowers/specs/2026-09-06-fleet-fields-kpi-design.md:10`; `docs/design/week-print/README.md:20`).
  - No jargon: users do not know "RT"; less information (`docs/DECISION_LOG.md:5985`).
  - Plain messages: never name a record by code; order = client, loading → delivery · day; trip = plate · driver · day (`CLAUDE.md` "ΜΗΝΥΜΑΤΑ ΧΩΡΙΣ ΚΩΔΙΚΟΥΣ", owner 8/11; `docs/plain-messages/`).
  - Days always open on the weekly boards; an empty day says "no movement"; point numbers in a dark box (`docs/DECISION_LOG.md:3767`; `docs/national-v5/weekly-findings-2026-11-01.md:161`).
  - Denser weekly (more rows per screen), designed on the real app with before/after screenshots (`docs/DECISION_LOG.md:2133-2140`). For new screens: Figma first → owner approval → code, one question at a time (`docs/design/2026-09-14-weekly-natl-parity-brief.md:10`).
  - Aligned columns across sections of the same page (dispatcher request, `docs/design/2026-09-15-pantelis-daily-ops-brief.md:7-10`).
  - Newest first in lists, same order on screen, A4 and CSV (`docs/DECISION_LOG.md:1617-1620`).
  - A shared dashboard for everyone serves no one: dispatcher wants "what is burning today", accountant "what waits for entry", owner "how are we doing" (`docs/premortems/PreMortem-dashboard.md:28-31`).
- **Permissions stance:** for now all roles edit widely ("a 403 at the wrong moment stops work"); delete stays narrow; dispatcher does not see P&L (`CLAUDE.md` locked decisions 23/8).

### B3. Open questions (not settled by the docs)

- **Warehouse role:** no named person and no active account. Who will use Πίνακας Ράμπας, and on what device (tablet is an audit assumption, not a stated fact)?
- **Phones/tablets:** no document states that any named person uses the app on a phone. The only "mobile use case" claims are audit assumptions (dashboard glance, ramp tablet).
- **Screens:** monitor size, number of monitors, shared vs personal PCs: not found in docs. Design audits used 1440 and 1920 wide frames without citing a real workstation.
- **Individual hours:** only the team window 05:30–14:30 is stated. Hours of the accountants, management and the owner: not found in docs.
- **Weekly rhythm:** which days next week's plan is built, and when the week is "closed": not found in docs (only the Wednesday export cutoff and Monday invoicing close).
- **Σωτήρης start date:** personal go-live date not stated; only the national start day (24/10) and first logged entries (by 31/10).
- **Who uses:** Πίνακας Ελέγχου daily, Η Απόδοσή μου, Πίνακας Διοίκησης, Ρυθμίσεις, Κάδος, Ιστορικό Ενεργειών, Ειδοποιήσεις (per person): not found in docs.
- **Two accountants, one role:** whether the two jobs (pallets+expenses vs invoicing) get separate menus is deferred (`docs/DECISION_LOG.md:1799`).
- **A third name** ("Ρίνη") appears once as an unresolved role question in the handbook notes (`docs/data-audit/2026-09/2026-09-08-company-handbook.md:17,25`); not settled whether this is the same person as Ειρήνη.
- **Is Excel still kept in parallel** for national planning after the v5 start: not found in docs.

---

## C. Per page / tool

## C1. App shell — `app.html`

**Who:** every signed-in user. The shell is drawn once; pages replace `#content`.

### Inventory

| Region / control | What it is | `file:line` |
|---|---|---|
| Sidebar | navy `<nav>`: white-inverted logo 84px, `#sidebarNav` (rendered by router), collapse button `◀/▶` | `app.html:19-34` |
| Sidebar «Quick jump… ⌘K» | button that opens the command palette | `core/router.js:131-137` |
| Mobile backdrop + hamburger | drawer ≤768px | `app.html:37`, `:44-50` |
| Topbar title | «group / label», initial text "Dashboard" until first navigate | `app.html:51`, `router.js:342-347` |
| `#topbarBreadcrumb` | empty div, nothing writes to it (not verified beyond `core/router.js`) | `app.html:52` |
| Undo button | always visible; idle = dimmed icon, title "Nothing to undo"; active = "Restore: … / Revert: … / Undo: …" + countdown from 60 s | `app.html:54-60`, `core/utils.js` `renderUndoButton` (~`:1291-1325`), `core/api.js:1354`, `:1381` |
| Bell | button + red dot + dropdown `#notifPanel` (`role="log"`) | `app.html:61-69`; see C7 |
| User chip | avatar = first letter of name, name, role badge showing the raw role id (`owner`, `dispatcher`…) | `app.html:70-74`, `:253-257` |
| «Sign out» | clears caches + session, goes to `index.html` | `app.html:75`, `router.js:480-484` |
| `#content` | `role="main" aria-live="polite"`; initial «Loading...» spinner | `app.html:80-82` |
| Shared modal | one `#modalOverlay` / `#modal` (title, ✕, body, footer) | `app.html:87-96`; see C3 |
| Assistant launcher | injected by `core/ai-chat.js` bottom-right; see assistant section | `app.html:151` |
| Page footer | «PETRAS GROUP TMS · v2.0 · year», injected 2 s after navigate when the page is taller than 100px | `router.js:469-474` |
| Offline banner | «Offline Mode — data may not be current» | `app.html:343-349` |
| Cache-age banner | amber strip on top: "Offline — data from N min ago" | `app.html:310-327` |
| Global error toast | any uncaught error / rejection → «Κάτι πήγε στραβά. Ανανεώστε τη σελίδα.» | `app.html:217-229` |

Boot order that must survive: config → session-streak → constants → auth (may redirect before anything else runs) → api → relogin / sw-update → utils → ui → router → icons → palette → metrics → modules → `init()` (`app.html:108-270`). `init()` reads the hash first, then `tms_page`, then `dashboard` (`app.html:265-267`).

### Keyboard shortcuts (global)

| Keys | Action | `file:line` |
|---|---|---|
| ⌘K / Ctrl K | open / close command palette | `core/command-palette.js:162-168` |
| Esc | close `.mf-overlay`, then shared modal (unless busy), then entity detail panel | `core/ui.js:436-443` |
| ← / → | previous / next week on the two weekly boards, only when no overlay is open | `core/ui.js:445-462`, `:468-474` |
| Enter | confirm in `confirmAction` dialog | `core/ui.js:141` |
| Enter / Space | sort a `TableSort` header; activate keyboard-enabled rows | `core/ui.js:566-572` |
| Tab | focus trap inside the shared modal | `core/ui.js:158-164` |

### Findings — shell

| Tag | Finding | Evidence |
|---|---|---|
| [INCONSISTENT] | English chrome over a Greek app: "Sign out", "Undo", "Nothing to undo", "Restore/Revert", "Loading...", "Dashboard" (initial title), "Offline Mode — data may not be current", "Offline — data from … ago", aria labels "Main navigation", "Open navigation menu", "Close". | `app.html:19`, `:44`, `:51`, `:54`, `:58`, `:75`, `:81`, `:91`, `:320`, `:343`; `core/utils.js` `renderUndoButton` |
| [INCONSISTENT] | The role badge prints the internal role id in English; the audit trail translates the same roles to Greek («ιδιοκτήτης», «διοίκηση», «λογιστήριο», «δρομολόγηση»). | `app.html:256` vs `modules/audit_trail.js` (see that section) |
| [BROKEN] | No badge colour for the `warehouse` role: `.role-badge` has rules for owner, dispatcher, management, accountant only. | `assets/style.css:757-760` |
| [EXTRA] | `#topbarBreadcrumb` is an empty element; the breadcrumb is written into `#topbarTitle` instead. | `app.html:52`, `router.js:342-347` |
| [INCONSISTENT] | Two offline notices with different wording and position (bottom/top), one from `navigator.onLine`, one from the service worker. | `app.html:296-327`, `:343-349` |
| [INCONSISTENT] | The global error toast tells the user to reload («Ανανεώστε τη σελίδα») in the formal plural; the rest of the app addresses the user in the singular («Ξαναδοκίμασε», «Δεν έχεις πρόσβαση»), while the router's no-access toast is plural again («Δεν έχετε πρόσβαση»). | `app.html:220`, `core/ui.js:272`, `:300`, `router.js:281` |
| [MISSING] | No visible app version / "what changed" anywhere in the shell; the only version texts are the two wrong constants (A4). | — |

---

## C2. Login page — `index.html`

**Who:** everyone, before the app. Self-contained: own `<style>`, own palette, loads no shared CSS or JS.

| Item | Detail | `file:line` |
|---|---|---|
| Layout | split: left brand panel (logo 114px, truck photo at 50% opacity with gradient fade, headline, tagline, footer line) + right 420px card; ≤768px the left panel is hidden | `index.html:40-131`, `:258-261` |
| Palette | own variables `--navy #091828`, `--navy-card #0F2545`, `--silver`, `--silver-dim`, `--white`, `--border`, `--border-foc`; grid-line background 52px | `index.html:11-38` |
| Fonts | Syne 300–800, DM Sans 300–500 (no 600/700, no DM Mono) | `index.html:7` |
| Form | real `<form>`; fields «Username», «Password»; button «Sign In →» (Syne, uppercase, gradient); busy label «Σύνδεση…» | `index.html:296-309`, `:372-380` |
| Texts | «Welcome», «Sign in to access the system», headline «Transport Management System», tagline in English | `index.html:276-292` |
| Errors (persist until next keystroke) | «Συμπλήρωσε όνομα χρήστη και κωδικό» · «Λάθος όνομα χρήστη ή κωδικός» · «Ο διακομιστής δεν απάντησε σωστά (σφάλμα N) — δοκίμασε ξανά σε λίγο» · «Δεν ήταν δυνατή η σύνδεση με το σύστημα — δοκίμασε ξανά» · «Δεν υπάρχει σύνδεση στο internet» | `index.html:331-339`, `:370`, `:400-423` |
| Motion | `slideIn` 0.5s on the form; button hover lifts 1px | `index.html:141-149`, `:228-235` |
| Session | a still-valid stored session skips the page straight to `app.html` | `index.html:442-448` |

Logic to keep: login goes to the Worker `/auth/login`; session lifetime follows the token's own expiry, 8 h fallback (`index.html:329`, `:346-356`, `:405-419`).

| Tag | Finding | Evidence |
|---|---|---|
| [INCONSISTENT] | Page chrome is English (`lang="en"`, labels, placeholders, headline, button) while every error message is Greek. | `index.html:2`, `:276-308` vs `:370-423` |
| [INCONSISTENT] | Separate palette and tokens from the app (navy `#091828` vs the app's sidebar navy; silver text scale exists nowhere else). | `index.html:11-19` |
| [EXTRA] | Dead `else` branch for a removed "direct mode". | `index.html:425-428` |
| [MISSING] | No "forgot password", no show-password toggle, no caps-lock hint, no reduced-motion rule. | `index.html` (whole file) |

---

## C3. Shared UI helpers — `core/ui.js` (+ `showErrorToast` in `core/utils.js`)

| Helper | What it draws / does | Callers (grep count in `modules/` + `core/`) | `file:line` |
|---|---|---|---|
| `openModal(title, body, footer, chip)` / `closeModal()` | the one shared modal; focuses first field; restores previous focus; backdrop click does NOT close (owner feedback 19/5) — only ✕ / Cancel / Esc | 26 | `core/ui.js:12-52`, `:148-166` |
| `modalSetBusy(bool)` | disables footer buttons during a save, blocks Esc | — | `core/ui.js:63-74` |
| `confirmAction(msg, {title, confirmLabel, cancelLabel, danger})` | Promise-based confirm inside the shared modal; defaults «Επιβεβαίωση» / «ΟΚ» / «Ακύρωση»; Enter = OK, Esc = cancel | 35 | `core/ui.js:98-146` |
| native `confirm()` | still used (deliberately for irreversible deletes per the comment; also Trash restore/clear) | 10 | `core/ui.js:86-88`, `core/utils.js:1968`, `:1977` |
| native `alert()` | still used | 13 (not individually verified) | — |
| `toast(msg, type)` | single bottom-right toast (bottom 88px to clear the assistant launcher), 3 s, types success / danger / warn / info; `error`→danger, `warning`→warn, unknown→info | ~402 | `core/ui.js:386-431` |
| `showErrorToast(msg, type, ms)` | a second, stacked toast system (container bottom 20px, max N, 5 s default) | ~120 | `core/utils.js:30-71` |
| `showLoading(msg)` | skeleton: 4 tiles + table rows with shimmer, «Φόρτωση…» | 14 | `core/ui.js:244-260` |
| `showError(msg)` | «Δεν φορτώθηκε» + message + «Δεν σημαίνει ότι δεν υπάρχουν εγγραφές — η οθόνη δεν μπόρεσε να τις διαβάσει.» + «Ξαναδοκίμασε» (re-runs the current route) | 11 | `core/ui.js:262-280` |
| `showEmpty(cfg)` / `showEmptyLegacy(msg, sub)` | empty state with one of 6 line illustrations (inbox, search, order, truck, plan, ramp) and optional CTA; legacy string form draws a different round-icon block; default «Καμία εγγραφή» | 20 | `core/ui.js:177-241`, `:285-293` |
| `showAccessDenied()` | lock icon, «Δεν έχεις πρόσβαση» / «Αυτή η ενότητα δεν είναι διαθέσιμη για τον ρόλο σου.» | router + modules | `core/ui.js:295-303` |
| `showComingSoon(label, {icon, today, eta, action})` | «Δεν έχει υλοποιηθεί ακόμη» + boxes «Πώς γίνεται σήμερα» / «Τι λείπει» | router only | `core/ui.js:320-337` |
| `wkMoreToggle(ev)` | the «⋯» menu of the weekly headers: click-toggle, outside click closes, Esc / ↑ / ↓ / Tab handled | weekly boards | `core/ui.js:351-383` |
| `TableSort` | opt-in click-to-sort for plain tables (`data-sort-id`, `th[data-sort=text|num|date]`): ▲ → ▼ → original order; Greek number and d/m date parsing; empties always last; `aria-sort` | notifications + others | `core/ui.js:501-580` |
| `icon(name, size, cls, stroke)` | 63 Lucide-style outline icons, stroke 1.75, `currentColor` | everywhere | `core/icons.js:7-108` |

Logic to keep: failed load ≠ empty table (three-sentence error, `ui.js:262-280`); a toast of unknown type is never green (`ui.js:409-415`); Enter in a confirm answers that confirm, not the row button underneath (`ui.js:136-143`); busy modal cannot be closed mid-save (`ui.js:63-74`).

| Tag | Finding | Evidence |
|---|---|---|
| [INCONSISTENT] | Two toast systems with different position, stacking, duration, text colour and animation (`toast`: one at a time, 3 s, bottom 88px; `showErrorToast`: stack, 5 s, bottom 20px, overlaps the assistant launcher). Success goes through one, most errors through the other. | `core/ui.js:386-431`, `core/utils.js:30-71` |
| [INCONSISTENT] | Three confirmation patterns: `confirmAction` (35), native `confirm()` (10), native `alert()` (13). | counts above |
| [INCONSISTENT] | Two empty-state looks from one function (illustration vs round icon), plus page-local ones (`.dash-empty`, `.dh-empty`, plain `<p>` in notifications, inline block in Trash). | `core/ui.js:177-191`, `:285-293`, `modules/notifications.js:145`, `core/utils.js:1903-1909` |
| [INCONSISTENT] | Loading: `showLoading` skeleton (14 callers) vs `.loading` spinner text (app boot, notifications) vs page-own skeletons (dashboard `dh-sk`). `showLoading` re-injects its own `<style>@keyframes sk-shimmer` on every call. | `core/ui.js:244-260`, `app.html:81`, `modules/notifications.js:217`, `modules/dashboard.js:775` |
| [INCONSISTENT] | All helper blocks are styled with inline `style=""` strings (sizes 14/18/28px, paddings 32/60px), not classes — the redesign has no single CSS place to change them. | `core/ui.js:245-336` |
| [INCONSISTENT] | Modal close is a `<div>` with «✕» (no button semantics); modal title element reused for confirm dialogs, forms and detail views alike. | `app.html:91` |

---

## C4. Session, new version, offline — `core/auth.js`, `core/relogin.js`, `core/sw-update.js`, `core/session-streak.js`, `sw.js`

**Who:** everyone; these are states, not pages.

| State | What the user sees today | `file:line` |
|---|---|---|
| Not signed in / session past its expiry at page load | silent redirect to `index.html`, no message | `core/auth.js:37-66` |
| Session expires while working (first 401) | overlay window over the page: «Συνδέσου ξανά» · «Η σύνδεση έληξε. Η φόρμα σου μένει ανοιχτή.» · read-only «Χρήστης», «Κωδικός», button «Σύνδεση» (busy «Σύνδεση…»), link «Έξοδος». Focus and keys are trapped in it. | `core/relogin.js:41-71`, `:94-122` |
| A save was refused during the expiry | red line in the window and, after login, a 10 s red toast: «Η σύνδεση έληξε — πάτα ξανά Αποθήκευση» (the write is not re-sent, except `/plan/*` writes with a request id) | `core/relogin.js:18`, `:73-79`, `:174-178` |
| Re-login errors | «Γράψε τον κωδικό» · «Λάθος κωδικός» · «Το σύστημα δεν απάντησε σωστά (σφάλμα N) — δοκίμασε ξανά» · «Δεν απάντησε το σύστημα — δοκίμασε ξανά» · «Δεν υπάρχει σύνδεση στο internet» | `core/relogin.js:135`, `:150-155` |
| Re-login as a different user / role | full reload of `app.html` | `core/relogin.js:167-171` |
| New version deployed, nothing open | immediate silent reload | `core/sw-update.js:112-116`, `app.html:333-339` |
| New version deployed, a form / dialog / popover is open, focus is in a field, or a typed field is on screen | blue pill bottom-centre «Νέα έκδοση · ανανέωση» (click = reload now); auto-reload at the first 2 s check that finds nothing open | `core/sw-update.js:18-32`, `:70-118` |
| Offline (browser event) | bottom banner «Offline Mode — data may not be current» | `app.html:343-349` |
| Offline, data served from cache | amber top strip "Offline — data from N min ago" | `sw.js:107-111`, `:175`; `app.html:304-327` |
| Page module failed to load | error card: «Η σελίδα «…» δεν φόρτωσε σωστά: λείπει ένα αρχείο της εφαρμογής. Κάνε ανανέωση με Ctrl+Shift+R· αν μένει, το σφάλμα έχει καταγραφεί.» | `core/router.js:461-466` |
| No permission (menu) | item not drawn | `core/router.js:144-157` |
| No permission (direct link) | red toast «Δεν έχετε πρόσβαση σε αυτή τη σελίδα»; at boot falls back to the dashboard | `core/router.js:280-291` |
| No permission (inside a route) | `showAccessDenied()` block | `core/router.js:415-437` |

Logic to keep: the reload for a new version must never land on a half-filled form (`sw-update.js:1-13`); the re-login window must sit above everything (`z-index: calc(var(--z-top) + 10)`, `relogin.js:48`) and above the update pill (`+4`), cache-age banner (`+2`) and error toasts (`+3`); the tab-level session streak reporting is invisible to users and must stay wired before `auth.js` (`session-streak.js:1-14`, `app.html:109-110`).

| Tag | Finding | Evidence |
|---|---|---|
| [INCONSISTENT] | The re-login window, the update pill and the cache-age banner are built with inline styles and hard-coded fallbacks (`#fff`, `#0B1929`, `#64748B`, `#CBD5E1`, `#B91C1C`, `#92400E`), and the window uses `--bg-card` / `--bg` while the rest of the app uses `--surface-card`. | `core/relogin.js:48-66`, `core/sw-update.js:93-95`, `app.html:315` |
| [INCONSISTENT] | The re-login card (white, 320px, radius 10, Greek) and the login page (navy split screen, English) are two unrelated designs for the same act. | `core/relogin.js:51-66`, `index.html` |
| [MISSING] | Expired at page load = silent bounce to login with no explanation; only the in-page expiry explains itself. | `core/auth.js:44-66` |
| [MISSING] | The mobile "Ctrl+Shift+R" instruction has no touch equivalent. | `core/router.js:463` |

---

## C5. Command palette — `core/command-palette.js`

**Who:** every role. Opened by ⌘K / Ctrl K or the sidebar «Quick jump…» button.

| Item | Detail | `file:line` |
|---|---|---|
| Overlay + dialog | `.cmdk-overlay` (click outside closes), `.cmdk` `role="dialog"` «Παλέτα εντολών» | `:81-94`; css `assets/style.css:4447` |
| Search input | placeholder «Αναζήτηση σελίδας ή ενέργειας…», «ESC» hint | `:95-99` |
| Results | `role="listbox"`, max 20; each: icon, title, group name or «Ενέργεια»; empty «Κανένα αποτέλεσμα» | `:103-115` |
| Footer hints | «↑ ↓ πλοήγηση · ↵ επιλογή · ESC κλείσιμο» | `:116-120` |
| Items | every NAV page the gate lets through + 3 actions: «Ανανέωση σελίδας», «Αποσύνδεση», «Αναίρεση τελευταίας ενέργειας» | `:16-59` |
| Scoring | title contains +3, keywords contain +1, title starts with +2; keywords include the English page id so «weekly», «clients» still match | `:61-78`, `:32-37` |
| Keys | ⌘/Ctrl K toggle, ↑ ↓, Enter, Esc | `:162-188` |

| Tag | Finding | Evidence |
|---|---|---|
| [BROKEN] | Gate differs from the menu (see A4): shows pages the role cannot open, hides pages it can. | `:21-27` |
| [MISSING] | Pages and three actions only: no search of orders, clients, trucks, drivers; no "new order"; no recent pages. Every page item uses the same `file_text` icon instead of its NAV icon. | `:28-40` |
| [EXTRA] | Logout and Undo icons are `user_check` and `refresh` (same icon as «Ανανέωση σελίδας»). | `:48-56` |
| [INCONSISTENT] | The whole list re-renders (innerHTML) on every keystroke and arrow key; hover changes selection — fine functionally, but there is no transition/animation to preserve. | `:80-131`, `:171-183` |

---

## C6. Command center — `core/command-center.js`

A shared "header band" component for the weekly boards (navy gradient card with a completion ring, action chips and small widgets).

| Function | State | Evidence |
|---|---|---|
| `buildCommandCenterHTML`, `widgetFleet`, `widgetEmptyLegs`, `widgetVsLastWeek`, `widgetOnTimeStreak`, `fetchOnTimeStreak` | **[EXTRA]** no caller anywhere in `modules/` or `core/` (grep, 0 hits outside the file) | `core/command-center.js:20-126`, `:216-249` |
| `weekPhaseBadge(week, today)` → «ΧΤΙΖΕΤΑΙ» / «ΣΕ ΕΞΕΛΙΞΗ» / «ΚΛΕΙΣΜΕΝΗ» | used (1 caller) | `:148-155` |
| `fetchPreviousWeekStats` | used (1 caller); re-throws on failure so the caller hides the widget instead of showing 0 | `:168-210` |
| `_ccJump(id)` — scroll to a row and flash it (`ccJumpFlash` 1.6 s) | used (5 call sites) | `:133-141`, `assets/style.css:2709` |

Logic to keep: week phase wording (build / live / closed) and the rule "a failed comparison is hidden, never shown as 0" (`:190-196`, `:251-256`).

| Tag | Finding | Evidence |
|---|---|---|
| [EXTRA] | Dead widgets still carry emoji (🔥 ✨), hard-coded hexes (`#1E3A8A`, `#10B981`, `#D97706`, `#059669`, `#EF4444`, `#FEE2E2`, `#D1FAE5`, `#DBEAFE`) and English header comments ("COMMAND CENTER"). Remove rather than restyle. | `:22-23`, `:37-45`, `:115` |
| [BROKEN] | `fetchOnTimeStreak` (dead) swallows errors and returns 0% / 0 weeks — the pattern the file itself calls wrong for the sibling function. | `:216-249` vs `:190-196` |

---

## C7. Notifications — bell (`core/utils.js`) and page «Ειδοποιήσεις» (`modules/notifications.js`)

**Who:** every role has the bell and the page; each sees only the alert families the code assigns to them: by role (accountant → invoicing, management → fleet documents) and by a per-username rule for planner / daily control / national / equipment / invoicing; the owner sees all (`core/utils.js:1422-1437`).

### Inventory

| Item | Detail | `file:line` |
|---|---|---|
| Bell button + red dot | title «Ειδοποιήσεις»; dot = something due | `app.html:62-67` |
| Dropdown | max 20 grouped cards («N× title» groups expand), per-card snooze, footer button «Όλες οι ειδοποιήσεις» → page | `core/utils.js:1781`, `:1815`, `:1840-1845` |
| Refresh | 3 s after load, then every 5 min, and on open | `core/utils.js:1856-1859`, `:1383-1397` |
| Browser push | permission asked once per session when the bell is first opened; toast «Push notifications ενεργοποιήθηκαν»; a desktop notification for critical items | `core/utils.js:1399-1410`, `:49` (in the notif block) |
| Page header | «Ειδοποιήσεις» · «N κρίσιμες · N προς ενέργεια · N ενημέρωση · ενημερώθηκε HH:MM» · search «Αναζήτηση…» · «Σήμανση όλων ως αναγνωσμένες» | `modules/notifications.js:148-155` |
| Tabs (with counts) | «Όλες» · «Μη αναγνωσμένες» · «Κρίσιμες» · «Σε αναμονή» | `:40-42`, `:114-115` |
| Category chips | «Όλες οι κατηγορίες» + Παραγγελίες / Ημερήσια λειτουργία / Συντήρηση / Λήξεις εγγράφων / Τιμολόγηση / Υπενθυμίσεις / Σύστημα / Άλλα | `:28-34`, `:50-51`, `:116-117` |
| Table | checkbox · «Σοβαρότητα» (dot + Κρίσιμη / Προς ενέργεια / Ενημέρωση) · «Κατηγορία» · «Ειδοποίηση» (title + sub) · «Κατάσταση» (Νέα / Αναγνωσμένη / Σε αναμονή ως…) · «Ενέργειες»; sortable via `TableSort` | `:129-144`, `:35-39`, `:87-90` |
| Row actions | «Άνοιγμα» (navigates to the alert's page) · «Αναγνωσμένη / Μη αναγνωσμένη» · select «Αργότερα…» (1 ώρα / Ως αύριο 08:00 / Ώσπου να λυθεί) · «Επαναφορά» | `:92-102`, `:172-177` |
| Bulk bar | «N επιλεγμένες» · «Αναγνωσμένες» · «Αργότερα 1 ώρα» · «Αργότερα ως αύριο» · «Καμία» | `:118-126` |
| Toasts | «Σημειώθηκαν ως αναγνωσμένες» · «Σημειώθηκε ως μη αναγνωσμένη» · «Επέστρεψαν στη λίστα» · «Σε αναμονή» | `:189-191` |

### Alert families (what each counts — must survive)

| Family (audience) | Title as shown | Type | Opens | `core/utils.js` |
|---|---|---|---|---|
| all planners/owner | «Export/Import χωρίς ανάθεση» — open order with no truck, delivery within 48 h | danger | `orders_intl` | `:1476-1481` |
| international planner | «Export χωρίς return load» | warn | `weekly_intl` | `~:1484-1495` |
| daily control | «Οδηγός μη ενημερωμένος» (loading today) · «Πελάτης μη ενημερωμένος» (delivery today) · «CMR εκκρεμεί» (delivered ≤3 days, max 5) | warn / warn / info | `daily_ops` | `~:1499-1537` |
| national | «National χωρίς Performance» · «Εθνική v5 εκπρόθεσμη» · «Εθνικές v5: η κατάσταση δεν διαβάστηκε» | info / warn / warn | `weekly_natl` | `~:1541-1572` |
| equipment | «Κρίσιμη βλάβη · priority» · «plate — DOC ΛΗΓΜΕΝΟ» · «plate — DOC ληγει σε Nμ» | danger / danger / warn | `maint_req`, `maint_expiry` | `~:1588-1606` |
| invoicing | «Παραγγελία χωρίς τιμολόγιο» | warn | `invoicing` | `~:1616-1630` |
| system | «Έλεγχος ειδοποιήσεων ελλιπής» (a source failed — state is then kept, not pruned) · «Υπενθύμιση» | warn / info | — | `~:1645-1658`, `:1438-1440` |

State: read / snooze live per browser and per user in `localStorage` (`NotifStore`, `core/utils.js:1340-1380`), keyed by record + title, forgotten after 30 days or when the alert is no longer raised. There is no "since when" — alerts are computed, not stored (`modules/notifications.js:20-21`).

### Findings

| Tag | Finding | Evidence |
|---|---|---|
| [BROKEN] | «CMR εκκρεμεί» sub-line reads `Order Number`, a field that does not exist (CLAUDE.md: use `Reference`) → the order is never named, only a 20-char delivery summary. | `core/utils.js:1536` |
| [INCONSISTENT] | Mixed languages in alert titles: «Export χωρίς return load», «National χωρίς Performance», «ορίσε On-Time/Delayed», «Push notifications ενεργοποιήθηκαν», fallback word `Order`. Typos: «ληγει» (no accent), «ορίσε». | `core/utils.js:1480`, `:1493`, `:1554`, `:1605`, `:1409` |
| [INCONSISTENT] | Alerts name a record by direction + truncated route (20–30 chars) or by reference, not by the one plain form of `core/plain-ref.js` (client, loading → delivery · day) that CLAUDE.md requires for every human-facing text. | `core/utils.js:1479-1480`, `:1629` |
| [INCONSISTENT] | The page ships its own `<style>` block (`.nc-*`) on every render and its own tab bar, chip and status styles, parallel to the entity lists and the audit trail it says it copies. | `modules/notifications.js:217-256` |
| [MISSING] | State is per browser: read / snoozed on one PC is unread on another; no history, no "since", no who-resolved (phase 2 is described but not built). | `modules/notifications.js:15-21` |
| [MISSING] | Warehouse has the bell and the page but no alert family is assigned to that role (only the system rows). | `core/utils.js:1429-1437` |
| [EXTRA] | `isEquip` tests a role `maintenance` that does not exist in `PERMS`. | `core/utils.js:1435`, `config.js:353-366` |
| [INCONSISTENT] | Empty state is a bare `<p>` in `.empty-state` («Καμία ειδοποίηση με αυτά τα φίλτρα.» / «Καμία ειδοποίηση σε αναμονή.») — no "all clear" state distinct from "filters hide everything". Loading is the plain «Φόρτωση…». | `modules/notifications.js:145`, `:217` |

States: loading «Φόρτωση…» then the last refresh at once, then a fresh one (`:257-261`); error = the system row «Έλεγχος ειδοποιήσεων ελλιπής» inside the list (no page-level error state); no-permission: none (open to all).

---

## C8. «Πίνακας Ελέγχου» — `modules/dashboard.js` (route `dashboard`)

**Who:** all five roles land here by default (`app.html:267`). Same content for every role — no role-specific variant in the module. It is a read-only morning overview; every tile and row is a link into another page.

### Inventory

| Region | Content | `file:line` |
|---|---|---|
| Header | greeting «Καλημέρα / Καλό απόγευμα / Καλό βράδυ, first name» · date · «Εβδομάδα N ISO» | `:327-346` |
| Header actions | «Νέα παραγγελία» (→ orders, international) · «Ημερήσιο» · «Εβδομαδιαίο» · «ενημερώθηκε HH:MM · ανά 5′» | `:347-352` |
| Band label | «Η ΕΒΔΟΜΑΔΑ · WN · ανασκόπηση — τα σημερινά παρακάτω» | `:355` |
| Score card | conic ring with «ΒΑΘΜΟΣ WN · k/4», four bars (Ανάθεση, Συνέπεια, Συμμόρφωση, Κενά χλμ) with the weakest marked, and a "receipt" line naming the formula, weights, sample and what pulls it down | `:357-374` |
| KPI tile 1 | «ΦΟΡΤΗΓΑ ΣΕ ΔΡΟΜΟ · WN» — %, delta vs previous week, 4-week trend, «busy/total ενεργά φορτηγά · N χωρίς ανάθεση», source line | `:376-388` |
| KPI tile 2 | «ΚΕΝΑ ΧΙΛΙΟΜΕΤΡΑ · WN» — avg km, delta, trend, pairs measured / missing coordinates | `:389-401` |
| KPI tile 3 | «ΣΥΝΕΠΕΙΑ ΠΑΡΑΔΟΣΗΣ · 30 ΗΜ» — %, delta, trend, judged / unjudged | `:402-413` |
| Goals card | «Στόχοι 2026 — μέτρηση τελευταίων 30 ημερών»: 4 goals (on-time ≥95%, empty km ≤50, utilisation ≥85%, days without expired document 365 — the last always «—») | `:416-431`, `:49-54` |
| «Αναχωρήσεις» / «Παραδόσεις» | two cards, rows grouped ΣΗΜΕΡΑ / ΑΥΡΙΟ: client, route, time (if any), pallets, plate, status word; after 12:00 deliveries come first and departures collapse to «x/y φόρτωσαν σήμερα · άνοιγμα ▾» | `:203-223`, `:337-338`, `:435`, `:565-586` |
| «Αναμονή ανάθεσης — κατά προθεσμία» | table ΦΟΡΤΙΟ · ΠΕΛΑΤΗΣ / ΔΡΟΜΟΛΟΓΙΟ · ΠΑΡΑΔΟΣΗ · ΠΑΛ. · ΠΡΟΘΕΣΜΙΑ (days-to-loading pill); row click opens orders filtered to unassigned; footer «ΔΙΑΘΕΣΙΜΑ ΓΙΑ ΑΝΑΘΕΣΗ · idle/active» with up to 3 plates + «+N ακόμη ›» | `:234-248`, `:437-456` |
| «Ειδοποιήσεις στόλου» | one row per vehicle with all its documents: «ΛΗΓΜΕΝΟ — N μέρες» / «άγνωστο · συμπλήρωση ›» / «σε N μέρες»; link «Λήξεις ›» | `:250-302`, `:459-470` |
| Auto refresh | every 5 min while on the page | `:475-479` |
| Styles | own `<style>` block `.dh-*` injected with the page; breakpoint 1366px | `:340`, `:775-776` (css from ~`:595`) |

No modal, no filter, no export / print, no period selector.

### Logic that must survive (definitions)

| Metric | Definition | `file:line` |
|---|---|---|
| Data window | ORDERS with loading date in the last 30 days (split legs excluded when `ORDER_SPLIT`), their ORDER_STOPS, reference trucks / trailers / clients / locations | `:61-106` |
| Unassigned | no truck AND no partner (owner 2/9), and status not Delivered / Invoiced / Cancelled; loose stock pieces excluded from the waiting list | `:20-21`, `:234` |
| Week | `currentWeekNumber()` and the orders' `Week Number`; trend = last 4 weeks | `:114-120` |
| "Too early" rule | 0 orders in the week → no percentage at all; <5 orders → value shown but not coloured or ranked, no delta | `:122-135`, `:190-201` |
| Fleet utilisation | `metrics.fleetUtilization` — active trucks with ≥1 assignment in the week / active trucks | `:138-143` |
| On-time | only the dispatcher's On Time / Delayed mark (`Delivery Performance`), never dates (owner 30/8); `null` when nothing was judged | `:145-149` |
| Empty km | each export paired once with the nearest later import of the same truck; distance last unloading stop → first loading stop (haversine); unpaired / no-coordinates declared, never dropped silently | `:151-161`, `:498-533` |
| Compliance | `metrics.compliancePct(trucks)` | `:164` |
| Weekly score | `metrics.weeklyScore`, weights 30/30/25/15; without on-time judgement or with no orders → no score; without empty-km → partial score marked `*` and «k/4»; ring colour ≥85 ok, ≥70 warn, else danger, neutral when partial or early | `:168-201`, `:333` |
| Deadline | whole days from today to loading date, local time, never hours | `:30-43`, `:225-248` |
| Fleet alerts | truck + trailer document fields: expired → unknown → expiring within 30 days; FRC only for reefers and not when notes carry NO-FRC; trailers with empty Active still alert | `:253-286` |
| Status words | ΣΕ ΜΕΤΑΦΟΡΑ · ΠΑΡΑΔΟΘΗΚΕ · ΑΚΥΡΩΘΗΚΕ · ΣΥΝΕΡΓΑΤΗΣ · ΑΝΑΤΕΘΕΙΜΕΝΟ · ΧΩΡΙΣ ΦΟΡΤΗΓΟ (a word, not a coloured dot) | `:555-563` |

### Findings

| Tag | Finding | Evidence |
|---|---|---|
| [BROKEN] | Goal «ΗΜΕΡΕΣ ΧΩΡΙΣ ΛΗΓΜΕΝΟ ΕΓΓΡΑΦΟ» is structurally always «—» («δεν μετράται ακόμη»): no history of expiries exists. | `:304-308`, `:428-429` |
| [BROKEN] | Time in departures / deliveries never shows: the date columns carry no time (comment: no sample with `T`), so rows have no hour and the «ΣΗΜΕΡΑ» group is sorted by an empty string. | `:546-553`, `:222` |
| [BROKEN] | «ΚΕΝΑ ΧΙΛΙΟΜΕΤΡΑ» depends on location coordinates; without them the tile reads «0/N ζεύγη — λείπουν συντεταγμένες» and the score runs 3/4. How often this happens was not verified (no data read). | `:391-400`, `:173-188` |
| [INCONSISTENT] | The on-time tile sits in the band «Η ΕΒΔΟΜΑΔΑ» but measures 30 days (declared by its «30 ΗΜ» suffix, acknowledged in a comment). | `:402-407` |
| [INCONSISTENT] | Goals are titled «Στόχοι 2026» but measured over 30 days, with placeholder targets hard-coded in the module («στόχοι ενδεικτικοί, ορίζονται από τον owner»). | `:45-54`, `:418-419` |
| [INCONSISTENT] | The page prints its data sources to the user in developer terms: «ORDERS × TRUCKS · W45 ISO», «ORDER_STOPS», «metrics.weeklyScore() · βάρη 30/30/25/15», «ORDERS 30 ημ». Against the owner's "no jargon / less info" direction (see B2). | `:372`, `:387`, `:399`, `:412`, `:439`, `:450` |
| [INCONSISTENT] | Header says «Εβδομάδα N ISO» while the boards use the Saturday–Friday `TmsWeek`; three week definitions exist across the dashboards (see the dashboards section). | `:345`, `:114` |
| [INCONSISTENT] | Row labels use «IMP / EXP + reference» as the name of a load; status / day words are upper-case Latin-style abbreviations («ΠΑΛ.», `12p`). | `:237-239`, `:569` |
| [EXTRA] | NATIONAL LOADS for 30 days is fetched and never read (declared dead call). | `:70-75` |
| [MISSING] | Same dashboard for all roles: nothing for the accountant (invoicing, pallets, expenses), the national dispatcher (no national figure at all) or warehouse (ramp). Header buttons «Νέα παραγγελία» etc. show to view-only roles too. | `:347-351` (no role check in the module) |
| [MISSING] | Rows in departures / deliveries open the weekly board or the orders list, not the order itself. | `:567` |
| [LOCKED] | Score and statistics on top, action lists below — owner decision 30/8, noted as a deliberate deviation; «ΤΙ ΚΑΙΕΙ» removed (30/8); compliance card not to return (11/8); on-time from the dispatcher's mark only. | `:4-8`, `:145-146` |
| [LOCKED] | No profit / margin figure on this page (dispatcher sees it). | CLAUDE.md «ΚΛΕΙΔΩΜΕΝΕΣ ΑΠΟΦΑΣΕΙΣ» |

### States

| State | Today | `file:line` |
|---|---|---|
| Loading | own skeleton `_dashSkeleton()` (pulse `dh-sk`) | `:58`, `:775` |
| Error | card «Το dashboard δεν φόρτωσε» + message + «ORDERS / TRUCKS / ORDER_STOPS. Αυτό ΔΕΝ σημαίνει ότι δεν υπάρχουν παραγγελίες.» + «Επανάληψη» | `:481-489` |
| Partial failure | stops failed → «οι στάσεις δεν φόρτωσαν — δεν μετρήθηκε» on the empty-km tile | `:100-105`, `:395` |
| Empty | each card has its own sentence naming what was checked, e.g. «Καμία αναχώρηση σήμερα ή αύριο — ORDERS · ημερομηνία φόρτωσης.», «Καμία ανοιχτή παραγγελία χωρίς ανάθεση — ORDERS 30 ημ, N παραγγελίες ελέγχθηκαν.», «Κανένα έγγραφο ληγμένο, άγνωστο ή προς λήξη σε 30 ημέρες — TRUCKS + TRAILERS.» | `:337-338`, `:450`, `:469` |
| Too little data | «— (καμία παραγγελία στη WN ακόμη)», «πολύ νωρίς — N παραγγελίες», «ΒΑΘΜΟΣ · χωρίς δείγμα», «— (χωρίς κρίση)» | `:134-135`, `:194-198`, `:362` |
| No permission | none — every role may open it | — |

---

## C9. Admin pages in the router — «Ρυθμίσεις», «Κάδος», «Καταγραφή Σφαλμάτων»

### «Ρυθμίσεις» (`settings`)
Owner and management. Placeholder only: gear icon, «Ρυθμίσεις», «Δεν έχει υλοποιηθεί ακόμη», box «Πώς γίνεται σήμερα: Οι ρυθμίσεις αλλάζουν στο config.js και ανεβαίνουν με deploy. Χρήστες και ρόλοι ορίζονται εκεί.», box «Τι λείπει: Οθόνη ρυθμίσεων δεν έχει προγραμματιστεί. Οι αλλαγές ρόλων περνούν από τον owner.» (`core/router.js:414-421`). Other roles: `showAccessDenied()`.
- [EXTRA] menu entry with nothing behind it. [MISSING] no place for per-user preferences that already exist scattered in `localStorage` (sidebar state, nav groups, board opt-ins, notification state, dashboard goals).

### «Κάδος» (`trash`) — `core/utils.js:1875-1980`
Owner and management. Lists the last 50 records deleted **from this browser** (localStorage), newest first.

| Item | Detail | `file:line` |
|---|---|---|
| Header | «Κάδος» · «N διαγραμμένες εγγραφές — …» · red button «Άδειασμα κάδου» | `:1888-1895` |
| Row card | table-name pill (internal table key) · record id · preview «Field: value \| …» from up to 3 known fields · «Διαγράφηκε πριν N λ./ώ./ημ. από name» · «Επαναφορά» | `:1912-1932`, `:1950-1965` |
| Confirms | native `confirm()`: «Επαναφορά της εγγραφής στον αρχικό της πίνακα;» · «Οριστικό άδειασμα του κάδου; Δεν αναιρείται.» | `:1968`, `:1977` |
| Empty | bin icon, «Καμία διαγραμμένη εγγραφή», «Οι διαγραμμένες εγγραφές εμφανίζονται εδώ για επαναφορά (τελευταίες 50, σε αυτόν τον browser)» | `:1903-1909` |
| Unreadable store | red «Ο κάδος δεν διαβάστηκε» + explanation (not the same as empty) | `:1896-1902` |
| Restore feedback | info toast «Η εγγραφή επαναφέρθηκε» | `:1970-1972` |

- [INCONSISTENT] Records are named by internal table key, record id and English field names («License Plate: …», «Direction: …») — against the plain-messages rule. `:1917-1921`, `:1954-1964`
- [INCONSISTENT] Whole page in inline styles; native `confirm()` instead of `confirmAction`; success shown through the *error* toast function with type info. `:1885-1934`, `:1968-1977`
- [MISSING] Per-browser only: a deletion made on another PC is not here; no search, no filter by table / person, no paging. `:1862-1865`

### «Καταγραφή Σφαλμάτων» (`error_log`) — `core/utils.js:1133-1273`
Owner only. JS errors recorded **in this browser** (localStorage), newest first.

| Item | Detail | `file:line` |
|---|---|---|
| Header | «Καταγραφή Σφαλμάτων» · «N καταγραφές · N σε προβολή · Κεντρική καταγραφή: ΕΝΕΡΓΗ / ΑΝΕΝΕΡΓΗ — τα σφάλματα μένουν μόνο σε αυτόν τον browser» | `:1190-1198` |
| Buttons | «JSON» · «CSV» (export) · «Καθαρισμός» | `:1199-1203` |
| KPI bar (3, clickable filters; disabled at 0) | «Κρίσιμα» (σφάλματα + εξαιρέσεις) · «Προειδοποιήσεις» (ταυτοποίηση, δίκτυο, 4xx) · «Πληροφορίες» (ακυρώσεις, αναμενόμενα) | `:1206-1226` |
| Filters | search «Αναζήτηση σε μήνυμα / πλαίσιο / χρήστη…» · «Σοβαρότητα» · «Χρήστης» · «Χρόνος» (Όλος / Τελευταία ώρα / 24 ώρες / 7 ημέρες) · count chip | `:1228-1251` |
| Table | Σοβαρότητα · Πότε (relative) · Μήνυμα (+ ×count) · Πλαίσιο · Χρήστης · Σελίδα; row click opens the stack | `:1166-1178`, `:1254-1266` |
| Empty (3 different sentences) | «Καμία καταγραφή σφάλματος» · «Καμία καταγραφή με αυτά τα φίλτρα» · unreadable store: «Η καταγραφή δεν διαβάστηκε — … Κάνε «Καθαρισμός» …» | `:1179-1188` |

- [INCONSISTENT] Borrows classes from three other pages: `.dash-*` (old dashboard), `.entity-toolbar-v2` / `.entity-search-input` (entity lists), `.svc-filter` (maintenance), `.md-fleet-table` (maintenance dashboard). `:1189-1266`
- [INCONSISTENT] «Κεντρική καταγραφή: ΑΝΕΝΕΡΓΗ» refers to the external monitor only (its address is empty, `config.js:36`), while every error IS also posted to the backend store (`core/utils.js` `logError` → `_postAppError`). The page reads only the local copy, so the owner's log is one browser's view and the header understates what is centrally recorded. `:1150-1160`, `:1196-1198`
- [MISSING] No view of the backend error store (all users, all browsers) — the page that would answer «αν σπάσει, πώς θα το μάθω;» shows one machine.
- [INCONSISTENT] The «Σελίδα» column shows internal page ids; «Χρήστης» shows display names here and actor ids in the audit trail.


---

## E2 — Dashboards: «Πίνακας Διοίκησης», «Η Απόδοσή μου», «Έλεγχος Μετρήσεων», core/metrics.js

Scope read in full: `modules/ceo_dashboard.js` (1138), `modules/performance.js` (1082), `core/metrics.js` (649), `modules/metrics_audit.js` (991). Field existence checked against the `TABLES` map in `worker/src/index.js` (ORDERS block 1317–1550, NATIONAL ORDERS 1665–1768, NATIONAL LOADS 1847–2025, MAINT_HISTORY 1105–1140, MAINT_REQ 1141–1164). Nothing was run; "structurally" below means "follows from code + Worker map", not from a row count.

Field-existence results used throughout (Worker map, grep):

| Label read by these files | In Worker map for the table it is read from? |
|---|---|
| `Temp Graph Sent`, `Dead KM`, `Loaded KM`, `Total KM`, `Client Name` (ORDERS) | NO (`Client Name` exists only as a computed of the stock-lots table, worker:2150) |
| `Order Number`, `CMR Received`, `CMR Archived` (ORDERS) | NO |
| `Actual Delivery Date`, `Delivery Performance`, `Matched Import ID`, `Partner Rate`, `Is Partner Trip`, `Assigned At`, `CMR Photo Received`, `Client Notified`, `Invoiced`, `Invoice Date`, `Price`, `Week Number` (ORDERS) | yes (worker:1416, 1378, 1399, 1383, 1438, 1418, 1441, 1442, 1431, 1417, 1382, 1333) |
| `Price`, `Cost`, `Total Cost` (NATIONAL LOADS) | NO (map worker:1850–1880) |
| `Date`, `Date Completed` (MAINT_REQ) | NO (map worker:1144–1163) |
| `Total Cost` (MAINT_HISTORY) | NO; `Cost` yes (worker:1114) |
| facade id of `TABLES.TRIP_COSTS` (config.js:51) and `TABLES.METRICS_SNAPSHOTS` (config.js:83) | NOT in the Worker `TABLES` map at all |

Status vocabulary facts used below: `Status='Delivered'` is written only to ORDERS, only by `modules/daily_ops.js:1581,1877` (together with `Delivery Performance` and `Actual Delivery Date`); no write path for `Status='Invoiced'` was found in `modules/` or `core/` ("Invoiced" is a checkbox, not a status — CLAUDE.md locked decisions); nationals never get `Status='Delivered'` (`modules/weekly_natl.js:630-636`, `core/orders-common.js:82-85`).

---

## 1. «Πίνακας Διοίκησης» — `modules/ceo_dashboard.js` (route `ceo_dashboard`)

### 1.1 Who sees it, what they do
- Owner only. Nav: section «Ανάλυση», perm `ceo_dashboard` (`core/router.js:79-80`; `config.js:354-365` → `full` for owner, `none` for all others). In-module gate: `can('ceo_dashboard') !== 'full'` → denied block (`ceo_dashboard.js:18-21`).
- Read-only overview of a chosen period (week / month / quarter / YTD) with period-over-period arrows. Two manual inputs, both stored in the browser only: weekly "anxiety calls" count and a revenue target.

### 1.2 Inventory

| # | Element | file:line |
|---|---|---|
| 1 | Header title «CEO Dashboard» + subtitle «Scaling Up · People · Strategy · Execution · Cash» | ceo:862-863 |
| 2 | Period segmented control: «Εβδομάδα» / «Μήνας» / «Τρίμηνο» / «YTD» (default month) | ceo:865-870, 10, 843-852 |
| 3 | Timestamp line `#ceo-updated`: «Φόρτωση…» → «Ενημερώθηκε HH:MM» (+ « · ⚠ δεν φόρτωσε: …») | ceo:871, 108-109, 187-197 |
| 4 | Conditional loss banner «N ζημιογόνες διαδρομές — συνολική ζημία …» | ceo:875, 434-447 |
| 5 | Section label «Οι τρεις υποσχέσεις μας» | ceo:878 |
| 6 | Brand card 1 «ΥΠΟΣΧΕΣΗ 1 / ΤΑΧΥΤΗΤΑ — στο ράφι πιο γρήγορα»: conic gauge ring, value, sub «N on-time / M» + delta, setup badge, «Στόχος: ≥98%» | ceo:882-899, 245-259 |
| 7 | Brand card 2 «ΥΠΟΣΧΕΣΗ 2 / ΠΟΙΟΤΗΤΑ — επιβεβαιωμένη φρεσκάδα»: gauge, sub «N proof / M», setup badge, «Στόχος: 100%» | ceo:902-919, 262-276 |
| 8 | Brand card 3 «ΥΠΟΣΧΕΣΗ 3 / ΗΡΕΜΙΑ — μηδέν αγωνία πελάτη»: gauge, sub «W.. · N κλήσεις», «Στόχος: 0 κλήσεις / εβδομάδα», number input «Αυτή την εβδ.:» + button «Αποθήκευση» | ceo:922-941, 279-291, 702-710 |
| 9 | Section label «Scaling Up» | ceo:945 |
| 10 | Quadrant «ΑΝΘΡΩΠΟΙ — Ομάδα & Στόλος»: KPI «Αξιοποίηση οδηγών» (+bar, delta), «Διαθέσιμοι», «Δρομολόγια συνεργατών» (+split bar, legend «Ιδιόκτητα» / «Partner»), list «Κατανομή φόρτου» (top 8 drivers, bars) | ceo:949-989, 294-320, 741-768 |
| 11 | Quadrant «ΣΤΡΑΤΗΓΙΚΗ — Ανάπτυξη & Θέση»: KPI «Έσοδα vs στόχος» (+bar, delta, pencil button title «Ορισμός στόχου»), KPI «Κενά χιλιόμετρα» (+bar, «ESTIMATE» chip, sparkline «8 εβδ.»), table «Top 5 Πελάτες (Revenue)» with mini bars | ceo:992-1029, 323-375 |
| 12 | Quadrant «ΕΚΤΕΛΕΣΗ — Επιχειρησιακή απόδοση»: KPI «Συνέπεια παράδοσης» (+sparkline «8 εβδ.», sub «4-εβδ. μέσος»), KPI «Κρίσιμα — επόμενες 48ω», KPI «Χρήση Veroia Switch», KPI «Με ανάθεση» | ceo:1032-1070, 378-405 |
| 13 | Quadrant «ΤΑΜΕΙΟ — Χρηματοροές & Κόστος»: KPI «Έσοδα (παραδοθέντα + τιμολογημένα)», «Αδρανή Τιμολόγια», «Maintenance», «Περιθώριο συνεργατών», table «Top 3 Ζημιογόνες Διαδρομές» (Διαδρομή / Έσοδο / Κόστος / Ζημία) | ceo:1073-1120, 408-458 |
| 14 | «ΣΥΝΟΨΗ ΠΕΡΙΟΔΟΥ» — rule-generated bullet briefing | ceo:1125-1131, 771-815 |
| 15 | Revenue-target dialog: native `prompt()` «Μηνιαίος Στόχος Εσόδων (€) — π.χ. 50000 (όχι "50k"):» | ceo:682-700 |
| 16 | Auto-refresh every 10 min while on page | ceo:32-39 |
| 17 | Error-state retry button «Ξαναδοκίμασε» | ceo:217 |

No tabs, no modal (only `prompt()`), no keyboard shortcuts, no export, no print, no filters other than the period control.

### 1.3 Logic that must survive (as coded)

Data loads (ceo:125-155): ORDERS by `Loading DateTime` in period; same for previous period (soft); DRIVERS `{Active}=1`; TRIP_COSTS by `Trip Start Date` (soft); MAINT_HISTORY by `Date` in period (soft); ORDERS with `Delivery DateTime` < now+48h and Status not Delivered/Cancelled/blank; ORDERS with `Loading DateTime` in last 56 days (sparklines). 15 s overall timeout (ceo:118-122). Stale-load guard `_loadId` (ceo:99, 158). "Still on this page" guard (ceo:229-232).

Periods (ceo:43-65): week = Monday–Sunday of today; month; quarter; YTD (Jan 1 → now; previous = whole previous year). Previous period = offset −1.

| KPI | Definition | Thresholds / colour | file:line |
|---|---|---|---|
| Speed (brand 1, also «Συνέπεια παράδοσης») | Among period orders with Status `Delivered`: if any have `Actual Delivery Date` + `Delivery DateTime` → share with actual ≤ planned; else share with `Delivery Performance`='On Time' among those with a value; else no data | target 98; ok ≥ target, warn ≥ 97 % of target, else bad | ceo:468-482, 254, 386, 818-823 |
| Quality (brand 2) | share of delivered orders with `Temp Graph Sent` truthy; "has data" only if the key is present on ≥1 record | target 100 | ceo:484-489, 271 |
| Anxiety (brand 3) | integer from `localStorage` key per ISO year+week, clamped 0–99 on save; ring = value×36° (max 10) | 0 = ok, ≤3 warn, else bad | ceo:491-497, 284-288, 702-710 |
| «Αξιοποίηση οδηγών» | distinct `Driver` ids on period orders ÷ active drivers | target 80 | ceo:499-508, 301-305 |
| «Διαθέσιμοι» | active drivers − distinct drivers used | >0 ok else muted | ceo:296, 315-317 |
| «Δρομολόγια συνεργατών» | orders with `Partner` ÷ all period orders; "owned" = the rest (incl. unassigned) | >40 bad, >30 warn, else ok; delta is lower-is-better | ceo:510-517, 307-313 |
| «Κατανομή φόρτου» | order count per driver, keyed by FIRST word of `Full Name`, top 8; bar class max/min/mid | — | ceo:741-768 |
| «Έσοδα vs στόχος» | Σ `Price` of ALL period orders (any status) vs `localStorage` target | vs target 100 % | ceo:519-521, 323-338, 678-680 |
| «Κενά χιλιόμετρα» | 3-step fallback: explicit `Dead KM`; else `Total KM`−`Loaded KM`; else estimate = matched orders×50 km + unmatched exports×600 km over 1200 km each | <15 % ok, <25 % warn, else bad | ceo:523-550, 340-356 |
| «Top 5 Πελάτες (Revenue)» | Σ `Price` grouped by `Client Name`, top 5, % of total | — | ceo:552-565, 359-375 |
| «Κρίσιμα — επόμενες 48ω» | count of the 48h query (delivery before now+48h, not Delivered/Cancelled/blank status — no lower bound, assignment not considered), minus loose stock pieces | 0 ok, else bad | ceo:153, 166, 393-397 |
| «Χρήση Veroia Switch» | exports with `Veroia Switch` ÷ exports | ≥60 ok, ≥40 warn, else muted | ceo:567-575, 399-401 |
| «Με ανάθεση» | orders with `Truck` ÷ all period orders (partner NOT counted) | target 90 | ceo:577-584, 403-405 |
| «Έσοδα (παραδοθέντα + τιμολογημένα)» | Σ `Price` where Status ∈ Delivered/Invoiced | always ok colour | ceo:586-597, 414-416 |
| «Αδρανή Τιμολόγια» | count + Σ `Price` of Status=`Delivered`, excluding stock pieces | sum >5000 bad; count >0 warn | ceo:594-596, 418-420 |
| «Maintenance» | Σ `Cost` (fallback `Total Cost`) of MAINT_HISTORY in period; sub = % of delivered revenue | <8 % ok, <12 % warn, else bad | ceo:599-601, 422-425 |
| «Περιθώριο συνεργατών» | (Σ Price − Σ `Partner Rate`) ÷ Σ Price over partner orders; shown only if TRIP_COSTS returned rows | >30 ok, >15 warn, else bad | ceo:603-611, 427-431 |
| «Top 3 Ζημιογόνες Διαδρομές» | TRIP_COSTS rows with `Price`>0 and cost>0 and cost>price, top 3 by loss | — | ceo:613-634, 449-458 |
| Sparklines | weekly on-time % and dead-km % from the 56-day set, last 8 buckets keyed `W<ISO week>` | — | ceo:637-670 |
| Delta arrows | (cur−prev)/prev rounded; hidden when prev is 0/NaN; "lower is better" flips colour | — | ceo:829-840 |
| Briefing rules | Speed ≥98 / ≥90 / else; dead km >15 %; critical >0; loss trips >0; uninvoiced >5000; revenue line with % vs previous | — | ceo:777-809 |

### 1.4 Findings

| Tag | Finding | Evidence |
|---|---|---|
| [BROKEN] | Brand promise 2 «ΠΟΙΟΤΗΤΑ» is structurally «—»: `Temp Graph Sent` is not in the Worker ORDERS map, so `'Temp Graph Sent' in r.fields` is never true → `hasData:false` → card stays in "no-data" with the setup badge. | ceo:485-486, 262-268, 914; worker map (no hit) |
| [BROKEN] | «Top 5 Πελάτες (Revenue)» collapses to a single row «Unknown» at 100 %: `Client Name` is not an ORDERS label (only `Client` link), so every order groups under the fallback `'Unknown'`. | ceo:556; worker:2150 is the only `Client Name` |
| [BROKEN] | «Κενά χιλιόμετρα» can only ever be the constant-based ESTIMATE (50/600/1200 km): `Dead KM`, `Loaded KM`, `Total KM` are not in the map. Its sparkline is structurally all-zero (reads only those three fields) yet is drawn whenever the estimate "has data". | ceo:524-548, 656-669, 347-349 |
| [BROKEN] | «Περιθώριο συνεργατών» is structurally «N/A» / «Trip Costs ?»: it is computed from ORDERS (`Price`, `Partner Rate` — both mapped) but displayed only when `tripCosts.length > 0`, and the TRIP_COSTS facade id is not in the Worker map. | ceo:427-431, 603-611; config.js:51; router.js:397 ("does not exist in the backend yet") |
| [BROKEN] | «Top 3 Ζημιογόνες Διαδρομές», the loss banner and the briefing's loss line can never show data (same missing table); the table permanently reads «Απαιτείται Trip Costs data» and the timestamp line permanently carries «⚠ δεν φόρτωσε: κόστος δρομολογίων». Response code of the Worker for an unmapped id: not verified. | ceo:146, 183, 190, 449-458 |
| [BROKEN] | «Αδρανή Τιμολόγια» ignores the `Invoiced` checkbox: counts every Status=`Delivered` order. Since no code path sets Status=`Invoiced`, an order ticked as invoiced stays "αδρανές" forever; «Όλα τιμολογημένα» is unreachable while any delivered order exists. The comment claims the checkbox "may not exist" — it is mapped. | ceo:586-596, 420; worker:1431 |
| [BROKEN] | Sparkline buckets are sorted as strings (`localeCompare` on `W9`, `W10`…) and keyed without year → wrong order across W9→W10 and at year change; `.slice(-8)` then keeps the wrong weeks. | ceo:652, 668 |
| [BROKEN] | «4-εβδ. μέσος: N/A%» is rendered when there is no weekly data (`_weekAvg` returns the string `'N/A'`, the template appends `%`). | ceo:387, 672-675 |
| [BROKEN] | Revenue target is asked as «Μηνιαίος Στόχος» but compared against whichever period is selected (week, quarter, YTD). | ceo:684, 325-332 |
| [BROKEN] | «Κατανομή φόρτου» keys drivers by the first word of the name: two drivers sharing it are summed into one bar. | ceo:751-752 |
| [BROKEN] | «Διαθέσιμοι» can go negative and «Αξιοποίηση οδηγών» above 100 %: the used-driver set includes drivers who are no longer active, the denominator only active ones. | ceo:499-508, 296 |
| [INCONSISTENT] | Week definition: this page uses its own ISO week number and a Monday–Sunday range; the rest of the app uses one definition, TmsWeek (Saturday–Friday). «W..» here can differ from every other screen. | ceo:48-52, 87-93 vs core/metrics.js:21-28 |
| [INCONSISTENT] | «Με ανάθεση» = has `Truck` only (sub «με truck»); `metrics.assignmentRate` (Dashboard, audit) = truck OR partner. Partner trips count as unassigned here. | ceo:577-584 vs metrics.js:449-459 |
| [INCONSISTENT] | «Κρίσιμα — επόμενες 48ω» = any undelivered order due before now+48h, including long-overdue and already-assigned ones; `metrics.highRiskDeliveries` = unassigned AND due within the next 48h. Sub-text says «Παράδοση <48h χωρίς Delivered». | ceo:153, 393-397 vs metrics.js:135-149 |
| [INCONSISTENT] | Two different numbers both called «Έσοδα»: Strategy = Σ Price of all period orders; Cash = Σ Price of delivered. The briefing's «Έσοδα» uses the Cash one. | ceo:330, 414, 461, 808 |
| [INCONSISTENT] | On-time is defined three ways across the files: here (delivered only; actual-vs-planned date first, else `Delivery Performance`), `metrics.onTimePct` (only records whose `Delivery Performance` is On Time/Delayed), and `performance.js` (any truthy `Delivery Performance`, all-time). | ceo:468-482; metrics.js:173-183; perf:302-308 |
| [INCONSISTENT] | Page name: nav «Πίνακας Διοίκησης», header «CEO Dashboard», denied text «Το CEO Dashboard…», error text «Ο πίνακας διοίκησης…». | router.js:80; ceo:862, 19, 213 |
| [INCONSISTENT] | Mixed language in visible copy: «on-time», «proof», «loaded», «partner», «Partner», «Maintenance», «Top 5 Πελάτες (Revenue)», «YTD», «Scaling Up», «ESTIMATE», «Speed Score», «Dead KM», «import matching», «Cash section», «Trip Costs ?», «48h» next to «48ω». | ceo:247, 264, 343, 309, 980, 1095, 1024, 869, 945, 785, 791, 799, 431, 396, 1053 |
| [INCONSISTENT] | "No value" is written three ways: «—» (brand cards), «N/A» (dead km, on-time, partner margin), «Χωρίς δεδομένα» (tables). | ceo:245, 351, 385, 427, 375 |
| [INCONSISTENT] | Stale copy pointing at a system no longer in use: «Έλεγχος Airtable filters.»; setup badges «Απαιτείται πεδίο Actual Delivery Date / Temp Graph Sent στον πίνακα ORDERS»; hint «Προσθέστε "Dead KM" στο ORDERS». | ceo:778, 894, 914, 549 |
| [EXTRA] | `_prevPeriodLabel()` defined, never called. | ceo:78-85 |
| [EXTRA] | `const { onTimePct } = speed` unused; `partnerRevPct: 0` returned and unused; `source` field of `_calcDeadKM` unused; `.ceo-val-accent` not used by this module (CSS not verified beyond grep). | ceo:378, 610, 529 |
| [EXTRA] | Speed setup badge «Απαιτείται πεδίο Actual Delivery Date…» is obsolete: the field is mapped and written by Daily Ops. | ceo:894; worker:1416; daily_ops.js:1581 |
| [MISSING] | No drill-down from any KPI to the orders behind it (no click targets anywhere). | ceo:855-1134 |
| [MISSING] | No explicit date range shown for the selected period (only a label in the briefing), and no "previous period" label next to the deltas. | ceo:69-76, 829-840 |
| [MISSING] | Anxiety count and revenue target live in `localStorage` only — not shared between devices, no history, lost on browser clear. | ceo:495, 679, 708 |
| [MISSING] | No export / print of the management view. | — |
| [MISSING] | National work is absent: every KPI reads ORDERS only (no national loads / national v5). | ceo:125-155 |
| [LOCKED] | All money figures read `Price` (not `Net Price`) until the P&L phase — keep. | ceo:520, 622; CLAUDE.md locked decisions |
| [LOCKED] | Page is owner-only; dispatcher must not see margins/costs — keep the gate. | ceo:18; config.js:355 |
| [LOCKED] | "Invoiced" is a checkbox, not a status — any redesign of the uninvoiced KPI must read the checkbox, not expect a status. | CLAUDE.md locked decisions |

### 1.5 States as coded

| State | What renders | file:line |
|---|---|---|
| No permission | `<h2>Χωρίς πρόσβαση</h2><p>Το CEO Dashboard είναι μόνο για τον ιδιοκτήτη του λογαριασμού.</p>` (class `access-denied`) | ceo:19 |
| Loading | Shell drawn immediately; values «—»; sub-lines and table bodies «Φόρτωση…»; timestamp «Φόρτωση…»; no spinner/skeleton | ceo:871, 959, 1026, 1130 |
| Error | Whole content replaced: «Ο πίνακας διοίκησης δεν φόρτωσε» + «Η φόρτωση των ORDERS / DRIVERS / κόστους γύρισε σφάλμα. Αυτό ΔΕΝ σημαίνει ότι δεν υπάρχουν δεδομένα. Ξαναδοκίμασε· αν επιμένει, ενημέρωσε τον διαχειριστή.» + button «Ξαναδοκίμασε» | ceo:212-218 |
| Timeout (15 s) | «Ο πίνακας διοίκησης δεν απάντησε μέσα σε 15 δευτερόλεπτα» + «Ο διακομιστής δεν απάντησε — ORDERS / DRIVERS / κόστη. Αυτό ΔΕΝ σημαίνει ότι δεν υπάρχουν δεδομένα. Έλεγξε τη σύνδεση και ξαναδοκίμασε.» | ceo:213-216 |
| Partial failure | timestamp turns warn colour: «Ενημερώθηκε HH:MM · ⚠ δεν φόρτωσε: σύγκριση περιόδου, κόστος δρομολογίων, συντήρηση» | ceo:181-196 |
| Empty period | Briefing: «Δεν υπάρχουν φορτία για {period}. Έλεγχος Airtable filters.»; tables «Χωρίς δεδομένα», «Χωρίς δεδομένα οδηγών», «Απαιτείται Trip Costs data» / «Καμία ζημιογόνος διαδρομή»; no target: «Πατήστε ✎ για στόχο»; no critical: «Καμία κρίσιμη στις επόμενες 48h»; no uninvoiced: «Όλα τιμολογημένα»; no revenue: «χωρίς έσοδα» | ceo:778, 375, 756, 457, 332, 396, 420, 425 |

---

## 2. «Η Απόδοσή μου» — `modules/performance.js` (route `performance`)

### 2.1 Who sees it, what they do
- Perm `performance`: owner `full`; dispatcher / management / accountant `view`; warehouse `none` (`config.js:354-365`). Item carries its own perm so it shows even though its section is owner-only (`router.js:81-84, 140-157`). Gate is enforced in `navigate()` (`router.js:276-280`); there is no gate inside the module (`perf:150-179`). `full` vs `view` makes no difference in the module.
- Each user sees 4 KPI cards chosen by a per-username rule (six hard-coded sets, `perf:94-137`), falling back to a per-role set (`perf:140-145`), then to the owner set (`perf:645`). Read-only except personal goals (browser-local checklist).
- Header shows the user's display name and a role subtitle from a per-username map with per-role fallback (`perf:674-687, 878-879`).

### 2.2 Inventory

| # | Element | file:line |
|---|---|---|
| 1 | Header: user name, role line «… · Εβδομάδα N (τρέχουσα / περασμένη)» | perf:876-880 |
| 2 | Week selector: «‹» (title «Προηγούμενη εβδομάδα»), `<select>` of 8 weeks («W.. τρέχουσα», «W.. περασμένη», «W..»), «›» (title «Επόμενη εβδομάδα», disabled at current) | perf:883-893, 1038-1051 |
| 3 | Live chip «ΤΡΕΧΟΥΣΑ» / «ΠΑΡΕΛΘΟΝ» with pulsing dot | perf:894-897 |
| 4 | Button «Ανανέωση» (full reload) | perf:898 |
| 5 | Button «Εξαγωγή CSV» | perf:899, 1062-1080 |
| 6 | KPI grid: 4 cards (icon + label, value+unit, WoW delta, «Στόχος: ≥/≤ …» + note, progress bar, top glow line) | perf:755-788, 903 |
| 7 | Card «ΤΑΣΗ ΕΒΔΟΜΑΔΙΑΙΟΥ ΣΚΟΡ» · «τελευταίες 4 εβδομάδες» — 4 horizontal bars `W.. n/100` | perf:791-805, 908-916 |
| 8 | Card «ΠΡΟΣΦΑΤΕΣ ΠΑΡΑΔΟΣΕΙΣ» · «N παραδόσεις» — table ΗΜ/ΝΙΑ / ΔΡΟΜΟΛΟΓΙΟ / PAL / ΕΠΙΔΟΣΗ, last 10, pills «Εγκαίρως» / «Εκπρόθεσμη» | perf:808-834, 919-930 |
| 9 | Card «ΕΒΔΟΜΑΔΙΑΙΟ ΣΚΟΡ» · «W..» — conic ring, «ΣΥΝΟΛΙΚΗ ΑΠΟΔΟΣΗ» (+ « · χωρίς δείγμα» / « · πολύ νωρίς»), 4 mini bars (one per the user's KPIs, label cut to 2 words) | perf:837-840, 935-962 |
| 10 | «ΣΥΝΟΨΗ · W..» — one generated sentence + optional warning line | perf:843-858, 965-973 |
| 11 | Card «ΣΤΟΧΟΙ» · «done/total» — checkbox rows, remove «x» (title «Αφαίρεση»), input placeholder «Νέος στόχος...» + «+» button | perf:861-872, 976-985, 992-1035 |
| 12 | Keyboard: Enter in the goal input adds the goal | perf:870 |
| 13 | Error-state button «Δοκιμή ξανά» | perf:173 |

No tabs, no modal, no print. Export = CSV only.

### 2.3 Logic that must survive (as coded)

Loads (perf:204-226): ALL ORDERS (no date filter, listed fields); NATIONAL LOADS (soft); trucks from reference cache; MAINT_REQ (soft); NATIONAL ORDERS ids only when the national-v5 state ≠ 'before' (soft); then ORDER STOPS for the current week's trucked orders in batches of 90 (perf:261-277). National v5 state via `NatV5Kpi` (perf:23-81) — shared with `metrics_audit.js`.

Shared display rules:
- `-1` = "no sample" → value «—», neutral colour, zero bar, visible reason text (perf:748-754, 759, 771, 782-786).
- `WEEK_MIN = 5`: fewer than 5 orders in the week → value shown, verdict withheld («πολύ νωρίς — N παραγγελίες στη W..»), applies to `fleet_usage`, `plan_complete`, `sub_cost_pct`, `weekly_score` (perf:296-299, 744, 761, 777).
- Card colour: normal KPI ok ≥ target, warn ≥ 70 % of target, else bad; inverted KPI ok ≤ target, warn ≤ 150 % of target, else bad (perf:764-773). Bar fill = value/target (or target/value inverted), capped 100 (perf:763, 786).
- Score ring / trend bars: ≥85 ok, ≥70 warn, else danger (perf:797, 839).
- WoW delta only for `weekly_score`, `on_time`, `plan_complete`, vs the previous trend entry (perf:715-738).
- Briefing sentence: by score band (unknown / early / ≥85 / ≥70 / else); warnings: dead km >100; fleet usage <60 (perf:843-858).

KPI catalogue (id → label → definition):

| id | Label (as shown) | Unit · target | Definition | file:line |
|---|---|---|---|---|
| weekly_score | «ΕΒΔΟΜΑΔΙΑΙΟ ΣΚΟΡ» | /100 · 85 | `metrics.weeklyScore`(assignment=plan_complete, on_time, compliance=`metrics.compliancePct`, dead-km score); −1 if on_time or plan_complete unknown | perf:561-578 |
| fleet_usage | «ΑΞΙΟΠΟΙΗΣΗ ΣΤΟΛΟΥ» | % · 80 | per active truck: Σ(delivery−loading days) of own-fleet week orders × 20.25, capped 100; mean over active trucks; −1 if the week has no orders | perf:316-335 |
| dead_km | «ΚΕΝΑ ΧΙΛΙΟΜΕΤΡΑ» | km · ≤50 | mean haversine distance, last unloading stop of a week export → first loading stop of a week import on the same truck; −1 if no pair with coordinates | perf:358-383 |
| on_time | «ΣΥΝΕΠΕΙΑ ΠΑΡΑΔΟΣΗΣ» | % · 90 | On Time ÷ orders with any `Delivery Performance`, over ALL loaded orders (not the selected week) | perf:302-309 |
| plan_complete | «ΟΛΟΚΛΗΡΩΣΗ ΠΛΑΝΟΥ» | % · 100 | week exports with `Truck` ÷ week exports | perf:337-340 |
| sub_cost_pct | «ΚΟΣΤΟΣ ΣΥΝΕΡΓΑΤΩΝ» | % · ≤30 | week orders flagged `Is Partner Trip` ÷ week orders with truck or partner (a trip count, not a cost) | perf:444-447 |
| cmr_collected | «CMR ΑΥΘΗΜΕΡΟΝ» | % · 95 | delivered orders with `CMR Photo Received` (or `CMR Received`) ÷ delivered orders, all-time; proxy if neither key present | perf:425-436 |
| client_updates | «ΕΝΗΜΕΡΩΣΕΙΣ ΠΕΛΑΤΗ» | % · 100 | week delivered with `Client Notified` ÷ week delivered | perf:449-452 |
| response_time | «ΧΡΟΝΟΣ ΑΠΟΚΡΙΣΗΣ» | h · ≤2 | mean age in hours of OPEN maintenance requests | perf:454-461 |
| natl_on_time | «ΣΥΝΕΠΕΙΑ ΕΘΝΙΚΩΝ» | % · 90 | national loads with Status Delivered/Invoiced and actual ≤ planned date; from day L adds v5 nationals (executed, not late) | perf:385-418 |
| plan_reviewed | «ΕΛΕΓΧΟΣ ΠΛΑΝΟΥ» | · 1 | `localStorage` flag per year+week | perf:539-542 |
| crisis_count | «ΚΡΙΣΕΙΣ ΠΟΥ ΛΥΘΗΚΑΝ» | · 0 | count of OPEN maintenance requests with priority SOS/Άμεσα (and legacy English values) | perf:544-550 |
| natl_profit | «ΚΕΡΔΟΦΟΡΙΑ ΕΘΝΙΚΩΝ» | % · 15 | mean (Price−Cost)/Price over national loads with both; from day L forced to −1 with reason «εκτός: το περιθώριο των εθνικών μετριέται στο P&L, όχι εδώ» | perf:491-511 |
| expired_docs | «ΛΗΓΜΕΝΑ ΕΓΓΡΑΦΑ» | · ≤0 | count of expired documents (KTEO / KEK / insurance, date ≤ today) on active trucks | perf:463-472 |
| work_orders | «ΕΝΤΟΛΕΣ ΠΟΥ ΕΚΛΕΙΣΑΝ» | % · 80 | maintenance requests Done ÷ all, all-time; 100 if none | perf:438-442 |
| downtime_hrs | «ΑΚΙΝΗΣΙΑ ΣΤΟΛΟΥ» | h · ≤24 | open maintenance requests × 24 | perf:474-475 |
| service_adherence | «ΠΡΟΓΡΑΜΜΑ ΣΥΝΤΗΡΗΣΗΣ» | % · 100 | Done requests closed ≤7 days after `Date Reported` ÷ Done requests; 100 if none | perf:477-489 |
| invoiced_pct | «ΤΙΜΟΛΟΓΗΜΕΝΑ» | % · 100 | Status=Invoiced ÷ Status∈{Delivered, Invoiced}, all-time | perf:420-423 |
| cmr_archived | «CMR ΣΤΟ ΑΡΧΕΙΟ» | % · 95 | `CMR Archived` if key present; else Status=Invoiced ÷ delivered | perf:513-524 |
| outstanding | «ΑΝΕΞΟΦΛΗΤΑ» | EUR · ≤0 | Σ `Price` of Status=Delivered, all-time | perf:526-531 |
| pallet_balance | «ΙΣΟΖΥΓΙΟ ΠΑΛΕΤΩΝ» | · 0 | integer from `localStorage` | perf:533-537 |

Trend (perf:595-635): for current week −3…current: `metrics.weeklyScore`(exports-with-truck %, on-time % of that week, fleet compliance, fixed dead-km score 75); −1 when the week has no `Delivery Performance`.

CSV (perf:1062-1080): ALL loaded orders, columns Order No, Direction, Week, Client, Load Date, Del Date, Pallets, Truck, Driver, Partner, Delivery Performance, Status; UTF-8 BOM; file `performance_<date>.csv`.

### 2.4 Findings

| Tag | Finding | Evidence |
|---|---|---|
| [BROKEN] | «ΤΙΜΟΛΟΓΗΜΕΝΑ» is structurally 0 %: numerator is Status=`Invoiced`, which nothing writes (invoiced is the `Invoiced` checkbox, which this page neither requests nor reads). | perf:189-197, 420-423 |
| [BROKEN] | «CMR ΣΤΟ ΑΡΧΕΙΟ» is structurally 0 %: `CMR Archived` is not in the map and not requested → falls to the Status=`Invoiced` proxy → 0. | perf:516-524 |
| [BROKEN] | «ΑΝΕΞΟΦΛΗΤΑ» counts every Status=`Delivered` order regardless of the `Invoiced` checkbox → never decreases when orders are marked invoiced. Label says "unpaid", code measures "delivered". | perf:530-531 |
| [BROKEN] | «ΙΣΟΖΥΓΙΟ ΠΑΛΕΤΩΝ» is structurally 0 and renders green: reads a `localStorage` key that no code writes (grep: only this read); target 0 and not inverted → `0 >= 0` = ok. The pallet ledger is not read. | perf:533-537, 135, 766 |
| [BROKEN] | «ΕΛΕΓΧΟΣ ΠΛΑΝΟΥ» is structurally 0: its `localStorage` flag has no writer anywhere (comment refers to a `/review-plan` action that does not exist in `modules/` or `core/`). | perf:539-542 |
| [BROKEN] | «ΠΡΟΓΡΑΜΜΑ ΣΥΝΤΗΡΗΣΗΣ» is 0 % whenever any request is Done (else 100 %): it needs a completion date `Date` / `Date Completed` on MAINT_REQ — neither is in the map nor requested. | perf:222, 481-489; worker:1144-1163 |
| [BROKEN] | «ΣΥΝΕΠΕΙΑ ΕΘΝΙΚΩΝ» before day L is structurally 0 % (shown as a red 0, not «—»): it requires national-load Status Delivered/Invoiced, which no path writes for nationals. | perf:387-396; weekly_natl.js:630-636 |
| [BROKEN] | «ΚΕΡΔΟΦΟΡΙΑ ΕΘΝΙΚΩΝ» before day L is structurally 0 %: NATIONAL LOADS has no `Price` / `Cost` / `Total Cost` label and the request does not ask for them. | perf:218-219, 493-504; worker:1850-1880 |
| [BROKEN] | «ΚΡΙΣΕΙΣ ΠΟΥ ΛΥΘΗΚΑΝ» shows the opposite of its label (counts OPEN urgent requests) and is always green: target 0, not inverted → any value ≥ 0 is "ok". | perf:120, 547-550, 766 |
| [BROKEN] | Partial-load warning is computed but never shown: `PERF.failedSources` is filled and never read by `_perfDraw` — a failed national-loads or maintenance read silently shifts the KPIs. | perf:236-239 (only occurrence) |
| [BROKEN] | Week picker does not move the trend, the WoW deltas, or the dead-km data: `_perfTrends()` and the ORDER STOPS fetch always use the current week, so on a past week the card shows that week's value with a delta against "current week −1", and dead km is «—». | perf:261-263, 596, 715-721 |
| [BROKEN] | Goals can be saved but not shown for some users: the list is read with one key rule (whitespace → `_`) and written with another (every non-ASCII-alphanumeric → `_`). Identical only for plain ASCII names. | perf:861-862 vs 992-996 |
| [BROKEN] | Ticking a goal does not re-render: strike-through and the «done/total» counter stay stale until reload. | perf:1021-1028 |
| [BROKEN] | CSV first column «Order No» is always blank: reads `Order Number`, which does not exist (use `Reference`) and is not requested. Export ignores the selected week (dumps every loaded order). | perf:1065-1067 |
| [BROKEN] | Week arithmetic is `currentWeek + offset` with no year handling: in the first weeks of a year the selector offers W0, W−1… | perf:286, 644, 886-888 |
| [BROKEN] | `<select>` offers 8 weeks (0…−7) but «‹» allows −8: at −8 no option is selected. | perf:886, 1041, 1048 |
| [BROKEN] | Unknown dead km is scored as perfect (100) inside the weekly score. | perf:562 |
| [BROKEN] | Values render glued to units («0EUR», «50km», «2h»). | perf:784, 957 |
| [INCONSISTENT] | Mixed time windows under one "Εβδομάδα N" header: `on_time`, `invoiced_pct`, `cmr_collected`, `cmr_archived`, `outstanding`, `work_orders`, `expired_docs` are all-time; others are the selected week; nothing on the card says which. | perf:302, 421, 427, 440, 530 |
| [INCONSISTENT] | «ΑΞΙΟΠΟΙΗΣΗ ΣΤΟΛΟΥ» here = truck-days formula; the Dashboard's fleet figure and the audit use `metrics.fleetUtilization` (busy trucks ÷ active). Same label, different number. The code comment's own arithmetic (5 days = 100 %) does not match the ×20.25 factor. | perf:316-335 vs metrics.js:379-389 |
| [INCONSISTENT] | Dead-km → score mapping exists in three variants: perf card (`100−(km−50)`, then ×0.33), `metrics.deadKmForPeriod` (×0.5 both legs), and a fixed 75 in the trend and the audit. | perf:562-565, 602; metrics.js:293-295; audit:153, 577 |
| [INCONSISTENT] | Weekly score "assignment" input = exports with `Truck`; canonical `metrics.assignmentRate` = truck OR partner, all directions. | perf:573 vs metrics.js:449-459 |
| [INCONSISTENT] | Partner trips identified by `Is Partner Trip` here, by the `Partner` link in the CEO page and `metrics.partnerTripPct`. | perf:317, 446 vs ceo:511; metrics.js:469 |
| [INCONSISTENT] | «ΚΟΣΤΟΣ ΣΥΝΕΡΓΑΤΩΝ» is a share of trips, not a cost. «ΧΡΟΝΟΣ ΑΠΟΚΡΙΣΗΣ» is the age of open maintenance requests (assigned to an execution/tracking KPI set). «CMR ΑΥΘΗΜΕΡΟΝ» has no same-day test. | perf:107, 114, 112, 431, 454-461 |
| [INCONSISTENT] | Expired document = `date <= today` here, `date < today` in `metrics.compliancePct` (a document expiring today is expired on one, valid on the other). KPI description still mentions ATP. | perf:470 vs metrics.js:436; perf:125 |
| [INCONSISTENT] | KPI `desc` texts are English and never rendered; table header «PAL»; CSV headers English; pills Greek. Page title «Η Απόδοσή μου» appears only in the error state — the normal state has no page title, just the user's name. | perf:104-135, 926, 1065, 164, 878 |
| [INCONSISTENT] | Stale comments describe a second local score formula ("hardcodes 50", "33 vs 44") that no longer exists — the trend now calls `metrics.weeklyScore` with 75. The same stale sentence is shown to the user in the audit page. | perf:650-656; audit:162-163 |
| [EXTRA] | Computed, never displayed in any KPI set: `assign_speed`, `empty_legs` (local var), `zero_anxiety: 0`, `on_time_sample`. | perf:314, 342-356, 581-587 |
| [EXTRA] | `PERF.drivers` never filled; `Client` requested only for CSV; `PERF.natOrders` only for v5. `roleLabels`/KPI sets hard-code usernames in the module (a per-username rule in code rather than data). | perf:85, 94-137, 674-681 |
| [EXTRA] | `full` vs `view` permission is not distinguished anywhere in the module. | perf:150-179 |
| [MISSING] | No explanation on the card of what each KPI counts (the `desc` exists but is not shown) or of its time window. | perf:779-787 |
| [MISSING] | No link from a KPI to the underlying records; «ΠΡΟΣΦΑΤΕΣ ΠΑΡΑΔΟΣΕΙΣ» rows are not clickable and are not filtered to the user or the selected week. | perf:808-834 |
| [MISSING] | Nothing on the page is per-person: every user with the same KPI set sees company-wide numbers under their own name. | perf:283-592 |
| [MISSING] | Goals are browser-local (no sync, no due date, no link to a KPI). | perf:992-1035 |
| [LOCKED] | One per-username set contains a national margin KPI («ΚΕΡΔΟΦΟΡΙΑ ΕΘΝΙΚΩΝ»). A dispatcher must not see margins; the code already replaces it with «εκτός…» from day L — do not "repair" it into a real margin for a dispatcher role (role of that user: not verified in code). | perf:121, 505-511 |
| [LOCKED] | Money KPIs use `Price`, not `Net Price`. | perf:526-531 |
| [LOCKED] | Nationals: "delivered" is computed, never read from Status — any national on-time redesign must follow that rule. | weekly_natl.js:630-636 |

### 2.5 States as coded

| State | What renders | file:line |
|---|---|---|
| Loading | centred spinner + «Φόρτωση δεδομένων απόδοσης…» | perf:152-153 |
| Error | page header «Η Απόδοσή μου» / «Προσωπικοί δείκτες και στόχοι» + banner «Η απόδοση δεν φόρτωσε» / «{message} — ORDERS / NATIONAL LOADS / TRUCKS. Αυτό ΔΕΝ σημαίνει ότι δεν υπάρχουν παραδόσεις. Ξαναδοκίμασε.» + «Δοκιμή ξανά» | perf:161-175 |
| No permission | none in module; `navigate()` shows toast «Δεν έχετε πρόσβαση σε αυτή τη σελίδα» | router.js:280-281 |
| KPI unknown | «—» + reason: «καμία παράδοση με καταγεγραμμένη επίδοση» / «κανένα ζεύγος εξαγωγής/εισαγωγής με συντεταγμένες» / «χωρίς δείγμα — δεν υπολογίζεται» / «καμία παραγγελία στη W..» / «χωρίς δείγμα» / national reasons | perf:748-754, 409, 416, 510 |
| Too early | «πολύ νωρίς — N παραγγελία/παραγγελίες στη W..» | perf:777 |
| Empty trend | «Καμία εβδομάδα με καταγεγραμμένη επίδοση — ORDERS, 4 εβδομάδες» | perf:914 |
| Empty deliveries | «Καμία παράδοση με καταγεγραμμένη επίδοση — ORDERS» | perf:927 |
| Empty goals | «Δεν έχουν οριστεί στόχοι» | perf:868 |
| Score unknown | ring «—», «ΣΥΝΟΛΙΚΗ ΑΠΟΔΟΣΗ · χωρίς δείγμα»; briefing «Χωρίς σκορ για τη W..: … Δεν σημαίνει κακή εβδομάδα — σημαίνει ότι δεν μετρήθηκε ακόμη.» | perf:942-944, 845 |
| Toasts | «Δεν υπάρχουν δεδομένα για εξαγωγή», «Το CSV εξήχθη», «Μέγιστο 50 στόχοι — σβήσε πρώτα κάποιους», «Ο στόχος δεν αποθηκεύτηκε — γεμάτος χώρος του browser;» | perf:1064, 1079, 1014, 1005 |

---

## 3. «Έλεγχος Μετρήσεων» — `modules/metrics_audit.js` (route `metrics_audit`)

### 3.1 Who sees it, what they do
- Owner only: nav item `role:'owner'` (`router.js:90`) and route check `ROLE !== 'owner'` → `showAccessDenied()` (`router.js:433-438`). No gate inside the module.
- Internal verification tool: (a) "cross-checks" — compares figures that other pages reported while rendered in this browser session (`reportPageMetrics` / `readPageMetrics`, `core/utils.js:402`) against each other or a canonical value; (b) a flat table of every canonical metric from `core/metrics.js`. Read-only.

### 3.2 Inventory

| # | Element | file:line |
|---|---|---|
| 1 | Title «Έλεγχος Μετρήσεων» + sub «N μετρήσεις · φορτώθηκε HH:MM:SS · κανονικές τιμές από metrics.js» | audit:896-899 |
| 2 | Button «Αντιγραφή JSON» (clipboard) | audit:902, 949-985 |
| 3 | Button «Ανανέωση» | audit:903 |
| 4 | Failure banner «⚠ Κάποια νούμερα παρακάτω μπορεί να είναι λάθος. …» | audit:796-803 |
| 5 | Status strip: «✓ Καμία ανεξήγητη διαφορά μεταξύ σελίδων» / «⚠ N διαφορές εντοπίστηκαν» + «· N σελίδες έχουν αναφέρει τιμές σε αυτή τη συνεδρία» | audit:909-914 |
| 6 | How-to note «Πώς να το χρησιμοποιήσεις: …» + «Δεν έχουν ανοίξει ακόμη: …» | audit:916-922 |
| 7 | Section «ΔΙΑΣΤΑΥΡΩΣΕΙΣ ΜΕΤΑΞΥ ΣΕΛΙΔΩΝ»: 8 cards (title, optional badge «N διαφορές», why-line, «Κανονική τιμή», table Σελίδα / Τιμή σελίδας / Διαφορά / Σημείωση) | audit:85-220, 671-748, 924-925 |
| 8 | Section «ΜΕΤΡΗΣΕΙΣ»: search input (placeholder «Αναζήτηση μέτρησης ή κλειδιού…») | audit:929-930, 750-757 |
| 9 | Category tabs with counts: «Όλες», «Λειτουργικές», «Απόδοση», «Οικονομικές», «Στόλος», «Ομάδα», «Απόθεμα», «Επιχείρηση» (+ «Εθνικά v5» from day L); disabled when 0 rows | audit:869-889, 931-935 |
| 10 | One card per category (titles «ΛΕΙΤΟΥΡΓΙΚΕΣ», «ΑΠΟΔΟΣΗ», «ΟΙΚΟΝΟΜΙΚΕΣ», «ΣΤΟΛΟΣ», «ΟΜΑΔΑ», «ΑΠΟΘΕΜΑ», «ΕΠΙΧΕΙΡΗΣΗ», «ΕΘΝΙΚΑ v5»): table Μέτρηση / Κλειδί / Τιμή / Σημείωση | audit:777-786, 812-861 |
| 11 | Legend «Υπόμνημα: …» | audit:940-945 |
| 12 | Error-state button «Ξαναδοκίμασε» | audit:383 |

No modal, no period selector (windows are fixed per metric), no keyboard shortcuts, no print. Export = JSON to clipboard.

Cross-check cards (audit:85-220): «Αριθμός εβδομάδας», «Ληγμένα έγγραφα στόλου», «Οχήματα με ληγμένο έγγραφο», «Συμμόρφωση στόλου %», «Εβδομαδιαίο σκορ», «Παραγγελίες τιμολόγησης», «Λήξεις Εγγράφων — «συμμόρφωση» έναντι «VALID»», «Πλήθος φορτηγών».

Metric rows (audit:407-607): op ×10, perf ×7, fin ×7, fleet ×6, hr ×4, inv ×2, biz ×2, natl ×5 (only from day L).

### 3.3 Logic that must survive
- 13 parallel reads, each wrapped so a failure is tagged, not silently empty (audit:326-351); failed sources listed in `AUDIT.failedSources` (audit:368-370).
- A category whose listed source failed shows «—» + «Μη διαθέσιμη: δεν φορτώθηκαν τα δεδομένα πηγής», never the computed 0 (audit:818-850). Mapping category → sources: audit:33-44.
- A percentage with zero denominator renders «—», not 0 % (audit:404).
- Cross-check row states: «δεν άνοιξε» (page not rendered this session), «δεν αναφέρθηκε» (rendered, no figure; `-1` is the "not applicable" marker), value + capture time (audit:681-692, 254-257).
- Difference cell: «βάση», «✓ ίδιο», «+N δηλωμένη» (expected, explained), «+N διαφορά» (fault). Only undeclared non-zero differences count toward the status strip (audit:283-288, 696-704).
- Baseline: canonical value when present, else a named baseline page; the weekly score deliberately compares page-to-page (`preferBaseline`) (audit:271-281).
- Row styling: fault = red left stripe; declared / warning = warm tint + amber stripe (audit:652-654, 732-733).
- Day-L logic for nationals: v5 share added to outstanding / invoiced totals without double counting (audit:476-505); the «Εθνικά v5» group exists only from day L or when L is unknown (audit:591-607, 882-885).
- JSON export carries a warning block when any source failed, and the cross-check results (audit:949-981).

### 3.4 Findings

| Tag | Finding | Evidence |
|---|---|---|
| [BROKEN] | Failed-source masking is incomplete — the category→source map does not match what the metrics read: `fin` reads both pallet ledgers (not listed), `hr` reads maintenance requests (not listed), `biz` reads trucks (not listed; lists national orders it does not read), `fleet` reads orders for utilisation/idle (not listed). A failed read of those sources leaves confident zeros on the accuracy page. | audit:33-44 vs 514-520, 554-558, 575, 525-529 |
| [BROKEN] | Cross-check «Αριθμός εβδομάδας» has a row for page `orders_intl`, but no module reports under that id (reporters: dashboard, weekly_intl, weekly_natl, performance, invoicing, maint_dash, maint_expiry, entity pages) and it is not a nav id (alias only) → permanently «δεν άνοιξε», labelled with the raw id. | audit:94; router.js:42, 266; grep `reportPageMetrics` |
| [BROKEN] | `weekly_natl` rows can never be reported once the v5 national board is in use (it deliberately does not call `reportPageMetrics`) → permanent «δεν άνοιξε». | audit:97; weekly_natl_v5.js:263 |
| [BROKEN] | «Εβδομαδιαίο σκορ (σύνθετο)» note prints the raw word `amber`: the colour map handles green/yellow/red, `metrics.weeklyScore` returns `amber`. | audit:580 vs metrics.js:523 |
| [BROKEN] | «Καθυστερημένες παραδόσεις» sample shows record-id fragments: `Order Number` does not exist (dropped by the facade), so the fallback `r.id.slice(-6)` is always used. Also against the house rule that messages do not name records by code. | audit:329, 428-429 |
| [BROKEN] | «Έσοδα (τιμολογημένα σύνολο)» / «…(30ημ)» are structurally 0 before day L (rule = Status `Invoiced`, never written); «Επείγοντα που έκλεισαν» is structurally 0 (priority values); see §4. The page presents them as canonical. | audit:492-505, 557-558; metrics.js:314, 483 |
| [BROKEN] | Cross-check note under «Εβδομαδιαίο σκορ» tells the reader the trend uses a local formula that "pins 50" — no longer true (trend calls `metrics.weeklyScore` with 75). | audit:162-163 vs perf:602, 624-631 |
| [INCONSISTENT] | The canonical weekly score here uses on-time over the last 30 days and assignment for the current week; the Performance card uses all-time on-time and exports-with-truck; all three are presented as the same score. | audit:146-155, 573-578 vs perf:302-308, 571-578 |
| [INCONSISTENT] | Invoicing cross-check labels are English tab names («Ready», «Overdue», «Blocked», «Invoiced») and speak of "4 καρτελών"; whether the current invoicing view still has those four tabs: not verified. | audit:176-187 |
| [INCONSISTENT] | Metric labels mix terms for the same idea: «Εμπρόθεσμες %» here vs «ΣΥΝΕΠΕΙΑ ΠΑΡΑΔΟΣΗΣ» (Performance) vs «Συνέπεια παράδοσης» / «on-time» (CEO); «νεκρά χλμ» here vs «Κενά χιλιόμετρα» elsewhere; week prefix «Ε..» here vs «W..» elsewhere. | audit:446, 463, 580; perf:100; ceo:1041, 1013 |
| [INCONSISTENT] | «Ανεξόφλητο υπόλοιπο» = delivered-not-invoiced (not "unpaid"); same wording problem as Performance «ΑΝΕΞΟΦΛΗΤΑ», with a different rule (this one respects the `Invoiced` checkbox). | audit:488-489 vs perf:530 |
| [INCONSISTENT] | «Φορτηγά με έγγραφα προς λήξη (30ημ)» also counts already-expired documents (`date <= today+30`). | audit:531-533; metrics.js:404-411 |
| [INCONSISTENT] | Page builds its own header (`h2.ma-title`) and injects a `<style>` block on every draw instead of the shared page-header pattern. | audit:617-664, 892-896 |
| [EXTRA] | Five sources fetched and never read by any metric: national loads, drivers, partners, locations, clients (acknowledged in a code note). | audit:29-32, 340, 343-346 |
| [EXTRA] | Requested and unused order fields: `Trailer`, `Driver`, `Total Pallets`; `Order Number` (non-existent). | audit:329-330 |
| [EXTRA] | `fleetAlerts30d`, `trucksInUse`, `onTimePct`, `unassignedOpen` are reported by the Dashboard and `onTimePct`/`fleetUsagePct`/`expiredDocs` by Performance, but no cross-check consumes them. | dashboard.js:313-323; perf:669-671; audit:85-220 |
| [MISSING] | Cross-checks only work for pages opened in the same browser session; nothing lets the owner trigger the comparison without visiting each page, and nothing persists a result. | audit:83-84, 916-921 |
| [MISSING] | No cross-check covers the CEO page at all (it does not call `reportPageMetrics`), although it duplicates on-time, assignment, partner share and uninvoiced figures. | grep `reportPageMetrics` (no hit in ceo_dashboard.js) |
| [MISSING] | No period control: each metric has a fixed window baked into its label («30ημ», «τρέχουσα εβδ.», «συνολικά»). | audit:409-585 |
| [LOCKED] | Owner-only; shows revenue and open balances — keep away from dispatcher. | router.js:434-437 |
| [LOCKED] | National orders: the old-model rows contribute 0 by design (nationals never carry Status Delivered; the legacy national-orders table being empty is correct). Do not "fix" by inventing a status. | audit:471-475; CLAUDE.md locked decisions |

### 3.5 States as coded

| State | What renders | file:line |
|---|---|---|
| Loading | «Φόρτωση δεδομένων ελέγχου…» (centred text, no spinner) | audit:300 |
| Error | bordered box: «Δεν φορτώθηκαν τα δεδομένα ελέγχου. Δεν σημαίνει ότι οι μετρήσεις είναι λάθος — δεν υπολογίστηκαν καθόλου. Η αποτυχία έχει καταγραφεί.» + «Ξαναδοκίμασε» | audit:380-384 |
| No permission | shared block: «Δεν έχεις πρόσβαση» / «Αυτή η ενότητα δεν είναι διαθέσιμη για τον ρόλο σου.» | core/ui.js:295-303 |
| Partial failure | banner «⚠ Κάποια νούμερα παρακάτω μπορεί να είναι λάθος. Δεν φορτώθηκαν N πίνακες: … εμφανίζονται ως «—», όχι ως μηδέν …»; per category «⚠ Αναξιόπιστες: δεν φορτώθηκε …» | audit:796-803, 819-822 |
| Calculation error | row «Σφάλμα υπολογισμού» with value «ΣΦΑΛΜΑ: {message}» | audit:441, 469, 521, 544, 559, 569, 586, 606 |
| Empty search | «Καμία διασταύρωση δεν ταιριάζει με «q».» / «Καμία μέτρηση δεν ταιριάζει με «q».» | audit:678, 938 |
| Clipboard | toasts «Το JSON αντιγράφηκε» / «Η αντιγραφή απέτυχε — δοκίμασε ξανά» | audit:983-984 |

---

## 4. `core/metrics.js` — shared KPI definitions

### 4.1 Who uses it

| Caller | Functions called | file:line |
|---|---|---|
| modules/dashboard.js | `fleetUtilization`, `compliancePct`, `assignmentRate`, `weeklyScore` | dashboard.js:138-139, 164, 166, 181-184, 309 |
| modules/performance.js | `compliancePct`, `weeklyScore` | perf:569-577, 600-631 |
| modules/metrics_audit.js | 30 functions (everything except those listed as unused below) | audit:409-585 |
| modules/ceo_dashboard.js | none — all KPIs are local re-implementations | ceo:468-634 |

No callers in `modules/` or `core/`: `delayedPct`, `deadKmForPeriod`, `topDebtors`, `ordersDelta`, `captureSnapshot`, `captureSnapshotsBatch`, `getSnapshotHistory`.

### 4.2 Inventory and definitions (the logic)

Common pre-filters: split legs removed when the split feature flag is on (metrics.js:41-47); loose stock pieces removed from unassigned / overdue / high-risk / assignment (55-57); stock pieces removed from invoice figures (63-65). Week = `TmsWeek.numOf` (25-28). `_inPeriod`: a missing date counts as inside the period (13-20).

| Function | Counts | file:line |
|---|---|---|
| `unassignedOrders` | no `Truck` and no `Partner`; optional direction + period on `Loading DateTime` | 69-81 |
| `pendingToday` | loading today, Status not In Transit / Delivered / Invoiced | 83-92 |
| `loadingsDone` / `deliveriesDone` | loading today with a done status / delivery today with Delivered or Invoiced | 94-111 |
| `checklistProgress` | of 5 checkboxes (`Docs Ready`, `Temp OK`, `CMR Photo Received`, `Client Notified`, `Driver Notified`): done ÷ present | 113-121 |
| `overdueDeliveries` | delivery date < today and not Delivered/Invoiced | 123-133 |
| `highRiskDeliveries` | unassigned and delivery within next 48 h | 135-149 |
| `rampPalletFlow` | today's ramp pallets by `Type` «Παραλαβή» (in) / «Φόρτωση» (out) | 151-162 |
| `stockInWarehouse` | Σ pallets where Type «Παραλαβή», Status Done, `Stock Status` In Stock | 164-169 |
| `onTimePct` / `delayedPct` | On Time ÷ (On Time + Delayed) by `Delivery Performance`, optional period on delivery date | 173-189 |
| `onTimeTrend` / `onTimeStreak` | per `Week Number`, last N weeks; streak = consecutive past weeks ≥ 90 % (lookback 8, stops at an empty week) | 191-226 |
| `cmrSameDayPct` / `clientUpdatePct` | delivered with `CMR Photo Received` / `Client Notified` ÷ delivered | 228-250 |
| `emptyLegs` | exports whose delivery country has no import loading there + the reverse (set membership, not pairing) | 252-262 |
| `deadKmForPeriod` | stub — always returns avg 0, score 100 | 268-297 |
| `outstandingBalance` | Σ `Price` where Status Delivered and not `Invoiced` | 301-307 |
| `revenueInvoiced` | Σ `Price` where Status = Invoiced, period on `Invoice Date` else delivery date | 309-317 |
| `revenueReadyToInvoice` / `overdueInvoices` | delegate to the invoicing page's own rule (`OrdersData.stateOf` / `ageOf`); overdue = ready or blocked and older than 30 days | 327-351 |
| `palletBalance` / `topDebtors` | Σ pallets per counterparty, `Direction` OUT = +, else − | 353-375 |
| `fleetUtilization` / `idleTrucks` | active trucks that appear on any order of the week ÷ active trucks | 379-400 |
| `expiryAlerts` / `expiryAlertsTrailers` | active trucks (KTEO / KEK / insurance) and trailers (KTEO / FRC / insurance) with date ≤ today+30 | 402-429 |
| `compliancePct` | active trucks with all three documents blank or ≥ today ÷ active trucks | 431-440 |
| `fleetDowntime` | open maintenance requests × 24 h | 442-445 |
| `assignmentRate` / `partnerTripPct` | truck-or-partner ÷ week orders / partner ÷ assigned | 449-471 |
| `workOrdersResolvedPct` / `crisisEventsResolved` | Done ÷ all / count Done with priority High or Critical | 473-485 |
| `palletSheetsComplete` | pallet-exchange orders with sheet 1 (and sheet 2 when Veroia Switch) uploaded | 489-499 |
| `stockAgeBuckets` | in-stock pallets by age ≤1 d / 2–3 d / >3 d from `Plan Date` | 501-516 |
| `weeklyScore` | 0.30·assignment + 0.30·on-time + 0.25·compliance + 0.15·dead-km score; ≥85 green, ≥70 amber, else red | 520-525 |
| `ordersDelta`, `directionImbalance` | count delta and %; abs(exports − imports) | 527-537 |
| snapshot capture / history | write/read to a `METRICS_SNAPSHOTS` table | 545-619 |

### 4.3 Findings

| Tag | Finding | Evidence |
|---|---|---|
| [BROKEN] | `crisisEventsResolved` is structurally 0: tests priority `High`/`Critical`; the app's values are «SOS» / «Άμεσα» / normal. | metrics.js:480-485; maintenance.js:1787-1792 |
| [BROKEN] | `revenueInvoiced` is structurally 0 for ORDERS: filters Status = `Invoiced`, which no code writes; the invoiced fact is the `Invoiced` checkbox (which `outstandingBalance` does use, two lines above). | metrics.js:305 vs 314 |
| [BROKEN] | `deadKmForPeriod` is a stub that returns score 100 for "no data" — a perfect score from nothing if anyone wires it. | metrics.js:268-297 |
| [BROKEN] | Snapshot functions target a facade id that is not in the Worker map — capture/history cannot work (they swallow the error and return null / []). | metrics.js:545-619; config.js:83 |
| [BROKEN] | `onTimeTrend` / `onTimeStreak` use raw week-number arithmetic (`curW − weeks`) with no year → empty/negative weeks at the start of a year; week numbers also collide across years. | metrics.js:193-209 |
| [INCONSISTENT] | `pendingToday`, `loadingsDone`, `deliveriesDone`, `overdueDeliveries`, `cmrSameDayPct`, `clientUpdatePct` all treat `Invoiced` as a status value; the locked vocabulary says it is not one. Harmless today, misleading as a definition. | metrics.js:86, 97, 109, 127, 234, 246 |
| [INCONSISTENT] | `_daysAgo` uses UTC (`toISOString`) while `_today` uses the local date — windows can shift by a day around midnight. | metrics.js:10-12 |
| [INCONSISTENT] | `_inPeriod` returns true for a missing date (record counted inside every window). | metrics.js:14 |
| [INCONSISTENT] | File header says "The ONLY place where metrics are computed" — the CEO page computes all of its KPIs locally and Performance most of its own. | metrics.js:2-3; ceo:468-634; perf:283-592 |
| [INCONSISTENT] | Comments still describe the store as Airtable (snapshot table, batch limit). | metrics.js:542, 573 |
| [EXTRA] | Seven exported functions have no caller (list in §4.1); `today` in `expiryAlerts` is assigned and unused; `period` and `locMap` in the stub are unused. | metrics.js:405, 271-273 |
| [MISSING] | No canonical definition for: dead km, expired documents (count), drivers' utilisation, uninvoiced count, national on-time — each page invents its own (see the cross-check notes «Δεν υπάρχει κανονική μέτρηση»). | audit:104-105, 119-120 |
| [LOCKED] | `Price` is the only money field until the P&L phase; «ready / overdue to invoice» must keep delegating to the invoicing rule rather than copying it. | metrics.js:319-328 |

### 4.4 States
Pure functions, no UI. Failure behaviour: snapshot functions catch and `console.warn` (metrics.js:568-569, 599-600, 618); everything else throws to the caller (the audit page catches per category and prints «ΣΦΑΛΜΑ: …»).

---

## 5. Design-relevant inline styling

Charts: no chart library in any of the four files (no Chart.js). Everything is hand-made:
- CEO sparkline = inline SVG (`polyline` + gradient `polygon` + end dot, 36 px high, stroke 1.5) — ceo:713-738.
- Gauges / score ring = CSS `conic-gradient` driven by custom properties (`--g-color`, `--g-deg`; `--perf-score-color`, `--perf-score-deg`), 0.8 s transition — ceo:254-256, 888; perf:941; style.css:6079-6091, 3945-3957.
- Bars = `div` width % (KPI bars, split bar, workload list, trend rows, client mini bars) — ceo:304, 312-313, 369, 764; perf:786, 801, 955.

Colour:
- CEO and Performance render DARK cards on the light page ground, each with its own token block: `.ceo-wrap` (`--ceo-card #0F1C2F`, text `#E2E8F0` / `#94A3B8` / `#7C8CA0`, accent `#38BDF8`, ok `#34D399`, warn `#F59E0B`, bad `#F87171`) — style.css:5860-5885; `.perf-wrap` (`--p-*`, same values) — style.css:3614-3636. KPI card background = 22 px grid lines over a `#12263C → #0F1C2F` gradient — style.css:3693-3700.
- In JS, colours are token references, not hex: `var(--panel-ok-hi)`, `var(--panel-warn)`, `var(--panel-bad-hi)`, `var(--panel-accent)`, `var(--ceo-*)`, `var(--p-*)`, `var(--ok)`, `var(--warn)`, `var(--danger)`, `var(--text-dim)`, `var(--accent)` — ceo:285, 345, 349, 390, 819, 888, 908, 928; perf:771-773, 797, 839, 950. Two palettes are mixed on one page (on-dark `--panel-*`/`--p-*` and light `--ok/--warn/--danger`).
- Audit page is light, tokens only, no per-category colour — audit:617-664.

Type: `'Syne'` for titles (style.css:5909; audit:620, 630, 634, 636; shared denied block core/ui.js:300), `'DM Sans'` for body and numbers (style.css:3633; audit:659); `monospace` for metric keys (audit:650); tabular numerals forced (style.css:3638; audit:639-651).

Hard-coded inline style values in JS (not tokens): font sizes 9 / 11 / 12 px, `border-radius:3px`, `letter-spacing:.3px` on the «ESTIMATE» chip (ceo:343); `padding:32px`, `font-size:12px` in the error block (ceo:212-214); `height:32px;font-size:12px`, `padding:0 8px`, `gap:6px`, `opacity:0.4` in the week selector (perf:883-894); `padding:80px` loader (perf:152); `padding:16px;border-radius:6px` error box and `padding:32px` loader (audit:300, 380); audit CSS uses fixed 6 px radius, 9999 px pill, 28 px search height, `minmax(720px,1fr)` grid (audit:623-662). Inline hover handlers swap colours on the target-edit button (ceo:1002).

Animation: staggered entrance `ceo-fade-up` / `ceo-slide-in` and `perf-fade-up` with per-card delays, disabled under `prefers-reduced-motion` (style.css:5989, 6548-6560, 4150-4160); pulsing live dot `dash-pulse 2s infinite` (style.css:3674-3680); KPI card hover lift `translateY(-2px)` (style.css:3708-3711); gauge transition 0.8 s. Audit page: none.

Icons: shared `icon()` helper (Lucide-style names) with a text fallback; glyph characters used directly in places («⚠», «✓», «✎», «‹», «›») — ceo:13, 332; perf:169, 884, 892; audit:699, 798, 911.

Native browser UI: `prompt()` for the revenue target (ceo:684); `<input type="number">` for anxiety (ceo:938); `<input type="search">` (audit:929).

---

## E3-A. «Ιστορικό Ενεργειών» (route `audit_trail`, `modules/audit_trail.js`)

Loaded by `app.html:211`. Nav item `core/router.js:95` (section «Διαχείριση», icon `clock`). Route case `core/router.js:445-449`. No `.at-` rules exist in `assets/style.css` (grep: none); all page CSS is an inline `<style>` re-emitted on every render (`audit_trail.js:671-736`).

### (1) Who sees it, what they do

| Gate | Where | Effect |
|---|---|---|
| Nav visibility | `core/router.js:86` (section `perm:'settings'`), item has no `role` flag `:95` | Shown to roles with `settings` ≠ none: owner, management (`config.js:354-365`) |
| Route | `core/router.js:445-449` | No `can()` gate on purpose; module decides |
| Module role check | `audit_trail.js:34`, `:602`, `:617-622` | Only `owner`, `management` render the page; others get `showAccessDenied()` |
| Server | `audit_trail.js:113` | 403 → Greek message (server is the real boundary) |
| Mode | `audit_trail.js:606-615` | Not in proxy mode → "not available" page |

Job: answer "who changed which record, when, from what to what". Read-only; no write action exists on the page.

### (2) Inventory

| # | Element | Label as coded | `file:line` |
|---|---|---|---|
| 1 | Header row (one flex line, wraps) | — | `audit_trail.js:626`, css `:676` |
| 2 | Title `h2` | «Ιστορικό Ενεργειών» | `:627` |
| 3 | Count / status sub-label `#afSub` | «φόρτωση…» → «N εγγραφές» / «τελευταίες 200 εγγραφές» (+ « για τα φίλτρα») / «0 εγγραφές» / «δεν φορτώθηκε»; `title` «Το όριο είναι 200 — στένεψε τα φίλτρα για παλαιότερες» or «νεότερες πρώτα» | `:628`, `:782`, `:790`, `:800`, `:809-814` |
| 4 | Filter select: user | «Χρήστης:» / first option «Όλοι»; options = actors seen in loaded responses only | `:632-634`, `:581`, `:66-71` |
| 5 | Filter select: table | «Πίνακας:» / «Όλοι»; options = tables seen, shown with Greek names | `:635-637`, `:582` |
| 6 | Filter select: action | «Ενέργεια:» / «Όλες», then «Δημιουργία», «Αλλαγή», «Διαγραφή», «Ολική διαγραφή», «Επιβεβαίωση», «Αντιστροφή», «Παράκαμψη τιμολ.», «Ανέβασμα αρχείου» | `:638-648`, `:387-398` |
| 7 | Filter select: range | «Εύρος:» / «Τελευταίες 200», «7 ημέρες», «30 ημέρες», «90 ημέρες», «Προσαρμοσμένο…» | `:649-657` |
| 8 | Custom date pair (hidden unless «Προσαρμοσμένο…») | two `type=date`, titles «Από» / «Έως», «–» between | `:658-662`, `:740`, `:751` |
| 9 | Record search input | placeholder «Αναζήτηση εγγραφής…», title «Ακριβές id εγγραφής (recXXXX ή αριθμός) — Enter για αναζήτηση» | `:664`, handler `:766` |
| 10 | Clear button `#afClear` | «Καθαρισμός», title «Αφαιρεί όλα τα φίλτρα»; disabled when nothing to clear | `:668`, `:590-593`, `:767-771` |
| 11 | Legend above table (only if a derived diff is on screen) | «≈ συμπέρασμα από την προηγούμενη καταγραφή της ίδιας εγγραφής — ο Worker δεν κατέγραψε την παλιά τιμή» | `:821-824` |
| 12 | Table, 6 columns | «Πότε», «Ποιος», «Ενέργεια», «Πίνακας», «Εγγραφή», «Αλλαγή» | `:829-835` |
| 13 | Col «Πότε» | `dd/mm hh:mm` (+`/yy` if other year); full el-GR stamp in `title` | `:141-152`, `:552` |
| 14 | Col «Ποιος» | actor (username) + role word under it: «ιδιοκτήτης», «διοίκηση», «λογιστήριο», «δρομολόγηση», «αποθήκη» | `:553`, `:326-332` |
| 15 | Col «Ενέργεια» | plain word; weight/colour by class `at-act-create/update/delete/cascade` | `:535`, `:554`, css `:710-713` |
| 16 | Col «Πίνακας» | Greek table name map (33 entries); unknown → raw name upper-cased | `:421-465`, `:555` |
| 17 | Col «Εγγραφή» | link: business label (from snapshot keys `code, reference, name, stop_label, plate, license_plate`) over mono record id; or id alone; title «Ιστορικό αυτής της εγγραφής»; click filters to that record id | `:472-484`, `:542-548`, `:49-56` |
| 18 | Col «Αλλαγή» | see logic (3); items joined by « · », `Field: from → to` | `:500-530` |
| 19 | Retry button (error state) | «Ξαναδοκίμασε» | `:796` (plus a second one inside `showError`, `core/ui.js:271-272`) |
| — | Tabs, cards, KPI tiles, modal/drawer, row detail, sort, pagination, export, print, keyboard shortcuts | none in the file | — |

Filters apply on `change` (no Apply button): `:744-766`. Text search applies on Enter/blur (`:765-766`).

### (3) Logic that must survive

- **Source**: `GET {PROXY_URL}/audit?<filters>&limit=200`, Bearer session header, `:108-110`. Query keys: `record_id, table, actor, action, since, until` then `limit` — order is deliberate (critics replay by URL), `:75-100`.
- **Paging**: none. One page of max 200 (`AUDIT_LIMIT`, `:38`; server cap). Sub-label and tooltip must say when the cap was hit (`:812-813`). Newest first (server order).
- **`until`** is sent as `<date>T23:59:59.999` so the chosen day is included (`:87-97`).
- **Range presets** set `since` = today−N; `until` empty (`:752-758`, `:561-565`).
- **Dropdown options** = union of actors/tables seen so far in this session; a selected value never disappears (`:66-71`, `:567-575`).
- **Diff** (`_auditDiff`, `:167-179`): key-by-key JSON compare of before/after, `updated_at` skipped.
- **Derived "before"** (`_auditAttachBefore`, `:210-235`): when the row has no recorded before, the previous snapshot of the same `table|record` inside the loaded page is used; marked `_derived` → rendered with `≈`, left rule and tooltip (`:522-529`). Switched off when a user or action filter is active (chain broken) → «άγνωστο — το φίλτρο κρύβει τη σειρά των αλλαγών» (`:504-508`). Actions without row snapshots (`cascade_delete`, `upload`, `invoice_override`) are never diffed (`:206-208`).
- **Change cell vocabulary** (`:500-516`): «Νέα εγγραφή», «Διαγραφή εγγραφής», «Διαγραφή εγγραφής και όσων κρέμονταν από αυτήν — <label: n · …>» (cascade counts, zero counts dropped, `:402-412`, `:487-497`), «άγνωστο — δεν καταγράφηκε η προηγούμενη τιμή», «Αποθήκευση χωρίς αλλαγή πεδίου». Unknown is never shown as "nothing changed".
- **Field labels**: `_AUDIT_FIELD` (~70 Postgres columns → Greek), unknown column shows its raw name on purpose (`:245-322`).
- **Value formatting** (`:352-377`): null/empty «—», booleans «ναι»/«όχι», ISO timestamps → same short format as «Πότε», ISO dates → `dd/mm`, numeric `*_id` → `#n`, `direction`/`side` → «ΕΞΑΓΩΓΗ/ΕΙΣΑΓΩΓΗ/ΚΑΘΟΔΟΣ/ΑΝΟΔΟΣ», objects → JSON string.
- **Naming a record for humans**: no lookup request; first non-empty of `code, reference, name, stop_label, plate, license_plate` from the snapshot, else the id alone (`:472-484`). `plan_request` rows show the operation name (`:478`).
- **Unknown action / table / role** shows raw rather than being hidden (`:535`, `:464`, `:553`).
- **Empty ≠ failed**: separate states (`:787-805`). All stored data is escaped (`:132-138`).
- Markup constraints noted in code (tests scrape `<th>`, `<label>`, `<button>` text): legend sits outside `<th>` (`:816-820`), selects are siblings of labels (`:629-631`), record link is `<a>` not `<button>` (`:538-541`).

### (4) Findings

| Tag | Finding | Evidence |
|---|---|---|
| [BROKEN] | Clicking a record link sets the record filter but never re-syncs «Καθαρισμός»: the button stays disabled while a filter is active | `_auditFilterRecord` `:50-55` calls `_auditRenderBody` only; `_auditSyncClear` `:590-593` is called from `apply` `:759` and initial render `:742` |
| [BROKEN] | Date range edges are off by time zone: `until` stamp carries no zone (last hours of the local day fall outside, documented in code), and `since` presets use the UTC date | `:93-97`, `:561-565` |
| [BROKEN] | Error state shows two «Ξαναδοκίμασε» buttons with different behaviour (one re-runs the route, one re-fetches keeping filters) | `:793-796` + `core/ui.js:271-272` |
| [MISSING] | No way past 200 rows (no "older" / next page); only narrowing filters | `:38`, `:813` |
| [MISSING] | No export or print | whole file |
| [MISSING] | No row detail (full before/after snapshot); long diffs only wrap in the cell | `:499-530` |
| [MISSING] | Record-link filter sends `record_id` only, not the table; numeric ids of different tables are not separated | `:50-55` (collision in data: not verified) |
| [MISSING] | User/table dropdowns can only offer values already seen in loaded pages; an actor with no row in the latest 200 cannot be chosen | `:66-71` |
| [INCONSISTENT] | Search placeholder says «Αναζήτηση εγγραφής…» but it is an exact-id match; the truth is only in the tooltip | `:664` |
| [INCONSISTENT] | Raw record codes shown to humans: record ids in «Εγγραφή», business codes (`code`, `reference`) used as the record's name, foreign keys as `#52` in «Αλλαγή» — against the plain-messages rule (the column may count as an identifier column; the `#n` values in the change sentence do not) | `:472-484`, `:545-546`, `:373` |
| [INCONSISTENT] | Two session messages are English on a Greek page: "No session token. Sign in again." / "Session expired. Sign in again." (kept for a test, per comment) | `:103-106`, `:114` |
| [INCONSISTENT] | Mixed Greek/English in the change cell: unlabelled columns print raw Postgres names; stored values (e.g. status words) and JSON objects print raw; «γραμμές groupage σε Unassigned» | `:320-322`, `:356`, `:376`, `:407` |
| [INCONSISTENT] | Two words for one thing: `rt_id` → «Κύκλος», «Στάσεις κύκλων», «Ακυρωμένος κύκλος» vs `ct_round_trips` → «Δρομολόγια P&L», `is_partner_trip` → «Δρομολόγιο συνεργάτη» | `:285-286`, `:310`, `:443`, `:450`, `:254` |
| [INCONSISTENT] | Actor is shown as the login handle, not a person's name | `:553` |
| [INCONSISTENT] | Page CSS lives in an inline `<style>` re-inserted on every render instead of `assets/style.css` | `:671-736` |
| [EXTRA] | "Direct Airtable mode" branch is unreachable in production (`USE_PROXY = true`, `config.js:15`) | `:604-615` |
| [EXTRA] | Fallbacks for missing shared helpers (`showAccessDenied`, `showError`, `showEmpty`, `escapeHtml`) duplicate state markup | `:135-137`, `:618-620`, `:793-795`, `:801-803` |
| [LOCKED] | GROUPAGE LINES are never deleted, only released: the cascade summary must keep saying "to Unassigned", not "deleted" | `:406-407` |
| [LOCKED] | Unified status vocabulary / direction words are stored as-is and translated on display only | `:334-347` |

### (5) States as coded

| State | What renders | `file:line` |
|---|---|---|
| Loading | sub-label «φόρτωση…»; body `<div class="loading">Φόρτωση…</div>` | `:628`, `:670`, `:781-782` |
| Empty | sub «0 εγγραφές»; `showEmpty('Καμία καταγεγραμμένη ενέργεια για αυτά τα φίλτρα', 'Άνοιξε το εύρος ή καθάρισε τα φίλτρα.')` | `:799-804` |
| Error (network / unknown) | sub «δεν φορτώθηκε»; `showError` card titled «Δεν φορτώθηκε» + «Το ιστορικό δεν φορτώθηκε — δεν σημαίνει ότι δεν υπάρχουν ενέργειες. Έλεγξε τη σύνδεση και ξαναδοκίμασε.» + retry | `:44`, `:125`, `:789-797` |
| Error (server status) | «Το ιστορικό δεν φορτώθηκε (ο server απάντησε NNN) — δεν σημαίνει ότι δεν υπάρχουν ενέργειες. Ξαναδοκίμασε· αν επιμένει, πες το στον Δημήτρη.» | `:115` |
| No permission (client role) | `showAccessDenied()`: «Δεν έχεις πρόσβαση» / «Αυτή η ενότητα δεν είναι διαθέσιμη για τον ρόλο σου.» | `:617-622`, `core/ui.js:295-303` |
| No permission (server 403) | «Ο ρόλος σου δεν έχει πρόσβαση στο ιστορικό ενεργειών.» inside the error card | `:113` |
| Offline | no dedicated state; falls into the network error above | `:123-126` |
| Session expired | "Session expired. Sign in again." (401) / "No session token. Sign in again." inside the error card; no redirect in this file | `:106`, `:114` |
| Not proxy mode | «Το ιστορικό ενεργειών δεν είναι διαθέσιμο σε αυτή τη λειτουργία.» + explanation | `:607-613` |

### Design-relevant inline styling (`audit_trail.js:671-736`)

- Tokens only, no hex: `--text`, `--text-mid`, `--text-dim`, `--surface-card`, `--surface-sunken`, `--border`, `--danger`, `--accent-text`; sizes `--text-xs/sm/body`.
- Fonts: title `'Syne'` 18px/700; record id `ui-monospace, SFMono-Regular, Menlo, monospace`; `font-variant-numeric: tabular-nums` on all cells.
- Geometry: header min-height 58px, gap 12px; filter select max-width 150px; search max-width 220px, height 34px; `thead th` 34px, padding 0 16px, weight 600, letter-spacing 0; `tbody td` min 40px, padding 4px 16px, line-height 1.35. Column widths: Πότε 150, Ποιος 170, Ενέργεια 140, Πίνακας 190, Εγγραφή 170, Αλλαγή = rest (wraps).
- Action idiom: create = `--text` 500; update = `--text-mid`; delete = `--text` 700; total deletion = `--danger` 700. No pills/badges.
- Derived diff: 2px left rule `--text-dim`, 8px padding, `≈` mark 600.
- No shadows, radii, z-index or animations defined in the file. Inline style on retry wrapper: `text-align:center;padding:0 0 16px` (`:796`).

---

## E3-B. Floating assistant «Νάκης» (`core/ai-chat.js`)

Loaded by `app.html:151`; cached by `sw.js:56`. Self-mounts on DOM ready (`ai-chat.js:1749-1753`). Base CSS injected as `<style id="ai-chat-css">` (`:202-367`); chips / citations / attachments CSS is in `assets/style.css:7186-7269`. Other places that reference it: `assets/style.css:228-232` (`--fab-clear: 88px`), `:6928` (legacy `.aic-panel` alias), `:7818` (Weekly International moves the launcher), `:10918-10919` + `modules/weekly_natl_v5.js:1861-1872` (Weekly National hides the launcher and opens it from the avatar menu item «Νάκης · βοηθός»), `core/ui.js:391-395` (toasts sit at bottom 88px to clear it), `core/utils.js:1061-1123` (Error Log reuses the `.aic-confirm-*` dialog classes).

### (1) Who sees it, what they do

| Gate | Where | Effect |
|---|---|---|
| Mount | `ai-chat.js:1401-1457`, `:1749-1753` | No role or username gate: launcher + panel are injected for every signed-in user on `app.html` |
| Per-username rule | — | none found in the file (storage keys are per username, `:33-36`) |
| Tool set per role | `AIC_PROFILES` `:638-651`, `_aicAllowedTools` `:848-852` | Profiles for owner, dispatcher, management, accountant; none defined for warehouse |
| Observer alerts per section | `_canSee` `:1255-1259`; `:1271`, `:1328` | Fleet/work-order alerts only with `maintenance` access; unassigned-order alerts only with `planning` access |
| Role-specific prompt lines | `:828-829` | dispatcher: no costs/financials; accountant: cannot create orders |
| Daily usage cap | `:17`, `:114-116`, `:1109-1118` | 100 000 units/day per user per browser |

What they do: open the panel, get an onboarding interview (first time) or a daily briefing, ask free-text questions, tap quick prompts, attach an image/PDF, let it read orders/fleet, navigate, set a reminder, create a work order or update a record (both behind a confirmation dialog).

### (2) Inventory

| # | Region / control | Label as coded | `file:line` |
|---|---|---|---|
| 1 | Launcher `.aic-btn#aic-toggle` — 52px circle, bottom-right 24/24, chat-bubble SVG | `aria-label` «Άνοιγμα βοηθού Νάκη», `title` «Νάκης — βοηθός» | `:1409-1418`, css `:207-213` |
| 2 | Alert dot `.aic-dot` on launcher (class `has-alerts`) | — | `:1416`, css `:214-217`, setter `:1726-1734` |
| 3 | Launcher relocation on Weekly International (left 8px, bottom 50px, 40×40, ≥1025px) | — | `assets/style.css:7818` |
| 4 | Launcher hidden on Weekly National v5; menu item instead; dot moves to avatar | «Νάκης · βοηθός» | `modules/weekly_natl_v5.js:1861-1864`, `assets/style.css:10918-10919` |
| 5 | Panel `.aic-panel#aic-panel` — 400×600 (max-height 80vh), same corner; launcher hidden while open | — | `:1421-1453`, css `:220-228`, toggle `:1459-1516` |
| 6 | Header: status dot (title "Online"), name | «Νάκης» | `:1427`, css `:231-237` |
| 7 | Header: usage badge `#aic-quota-badge` (hidden at 0; `warn` ≥80%, `full` ≥100%) | e.g. "12.4K/100K", title "N% of daily token quota used today" (initial title "Daily token usage") | `:1428`, `:1707-1724`, css `:238-242` |
| 8 | Header: close button | `aria-label` "Close", × icon | `:1429`, css `:243-246` |
| 9 | Quick prompts row `.aic-quick` (5 pills, each sends a fixed prompt) | "Briefing", "Today", "Unassigned", "Fleet", "Help" | `:1431-1437`, `:1743-1746`, css `:249-254` |
| 10 | Message list `.aic-msgs` — user bubbles right (accent), assistant bubbles left | — | `:1438`, `:1531-1557`, css `:257-274` |
| 11 | Typing indicator | "Thinking…" (italic bubble) | `:1553-1555` |
| 12 | Tool badge (transient bubble while a tool runs) | "Reading orders…", "Reading fleet…", "Creating work order…", "Updating record…", "Navigating…", "Saving profile…", "Setting reminder…", "Reading page context…" | `:1223-1252`, css `:269-272` |
| 13 | Action chips inside assistant text (`[ACTION:label|call]`, allow-listed to navigate / open command palette / prefill input) with "↗" prefix | label from the model | `:1564-1581`, prompt `:831-843`, css `assets/style.css:7186-7202` |
| 14 | Citations footer under an assistant message | "📎 Orders·N · Fleet · Page · Profile · Reminder · Update · Work Order · Navigate" | `:1583-1605`, css `assets/style.css:7204-7212` |
| 15 | Attachment previews in a user bubble (image thumb ≤120×90, or "📄 name") | — | `:1537-1544`, css `assets/style.css:7214-7233` |
| 16 | Pending-attachment pills above input (icon, name ≤30 chars, KB, × remove) | `aria-label` "Remove" | `:1439`, `:1659-1676`, css `assets/style.css:7250-7269` |
| 17 | Attach button (paperclip) + hidden file input (`image/*`, PDF; max 10MB) | title "Attach image / PDF", `aria-label` "Attach" | `:1441-1444`, `:1620-1647` |
| 18 | Text input (textarea, 1 row, max-height 80px) | placeholder "Ask anything…" | `:1445`, css `:281-287` |
| 19 | Send button (36px circle) | `aria-label` "Send" | `:1446-1448`, css `:288-293` |
| 20 | Stop button (replaces Send while loading, pulsing) | title "Stop generating", `aria-label` "Stop" | `:1449-1451`, `:1679-1685`, `:1694-1705`, css `:294-303` |
| 21 | Confirmation dialog for data-changing tools (overlay + card: icon, title, preview, 2 buttons) | titles «Δημιουργία Work Order;», «Ενημέρωση record;», «Επιβεβαίωση ενέργειας;»; rows «Όχημα:», "Priority:", "Description:", "Notes:", "Table:", "Record:", "Fields:"; buttons «Ακύρωση», «Επιβεβαίωση» | `:478-524`, css `:306-360` |
| 22 | Native `confirm()` for profile reset (typed phrase trigger) | «⚠ Θες πραγματικά να σβήσω το προφίλ σου; … Η ενέργεια ΔΕΝ μπορεί να αναιρεθεί.» | `:1087-1106` |
| 23 | Toasts | 'Work order created!', 'Record updated', 'Profile saved!', 'Reminder set!', «Προφίλ μηδενίστηκε — ξεκινάει νέα συνέντευξη», «Ακυρώθηκε», 'File too large (max 10MB)', 'Only images / PDFs supported' | `:575`, `:593`, `:602`, `:617`, `:1102`, `:1683`, `:1622`, `:1625` |
| — | Voice input, history list / "new chat" / clear button, resize, minimise, search | none in the file | — |

Keyboard: Enter sends, Shift+Enter newline (`:1445`); Esc cancels the confirmation dialog (`:520-522`); click on the overlay backdrop cancels (`:519`). No shortcut opens or closes the panel; Esc does not close the panel; no click-outside close.

Persistence (per browser):

| Key | Store | Content | `file:line` |
|---|---|---|---|
| `nakis_profile_<user>` | localStorage | onboarding profile (versioned, v2) | `:65`, `:71-96` |
| `nakis_notifs_<user>` | localStorage | reminders | `:66`, `:99-104` |
| `nakis_tokens_<user>_<date>` | localStorage | daily usage counter | `:68`, `:107-119` |
| `aic_history_<user>` | sessionStorage | last 20 text messages | `:67`, `:1403-1406`, `:1736-1741` |
| `nakis_brief_<date>` | localStorage | "briefing shown today" flag (not per user) | `:1489-1494` |
| in memory | — | observer alerts cached 10 min | `:1262-1266`, `:1395-1397` |

### (3) Logic that must survive

- **Open flow** (`:1459-1516`): hide launcher, show panel, run observer, render. If no messages: no profile → interview (7 questions one at a time, then `save_profile`, `:773-785`); profile + first open of the day → morning briefing; otherwise short greeting. Fallback greetings if the call fails (`:1482`, `:1504`). Focus goes to the input after 250ms.
- **Model call**: sent from the browser straight to the model provider's messages endpoint (`:912`, `:978`), not through the Worker's `/v1/ai/messages` proxy that scan uses (`core/scan-helpers.js:229-230`). Streaming for user-visible turns (`:964-1072`), non-streaming for the greeting (`:902-961`). Model chosen per message: larger model if text > 80 chars or contains analysis words (`:859-869`, ids in `config.js:106-110`). 60s timeout, 2 retries with backoff on the non-streaming path (`:898-900`, `:955-958`). Max 5 tool rounds per message (`:1154-1158`).
- **Context sent with every call** (`:764-846`): user name, role, current page, date, week; app guide text (`:654-729`, capped 5000 chars); page summary (`_aicPageContext`, `:122-199`, capped 2000 chars) for Weekly International, Weekly National (v5: a "no summary yet" line), Ramp, Daily Ops, Maintenance, Orders; up to 5 due reminders; profile.
- **Tools** (`:370-469`, exec `:526-635`):

| Tool | Does | Confirmation | Roles (`:638-651`) |
|---|---|---|---|
| `read_orders` | international or national orders via `atGetAll`, default 10 rows; returns id, client, goods, pallets, status, direction (no prices) | no | owner, dispatcher, accountant |
| `read_fleet` | trucks / trailers: plate, brand, model, active, expiry dates | no | all four |
| `create_work_order` | creates a maintenance request (plate, description, priority «SOS/Άμεσα/Κανονικό», notes; status `Pending`, today) | **dialog** | owner, dispatcher, management |
| `update_record` | patches fields on orders, national orders, trucks, trailers, maintenance requests; refuses old national tables after the v5 cut-over with the shared legacy text (`:581-591`) | **dialog** | owner, management |
| `navigate_to` | `navigate(page)` to one of 14 pages | no | all four |
| `save_profile` | stores onboarding answers locally | no | all four |
| `set_reminder` | stores a dated reminder locally | no | all four |
| `read_page_context` | page id, page summary, profile, due reminders | no | all four |

- **Must confirm first**: the two data-changing tools (`_DESTRUCTIVE_TOOLS`, `:10`, gate `:528-531`); cancel returns "Cancelled by user — no changes made." to the model. Profile reset needs a native confirm (`:1088`). The prompt also tells the model to ask before changing data (`:826`).
- **Chips**: only three call shapes are rendered as buttons; anything else degrades to plain label text (`:1570-1577`).
- **Attachments**: image or PDF ≤10MB, images pre-processed by the scan helper when present; sent only with the latest user message (`:1131-1152`, `:1620-1657`).
- **Observer** (`:1261-1398`): fleet expiries ≤30 days (critical if expired, warning ≤14d), SOS/pending work orders, unassigned international orders (delivery <48h = critical; unassigned >24h = warning; loose stock pieces excluded, `:1333-1339`), empty return legs (>2), due reminders; sorted by severity, top 8.
- **History**: last 20 messages, text only, per browser session (`:1736-1741`).
- **Layout contracts elsewhere**: `--fab-clear: 88px` and toast offset assume a 52px launcher at 24/24 (`assets/style.css:228-232`, `core/ui.js:391-395`); Weekly screens override position/visibility (rows 3–4 above); Error Log dialogs depend on `.aic-confirm-*` classes (`core/utils.js:1061-1123`).

### (4) Findings

| Tag | Finding | Evidence |
|---|---|---|
| [BROKEN] | With the configuration as committed the assistant's model call cannot succeed (it bypasses the Worker proxy the rest of the app uses), so in practice the user gets the canned fallback greeting and error bubbles for every question. Whether a local override changes this in production: not verified | `ai-chat.js:912`, `:978`, `:1482`, `:1504`, `:1215`; `config.js:38-46`; proxy used elsewhere `core/scan-helpers.js:229-230` |
| [BROKEN] | Pressing Stop while the answer is streaming leaves the panel stuck in "loading" (Stop button stays, Send hidden, input blocked, empty bubble remains): the abort raised by the stream reader returns early before the loading flag is cleared | `:1022` (read outside try), `:1213-1214` (`return`), `:1218` skipped |
| [BROKEN] | Alert dot never appears: `_aicUpdateDot` is only called from a dead function; the avatar dot on Weekly National depends on the same class | `:1726-1734`, only caller `:1527`; `assets/style.css:10919` |
| [BROKEN] | During the daily briefing/greeting the internal instruction text «(MORNING BRIEFING: …)» / «(ο χρήστης μόλις άνοιξε τον Νάκη)» is rendered as a user bubble until the reply arrives; in the interview flow a fake «Γεια σου Νάκη!» user message stays in the thread | `:1491-1496`, `:1474-1475` |
| [BROKEN] | An empty assistant bubble is drawn next to "Thinking…" at the start of every round | `:1161-1163`, `:1550`, `:1553-1555` |
| [BROKEN] | Page summary for the fleet overview never fires: it tests page id `maint_dashboard`, the route is `maint_dash` | `:170` vs `core/router.js:59`, `:377` (same slip already fixed in `:749`) |
| [BROKEN] | Errors show a doubled prefix ("⚠ Error: ⚠ …") and raw browser wording for network failures | `:1215` + `:872-896` |
| [MISSING] | No voice input | whole file |
| [MISSING] | No history UI: no list of past chats, no "new conversation" / clear button (only a typed phrase resets everything); history is lost when the tab closes | `:1087`, `:1736-1741` |
| [MISSING] | No Esc / click-outside to close the panel, no shortcut to open it, no `role="dialog"` / focus handling | `:1421-1453`, `:1459-1516` |
| [MISSING] | No responsive rule for the panel (fixed 400px wide) or launcher below 1025px | grep `aic-` in `assets/style.css`: only `:6928`, `:7818`, `:10918` |
| [MISSING] | No offline or session-expired state; no empty-state for the message list | `:1213-1216` |
| [MISSING] | `navigate_to` cannot reach pages the prompt lists (Daily Ops, performance, invoicing, pallet ledger) | enum `:429` vs `:845` |
| [INCONSISTENT] | Mixed Greek/English UI: quick pills, placeholder "Ask anything…", "Thinking…", tool badges, all success toasts, attachment errors, aria-labels, usage badge tooltip, observer alert texts ("Expires in N days", "N pending work orders") are English; name, dialogs' buttons and reset flow are Greek | `:1432-1436`, `:1445`, `:1554`, `:1224-1233`, `:575-617`, `:1622-1625`, `:1288`, `:1319-1322` |
| [INCONSISTENT] | Confirmation dialog mixes languages and shows raw record code, table key and JSON to the user («Ενημέρωση record;», "Table:", "Record: recXXX", "Fields: {…}") — against the plain-messages rule; work-order dialog mixes «Όχημα:» with "Priority/Description/Notes" | `:482-497` |
| [INCONSISTENT] | App guide given to the assistant contradicts locked decisions and current screens: lists «Invoiced» as a status step; says Veroia Switch auto-creates a National Order; English page names/buttons ("+ New Order", "Print Week") | `:699`, `:668`, `:665`, `:681` |
| [INCONSISTENT] | Tool descriptions and comments still say "Airtable" | `:9`, `:378`, `:412`, `:417` |
| [INCONSISTENT] | Light-theme tokens used inside the dark panel: attach button border/hover (`--border`, `--bg-hover`), citations divider `rgba(0,0,0,0.08)`, pending pills tinted for light background | `assets/style.css:7204-7211`, `:7236-7260` |
| [INCONSISTENT] | Panel is styled twice with different values: legacy alias `#0F1C2F` + `--radius-md` vs injected `--surface-dark` + 6px | `assets/style.css:6928-6932` vs `ai-chat.js:220-227` |
| [INCONSISTENT] | Launcher has three placements depending on screen (bottom-right 52px; left rail 40px; hidden behind avatar menu) | `ai-chat.js:207`, `assets/style.css:7818`, `:10918` |
| [INCONSISTENT] | History is saved to session storage, but the legacy-key migration and the reset look for it in local storage; briefing flag is not per user | `:51`, `:1097` vs `:1404`, `:1739`; `:1489` |
| [INCONSISTENT] | Emoji used as icons (📎 📄 🖼 ⚠ ⏹) beside the app's SVG icon set | `:1542`, `:1604`, `:1666`, `:875-895` |
| [INCONSISTENT] | Usage badge exposes a technical unit to end users ("12.4K/100K", "token") | `:1707-1724`, `:1113` |
| [EXTRA] | Dead UI: `_aicRenderObs` renders alert cards into `#aic-obs`, which is never created; `.aic-obs-*` has no CSS | `:1518-1529` (no `aic-obs` in `:1425-1452` or `assets/style.css`) |
| [EXTRA] | `AiChat.suggestions` (observer alerts) are computed on every open but shown nowhere and not sent to the model (the comment at `:1455` says they feed the prompt; `_aicSystemPrompt` does not read them) | `:1395`, `:1455`, `:764-846` |
| [EXTRA] | Status dot in the header is always green ("Online") regardless of state | `:1427`, css `:236-237` |
| [EXTRA] | `read_orders` asks for a `Client Name` label that is not an orders label in the Worker map (only hit is another table) | `:542`; `worker/src/index.js:2150` (what the model receives as client: not verified) |
| [LOCKED] | Dispatcher gets no costs/financials from the assistant; `read_orders` returns no price or margin fields | `:828`, `:540-543` |
| [LOCKED] | Old national tables are not written after the v5 cut-over; the assistant shows the shared refusal text | `:581-591` |
| [LOCKED] | Priority values stay Greek («SOS», «Άμεσα», «Κανονικό»), never translated | `:404`; `worker/src/index.js:1148-1149` |

### (5) States as coded

| State | What renders | `file:line` |
|---|---|---|
| Closed | launcher only (or avatar menu item on Weekly National) | `:1513-1514` |
| First open, no profile | fake user bubble «Γεια σου Νάκη!», then interview; fallback «Γεια σου! Είμαι ο Νάκης, ο ψηφιακός βοηθός σου. Ας γνωριστούμε — ποιος είσαι και ποιος ο ρόλος σου;» | `:1472-1486` |
| Open with profile | briefing/greeting; fallbacks «Γεια σου! Τι χρειάζεσαι;» / «Γεια σου! Τι μπορώ να κάνω για σένα;» | `:1488-1508` |
| Empty thread | nothing (no placeholder text) | `:1531-1557` |
| Loading | "Thinking…" bubble; Send → pulsing Stop; tool badges | `:1553-1555`, `:1694-1705`, `:1223-1252` |
| Error | assistant bubble "⚠ Error: " + one of: «⚠ Ο Νάκης είναι offline (credits εξαντλήθηκαν). Επικοινώνησε με τον admin.», an authentication-problem message, «⚠ Πολλά αιτήματα — περίμενε 60s και δοκίμασε ξανά.», «⚠ Anthropic προσωρινά πλημμυρισμένο — δοκίμασε σε λίγο.», «⚠ Server error (NNN) — δοκίμασε ξανά σε λίγο.», «⚠ Πολύ αργή απόκριση — ακυρώθηκε. Δοκίμασε πιο σύντομη ερώτηση.», «⚠ Κάτι πήγε στραβά: …» | `:872-896`, `:1215` |
| Cancelled by user | «⏹ Ακυρώθηκε.» + toast «Ακυρώθηκε» (see stuck-loading finding) | `:949`, `:999`, `:1683` |
| Limit reached | «⚠ Έφτασες το ημερήσιο όριο tokens (100,000). Δοκίμασε ξανά αύριο.»; badge turns `full` | `:1109-1118`, `:1723` |
| Tool refused / cancelled | no own UI; the model is told "Cancelled by user — no changes made." / "Unknown table: …" / the error text and words its own reply | `:530`, `:580`, `:632-634` |
| No permission | not coded: no "assistant not available for your role" state; a tool outside the role's list is simply not offered | `:848-852` |
| Offline | not coded; surfaces as "⚠ Error: " + browser message | `:1215` |
| Session expired | not coded in this file (tool reads go through `atGetAll`; behaviour not verified) | — |
| Attachment rejected | toasts 'File too large (max 10MB)' / 'Only images / PDFs supported' | `:1622-1625` |

### Design-relevant inline styling

Injected block `ai-chat.js:205-365`:

- **Z-index**: launcher and panel `var(--z-float)` (=300, `assets/style.css:111`); confirm overlay `calc(var(--z-float) + 1)`.
- **Launcher**: 52×52, radius 50%, `--accent` → hover `--accent-hover` + `scale(1.08)`; shadow `0 4px 16px rgba(2,123,189,0.35)`; dot 12px `--danger` with 2px `--surface-card` ring.
- **Panel**: 400×600, max-height 80vh, radius 6px, bg `--surface-dark` (#0B1929), border `1px solid rgba(255,255,255,0.06)`, shadow `0 12px 48px rgba(15,23,42,0.4)`; open/close = `scale(0.92) translateY(16px)` + opacity, `var(--duration-base, .2s) var(--ease-out)`.
- **Header**: 52px, bg `--navy-mid`; title `'Syne'` 15px/700, letter-spacing 0.3px; status dot 7px `--panel-ok-hi` with `0 0 0 3px rgba(16,185,129,0.15)`; badge 11px/600 `'DM Sans',monospace`, radius 9999px, warn `rgba(245,158,11,0.12)` / full `rgba(220,38,38,0.15)`.
- **Quick pills**: radius 9999px, 11px/600, border `rgba(255,255,255,0.10)`, bg `rgba(255,255,255,0.04)`; hover `rgba(56,189,248,0.12)` + `--panel-accent`.
- **Messages**: 13px, line-height 1.5, radius 6px with 4px "tail" corner, max-width 88%; user = `--accent`; assistant = `rgba(255,255,255,0.04)` + hairline; tool badge `rgba(56,189,248,0.12)` 11px/600 radius 6px; scrollbar 6px `rgba(255,255,255,0.08)`. Animation `aic-msg-in` 0.18s (fade + 4px rise).
- **Input bar**: bg `rgba(0,0,0,0.15)`; input `'DM Sans'` 13px, radius 6px, focus ring `0 0 0 3px rgba(56,189,248,0.15)` + `--panel-accent` border; Send 36px circle `--accent`; Stop 36px circle `--danger`, animation `aic-pulse` 1.6s infinite (`rgba(220,38,38,0.5)` ring).
- **Confirm dialog**: overlay `rgba(0,0,0,0.55)`, animation `aic-overlay-in` 0.15s; card max-width 440px, radius 6px, shadow `0 24px 60px rgba(0,0,0,0.5)`, animation `aic-card-in` 0.2s; title `'Syne'` 14px/700; body 12px/1.6; OK = `--panel-accent` bg with `--navy-mid` text; cancel = ghost. Inline styles in the preview: priority pill `rgba(245,158,11,.15)` / `--panel-warn` radius 4px; code/pre `rgba(0,0,0,.2)` radius 3–4px, 11px (`:485-496`).
- `prefers-reduced-motion`: message, overlay and card animations off (`:362-364`); the Stop pulse is not.

In `assets/style.css`:

- `.aic-chip` (`:7186-7202`): `--accent` bg, `#fff`, 600 11px `'DM Sans'`, `--radius-full`, "↗" pseudo-element, hover `brightness(1.1)`.
- `.aic-citations` (`:7204-7212`): 10px, `--text-dim`, dashed top border `rgba(0,0,0,0.08)`.
- `.aic-att-img` 120×90 max, `--radius`; `.aic-att-doc` `rgba(255,255,255,0.1)` (`:7220-7233`).
- `.aic-upload-btn` 32×32, `--border`, `--radius-md`; `.aic-upload-pending .pill` `rgba(2,123,189,0.10)`, `--accent-text`, `--radius-lg` (`:7236-7269`).
- Legacy alias `.aic-panel { background:#0F1C2F; color:#fff; border-radius: var(--radius-md); border:1px solid rgba(255,255,255,0.05) }` (`:6928-6932`).

---

## D. Current design system as coded

Scope: `assets/style.css` (11,035 lines), `assets/route-diagram.css` (113), `app.html`, `index.html`, `print.html`, `print_payroll.html`, `print_pnl.html`, `core/week-paper.js`, `core/utils.js`, and `<style>` blocks injected by `modules/*.js` / `core/*.js` (91 JS files). All numbers come from `grep`/`awk` counts on the branch as checked out; line numbers are `style.css` unless a file is named. "Not verified" = not checked.

Intended system: `DESIGN.md` (228 lines; "ΜΕΡΟΣ Β" colour at `DESIGN.md:56`, Γ typography, Δ spacing/radius/motion). Code is reported as truth; disagreements are flagged in D8.

---

### D1. Fonts

**Loaded families / weights**

| Where | Syne | DM Sans | DM Mono |
|---|---|---|---|
| `app.html:12` | 400,500,600,700,800 | 300,400,500,600,700 | 400,500 |
| `index.html:7` (login) | 300,400,500,600,700,800 | 300,400,500 | none |
| `print.html:6` | 700,800 | 400,500,600,700 | none |
| `print_payroll.html:6` | 700,800 | 400,500,600,700 | none |
| `print_pnl.html:6` | 600,700,800 | 400,500,600,700 | none |
| `core/utils.js:1990` (`_printWeekShell`) | 700 | 400,500 | none |
| `core/week-paper.js:14` | none (but used, see D6) | 400,500,700 | 500 |
| `modules/wn5_sheet.js:18` | none | 400,500,600,700 | 500 |
| `modules/daily_ramp.js:1119` | 400,700,800 | 400,500 | none |
| `modules/maintenance.js:817` / `:2253` | 400,700,800 / 700 | 400,500,600 / 400–700 | none / 400,500 |
| `modules/orders_noprice_view.js:566` | 600,700 | 400,500,600 | none |
| `modules/pallet_ledger.js:1228` | 600,700 | 400,500,700 | none |

13 separate Google Fonts `<link>`s, 11 distinct weight sets.

**Where applied (style.css `font-family` declarations, 162 total)**

| Family | Count | Typical use |
|---|---|---|
| `'Syne', sans-serif` | 56 | `.sidebar-logo-text` :419, `.topbar-title` :699, `.page-title` :898, `.notif-header` :822, `.footer-logo` :878, card/section titles, `.ramp-day-btn` :3427, `.wk3-tab` :2768 (also on a button and a tab, i.e. not titles only) |
| `'DM Sans', sans-serif` | 51 (+2 with `-apple-system` fallback) | `body` :362, `.btn` :973, form controls :1442 |
| `var(--dc-nums)` / `--ceo-nums` / `--p-nums` | 16 / 8 / 6 | dashboard numerals; all three resolve to `'DM Sans', -apple-system, sans-serif` (:4988, :3633; `--ceo-nums` definition line not verified) |
| `'DM Mono', …` | 9 (two different fallback stacks) | codes/chips in wi4/wn5; `route-diagram.css:32,56` |
| `inherit` | 14 | buttons inside composed controls |

Also 24 `font:` shorthand declarations (sizes inside them not tokenised).

**Base size / line-height:** `body` (:361–374) sets family, background, colour only. No `font-size`, no `line-height`, no `html{}` rule: the root is the browser default 16px / normal; effective body text size comes from each component (13px de facto, per comment :196).

**Type scale tokens (:195–215, :349)**

| Token | Value | Uses of `font-size:var(...)` |
|---|---|---|
| `--text-2xs` | 10px | 0 (but raw `10px` ×111) |
| `--text-xs` | 11px | 105 |
| `--text-sm` | 12px | 84 |
| `--text-body` | 13px | 24 |
| `--text-base` | 14px | 6 |
| `--text-md` | 15px | 2 |
| `--text-lg` | 17px | 7 |
| `--text-xl` | 20px | 4 |
| `--text-2xl` | 24px | 8 |
| `--text-3xl` | 30px | 0 |
| `--text-4xl` | 38px | 0 |
| `--num-md` | 22px | 4 |
| `--leading-tight / snug / normal / relax` | 1.25 / 1.4 / 1.5 / 1.7 | not verified |

Raw sizes dominate: 44 distinct `font-size` values; top raw: 11px ×113, 10px ×111, 12px ×102, 11.5px ×73, 10.5px ×72, 9px ×58, 12.5px ×46, 13px ×34, 9.5px ×15, 8.5px ×8. Font weights: 600 ×220, 700 ×174, 500 ×128, 400 ×45, 800 ×43, 900 ×3 (900 is not loaded for any family), 300 ×1.

Tabular numerals: opt-in class list at :353–359 (`.num`, `.currency`, `.metric`, `.kpi-big`, …), not global.

---

### D2. Colour tokens

Five `:root` blocks in `style.css`: :29–350 (151 properties), :7637–7706 (wi4), :9016–9035 (wn5), :10125–10132 (wn5 segments), :10234–10241 (wn5 field/handover), plus a one-liner :10445. Distinct custom properties declared anywhere in the file: **311**. `index.html:11` has its own separate `:root` (7 properties, login page). No `prefers-color-scheme` block and no `data-theme` anywhere: **no dark theme**; dark "panels" live inside a light page (comment :119).

**Primary block (:29–350)**

| Group | Tokens (value) |
|---|---|
| Surfaces | `--surface-page` #F4F6F9 · `--surface-card` #FFFFFF · `--surface-sunken` #F0F5FA · `--surface-dark` #0B1929 (:52–56) |
| Surface aliases (legacy names) | `--bg` → surface-page · `--bg-card` → surface-card (:88–89) · `--bg-hover` #EEF2F6 (:90) · `--bg-row-alt` #F8FAFC (:306) |
| Text | `--text` #0F172A · `--text-mid` #475569 · `--text-dim` #94A3B8 · `--text-on-dark` #E2E8F0 (:59–62) · `--text-disabled` #9CA3AF (:96) · `--text-inverse` #FFFFFF (:302) · `--text-error` → danger-strong (:343) |
| Borders | `--border` #E2E8F0 · `--border-dark` #334155 (:65–66) · `--border-mid` rgba(0,0,0,.10) (:116) · `--border-row` #F1F5F9 (:309) · `--border-focus` → accent · `--border-error` → danger-strong (:341–342) |
| Accent | `--accent` #0284C7 · `--accent-hover` #0369A1 (:70–71) · `--accent-text` #0369A1 (:161) · `--accent-light` rgba(2,123,189,.10) · `--accent-glow` rgba(2,123,189,.20) (:162–163) · `--status-in-progress` → accent (:344) |
| Semantic (on light) | `--ok` #15803D · `--warn` #92400E · `--warn-bg` #FEF3C7 · `--warn-border` #E6CE9E · `--danger` #B91C1C · `--unassigned` #7F1D1D (:70–75) |
| Semantic aliases (legacy names) | `--success` → ok (:176) · `--warning` → warn (:188) · `--danger-strong` → danger (:187) · `--warning-soft` → warn-bg (:145) · `--success-bg` rgba(5,150,105,.08) (:177) · `--danger-bg` rgba(220,38,38,.08) (:180) · `--warning-bg` rgba(217,119,6,.08) (:189) |
| Sidebar / navy | `--navy` #080F1A · `--navy-mid` → surface-dark · `--navy-light` #122238 · `--navy-hover` #17304F · `--silver` #C4CFDB · `--silver-dim` #6E8099 · `--silver-light` → text-on-dark (:78–84) |
| Dark panel | `--panel` #0F172A · `--panel-border` #1E293B · `--panel-text` #F1F5F9 · `--panel-dim` #94A3B8 (:147–150) · `--panel-ok` #10B981 · `--panel-warn` #F59E0B · `--panel-bad` #EF4444 · `--panel-accent` #38BDF8 (:131–134) · `--panel-ok-hi` #34D399 · `--panel-bad-hi` #F87171 (:143–144) |
| Assignment chips | `--chip-own` → navy-mid · `--chip-partner` #166534 · `--chip-unassigned` → unassigned (:314–316) |
| Empty-return row | `--row-empty-bg` → warning-soft · `--row-empty-border` #D97706 · `--row-empty-text` → warn (:319–321) |
| Badges (fill/text pairs) | `--badge-pe-*` #DBEAFE/#1E40AF · `--badge-vs-*` #EDE9FE/#6D28D9 · `--badge-ok-*` #D1FAE5/#065F46 · `--badge-stop-*` #FEE2E2/#991B1B (:324–331) |
| Day header | `--day-header-bg` → border-row · `--day-header-today-bg` → navy-mid · `--day-header-today-text` → text-inverse (:334–336) |
| Map | `--map-hub` #7C3AED · `--map-wash` #0891B2 · `--map-cli-1…12` (#027BBD, #DC2626, #7C3AED, #F59E0B, #059669, #DB2777, #0891B2, #CA8A04, #4F46E5, #B91C1C, #15803D, #9333EA) (:267–280) |
| Non-colour (see D1/D3/D7) | `--z-*` ×6, `--sidebar-w/-col`, `--header-h`, `--text-*`, `--num-md`, `--leading-*`, `--space-*`, `--fab-clear`, `--radius-*`, `--shadow-*`, `--ease-*`, `--duration-*` |

**Page-scoped token sets (not in `:root`)**

| Scope | Line | Tokens |
|---|---|---|
| `.perf-wrap` | :3614–3633; light override :3797–3806; third override :3813–3815 | `--p-card` #0F1C2F, `--p-card-hover` #142845, `--p-border`, `--p-border-hover`, `--p-text` #E2E8F0, `--p-text-mid` #94A3B8, `--p-text-dim` #7C8CA0, `--p-accent` #38BDF8, `--p-ok` #34D399, `--p-warn` #F59E0B, `--p-bad` #F87171, `--p-*-soft`, `--p-nums` |
| `.dash-wrap` | :4964–4988; light override :5132–5140; third :5150–5153 | `--dc-card-bg` #0F1C2F, `--dc-card-bg-hover`, `--dc-card-border(-hover)`, `--dc-text` / `-mid` / `-dim`, `--dc-accent` #38BDF8, `--dc-accent-hover` #7DD3FC, `--dc-accent-soft`, `--dc-ok` #10B981, `--dc-warn` #D97706, `--dc-bad` #F87171, `--dc-*-soft`, `--dc-nums` |
| `.ceo-wrap` | :5860–5886 | `--ceo-bg`, `--ceo-card` #0F1C2F, `--ceo-card-hover`, `--ceo-card-border(-hover)`, `--ceo-card-shadow`, `--ceo-text` / `-mid` / `-dim` / `-faint`, `--ceo-accent` #38BDF8, `--ceo-accent-deep` #027BBD, `--ceo-ok` #34D399, `--ceo-warn` #F59E0B, `--ceo-bad` #F87171, `--ceo-navy` #3B82F6, `--ceo-*-soft`, `--ceo-track` |
| `.rd` (`route-diagram.css:8–23`) | — | 15 `--rd-*` tokens; 8 raw hexes, 7 `var(--token, fallback)` |
| `.wp` (`core/week-paper.js:42`) | — | 14 print tokens re-declared as raw hex (`--navy`, `--blue`, `--red`, `--green`, `--amber`, `--ink`, `--body`, `--mut`, `--done`, `--rule`, `--edge`, `--tk`, `--vs`, `--vsink`) |

**Weekly International v4 block (:7637–7706), 51 tokens:** `--wi4-ink`, `--wi4-grey-1/2/3` (#344054, #5b6b7f, #98a2b3), `--wi4-icon`, `--wi4-tabs-bg` #eef2f6, `--wi4-badge-bg/-ink`, `--wi4-av-t0…t3(-bg)` (8 presence tints), `--wi4-line` #eef1f5, `--wi4-line-2` → border, `--wi4-line-3` #eaecf0, `--wi4-today-line/-bg/-hover`, `--wi4-ctl` #d0d5dd, `--wi4-slot` #cbd5e1, `--wi4-red(-bg/-ink/-line)`, `--wi4-amber` #b45309 `(-bg/-ink/-line)`, `--wi4-sel`, `--wi4-kcap`, `--wi4-delay-bg`, `--wi4-own` #eef2f6, `--wi4-partner(-line/-ink/-sub)`, `--wi4-blue` #027bbd, `--wi4-blue-ink`, `--wi4-chip`, `--wi4-split-hd`, `--wi4-hover`, `--wi4-done` .4, `--wi4-info-bg/-line/-ink`, `--wi4-conf-line`.

**Weekly National v5 blocks:** :9016–9035 `--wn5-note-bg/-line/-ink`, `--wn5-err-line`, `--wn5-info-bg/-line`, `--wn5-ctl-hover`, `--wn5-dlg-shadow`, `--wn5-pop-shadow`, `--wn5-card-shadow`, `--wn5-chip-navy`, `--wn5-chip-ok-bg`, `--wn5-leave-ink`, `--wn5-mode-on`, `--wn5-lock-bg`, `--wn5-sel-chev`; :10125 `--wn5-seg-initial/-intermediate/-final(-ink)`; :10234 `--wn5-field-err` #dc2626, `--wn5h-card-shadow`, `--wn5h-dlg-shadow`; :10445 `--trip-sep`, `--trip-sep-in`.

**Aliases / duplicates / legacy**

| Finding | Evidence |
|---|---|
| Same concept under two names | `--warn`/`--warning` (:71,:188) · `--ok`/`--success` (:70,:176) · `--danger`/`--danger-strong` (:74,:187) · `--warn-bg`/`--warning-soft` (:72,:145) · `--surface-page`/`--bg` · `--surface-card`/`--bg-card` · `--surface-dark`/`--navy-mid` · `--text-on-dark`/`--silver-light` |
| Same name family, different colour | `--warn-bg` #FEF3C7 (opaque) vs `--warning-bg` rgba(217,119,6,.08) — two different "warning backgrounds" |
| Same value, different names (documented coincidences) | `--accent-hover` = `--accent-text` #0369A1 · `--panel` = `--text` #0F172A · `--panel-text` = `--border-row` #F1F5F9 · `--text-dim` = `--panel-dim` #94A3B8 · `--text-on-dark` = `--border` #E2E8F0 · `--wi4-own` = `--wi4-tabs-bg` = `--bg-hover` #EEF2F6 |
| Old accent still inside tokens | `--accent` is #0284C7 but `--accent-light`, `--accent-glow`, `--shadow-focus` use rgb(2,123,189) = #027BBD; `--wi4-blue`, `--ceo-accent-deep`, `--map-cli-1`, `--rd-today` are #027BBD |
| Three parallel dashboard palettes | `--p-*`, `--dc-*`, `--ceo-*` repeat the same dark-card values; `ok` is #34D399 in `--p-`/`--ceo-` but #10B981 in `--dc-`; `warn` is #F59E0B vs #D97706 |
| Tokens re-declared within their own scope | 40+ names declared 2–3 times (e.g. `--dc-text` ×3, `--p-text` ×3, `--dc-accent` ×3) |
| `var()` referenced but never declared in style.css | `--accent-hi`, `--navy-deep`, `--text-strong`, `--white`, `--existing`, `--kpi-dot`, `--ow4-minw`, `--ow4-rw`, `--wi4-tr`, `--wn5-tr` (some are set from JS or carry a fallback; not verified individually). `--white` exists only in `index.html:16` |
| Login page has its own palette | `index.html:11–19`: `--navy` #091828 (app: #080F1A), `--silver` #B8C4D0 (app: #C4CFDB), `--silver-dim` #6A7D90 (app: #6E8099), `--border` rgba(...) (app: #E2E8F0) |

---

### D3. Radii, shadows, spacing, z-index, layout constants

**Radius (:236–241):** `--radius-sm` 4px · `--radius` 6px · `--radius-md` 8px · `--radius-lg` 12px · `--radius-xl` 16px · `--radius-full` 9999px.
Usage: tokenised ≈205 declarations; raw: 6px ×60, 4px ×49, 50% ×38, 5px ×28, 8px ×24, 3px ×20, 10px ×9, 12px ×5, 9px ×4, 999px ×4, 7.5px ×2.

**Shadows (:244–256):** `--shadow-xs`, `--shadow-sm`, `--shadow`, `--shadow-md`, `--shadow-lg` (all rgba(15,23,42,…)), `--shadow-focus` 0 0 0 3px rgba(2,123,189,.25), `--shadow-panel` -8px 0 30px, `--shadow-lift` 0 3px 14px. Extra shadow tokens outside the scale: `--wn5-dlg-shadow`, `--wn5-pop-shadow`, `--wn5-card-shadow` (:9024–9026), `--wn5h-card-shadow`, `--wn5h-dlg-shadow` (:10239–10240), `--ceo-card-shadow` (:5867). `box-shadow` declarations: 143, of which 38 start with `var(`.

**Spacing (:218–228, :348):** `--space-0` 0 · `--space-05` 2px · `--space-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 20 · `-6` 24 · `-8` 32 · `-10` 40 · `-12` 48 · `-16` 64. `--fab-clear` 88px (:233). Of 1,835 `padding|margin|gap` declarations, 257 use a `--space-*` token (14%).

**Z-index tokens (:109–114):** `--z-raised` 1 · `--z-sticky` 2 · `--z-nav` 100 · `--z-float` 300 · `--z-overlay` 9000 · `--z-top` 9999.

| z-index in style.css | Count |
|---|---|
| Declarations total (excluding 5 mentions in comments) | 66 |
| Token or `calc(token + n)` | 30 |
| Hard-coded number | 36: `1` ×8, `3` ×3, `5` ×3, `20` ×3, `30` ×3, `1200` ×3, `-1` ×2, `35` ×2, `40` ×2, `600` ×2, `2`, `31`, `50`, `-2`, `9999 !important` |
| In JS (`modules/*.js`, `core/*.js`) | 50 declarations; hard-coded include `99999`, `99998`, `60`, `61`, `40`, `30`, `20`; `calc(var(--z-top) + 3/4/10)` |

The comment at :98–108 states "6 semantic levels, do not add a 7th"; 15 distinct hard-coded values exist in the same file.

**Layout constants**

| Constant | Value | Where |
|---|---|---|
| Sidebar width | 228px (`--sidebar-w`) | :191, `.sidebar` :380 |
| Sidebar collapsed | 56px (`--sidebar-col`) | :192, :393; also literal `56px !important` at :2292 |
| Sidebar logo block | 78px high | :397 |
| Topbar height | 52px (`--header-h`) | :193, :686; **60px** on Weekly screens (`body.wi4-on .topbar` :7758) |
| Topbar padding | 0 28px; 0 16px ≤1024px | :692, :2302 |
| Content padding | 32px 36px 148px | :855; Weekly: 8px 28px (:7740) |
| Page header bottom margin | 28px (`.page-header` :894) vs 20px (`.tms-page-header` :6985) | |
| Modal width | 600px; `.modal--wide` 1100px; max 96vw / 90vh | :1319, :1332 |
| Notification panel | 340 × max 420px | :816 |
| Touch target | 44px min on shell chrome (:863) and on most controls ≤768px (:2487) | |

---

### D4. Breakpoints

The header comment (:5–22) declares **three** thresholds (1200 / 1024 / 768). As coded:

| Query (style.css) | Count | Lines | What it does |
|---|---|---|---|
| `max-width:1600px` | 11 | :7778, :7875, :7900, :7980, :8045, :8508, :8735, :9115, :9360, :9799, :10222 | Weekly v4 / National v5 density: hide labels, drop outer week tabs, narrower columns |
| `max-width:768px` | 5 | :2324, :2452, :4437, :5848, :6567 | Sidebar becomes off-canvas drawer with hamburger + backdrop (:2324–2344); `.entity-detail-panel` full-screen (:2452); 44px touch targets (:2487); dashboards single column |
| `max-width:1024px` | 4 (one as `screen and`) | :2291, :3459, :3857, :6564 | Sidebar forced to 56px icons, modal and detail panel 95% width, `.form-grid` 1 column (:2291–2313); perf/ceo grids 1 column |
| `max-width:1200px` | 4 | :3085, :5844, :6887, :7435 | Asymmetric "main + side" grids stack |
| `min-width:1025px` | 2 | :622, :7814 | Collapsed-sidebar rules only on desktop; wi4 topbar |
| `max-width:1366px` | 1 | :9116 | wn5 column width |
| `max-width:1360px` | 1 | :2989 | weekly (wk3) |
| `max-width:1279px` | 1 | :10540 | orders week view (ow4) |
| `max-width:1140px` | 1 | :5216 | `.dash-burn` 1 column |
| `max-width:820px` | 1 | :7441 | locations map |
| `hover:none` / `hover:hover` | 3 / 1 | :7164, :8668, :8714 / :9579 | Show hover-only affordances on touch |

**10 distinct width values in style.css.** JS-injected `<style>` adds 6 more: `max-width` 1800 (×3), 1320 (×2), 720, 560, 1366, 1360, 768 and `min-width` 1800, 1700 (files not attributed individually). Total distinct width breakpoints across CSS + JS: **15**. Login page: one `max-width:768px` (`index.html:258`).

---

### D5. Components as coded

#### Buttons

| Family | Line | As coded | Notes |
|---|---|---|---|
| `.btn` base | :966 | 36px high, radius 6, DM Sans 12px/600, 1px transparent border, `:active` scale .97, `:disabled` opacity .45, focus ring `--shadow-focus` | "Button System v2" |
| sizes | :994–998 | `.btn-sm` 28px/11px · `.btn-lg` 44px/14px · `.btn-icon` 36px square (also redefined :2054) | |
| `.btn-primary` | :1001 **and** :6937 | :1001 solid `--accent`; :6937 (later, wins) `linear-gradient(135deg,#0B1929,#027BBD)`, radius 8, `font:600 13px`, `border:none` | [INCONSISTENT] two definitions |
| `.btn-success` | :1013 | solid `--success`, hover raw #047857 | |
| `.btn-secondary` | :1021 | white, `--border-mid`, hover accent tint | |
| `.btn-ghost` | :1029 | transparent, `--border-mid`, `--text-mid` | |
| `.btn-danger` | :1041 | `--danger-bg` fill, red text (subtle, not solid) | |
| `.btn-new-order` | :1049, :2100, :6938 | :1049 "legacy alias of btn-primary" (solid accent); :6938 gradient | 3 definitions |
| `.btn-scan` | :2122, :6964 | :2122 transparent, padding 8px 14px, radius 8; :6964 white, 36px, 1px #027BBD | 2 definitions |
| `.tms-btn` / `.tms-btn-outline` / `.btn-new-entry` | :6936–6963 | "Unified primary button", gradient / outline | third system layered over the first two |
| `.btn-logout` | :762 | padding 6px 14px, `--text-dim`, `transition: all .15s` | |
| `.undo-btn` / `.undo-btn-idle` | :781 / :788 | raw #FEF3C7 / #92400E / #FCD34D (not `--warn-*`) | |
| `.wi4-btn` | :7904 (46 selectors) | 32px, radius 6px literal, `--wi4-ctl` border | Weekly v4 own button |
| `.wi-btn`, `.wi-btn-d`, `.wi-side-btn` | first seen :2487, :2625 | legacy Weekly buttons | base rules not located |
| `.ops-day-btn`, `.ops-alert-btn`, `.ramp-day-btn` | :2488, :2487, :3427 | `.ramp-day-btn` uses Syne 11px/700 | |
| `.ceo-period-btn` | :5933 | segmented control | |
| `.entity-action-btn`, `.ecard-meta-row-btn`, `.wn5f-cbtn`, `.aic-upload-btn`, `.modal-close`, `.mobile-nav-toggle`, `.notif-bell` | :4443, :1845, :10056, :7236, :1367, :2326, :805 | one-offs | |
| JS-injected families | — | `.dl-btn`/`.dl-mbtn` (payroll), `.ct-btn` (costs), `.ex-btn` (expenses), `.ei-btn`/`.ei-btn-primary` (expenses_import), `.plv-btn`/`.plv-btn-p` (pallet_ledger), `.plw-btn` (pallets_week), `.do-btn`/`.do-late-btn` (daily_ops), `.wn4-btn` (weekly_natl), `.wi2-btn`/`.wi2-legend-btn` (weekly_intl), `.pre-btn` (preorder), `.loc-act-btn`/`.loc-pager-btn` (locations), `.oiv-warn-btn` (orders_invoicing_view), `.aic-btn`/`.aic-qbtn` (ai-chat), a local `.btn` (print windows) | |
| Print pages | `print.html:28` | `.pbar-btn` grey #6B7280 | |

**Count: 32 distinct `*btn*`/`*button*` class names in style.css ≈ 17 families, plus ≈ 14 JS-injected families and 1 print family ≈ 32 button families.**

#### Inputs / selects / search

| Class | Line | As coded |
|---|---|---|
| `.form-input, .form-select, .form-textarea` | :1442 | white, 1px `--border-dark` (#334155, a dark border on light), radius 8, padding 9px 13px, 13px |
| `.form-label` | :1435 | 11px/500 `--text-mid` |
| `.form-grid`, `.form-field.span-2` | referenced :2305–2306 | base rule line not verified |
| `.filter-select` | :1545 | `--bg` fill, 1px `--border`, radius 6, 6px 10px, 12px |
| `.search-input` | :1085 | `--bg` fill, radius 6, 7px 12px, 13px, focus ring `--accent-glow` |
| `.entity-search-input` | :4924 | borderless inside a wrapper, 12px |
| `.fh-cb-input` (searchable select) | :2085 | chevron data-URI; same chevron duplicated in `--wn5-sel-chev` (:9034) |
| `.svc-filter`, `.tinp`, `.ramp-date-inp`, `.wi-pop-inp(-wide)`, `.wi-sdi`, `.wi-ti` | :2488, :2309, :2312 | per-screen inputs |
| JS-injected | — | `.at-search`, `.ex-search`, `.ma-search`, `.nc-search`, `.oc-search`, `.oiv-search`, `.dl-search`, `.mnt-search`, `.mnt-select`, `.mnt-inline-input`, `.np-in`, `.plv-in`, `.plw-in`, `.ei-catselect`, `.aic-input` |

≥ 4 input looks in style.css + ≥ 13 module-local search/input classes.

#### Tables

| Class | Line | Notes |
|---|---|---|
| global `table`, `thead th`, `tbody td` | :1104, :1109, :1130 | element selectors: `th` 10px/600 uppercase, padding 11px 18px, background raw `#F0F5FA` (the value of `--surface-sunken`, not the token) |
| `.table-wrap`, `.table-wrap--sticky`, `.table-toolbar`, `.table-scroll` | :1069, :1127, :1076, :2404 | card frame radius 12 |
| `.entity-table-wrap` / `.entity-table` | :1567 / :4384 | master data |
| `.ops-table`, `.exp-table-wrap`, `.sig-table`, `.dash-aging-table`, `.ceo-mini-table`, `.md-fleet-table`, `.md-svc-table`, `.wi4-rtab`, `.owvp-tb` | :2417, :4866, :4402, :5163, :5897, :6628, :6677, :8276, :10596 | per-screen |
| JS-injected | — | `.dh-tbl`, `.ct-tbl`, `.plw-tbl`, `.at-table`, `.mnt-table`, `.ma-table`, `.nc-table`, `.do-t`, `.lh-t`, `.oiv-t`, `.np-t`, `.plv-t`, `.s-t` |

≈ 13 table families in CSS + 13 in JS.

#### Cards

`.kpi-card` :924 · `.tms-stat-card` :1683 · `.ecard-*` (≈45 classes, entity card) :1796–1931 · `.pl-balance-card` :2264 · `.wi-card` (+ `-ok/-bp/-cl/-un`) :2652–2706 · `.perf-card` :3781 · `.stop-card` :4402 · `.dash-card` :5124 (and again in a grouped dark rule :6928 with `.entity-kpi-card, .ramp-stat-card, .ops-kpi-card, .aic-panel`, raw `#0F1C2F`) · `.ceo-brand-card` :6013 · `.wi2-card` :7455 · `.wi4-qcard` :7596 · `.wn5-qcard` :9353 · `.wn5-ocard` :9750 · `.wn5f-card` :10063 · `.ow4-card` :10413 · `.owv-card` :10556 · `.card-lift` :1271.
JS-injected: `.dh-card`, `.ct-card`, `.ex-card`, `.ei-card`, `.mnt-card`, `.ma-card`, `.oi-card`, `.on-card`, `.oiv-card`, `.np-card`, `.plv-card`, `.plw-card`, `.dl-card`, `.pre-card`, `.wn4-card`, `.ekpi-card`, `.s-card`. **≈ 17 CSS + 17 JS card families.**

#### Badges / pills / chips

| Family | Line | Shape |
|---|---|---|
| `.badge` + `-green/-blue/-yellow/-red/-grey` | :1148–1161 | radius 4, 11px/500, tinted fill; blue and grey use raw colours |
| `.tms-pill` + `-ok/-warn/-bad/-info/-owned/-partner/-mute/-outline` | :7017–7036 | radius full, 22px, 11px/600 uppercase, dark solid fills with raw hex |
| `.role-badge` + `.owner/.dispatcher/.management/.accountant` | :743–760 | 9px/600 uppercase, radius 12 |
| `.wi-badge`, `.wi-pill`, `.wk3-pill`, `.wk3-segpill`, `.wi-shelf-chip`, `.wi-ichip`, `.wi-chip-impnv`, `.wk-driver-chip`, `.wi2-splitchip`, `.wn3-chip`, `.wi4-tag`, `.wn5-chip`, `.wn5-pbadge`, `.wn5f-chip`, `.wn5f-badge`, `.wn5h-chip`, `.wn5-hub-chip` | :2588–10278 | Weekly generations 1–5 each with own chips |
| `.vs-badge` :3502 · `.perf-pill(-ok/-bad)` :3929 · `.count-chip` :4612 · `.entity-count-chip` :4936 · `.exp-section-badge` :4849 · `.dash-idle-pill`, `.dash-day-tag`, `.dash-aging-pill` :5164–5603 · `.ceo-setup-badge` :6132 · `.scan-doc-type-badge` :7135 · `.aic-chip` :7186 · `.od-badge` :8601 · `.modal-title-chip` :1359 · `.ecard-badge-svc` :1849 · `.owvp-tag` :10592 · `.rd-chip`, `.rd-vs`, `.rd-tag` (`route-diagram.css:32,56,58`) | | |
| JS-injected | — | `.ct-badge`, `.ct-mbadge`, `.ct-rolechip`, `.do-pill`, `.dh-pill`, `.ex-chip`, `.ex-badge-neutral`, `.ei-chip`, `.loc-chip`, `.locc-chip`, `.mnt-pill`, `.ma-badge`, `.nc-chip`, `.oc-chip`, `.oh-badge`, `.oh-navbadge`, `.oi-chip` (+ `-bad/-warn/-unassigned`), `.oi2-chip`, `.oi2-vschip`, `.on-chip`, `.plw-chip`, `.dl-badge`, `.dl-ychip`, `.pre-chip`, `.pre-pill`, `.wn4-chip`, `.wi2-ichip`, `.aic-quota-badge` |

**≈ 40 class families in style.css + ≈ 28 in JS.**

#### Modals, dialogs, drawers, panels

| Pattern | Where | Notes |
|---|---|---|
| `.modal-overlay` / `.modal` (+ `--wide`, `-header`, `-title`, `-title-chip`, `-close`, `-body`, `-footer`) | :1297–1392; z rule again :2511; JS `core/ui.js:12` `openModal` | blur backdrop rgba(11,25,41,.55), radius 12, 600px, `modalIn` .2s |
| `.mf-overlay` / `.mf-modal` | :2512, `modules/maintenance.js` | overlay + 100 |
| `.pu-overlay` / `.pu-modal` | :2147–2152 | pallet upload, overlay + 600 |
| `.cmdk-overlay` | :4447 | command palette |
| `.wi4-dlg` (+ `-back/-hd/-t/-x/-ft`) | :7617, :8883 | Weekly v4 dialog |
| `.wn5-dlg` (67 selectors), `.wn5-pop-back`, `.wn5-hub-pop`, `.wn5h-sheets` | :9152, :9444, :10773, :10264 | National v5 dialogs, own shadows |
| `.wi-pop-*`, `.wi-panel`, `.wk3-sheet` | :2307–3333, :3133, :2812 | legacy Weekly popovers / side panel (fixed, 360px) |
| `.entity-detail-panel` | :1517, :1773 (480px), :2452 (full-screen ≤768) | master-data side panel |
| `.owv-card` drawer | :10556 | fixed right 480px, `z-index:1200` |
| `.notif-panel` | :815 and :4594 | 2 definitions |
| JS-injected | — | `.ct-overlay`/`.ct-modal`/`.ct-panel`, `.ex-modal-*` (+ `-scrim`), `.dl-overlay`/`.dl-modal`, `.locc-overlay`/`.locc-panel`, `.mnt-drawer(-bg)`, `.plw-panel`, `.do-pop`, `.wi2-pop`, `.aic-panel`/`.aic-confirm-overlay`, slide-in order forms (`oi-slide`, `onSlideIn` keyframes), local `.modal` in `orders_intl.js` |

**≥ 8 modal/dialog shells in CSS + ≥ 7 in JS; ≥ 5 right-side drawer/panel shells.** Confirm dialog: `confirmAction` (`core/ui.js:98`) plus native `confirm()` still used (e.g. `core/utils.js:1978`).

#### Toasts / banners

No toast CSS class: `toast()` builds `#toast` with inline `cssText` (`core/ui.js:386–428`): fixed bottom 88px / right 24px, radius 6px, 13px/500, raw shadow, 0.25s ease, 3s; colours `--ok` / `--danger` / `--warn` / `--surface-dark`. Only style.css rule: `#toast { z-index }` :2513. Second implementation `showErrorToast` (`core/utils.js:30`), third `_toast` (`core/share-helpers.js:17`), fourth `_retryToasts` (`modules/weekly_intl_v2.js:2166`).
Banners: `.offline-banner` :2518 · `.dash-alert-banner` :5060 · `.ceo-loss-banner` :5978 · `.tms-error-banner` :7043 · `.wi4-banner` :7595 · wn5 note/info strips (tokens :9017–9022).

#### Empty states

`.empty-state` (+ `.icon`, `.empty-state-illustration`) :1185, :4553 · `.notif-empty` :844, :4669 · `.ecard-empty` :1895 · `.wk3-empty` :2947 · `.wn3-lempty` :3029 · `.wi-panel-empty` :3154 · `.ramp-empty` :3494 · `.ops-empty` :3605 · `.perf-goal-empty` :4098 · `.cmdk-empty` :4528 · `.dash-empty` :5806 · `.lmap-empty` :7374 · `.wi4-dayempty` :7600 · `.wn5-nf-empty` :10785 · `.wn5-cb-empty` :10852. JS-injected: `.dh-empty`, `.ct-empty`, `.do-empty`, `.locc-empty`, `.ma-empty`, `.oiv-empty`, `.np-empty`, `.plv-empty`, `.wn4-empty`, `.od-empty`. JS helpers: `showEmpty`, `showEmptyLegacy` (`core/ui.js:177,285`), `_entityEmptyState` (`core/entity.js:1614`), `_plvEmptyCard` (`modules/pallet_ledger.js:510`). **15 CSS + 10 JS empty-state classes.**

#### Loading

`.loading` :1164 (60px padding, `--silver-dim`) · `.spinner` :1174 (18px, `spin .7s`) · skeleton set `.sk`, `.sk-line`, `.sk-line-sm`, `.sk-text`, `.sk-title`, `.sk-avatar`, `.sk-card` :1225–1237 · `showLoading()` (`core/ui.js:244`) builds a different skeleton entirely from inline styles and injects its own `@keyframes sk-shimmer` (`core/ui.js:259`, a `transform` animation) that conflicts with `style.css:1221` (a `background-position` animation of the same name) · `.dh-sk` (`modules/dashboard.js:775`) · `.wn5-reloading` :9583 · Weekly spinner uses `animation: wi-spin` :3336, for which no `@keyframes wi-spin` exists in `assets/`, `modules/` or `core/` · print pages have their own `.spin` / `@keyframes sp`.

#### Tabs

`.pu-tab(s)` :2174–2193 · `.wk3-tab(s)` :2767–2768 (Syne 11.5px/700) · `.exp-tab-bar` / `.exp-tab` / `.exp-tab-count` :4761–4793 · `.wi4-tab(s)` / `.wi4-tab-b` / `.wi4-tab-cur` :7887–7897 (28px, radius 6, 12.5px/500) · `.owv-ed-tab` :10656 (24px segmented) · `.wn5-cmp-tab` :10828 (24px pill, radius 12) · `.ceo-period-btn` :5933 (segmented). JS-injected: `.oh-tab(s)`, `.nc-tab(s)`, `.ma-tab`, `.wi2-tabs`. **7 CSS + 4 JS tab families.**

#### Sidebar / nav

`.sidebar` :379 (228px, `--navy-mid`, width transition .22s) · `.sidebar.collapsed` :393 · `.sidebar-logo` :396 (78px) · `.sidebar-logo-text` :418 (Syne 13/700) · `.sidebar-cmdk` :431 · `.nav-section` :489 (10px/700 uppercase, letter-spacing 1.2px) · `.nav-group-items` :521 · `.nav-item` :534 (min-height 44, 12px/500, radius 6, margin 1px 8px) · `.nav-item:hover` :555 · `.nav-item.active` :567 (rgba(56,189,248,.18) + 3px left bar raw `#38BDF8` with glow :573–583) · `.nav-icon` :585 · `.nav-label` :604 · `.sidebar-toggle` :652 · mobile: `.mobile-nav-toggle`, `.mobile-nav-backdrop`, `body.mobile-nav-open` :2321–2344. Sidebar colours are raw `rgba(255,255,255,…)` / `rgba(56,189,248,…)` / `#38BDF8` / `#F1F5F9` rather than `--panel-accent` / `--panel-text`.

#### Topbar

`.topbar` :685 · `.topbar-title` :697 (Syne 17/700) · `.topbar-breadcrumb` :706 · `.topbar-right` :711 · `.user-chip` :717 · `.user-avatar` :729 · `.btn-logout` :762 · `.undo-btn` :781 · `.notif-bell` :805 · `.notif-dot` :811 (raw #EF4444) · `.notif-panel/-header/-list/-item/-icon/-body/-title/-sub/-time/-empty` :815–844, redefined :4594–4679 · `.notif-x`, `.notif-all`, `.notif-child(ren)` :7153–7181 · `.notif-wrap` :7787.

`.role-badge` per-role colours (:757–760):

| Role class | Fill | Text |
|---|---|---|
| base | rgba(184,196,208,.12) | `--silver-dim` |
| `.owner` | rgba(240,165,0,.15) | #8A5A00 |
| `.dispatcher` | rgba(46,196,160,.15) | #0F6B57 |
| `.management` | rgba(100,150,220,.15) | #2C5F96 |
| `.accountant` | rgba(184,196,208,.12) | #475569 |
| `.warehouse` | no rule (falls back to base) | — |

None of these eight colours is a token.

#### Page header / footer

`.page-header` :890 / `.page-title` :897 (Syne 24/700) / `.page-sub` :909 (13px `--text-dim`) **and** a second system `.tms-page-header` / `.tms-page-title` / `.tms-page-sub` / `.tms-page-actions` :6985–7010 (Syne 24/700, sub 13px `--text-mid`). `.page-footer` :866 (11px, top border, 40px top margin) with `.footer-logo` :877 (Syne 12/700).

---

### D6. Print

**`@media print` in `style.css` (8) and `route-diagram.css` (1)**

| Line | What it does |
|---|---|
| :3222 | hides Weekly shelf (`.wk3.wi2 .wi-shelf`) |
| :4166 | main block: `@page { size: landscape; margin: 1cm }` (:4168); hides `.sidebar`, `.topbar`, AI chat, banners, `.page-footer`, **every `button`**, `.btn*` with `!important`; hides Weekly week bars, context menus, popovers, side buttons (rest of block not read in full) |
| :9003 | hides wi4 queue, shelf, banner, presence; un-sticks columns |
| :9895 | hides `.wn5-hub` |
| :10544 | orders week view (ow4): hides strips/links, `break-inside: avoid` on rows |
| :10575 | hides `.owv-docs` |
| :10583 | named page `@page owvp { size: A4 portrait; margin: 11mm 11mm 12mm }` (:10582); `body.owv-printing` shows only `#owvPrint`; `.owvp*` rules :10587+ use DM Sans 9.5px, Syne 14/18px titles, fixed raw colours (#111, #64748b) |
| :10660 | hides `.owv-ed` |
| `route-diagram.css:113` | hides `.wn5-rdp`, `.rdc` |

Two unnamed/named `@page` rules in one stylesheet (landscape :4168 vs portrait named :10582).

**Separate print pages / shells**

| Shell | `@page` | Fonts / base size |
|---|---|---|
| `print.html` (1,518 lines) | `A4; margin 9mm` (:233) | DM Sans 11px / 1.5, colour #111827 (:9); Syne 700/800 for logo/titles; own `.pbar` screen bar #0B1929; sizes 8–13px |
| `print_payroll.html` (355) | `A4; margin 12mm` (:100) | same body (:14); same `.pbar` pattern copied (comment :8) |
| `print_pnl.html` (191) | written per paper by script, `A4 portrait|landscape; margin 12mm 12mm 14mm` (:139) | DM Sans 11px / 1.45 (:14) |
| `core/utils.js:1986` `_printWeekShell` | `margin 10mm` (:1991) | `*{font-family:'DM Sans'; color:#0F172A}`; loads Syne 700, DM Sans 400/500 only |
| `core/week-paper.js` (printed week, rendered inside the shell above) | `A4 landscape; margin 8mm 9mm 11mm` with page counter (:37), per-paper footer (:269, :506) | sizes in **pt** (`font: var(--fs)/1.25 'DM Sans'`, masthead Syne 700 19pt, KPI 26pt); own 14-token palette as raw hex (:42); loads DM Sans 400/500/700 + DM Mono 500 itself (:14) because the shell lacks them (:13) |
| `modules/wn5_sheet.js:240` | `A4; margin 0` (:242) | DM Sans 400–700 + DM Mono 500; `.s-` classes |
| `modules/maintenance.js:2029`, `:2254` | `A4; 16mm` / `A4 landscape; 11mm 11mm 12mm` + page counter | own font links (:817, :2253) |
| `modules/pallet_ledger.js:1228` | `A4; 16mm` | DM Sans 11px, colour #0F172A |
| `modules/orders_noprice_view.js:566` | `A4 portrait; 14mm` (:594) | Syne 600/700, DM Sans |
| `modules/orders_catalog.js:548` | `A4 landscape; 12mm` | `font:10px/1.35 'DM Sans',Arial` |
| `modules/orders_invoicing_view.js:1167` | `A4 landscape` | not verified |
| `modules/daily_ramp.js:1119` | not verified | own font link |

**≥ 12 independent print shells; page margins 0 / 8 / 9 / 10 / 11 / 12 / 14 / 16 mm / 1cm; units mixed (px and pt).**

---

### D7. Motion

**Tokens (:283–287):** `--ease-out` cubic-bezier(.16,1,.3,1) · `--ease-in-out` cubic-bezier(.4,0,.2,1) · `--duration-fast` 150ms · `--duration-base` 250ms · `--duration-slow` 400ms.

**`@keyframes` in style.css (17)**

| Name | Line | Used at |
|---|---|---|
| `spin` | :1182 | `.spinner` :1179 |
| `sk-shimmer` | :1221 | `.sk` :1228; also redefined differently in `core/ui.js:259` |
| `slide-up-fade` | :1240 | :1189 (`.empty-state`), :1260, :4558, :4841 |
| `scale-in` | :1244 | :4466 (command palette) |
| `pulse-subtle` | :1248 | **unused** |
| `number-tick` | :1252 | **unused** |
| `overlay-fade` | :1308 | :1306 (`.modal-overlay`), :4457 |
| `modalIn` | :1336 | :1324 (`.modal`) |
| `ccJumpFlash` | :2710 | :2709 |
| `perf-fade-up` | :4153 | :4141 |
| `dash-pulse` | :5029 | :3678, :5026 |
| `dash-slide-in` | :5091 | :5070 |
| `dash-fade-up` | :5833 | :5819 |
| `ceo-slide-in` | :5989 | :5987 |
| `ceo-fade-up` | :6551 | :6540 |
| `lmapPulse` | :7433 | :7430 |
| `wi4-sh` | :8182 | :8180 |

Referenced but not defined: `wi-spin` (:3336). `perf-fade-up`, `dash-fade-up`, `ceo-fade-up` and `dash-slide-in`, `ceo-slide-in` are per-page copies of the same idea as `slide-up-fade`.

**`@keyframes` outside style.css (13):** `dh-sk` (`modules/dashboard.js:775`), `mnt-in` (`modules/maintenance.js:216`), `onSlideIn` (`modules/orders_natl.js:170`), `oi-slide` (`modules/orders_intl.js:87`), `aic-msg-in`, `aic-pulse`, `aic-overlay-in`, `aic-card-in` (`core/ai-chat.js:265–323`), `sk-shimmer` (`core/ui.js:259`), `sp` ×3 (`print.html:14`, `print_payroll.html:19`, `print_pnl.html:18`), `slideIn` (`index.html:146`). **Total 30 `@keyframes` declarations, 27 distinct names.**

**Transitions (style.css, 123 `transition:` declarations; 20 are `transition: all`)**

| Duration | Count | | Easing | Count |
|---|---|---|---|---|
| `var(--duration-fast)` (150ms) | 47 | | `var(--ease-out)` | 77 |
| `0.15s` / `.15s` | 25 / 16 | | `cubic-bezier(0.4,0,0.2,1)` (raw, = `--ease-in-out`) | 3 |
| `0.6s` | 9 | | `ease` | 3 |
| `0.8s` | 6 | | `ease-out` | 3 |
| `0.12s` / `.12s` | 6 / 6 | | (none given = `ease`) | remainder |
| `.1s` / `0.1s` | 6 / 3 | | | |
| `0.2s` / `.2s` | 5 / 3 | | | |
| `var(--duration-base)` | 2 | | | |
| `0.4s`, `0.22s`, `0.05s` | 2 each | | | |
| `var(--duration-slow)`, `0.7s`, `0.5s`, `0.3s`, `.3s`, `0.28s`, `0.25s`, `0.08s`, `.07s` | 1 each | | | |

50 of ≈ 150 duration values use a token; 41 are the literal equivalent of `--duration-fast`. Animation durations are mostly tokenised (`--duration-base` ×9) with raw `0.2s`, `0.7s`, `1.5s`, `1.6s`, `2s`, `.6s`; `modalIn` uses a third easing `cubic-bezier(0.22,1,0.36,1)` (:1324). Toast uses `0.25s ease` inline (`core/ui.js:396`).

**`prefers-reduced-motion`: partial.** style.css: 7 scoped blocks — :3139 (`.wi-panel`), :4157 (perf), :4414, :5837 (dashboard), :6555 (ceo), :7497 (`.wk3-seg`), :8438 (wi4 rows). JS: `modules/weekly_intl.js:381,395,478`, `core/ai-chat.js:362`. No global rule; modal, toast, skeleton, spinner, sidebar width transition, empty-state entrance and module slide-ins are not covered (the :4414 block's scope was not read).

---

### D8. Evidence of inconsistency

| # | Tag | Finding | Numbers / evidence |
|---|---|---|---|
| 1 | [INCONSISTENT] | Hard-coded hex colours outside token declarations in style.css | **396** occurrences (comments stripped), **93** distinct values; a further 159 hexes sit on token-declaration lines. Top 10: `#FFF` 65 · `#0B1929` 20 · `#027BBD` 18 · `#38BDF8` 17 · `#94A3B8` 13 · `#F87171` 12 · `#CBD5E1` 11 · `#E2E8F0` 8 · `#1E293B` 8 · `#059669` 8 (then `#F1F5F9` 7, `#DC2626` 7). Plus 351 `rgb()/rgba()` literals. `var(--…)` is used 3,612 times, so tokens and literals coexist. |
| 2 | [INCONSISTENT] | Hex in JS | 163 six-digit hex literals in `modules/*.js` + `core/*.js`; top: `#0B1929` 24, `#475569` 15, `#B91C1C` 10, `#CBD5E1` 9, `#64748B` 8 |
| 3 | [INCONSISTENT] | Two accent blues live | Token `--accent` #0284C7 (3 raw uses in CSS) vs former accent #027BBD: 22 raw uses + 32 `rgba(2,123,189,…)`, including inside `--accent-light`, `--accent-glow`, `--shadow-focus`, `--wi4-blue`, and the gradient primary button (:6937) |
| 4 | [INCONSISTENT] | `!important` | **169** in style.css (0 in route-diagram.css) |
| 5 | [INCONSISTENT] | Inline `style="` in JS | **1,192** across `modules/*.js` + `core/*.js`. Top 10: `core/entity.js` 131 · `modules/payroll.js` 119 · `modules/weekly_intl.js` 95 · `modules/maintenance.js` 94 · `modules/orders_natl.js` 90 · `modules/orders_intl.js` 63 · `modules/costs.js` 60 · `core/utils.js` 58 · `modules/ceo_dashboard.js` 54 · `modules/daily_ramp.js` 46. HTML: `print.html` 19, `app.html` 6 |
| 6 | [EXTRA] | CSS lives in JS | 39 `<style>` tags in 28 JS files + 12 `createElement('style')` injectors (33 files in all). Per file (count · prefix): `weekly_natl.js` 4 · `.wn4-` — `weekly_intl.js` 3 · `.wi2-` — `maintenance.js` 3 · `.mnt-`, `.mf-` — `pallet_ledger.js` 2 · `.plv-` — `daily_ops.js` 2 · `.do-` — `week-paper.js` 2 · `.wp` — `dashboard.js` 1 · `.dh-` — `costs.js` 1 · `.ct-` — `expenses.js` 1 · `.ex-` — `expenses_import.js` 1 · `.ei-` — `payroll.js` 1 · `.dl-` — `orders_intl.js` 1 · `.oi-`, `.oi2-` — `orders_natl.js` 1 · `.on-` — `orders_invoicing_view.js` 1 · `.oiv-` — `orders_noprice_view.js` 1 · `.np-` — `orders_catalog.js` 1 · `.oc-` — `orders_hub.js` (injector) · `.oh-` — `notifications.js` 1 · `.nc-` — `metrics_audit.js` 1 · `.ma-` — `audit_trail.js` 1 · `.at-` — `locations.js` 1 · `.loc-`, `.locc-` — `pallets_week.js` 1 · `.plw-` — `preorder.js` (injector) · `.pre-` — `daily_ramp.js` 1 · `.ramp-`, `.vs-` (print window) — `wn5_sheet.js` 1 · `.s-` — `weekly_intl_v2.js` 1 · not verified — `core/ai-chat.js` (injector) · `.aic-` — `core/entity.js` 1 · `.ekpi-` — `core/relay.js` 1 · `.lh-` — `core/order-docs.js` (injector) · `.od-` — `core/orders-common.js` (injector) · `.oc-` (same prefix as `orders_catalog.js`) — `core/ui.js` 1 · keyframes only — `core/utils.js` 1 · print shell |
| 7 | [INCONSISTENT] | Same class defined more than once with different looks | `.btn-primary` :1001 (solid) vs :6937 (gradient) · `.btn-new-order` :1049 / :2100 / :6938 · `.btn-scan` :2122 / :6964 · `.btn-icon` :996 / :2054 · `.notif-panel/-header/-list/-item/-empty` :815–844 vs :4594–4679 · `.dash-card` :5124 vs dark grouped rule :6928 · `.modal-overlay` :1297 / :2511 · `.wk3-tab`, `.wi4-c-idx`, 6 `.wn5-*` classes. 17 standalone class selectors have ≥ 2 base rules |
| 8 | [INCONSISTENT] | Three button systems | "Button System v2" `.btn-*` (:964) + "legacy" `.btn-new-order`/`.btn-scan` + "Unified primary" `.tms-btn*` (:6936) + per-screen `.wi4-btn` and ≈ 14 JS families → ≈ 32 families (D5). Heights 24/28/32/36/44px; radii 6 and 8 |
| 9 | [INCONSISTENT] | Components in 3+ visual variants | Modals/dialogs: `.modal`, `.mf-modal`, `.pu-modal`, `.wi4-dlg`, `.wn5-dlg`, `.ct-modal`, `.ex-modal-box`, `.dl-modal`, `.aic-confirm-card` · Drawers: `.entity-detail-panel`, `.owv-card`, `.wi-panel`, `.mnt-drawer`, `.locc-panel`, `.ct-panel`, `.plw-panel` · Pills: `.badge-*`, `.tms-pill-*`, `.role-badge`, `.wk3-pill`, `.wi4-tag`, `.wn5-chip`, `.perf-pill`, `.do-pill`, `.oi-chip`, … (≈ 68 families) · Empty states: 25 classes · Tabs: 11 families · Tables: ≈ 26 families · Cards: ≈ 34 families · Toasts: 4 implementations · Page header: `.page-header` vs `.tms-page-header` · Skeleton: `.sk*` vs inline `showLoading` vs `.dh-sk` |
| 10 | [INCONSISTENT] | Type scale bypassed | 44 distinct font sizes; half-pixel sizes (11.5, 10.5, 12.5, 9.5, 8.5, 7.5px) account for ≈ 220 declarations and are not in the scale; `--text-3xl`, `--text-4xl`, `--text-2xs` have 0 `font-size` uses; weight 900 used ×3 but never loaded |
| 11 | [INCONSISTENT] | Spacing / radius / shadow scales bypassed | 14% of padding/margin/gap declarations use `--space-*`; raw radii 3/5/9/10/7.5px outside the scale; 105 of 143 `box-shadow` are raw |
| 12 | [INCONSISTENT] | Z-index rule vs practice | Comment :98 fixes 6 levels; 36 hard-coded z-index values in style.css (15 distinct) and `99999`/`99998` in JS |
| 13 | [INCONSISTENT] | Breakpoint rule vs practice | Comment :5 fixes 3 thresholds; 10 distinct widths in style.css, 15 with JS |
| 14 | [INCONSISTENT] | Semantic colours in ≥ 3 strengths | "ok" green: `--ok` #15803D, `--panel-ok` #10B981, `--panel-ok-hi`/`--p-ok`/`--ceo-ok` #34D399, raw #059669 ×10, #047857 (:1019), `--badge-ok-text` #065F46, `--chip-partner` #166534, `--wi4-partner-ink` #14532d. "warn": #92400E, #B45309 (×10 raw), #D97706, #F59E0B, `--wi4-amber` #b45309, `--wn5-note-ink` #b5540a, `--wn5-leave-ink` #c25c0d. "danger": #B91C1C, #DC2626 (×15 raw, also `--wn5-field-err`), #EF4444, #F87171, #7F1D1D, `--wi4-badge-ink` #b42318 |
| 15 | [INCONSISTENT] | Code vs `DESIGN.md` | Doc: "15 tokens" for colour (`DESIGN.md:57`) → code: 311 custom properties. Doc: six type sizes 28/18/14/13/12/11 (`DESIGN.md` ΜΕΡΟΣ Γ) → code: 44 sizes, page title 24px (:899), topbar title 17px. Doc: spacing 4/8/12/16/24/32 only → code scale adds 2/20/40/48/64 and raw 10/14/18/28/36px paddings. Doc: radii "6px for everything, 9999px for badges" → code scale has 4/6/8/12/16/full. Doc: "borders, not shadows" and motion "150ms" → 143 shadows, durations up to .8s. Doc: `--border-dark` is "on dark" → used as the light-surface `.form-input` border (:1443; acknowledged in comment :44–48). Doc: accent "only primary action" → `--accent`/`#027BBD` used for links, focus, tabs, nav. Doc: Syne never on data/controls → `.ramp-day-btn`, `.wk3-tab`. Token names and values of the 15 doc tokens themselves do match the code (:52–75) |
| 16 | [EXTRA] | Dead or orphan pieces | `@keyframes pulse-subtle`, `number-tick` unused; `wi-spin` used but undefined; `--text-3xl/-4xl` unused; 5 Weekly generations coexist in CSS (`wi-`, `wk3-`, `wi2-`, `wn3-`/`wn4-`, `wi4-`/`wn5-`); `.ai-chat-btn`/`.ai-chat-panel` referenced only in the print block (:4176) while the live classes are `.aic-*` |
| 17 | [INCONSISTENT] | Login page is a separate mini-system | `index.html:8–262`: own `:root`, own colours (D2), loads Syne 300 and no DM Sans 600/700, own `slideIn` keyframe, does not load `assets/style.css` (not verified beyond the `<link>`/`<style>` grep) |
| 18 | [INCONSISTENT] | Focus handling | 36 `:focus-visible` rules vs 31 `outline:none`; coverage per component not verified |

---

## E. Cross-app inconsistencies (evidence only)

Numbers marked (D8) come from the counts in section D8; the rest from the sections above.

| # | Tag | One thing, several forms | Evidence |
|---|---|---|---|
| 1 | [INCONSISTENT] | **Feedback toasts:** `toast()` (single, 3 s, bottom 88px, ~402 call sites) and `showErrorToast()` (stack, 5 s, bottom 20px, ~120 call sites); D8 counts 4 toast implementations in all. | `core/ui.js:386-431`, `core/utils.js:30-71`, D8 |
| 2 | [INCONSISTENT] | **Confirmation:** `confirmAction` in the shared modal (35), native `confirm()` (10), native `alert()` (13), plus the assistant's own confirm dialog. | C3; assistant section |
| 3 | [INCONSISTENT] | **Modal / dialog shells:** one shared `#modal` (26 `openModal` call sites) next to ~15 module-own overlays, drawers and dialogs (D8); the re-login window and the command palette are two more. Backdrop click: shared modal ignores it, palette and assistant confirm close on it. | `core/ui.js:148-152`, `core/command-palette.js:87`, D8 |
| 4 | [INCONSISTENT] | **Primary button:** `.btn-primary` defined twice with different looks (flat accent, then navy→blue gradient that wins), plus `.btn-new-order`, `.btn-scan`, `.tms-btn`, `.wi4-btn` and ~14 module-local families; re-login and update pill use inline-styled buttons. | D5 / D8, `core/relogin.js:65`, `core/sw-update.js:93` |
| 5 | [INCONSISTENT] | **Empty states:** `showEmpty` (two looks), `.dash-empty`, `.dh-empty`, bare `<p>` (notifications), inline blocks (Trash), «Κανένα αποτέλεσμα» (palette); D8 counts 25 empty-state classes. Wording varies: «Καμία εγγραφή», «Καμία καταγραφή…», «Κανένα αποτέλεσμα», sentence-with-source on the dashboard. | C3, C7, C8, C9, D8 |
| 6 | [INCONSISTENT] | **Loading:** skeleton (`showLoading`), spinner + «Loading...» / «Φόρτωση…», page-own skeletons; `sk-shimmer` defined twice with different values (D8). | C3, D7 |
| 7 | [INCONSISTENT] | **Error state:** `showError` («Δεν φορτώθηκε» + «Ξαναδοκίμασε»), dashboard card («Το dashboard δεν φόρτωσε» + «Επανάληψη»), audit trail (two retry buttons at once), assistant error bubbles, global toast «Κάτι πήγε στραβά…». Two words for retry: «Ξαναδοκίμασε» / «Επανάληψη». | `core/ui.js:262-280`, `modules/dashboard.js:484-488`, audit section, `app.html:220` |
| 8 | [INCONSISTENT] | **No-permission:** hidden menu item, red toast, `showAccessDenied` block, module-internal role message — four behaviours, two forms of address («Δεν έχετε…» / «Δεν έχεις…»). | C4 |
| 9 | [INCONSISTENT] | **Language:** shell chrome, login page, palette launcher, undo, offline banners and much of the assistant are English; pages are Greek; alert titles mix both. | C1, C2, C7, assistant section |
| 10 | [INCONSISTENT] | **Naming a record:** the plain form (`core/plain-ref.js`) is required by CLAUDE.md, but the bell, the dashboard waiting list («EXP ref»), Trash (table key + id + English field names), the audit trail (ids, `#52`) and the assistant confirm (raw id + JSON) each use their own. | C7, C8, C9, audit / assistant sections |
| 11 | [INCONSISTENT] | **Role names:** raw ids in the topbar badge and error log, Greek words in the audit trail, per-username titles in «Η Απόδοσή μου». | `app.html:256`, dashboards + audit sections |
| 12 | [INCONSISTENT] | **Week:** «Εβδομάδα N ISO» on the dashboard, Saturday–Friday `TmsWeek` on the boards, an own ISO-Monday week in «Πίνακας Διοίκησης». | `modules/dashboard.js:345`, dashboards section |
| 13 | [INCONSISTENT] | **One KPI, several definitions:** on-time (3 ways), assignment (truck only vs truck or partner), invoiced (status that is never written vs the checkbox). | dashboards section, `core/metrics.js` section |
| 14 | [INCONSISTENT] | **Tabs / chips / pills:** notifications `.nc-tab` / `.nc-chip`, orders hub tabs, entity tabs, maintenance tabs — each module-local; ~68 pill / badge / chip families (D8). | `modules/notifications.js:227-234`, D5 / D8 |
| 15 | [INCONSISTENT] | **Tables:** `TableSort` opt-in tables, entity list tables, `.md-fleet-table`, `.dh-tbl`, `.nc-table` — five header heights / paddings / sort behaviours. | `core/ui.js:485-500`, C8, C9, D5 |
| 16 | [INCONSISTENT] | **Where CSS lives:** `assets/style.css` (11k lines) + 39 `<style>` tags injected from 33 JS files + 1,192 inline `style="` strings (D8). The shell helpers (C3, C4) are entirely inline. | D8 |
| 17 | [INCONSISTENT] | **Icons:** one SVG set (`core/icons.js`, 63 icons) but hand-written inline SVGs in `app.html` (hamburger, undo, bell), `core/ui.js` (toast, empty, lock), Trash; text glyphs «✕ ◀ ▶ ▾ › ▲ ▼ ⚠»; emoji in dead command-center widgets. | `app.html:45-65`, `core/ui.js:404-407`, `core/command-center.js:115` |
| 18 | [INCONSISTENT] | **Z-order of global layers** is expressed as `calc(var(--z-top) + n)`: toast `+0`, cache banner `+2`, error toasts `+3`, update pill `+4`, re-login `+10` — an implicit scale spread over five files. | `core/ui.js:395`, `app.html:315`, `core/utils.js:38`, `core/sw-update.js:93`, `core/relogin.js:48` |
| 19 | [INCONSISTENT] | **Per-browser state presented as app state:** Trash, error log, notification read / snooze, undo, nav / sidebar state, some «Η Απόδοσή μου» cards — all `localStorage`; the pages do not all say so (Trash and error log do, notifications and performance do not). | C7, C9, dashboards section |
| 20 | [EXTRA] | **Dead / unreachable UI to drop, not restyle:** command-center widgets, `costs_dash` and `pl` routes, «Ρυθμίσεις» placeholder, `#topbarBreadcrumb`, NAT_LOADS fetch on the dashboard, assistant alert dot / observations, `soon` pill. | A3, C1, C6, C8, assistant section |
