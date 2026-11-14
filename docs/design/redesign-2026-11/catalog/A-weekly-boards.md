# Catalogue A — the weekly planning boards

Read-only catalogue of the two planning boards ahead of the visual redesign. Source = code at the worktree tip (branch `claude/design-petras-tms-redesign-05f337`, 14/11/2026). Nothing was run; no database was read. "Not verified" marks anything taken from a code comment rather than from the code path itself.

Paths are relative to the repo root. Abbreviations used in `file:line` references:

| Short | File |
|---|---|
| `wi` | `modules/weekly_intl.js` (v1 board + all data loading and writes) |
| `wi2` | `modules/weekly_intl_v2.js` (v4 renderer, global `WIV2`) |
| `wi4a` | `modules/wi4_actions.js` (v4 menu, date panel, queue panel, keyboard) |
| `wi4l` | `core/wi4-logic.js` (pure rules, global `WI4`) |
| `wn` | `modules/weekly_natl.js` (old national board) |
| `wn5` | `modules/weekly_natl_v5.js` (v5 board, global `WN5`) |
| `wn5a` | `modules/wn5_actions.js` |
| `wn5l` | `core/wn5-logic.js` |

## 0. Which version is live

`config.js:417` — `FEATURES = { …, WI_V2: 'on', WI_PRESENCE: false, WN_V5: 'on', WN_ROAD: 'pilot', WN_COMPOSE: 'pilot', WN_EXPECT: true }`; pilot list = one username (`config.js:421`).

| Board | Live renderer | Still shipped and reachable | Off / pilot |
|---|---|---|---|
| Weekly International | v4 (`wi2` + `wi4a`), a second renderer over v1 state (`wi2:11-16`) | v1 board: user picks «Παλιά προβολή» (`wi2:1758`), or v4 paint throws (sticky fallback, `wi2:2075-2101`) | Presence strip (`WI_PRESENCE` false) |
| Weekly National | v5 (`wn5` + `wn5_*`), own data via `/plan/*` | Old board: only for weeks before cutover day "L" via «Παλιά προβολή» (`wn5:644-662`), or v5 paint throws (`wn5:466-490`) | «Αλλαγή στον δρόμο» and «Σύνθεση φορτίων» = pilot user only (`config.js:408-412`) |

Both are loaded unconditionally by `app.html:117-194`. v1 International is **not** dead code: v4 calls its loaders, writes, popover, panels and menu builders through `window.WI_INTERNAL` (`wi:8415-8472`). Only the v1 *markup* path is legacy.

Week definition for both: Saturday–Friday, one shared source `core/tms-week.js` (`TmsWeek.start/numOf/current`); `wi:110-113`, `wn5:237-240`.

---

## 1. Weekly International — «Εβδομαδιαίο Διεθνών»

### 1.1 Who sees it

- Nav: section «Σχεδιασμός», perm `planning` (`core/router.js:24-27`). Every role has at least `view` (`config.js:354-365`): owner + dispatcher `full`; management, accountant, warehouse `view`.
- Router refuses only `none` (`core/router.js:277-291`); the page has its own `none` check too (`wi:625`).
- `view` roles get the same screen with every control drawn; each write entry point answers with a toast «Μόνο ανάγνωση για τον ρόλο σου» (`wi:589-593`, 19 call sites).
- Job (inference from code + `docs/weekly-intl-redesign/PLAN.md`): the international dispatcher's main working screen, open all shift (team works 05:30–14:30 per `CLAUDE.md`). Order of work the screen is built around: read «ΕΠΟΜΕΝΑ» (what needs action) → assign truck/partner to exports → match an import to each own-truck export (avoid «κενό γύρισμα») → fix dates → print / WhatsApp the driver order → groupage, rota legs, local relays, stock pieces as exceptions. Create order / scan / pre-order without leaving the board. Management reads it; accountant and warehouse reach it but have no job on it (inference).

### 1.2 Inventory (v4, the live board)

**Top bar** (`wi2:1768-1797`; mounted into the app top bar, `wi2:2329`)

| Element | What it does | Ref |
|---|---|---|
| Title «Εβδομαδιαίο Διεθνών» + date range | static; range gives way first on narrow widths | `wi2:1787`, `wi2:1664` |
| Presence strip | who else is on the board; inert while `WI_PRESENCE` is false | `wi2:1950-2020` |
| Sync token | «↻ Ενημερώθηκε πριν N΄» / «↻ ζωντανά» / «N αλλαγές από … · Ανανέωση» (button) | `wi2:1689-1718` |
| Failed-save counter | «N αλλαγές δεν αποθηκεύτηκαν», own slot | `wi2:1677-1680` |
| Week tabs | ‹ · W−3…W+3 · › · «Σήμερα» (only off the current week); current-week dot; W+1 badge = next-week loads due by tomorrow («…» loading, «—» failed) | `wi2:1719-1745` |
| «Προβολή ▾» menu | «Εκτύπωση εβδομάδας», «CSV», «Ανανέωση», «Πλήρης οθόνη»; «Κατάσταση» radio (Όλες / Χωρίς ανάθεση / Ανατεθειμένα / Εισαγωγές χωρίς ταίριασμα); «Εθνικές στήλες» toggles ΠΡΟΣ ΒΕΡΟΙΑ / ΑΠΟ ΒΕΡΟΙΑ; «Παλιά προβολή»; a note about the conflict check | `wi2:1746-1767`, `wi2:115` |
| «Pre-order N» | opens the pre-order form; N = open pre-orders on the sheet | `wi2:1795`, `wi:936`, `modules/preorder.js:116` |
| «Σάρωση» | new order from a scanned document | `wi2:1776`, `wi:919` |
| «+ Νέα παραγγελία» | order form in a modal, board re-renders on close | `wi2:1777`, `wi:910-935` |
| User chip menu («Αποσύνδεση») | mounted with the bar | `wi2:2377-2450` |

**Banners** (under the bar)

| Banner | Ref |
|---|---|
| Local relays failed to load, with «↻ Ξαναδοκίμασε» | `wi2:1861-1866` |
| «N παραγγελίες δεν φαίνονται στον πίνακα: …» (orders loaded but drawn nowhere; also logged) | `wi2:1871-1886` |
| «Η νέα προβολή απέτυχε — δείχνουμε την παλιά…» (above `#content`, sticky for the session) | `wi2:2075-2101` |

**«ΕΠΟΜΕΝΑ» band** (`wi2:1798-1833`)

- Search box «Αναζήτηση» with match counter `i/N` and `/` hint; Enter = next match, Esc = clear. Non-matches dim, matches are raised; nothing is hidden (`wi2:2525-2577`).
- Header «ΕΠΟΜΕΝΑ · N» with «X επείγοντα · Y προσοχή»; «≥N» and «φορτώνει…» while a source is still loading.
- Up to 3 cards: day chip, load in words, pallets + reason, one action button (labels `wi4a:75-80`: Ανάθεση, Νέα εισαγωγή, Κομμάτια, Άνοιγμα, Παρτίδα, Μετατροπή, Ξαναδοκίμασε, Τοπικός οδηγός, «W+1 →»). Card click = scroll to and focus the row (`wi2:3005`).
- «Όλα N ▾» opens the queue panel (dialog, grouped, `Q` steps through) (`wi4a:1430-1583`).

**Stock shelf** «Απόθεμα σε αποθήκες» — strip of lot chips, only when stock exists (`wi2:1834-1840`, `wi:7211-7360`).

**Column header** (`wi2:1841-1860`): `#` · «◂ ΠΡΟΣ ΒΕΡΟΙΑ» (collapsible) · «ΕΞΑΓΩΓΗ · N φορτία · ανά ημέρα εκφόρτωσης» + «ΠΑΛ.» · «ΑΝΑΘΕΣΗ · ΕΝΤΟΛΗ» · «ΕΙΣΑΓΩΓΗ · N φορτία» + «ΠΑΛ.» · «ΑΠΟ ΒΕΡΟΙΑ ▸» (collapsible). Collapse state per browser (`localStorage tms_wk3_fl / tms_wk3_fr`).

**Day sections** (`wi2:1633-1663`): caps day name + date, «· σήμερα», chevron; click folds. Folded day with work shows one dot (red filled / amber ring). Empty day = name only. Extra «μεταφέρθηκε» sections after Friday for rows shifted into this week. No-date section «ΧΩΡΙΣ ΗΜΕΡΟΜΗΝΙΑ».

**Row types** (`wi2:1581-1595` dispatch)

| Row | Content | Ref |
|---|---|---|
| Export row | number + ✈ menu button; export leg (points with «+N» overflow, date chips, pallets, docs paperclip); national tile each side for Veroia Switch; assignment cell; matched import leg or the gap cell | `wi2:1237-1331` |
| Assignment cell | own truck: plate · trailer · driver; partner: name · plates; «ΠΡΟΣ ΑΝΑΘΕΣΗ» button when empty; copy-plates; printer button | `wi2:1139-1218` |
| Gap cell (own truck, no import) | «κενό γύρισμα» with «Νέα εισαγωγή» button; drop target for an import | `wi2:1370-1392`, `wi2:1314` |
| Import-only row | draggable (handle «⋮⋮»), jump to first unassigned export | `wi2:1398-1419` |
| Ghost row | an import group drawn on its own day while matched elsewhere | `wi2:1354-1369` |
| Split header + legs | order split in two legs («ΣΠΑΣΜΕΝΗ ΣΕ N ΣΚΕΛΗ») | `wi2:1420-1438` |
| Rota leg / continuation | forwarding leg under its parent; «συνέχεια» for a leg of another week | `wi2:1439-1520` |
| Local relay sub-row | «Παράδοση/Φόρτωση με τοπικό οδηγό» | `wi2:1521-1580` |
| Save-failure line | under the row: «Δεν αποθηκεύτηκε — … · Ξαναδοκίμασε · κλείσιμο ×» | `wi2:1935-1948` |
| Missing-record row | row whose order is not in the load, with «Ανανέωση» | `wi2:1229-1236` |

**Per-load menu** (✈ click, Enter, or right-click; `wi4a:748-834`, model `wi4a:193-386`). Sections: ΕΞΑΓΩΓΗ / GROUPAGE ΕΞΑΓΩΓΗΣ, ΕΙΣΑΓΩΓΗ / GROUPAGE ΕΙΣΑΓΩΓΗΣ, ΣΚΕΛΟΣ ΡΟΤΑΣ, ΣΠΑΣΜΕΝΗ ΣΕ N ΣΚΕΛΗ, per-member submenus, ΤΟΠΙΚΗ. Items are built by the v1 builders and relabelled (`wi4a:86-106`):

| Item (v4 label) | Builder ref |
|---|---|
| «Άνοιγμα παραγγελίας» | `wi4a:316` (v4 only) |
| «Ανάθεση…», «Εκτύπωση / WhatsApp…», «Αντιγραφή πινακίδων», «Αρχική παραγγελία…», «Αφαίρεση ταιριάσματος», «Groupage εξαγωγών…», «Σκέλος προώθησης (ρότα)…», «Διάλυση groupage» (danger), «Καθαρισμός ανάθεσης» (danger) | `wi:4701-4736` |
| Import: «Groupage εισαγωγών…», «Groupage εισαγωγών · σε αυτό το φορτίο…», «Μεταφορά εβδομάδας…» | `wi:5945-5992` |
| Group member: «Επιστροφή στο απόθεμα», «Βγάλε από το groupage» | `wi:6656-6680` |
| Split: «Ένωση ξανά», «Εκτύπωση / WhatsApp όλων…», «Αλλαγή σημείου παράδοσης-παραλαβής…» | `wi:1538-1567` |
| Rota leg: «Επεξεργασία…», «Ακύρωση προώθησης» | `wi:5564-5575` |
| Relay: «Αλλαγή…», «Διαγραφή τοπικής» | `wi:5870-5876` |
| Pre-order: «Μετατροπή σε παραγγελία…», «Επεξεργασία pre-order», «Διαγραφή pre-order» | `wi:4784-4795` |
| Stock: «+ Κομμάτι από απόθεμα…», «Απόθεμα…», «Άνοιγμα» | `wi:7391-7402`, `wi:7605-7645` |

**Popover, panels, dialogs**

| Surface | What | Ref |
|---|---|---|
| Assignment popover | truck / trailer / driver or partner (type-ahead lists), partner plates, «Κόμιστρο εξαγωγής €» / «Κόμιστρο εισαγωγής €», lane history, matched import chip, «Καθαρισμός», «Αποθήκευση/Ενημέρωση ανάθεσης» | `wi:3593-3720`, save `wi:3769-4031` |
| Date panel | segmented Φόρτωση / Εκφόρτωση / Βέροια, calendar starting Saturday, time HH:MM, group line, conflict state | `wi4a:1037-1352` |
| Conflict dialog «Ποια κρατάμε;» | another user changed the same field (409) | `wi4a:913-979` |
| Side panels (`#wi-panel`) | Groupage build, join load, rota, split, handover-point change, week shift (two choices), confirm unlink, stock pick | `wi:4328-4680`, `wi:4843`, `wi:1601`, `wi:6013`, `wi:7662` |
| Stock lot / loose-piece modals | lot contents, pieces, lock/return | `wi:7420-7600` |
| Rota card of a group | reorder stops, save, split | `wi:6893-6990` |
| Veroia notice («✎») | read the national desk's notice on a VS row | `wi2:1073-1098` |
| Pre-order modal | client, direction, loading date, country, count stepper, notes | `modules/preorder.js:116-143` |
| «?» shortcuts sheet | lists only keys that work | `wi4a:1586-1659` |

**Keyboard** (`wi4l:762-775`, handler `wi4a:1799`): ↑/↓ row, Enter menu, A assign, D date, P print/WhatsApp, N new import (on a gap), O open order, Q next in queue, `/` search, `?` help, Esc. ←/→ change week unless an overlay is open (`core/ui.js:445-461`). By `e.code`, so it works on a Greek layout.

**Drag and drop**: import row → export row or gap = match (`wi:2952`, `wi:3087-3153`, `wi2:1314`); groupage tiles reorder within a group (`wi:6546-6655`, `wi2:804`); edge auto-scroll while dragging (`wi2:2272-2281`).

**Print / export**

| Output | Ref |
|---|---|
| Printed week, A4 landscape, 1–N pages, from the board model | `wi2:3135-3146`, `core/week-paper.js:238-300` |
| Driver order per load / group / split (A4 + WhatsApp text; right-click = share menu) | `wi:4678`, `wi:6858-6892`, `wi:1568` |
| CSV of the loaded orders | `wi:8377-8405` |
| Full screen (board only, Esc leaves) | `wi:3069` |

**Toasts / messages** (types): read-only refusal; save OK «✓»; conflict «την είχε αλλάξει άλλος»; offline «μπήκε σε αναμονή» (`wi4a:1257`); downstream sync failure naming what did not follow (`wi4a:1261-1269`); paper rows unread (`wi2:3140`); row gone «ανανέωσε» (`wi4a:128`).

### 1.3 Business logic that must survive

1. **Week** = Sat–Fri (`core/tms-week.js`). Exports belong to the week of their **earliest delivery day** (loading day if none); imports to the week of their **earliest loading day**; an explicit `Plan Week Start` overrides in either direction (`wi4l:77-115`). Reads reach ±8 days around the week (`wi4l:95-98`).
2. **Row = one truck's work**: export on the left, assignment in the middle, its matched import on the right. Rows sharing a Group ID collapse into one (groupage); rota legs and split legs hang under their parent (`wi4l:132-256`).
3. **Day filing**: export rows by delivery day, import-only rows by loading day; a group sits on the earliest day of any member, bounded to the week (`wi4l:266-285`).
4. **Order inside a day**: exports, then import-only rows; Veroia Switch rows last, then by datetime (`wi4l:49-53`, `wi4l:287-343`). Row numbers run 1…N over the week and are shared with «Παραγγελίες › Εβδομάδα» (`wi4l:55-63`).
5. **"Needs action" reasons** (`wi4l:585-626`): no truck (red today/tomorrow, amber later), empty return on own truck (amber from 2 days before return, red after), over 33 pallets, pallets unknown near 33, same-day clash, late, relay without driver, pre-order pressure, failed save (red), unread source. A partner row is never an "empty return".
6. **Queue order**: red before amber; then stop → cost → look; nearest date first; unknown date sorts first (`wi4l:731-747`).
7. **Unknown ≠ empty**: a source not yet read or failed shows «—»/«≥N», never 0 or «ΠΡΟΣ ΑΝΑΘΕΣΗ» (`wi2:28-29`, `wi4l:645-656`).
8. **Days are always open**; only the user folds one, for the session (`wi2:1622-1632`).
9. **Assignment never locks** — an executing order can be reassigned after one confirm that says what follows downstream (`wi:3167-3204`).
10. **Writes** (client side): assignment, match, dates, week shift = `PATCH` on ORDERS through the facade (`wi:3769`, `wi:3230`, `wi:1953`, `wi:6048`), followed by `syncOrderDownstream` (`wi:1978-1990`); partner assignments via `core/pa-helpers.js` (`wi:4032-4100`); split = two new ORDERS + parent cleared (`wi:5044-5093`); relays via `core/relay.js`; rota leg removal `DELETE /costs/rt/:id/legs` (`wi:5252`). v4 sends `_expect` so the Worker can answer 409 (`wi:2327-2344`).
11. **Pre-order** = an ORDERS row with `Ops Status = 'Provisional'`; level red ≤1 day, amber 2–3 days (`modules/preorder.js:23-43`).
12. **Veroia Switch** tiles show the national carrier read from `/plan/vs-state`, falling back to NATIONAL LOADS for orders before cutover (`wi:706-768`); the VS date estimate when empty is Loading+1 (export) / Delivery−1 (import) (`wi:1912-1919`).

### 1.4 Findings

| # | Tag | Finding | Evidence |
|---|---|---|---|
| I1 | [BROKEN] | Week navigation has no year. Tabs clamp to 1…53; the ←/→ keys do not clamp at all (week 0, 54 reachable, tabs then skip them); `TmsWeek.start(w)` always resolves in the current year. Weeks of the previous/next year cannot be opened by number — relevant within weeks of today. | `wi2:1721`, `wi2:1726`, `core/ui.js:452-455`, `core/tms-week.js` (`start`) |
| I2 | [BROKEN] | CSV is not "the week": it writes every loaded import, i.e. the ±8-day read window, while exports are cut to the week. Its «Status» column is a derived `Assigned/Unassigned`, not the order status; headers are English. | `wi:792` (imports uncut), `wi:685`, `wi:8378-8398` |
| I3 | [EXTRA] | The v1 board is fully shipped and one click away («Παλιά προβολή»). It carries a different title («Πίνακας Σχεδιασμού Αποστολών»), its own week print, a native date picker, a «κενά» counter, a legend and a details toggle that v4 does not have. | `wi2:1758`, `wi:1042-1180`, `wi:1081`, `wi:1087`, `wi:1111-1118`, `wi:1923`, `wi:7011` |
| I4 | [EXTRA] | Presence («who else is here») is built end to end but switched off; ~500 lines plus bar slots are inert. The flag comment says it waits for SQL and a Worker that `CLAUDE.md` lists as live. | `config.js:395-397`, `config.js:417`, `core/wi4-presence.js`, `wi2:1950-1952` |
| I5 | [INCONSISTENT] | «Pre-order N»: the badge counts existing pre-orders but the click opens the *create* form. On v1 the same count was a filter. | `wi2:1775`, `wi2:1795`, `wi:936`, `wi:1118` |
| I6 | [MISSING] | The «Κατάσταση» filter lives inside «Προβολή ▾» and only dims rows; with the menu closed nothing says a filter is on. | `wi2:1754`, `wi2:2582-2586`, `wi2:2517-2524` |
| I7 | [INCONSISTENT] | Read-only roles (3 of 5) see every write control; each click answers with a toast. There is no read-only presentation. The national board follows a different rule (N9). Any change here is a role decision for the owner. | `wi:589-593`, `config.js:356-365` |
| I8 | [INCONSISTENT] | A system note sits in the user's «Προβολή ▾» menu until the first save of the session: «ο έλεγχος «το άλλαξε άλλος» δεν έχει επιβεβαιωθεί ακόμη». | `wi2:1764-1765` |
| I9 | [INCONSISTENT] | One thing, several names: v1 menu strings are re-labelled by a string map for v4 («Ομαδοποίηση…» → «Groupage εξαγωγών…»; «Ακύρωση groupage» → «Βγάλε από το groupage», next to «Διάλυση groupage»). The v4 menu is built by parsing v1 menu HTML. | `wi4a:86-106`, `wi4a:140`, `wi:4701-4736` |
| I10 | [INCONSISTENT] | Two date editors for the same fields: v4 date panel vs v1 hidden native `<input type=date>`; both reachable depending on the view. | `wi4a:1037`, `wi:1923-1951` |
| I11 | [INCONSISTENT] | The row save-failure line keeps a «#N» wording, against the plain-messages rule of 8/11 (code comment calls it debt; text not re-verified). | `wi2:1887-1888` |
| I12 | [INCONSISTENT] | No «Διαδρομή» (route diagram) on this board, while the national ✈ menu has one and the orders week view uses the same component. | `wn5:2094`, `modules/orders_week_view.js:1881`, none in `wi*` |
| I13 | [EXTRA] | Small leftovers: `WINTL.shelf` "kept for compat, not used"; the `none` access-denied branch cannot be reached (no role has `planning: none`). | `wi:35`, `wi:625`, `config.js:354-365` |
| I14 | [INCONSISTENT] | Styling is split: a CSS string injected by JS on every paint plus `assets/style.css`. | `wi2:2134` (`<style>${I.css}</style>`), `wi:8420` |
| I15 | [LOCKED] | Dispatcher sees and writes the partner fee («Κόμιστρο») in the assignment popover. | `wi:3676-3679`; `CLAUDE.md` locked decisions |
| I16 | [LOCKED] | Days never auto-collapse; VS rows last in a day; VS date estimate ±1 day; assignment never locks. | `wi2:1622-1627`, `wi4l:49`, `wi:1912`, `wi:3167` |

### 1.5 States

| State | Today | Ref |
|---|---|---|
| Loading | spinner + «Φόρτωση εβδομάδας N…»; 25 s watchdog turns it into the error card | `wi:626-642` |
| Load error | card: what failed · «ΔΕΝ σημαίνει ότι δεν υπάρχουν παραγγελίες» · «Ξαναδοκίμασε» | `wi:612-620`, `wi:832-845` |
| Empty week | «Άδειο φύλλο — WN · Καμία διεθνής παραγγελία ακόμη…» | `wi2:2122-2124` |
| Empty day | day name only, no chevron | `wi2:1648-1652` |
| Partial data | late sources (national carriers, relays, stock, W+1) paint after the board; «≥N», «…», «—», relay banner; repaint deferred while a popover is open | `wi:706-768`, `wi:797-806`, `wi2:1802-1806`, `wi2:2761` |
| Failed save | red line under the row + bar counter + queue item | `wi2:1935`, `wi2:1677` |
| Conflict | dialog «Ποια κρατάμε;» | `wi4a:913` |
| No permission | `none` → access-denied page (unreachable today); `view` → toast per click | `wi:625`, `wi:589` |
| Renderer crash | banner + v1 board until reload | `wi2:2075` |
| Many rows | all rows rendered, no paging/virtualisation; queue shows 3 + panel; points overflow «+N» by measured width | `wi2:2122`, `wi2:1807`, `wi2:774-785` |

---

## 2. Weekly National — «Εβδομαδιαίο Εθνικών»

### 2.1 Who sees it

- Same nav gate as above (`planning`, `core/router.js:27`). No page-level check and **no role gate on the screen**: every role sees every button; the Worker's 403 is shown in a strip (`wn5:19`, `wn5a:16-17`).
- Job (inference from code + `docs/national-v5/`): the national dispatcher plans trucks between the north (Veroia hub) and the south. One row = one truck's trip: ΚΑΘΟΔΟΣ (north→south) on the left, ΑΝΟΔΟΣ (south→north) on the right. Typical order: assign the Veroia Switch loads waiting in «ΕΠΟΜΕΝΑ» → add loads to a truck («+») → split/compose at Veroia → set stop hours → print/WhatsApp the driver sheet → handle changes on the road. Continuous use through the shift.

### 2.2 Inventory (v5)

**Top bar** (`wn5:628-655`)

| Element | What | Ref |
|---|---|---|
| Title + range (long/short form) | static | `wn5:633-634`, `wn5:707` |
| «↻ Ενημερώθηκε HH:MM» | button, reloads; «Διαβάζει…» while loading | `wn5:632-635` |
| Week tabs | ‹ · seven fixed weeks starting two before current · › · «Σήμερα» (always there, disabled on the current week); badge = orders without a truck that week | `wn5:669-705` |
| Cutover notes | «Η παλιά προβολή υπάρχει μόνο για εβδομάδες πριν από D/M», «Η ημέρα μετάβασης δεν διαβάστηκε», recheck note | `wn5:644-648`, `wn5:149-166` |
| «Παλιά προβολή» | only for weeks before cutover | `wn5:656` |
| «+ Νέα παραγγελία» | v5 order form | `wn5:652-653`, `modules/wn5_forms.js:902` |
| «Εκτύπωση εβδομάδας» | printer button in the **number column header**, not the bar | `wn5:863-868` |

**Strips** (role=alert, under the bar): «ΣΦΑΛΜΑ» with the Worker's words + «Ανανέωση ↻» (`wn5:718-731`); «ΑΠΟΘΗΚΕΥΤΗΚΕ · Ο ΠΙΝΑΚΑΣ ΔΕΝ ΑΝΑΝΕΩΘΗΚΕ» (`wn5:721-726`); «ΟΝΟΜΑΤΑ ΤΟΠΩΝ» (`wn5:734-738`); «ΔΕΔΟΜΕΝΑ ΠΟΥ ΔΕΝ ΣΧΕΔΙΑΣΤΗΚΑΝ» (`wn5:741-744`). Action results use one strip vocabulary: ΔΕΝ ΑΠΟΘΗΚΕΥΤΗΚΕ, ΕΙΧΕ ΗΔΗ ΑΠΟΘΗΚΕΥΤΕΙ, ΧΡΕΙΑΖΕΤΑΙ ΕΠΙΒΕΒΑΙΩΣΗ, ΠΡΟΕΠΙΣΚΟΠΗΣΗ, ΜΠΟΡΕΙ ΝΑ ΑΠΟΘΗΚΕΥΤΗΚΕ, ΑΡΓΗ ΑΠΑΝΤΗΣΗ, ΧΩΡΙΣ ΣΥΝΔΕΣΗ, ΠΡΟΕΙΔΟΠΟΙΗΣΗ, ΣΦΑΛΜΑ (`wn5a:35-39`); busy truck/driver offers «Αποθήκευση έτσι κι αλλιώς» (`wn5a:57-60`).

**«ΕΠΟΜΕΝΑ» band** (`wn5:803-857`): search (`/`), «ΕΠΟΜΕΝΑ · N» + per-day summary, cards (day chip, direction arrow + first place «+N», pallets, «αργό», «Ανάθεση»); 3 cards at wide, 2 at ≤1600px; «Όλες οι N ▾ / Λιγότερα ▴» expands in place.

**Veroia panel** (`modules/wn5_veroia.js:236-281`): closed line «ΒΕΡΟΙΑ · day · N για μοίρασμα · απόθεμα Xπ · late chip · places · Άνοιγμα ▸»; open = left list (ΓΙΑ ΜΟΙΡΑΣΜΑ by day, ΑΠΟΘΕΜΑ) with tick boxes and per-line «Σε φορτηγό ▾», «Σπάσε…», «← Weekly»; right «Νέο φορτίο» builder (day, window, truck now/later, create). With `WN_COMPOSE` on, the panel is replaced by «Σύνθεση φορτίων»: two sides, shared draft loads as cards, drag parts between drafts, history, «Δημιουργία» / create all (`modules/wn5_compose.js:284-425`, `:603-662`).

**Column header** (`wn5:859-875`): `#`(print) · ΚΑΘΟΔΟΣ · ΦΟΡΤΩΣΗ · ΠΑΡΑΔΟΣΗ · ΠΑΛ. · ΑΝΑΘΕΣΗ · ΑΝΟΔΟΣ · ΦΟΡΤΩΣΗ · ΠΑΡΑΔΟΣΗ · ΠΑΛ. Hidden when the board has no row.

**Day sections** (`wn5:876-913`): as International; empty day «· καμία φόρτωση»; folded day says «▸ N γραμμές κρυμμένες · άνοιγμα»; loading = two grey skeleton bars under today.

**Rows** (`wn5:932-966`)

| Part | What | Ref |
|---|---|---|
| Number + ✈ (row menu) or page icon (order card, for a waiting national order) | row number shared with «Παραγγελίες › Εβδομάδα»; other-week rows show «n · Wxx» | `wn5:943`, `wn5:1300-1309`, `wn5:1438-1458` |
| ΚΑΘΟΔΟΣ / ΑΝΟΔΟΣ side | date chip (opens day/hour panel), points (1 or 2 visible, «+N»), pallets «n/33», «+» add load, printer | `wn5:1030-1133`, `wn5:1223-1290`, `wn5:1329-1353` |
| ΑΝΑΘΕΣΗ | truck · trailer · driver or partner, copy plates; red «ΠΡΟΣ ΑΝΑΘΕΣΗ» box on a waiting row; segment tiles when the vehicle changed on the way | `wn5:1354-1416` |
| «⇄» line | vehicle changes of the trip | `wn5:1391-1399` |
| «↳ Φόρτωση με τοπικό» line | local driver loading | `wn5:1417-1437` |
| Rota chips | next load with the same truck; own click and right-click menu | `wn5:967-1029` |
| Dimming | executed parts fade to 40% by the base's flags only; never a row that needs work | `wn5:916-931` |

**✈ row menu** (`wn5:2085-2128`): «Άνοιγμα παραγγελιών (n)», «Διαδρομή», «Ανάθεση / αλλαγή φορτηγού ή συνεργάτη», «Νέα παραγγελία σε αυτό το δρομολόγιο ›», «⤷ Επόμενο φορτίο με το ίδιο φορτηγό ›», «Φόρτωση με τοπικό ›», «Παράδοση με τοπικό ›», «Σπάσιμο παραγγελιών → Βέροια», «Εκτύπωση / WhatsApp ›» (Κάθοδος · Άνοδος · Όλο το δρομολόγιο), «Αντιγραφή πινακίδων», «Αλλαγή οχήματος…» or «Αλλαγή στον δρόμο…» (flag), «Καθαρισμός ανάθεσης» (danger). Submenus open with →, close with ←.

**Right-click on a point / waiting row** (`modules/wn5_edit.js:66-78`, `:259`): «Μεταφορά σε άλλο φορτηγό…», «Αλλαγή στον δρόμο από εδώ…» (flag), «Διαγραφή σημείου», «Διαγραφή παραγγελίας».

**Dialogs** (all `role=dialog`, shared kit `wn5a:341-450`)

| Dialog | Ref |
|---|---|
| «Ανάθεση» — who executes (own truck + trailer + driver, or partner), day and window per stop, partner fee (one or two fields), «Λείπει: …» | `modules/wn5_assign.js:670`, rules `:1-30` |
| «+» add load — «Νέα παραγγελία / Από αναμονή», other weeks on demand | `wn5a:1494-1945` |
| «Μεταφορά σε…» — candidate list then two-step confirm | `wn5a:1947-2057` |
| «Καθαρισμός ανάθεσης» — dry run, list of consequences, confirm | `wn5a:2058-2133` |
| Day / hour panel «Ώρα στάσης · …» — calendar, hours, dry run per change, conflict | `wn5a:2134-2522` |
| «Φόρτωση με τοπικό» + its cancel | `wn5a:2524-2674` |
| Order card + «Διαγραφή παραγγελίας» | `wn5a:2676-2842` |
| «Παραγγελίες · <trip>» list | `wn5a:2843-2886` |
| Order forms (new load, groupage, short «+» form, edit, VS day) | `modules/wn5_forms.js:902`, `:1283`, `:1934` |
| Vehicle change, segment fix/removal, trip card | `modules/wn5_handover.js:475`, `:687`, `:741` |
| «Αλλαγή στον δρόμο» (transfer at any point, preview then save) | `modules/wn5_road.js:480`, `:516` |
| «Σπάσε…» (split a delivery at Veroia) | `modules/wn5_veroia.js:526-660` |
| «Διαδρομή» side panel (route diagram) | `wn5:1609-1690` |

**«ΤΟΠΙΚΑ»** section under the board: driver × day, numbered moves, «Ακύρωση» / «Άνοιγμα» (`wn5:776-801`).

**Keyboard**: `/` search, Esc (menu, route panel), ←/→ week, arrows inside the ✈ menu (`wn5:1719-1734`, `wn5:1504-1516`, `core/ui.js:457`).

**Drag and drop**: waiting row → a truck row opens that truck's «+» with the load marked (never writes by itself) (`wn5a:705-738`); a point → another truck or another day's head (`modules/wn5_edit.js:1-12`); draft parts between drafts in «Σύνθεση φορτίων» (`modules/wn5_compose.js:643-662`).

**Print / export**: printed week (A4 landscape, two tables) (`wn5:2026-2050`, `core/week-paper.js:311-528`); driver sheet per trip/side + WhatsApp text, no prices (`modules/wn5_sheet.js:1-7`). No CSV.

### 2.3 Business logic that must survive

1. **Data source**: one read `GET /plan/board?week=<Saturday>`; names of places from `GET /plan/lookups`; everything is written through `/plan/*` (`wn5:7-10`, `wn5:294`). The screen decides no rule the base decides (`wn5:17`).
2. **One fetch per press, never an automatic resend**; creations carry one `request_id` per open form; a failed press keeps the dialog open with the Worker's words (`core/plan-api.js:6-16`, `wn5a:8-13`).
3. **Row order**: day → trips before waiting loads → time → key; a ΚΑΘΟΔΟΣ row is filed by its first delivery day, a row without ΚΑΘΟΔΟΣ by its ΑΝΟΔΟΣ loading day (`wn5l:47-57`).
4. **Placement of waiting loads**: on their own day only; an older load is carried to the Saturday of the *current* week only; a trip of another week is shown whole, marked, at the top (earlier week) or bottom (later week) of the edge day (`wn5l:557-594`).
5. **Row numbers** count trips of this week only, in board order; other-week rows borrow the number of their own week (`wn5l:716-750`).
6. **«ΕΠΟΜΕΝΑ»** = Veroia Switch loads without a truck that this week shows; «αργό» = the base's overdue flag (`wn5l:603-612`).
7. **Pallets**: capacity 33 is display only; over 33 is a red number, never a refusal; unknown pallets are «;» and sums read «12+;» — never 0 (`wn5l:22`, `wn5l:33-45`, `modules/wn5_assign.js:10`).
8. **Veroia**: the only place a delivery is split; a piece is in one place (Weekly row *or* Veroia panel); stock lives only in the panel (`modules/wn5_veroia.js:1-3`, `wn5l:606-610`, `wn5l:547`).
9. **Two-step destructive acts**: dry run → list of consequences → confirm (`wn5a:553-690`).
10. **Stale-write guard**: a change of a trip sends the last change the board showed; someone else's newer change is refused, never overwritten (`config.js:413-416`).
11. **Cutover day "L"** comes from the base (`/plan/config`), never from a date in the screen; weeks before it live in the old model (`core/plan-config.js:1-20`, `wn5:132-140`).
12. **Driver sheet leaves the building**: no price, no fee; Veroia is named only as the company's own warehouse (`modules/wn5_sheet.js:3-5`).

Endpoints the client calls: `GET /plan/board`, `/plan/lookups`, `/plan/config`, `/plan/vs-state`, `/plan/orders/:id`, `/plan/drafts`, `/plan/drafts/:id/history`; `POST /plan/orders`, `/plan/legs`, `/plan/move`, `/plan/pieces/split`, `/plan/local-loading`, `/plan/delete`, `/plan/transfer`, `/plan/vs/day`, `/plan/rt/:id/handover`, `/plan/drafts/move`, `/plan/drafts/:id/realize`, `/plan/segments/:id/remove`; `PATCH /plan/orders/:id`, `/plan/rt/:id`, `/plan/segments/:id` (grep of `planFetch` / route strings in `modules/wn5_*.js`). Tables behind them are not visible from client code.

### 2.4 Findings

| # | Tag | Finding | Evidence |
|---|---|---|---|
| N1 | [BROKEN] | Same year problem as I1, different symptom: › has no upper cap, so tabs can read «W54», «W55»…; ‹ stops at W1; the week number carries no year. The two boards also disagree on the clamp. | `wn5:241-247`, `wn5:673`, `wn5:681-685`, `wi2:1721` |
| N2 | [BROKEN] | If the v5 renderer throws, the board falls back to the old national board for the session — but from the cutover the old model is frozen history, so the fallback shows a week without its real work under a banner. (Old-model emptiness is from code comments; not verified against data.) | `wn5:457-490`, `wn5:133-134`, `core/plan-config.js:13-16` |
| N3 | [MISSING] | No «Προβολή ▾», «Σάρωση», CSV, full screen or status filter; the code says they wait for a later phase. International has all five. | `wn5:649-651` vs `wi2:1746-1767` |
| N4 | [MISSING] | v5 reports no page metrics; the metrics audit shows the page as never opened. | `wn5:263-265` |
| N5 | [EXTRA] | The old national board (3,198 lines: popovers, drag, local moves, CSV, print) stays shipped for weeks before cutover only; its write controls are still drawn although the base refuses its writes (per comment). | `wn5:644-662`, `wn5:133-134`, `wn:141-146`, `wn:55-59` |
| N6 | [INCONSISTENT] | Two flagged variants change the screen per user: the ✈ item is «Αλλαγή οχήματος…» or «Αλλαγή στον δρόμο…»; the Veroia panel is drawn by one of two modules. The redesign must draw one of each. | `wn5:2121-2124`, `modules/wn5_veroia.js:239-240`, `config.js:408-412` |
| N7 | [INCONSISTENT] | Same chrome, done differently on the two boards: week steppers (text ‹ › vs icons); «Σήμερα» (always/disabled vs only off-week); refresh (clickable token vs menu item); week print (column-header icon vs menu item); «Όλες οι N ▾» (expands in place vs popup panel); folded-day marker (text vs dot); loading word («Διαβάζει…» vs «Φόρτωση εβδομάδας N…»); error (strip vs card). | `wn5:680-686` / `wi2:1724-1743`; `wn5:635` / `wi2:1751`; `wn5:868` / `wi2:1749`; `wn5:815` / `wi2:1826`; `wn5:895` / `wi2:1609`; `wn5:632` / `wi:629`; `wn5:718` / `wi:612` |
| N8 | [INCONSISTENT] | Keyboard: this board binds only `/`, Esc and ←/→; International has a full set and a «?» sheet. | `wn5:1719-1734` vs `wi4l:762-775` |
| N9 | [INCONSISTENT] | «ΕΠΟΜΕΝΑ» means different things: here only Veroia Switch loads without a truck (other national orders without a truck appear as rows and in the tab badge, not in the band); on International it is every reason for action. | `wn5l:606`, `wn5:683`, `wi4l:585-626` |
| N10 | [INCONSISTENT] | Words the owner banned from the screen still appear in dialogs and strips: «κύκλος» and the English «board». | `wn5a:1213`, `wn5a:1732`, `wn5a:2066`, `wn5a:2082-2083`, `wn5a:2117`; rule at `modules/wn5_assign.js:6-8`, `wn5:860-861` |
| N11 | [INCONSISTENT] | Codes as the subject of a sentence, against the plain-messages rule: «Διαγραφή παραγγελίας #N;», «Διαγράφηκε η παραγγελία #N», card title starts with the reference; «τόπος #id…» in the data strip. `PlainRef` is not used in any v5 file. | `wn5a:2829`, `wn5a:2838`, `wn5a:2800`, `wn5l:534` |
| N12 | [INCONSISTENT] | The week-print button sits in the number column's header because the bar had no room at 1440px; the owner did not find it at first (per comment). | `wn5:863-868` |
| N13 | [INCONSISTENT] | Unknown pallets are written «;» / «12+;» here; International uses a different convention (its own pallet helper). Same fact, two notations (International side not traced in detail). | `wn5l:33-45`, `wi2:182-193` |
| N14 | [LOCKED] | No role gate on the screen: every role sees every button and the Worker answers. Owner decision; do not hide controls per role without asking. | `wn5:19`, `wn5a:16-17`, `modules/wn5_forms.js:19` |
| N15 | [LOCKED] | Veroia Switch is internal: the driver sheet names it only as the company warehouse; national orders table stays empty by design. | `modules/wn5_sheet.js:3-5`; `CLAUDE.md` locked decisions |

### 2.5 States

| State | Today | Ref |
|---|---|---|
| Loading (first) | bar «Διαβάζει…», seven day heads «· …», two skeleton bars under today, search disabled, «ΕΠΟΜΕΝΑ · …» | `wn5:620-626`, `wn5:883`, `wn5:805`, `wn5:1901-1904` |
| Loading (reload) | previous board stays; tab badges keep the last counts | `wn5:691-699` |
| Error, nothing before | «ΣΦΑΛΜΑ» strip + «Η εβδομάδα δεν διαβάστηκε — δεν σημαίνει ότι είναι άδεια»; days show «· —» | `wn5:727-730`, `wn5:894` |
| Error after a save | «ΑΠΟΘΗΚΕΥΤΗΚΕ · Ο ΠΙΝΑΚΑΣ ΔΕΝ ΑΝΑΝΕΩΘΗΚΕ», rows are the state before the change | `wn5:721-726` |
| Empty week | every day «· καμία φόρτωση», no column header, «ΕΠΟΜΕΝΑ · κανένα» | `wn5:767`, `wn5:807`, `wn5:894` |
| Week before cutover | one line «Εβδομάδα πριν από D/M: τα εθνικά της είναι στην παλιά προβολή» + button | `wn5:661-663`, `wn5:760-762` |
| Partial data | places «—» + «ΟΝΟΜΑΤΑ ΤΟΠΩΝ» strip; other-week numbers filled later; unplaceable data listed in a strip and logged | `wn5:734-752`, `wn5:314-336` |
| No permission | none on screen; a refused action shows «ΔΕΝ ΑΠΟΘΗΚΕΥΤΗΚΕ» with the Worker's message | `wn5a:35-39`, `core/plan-api.js:136` |
| Writes closed | «ΠΡΟΕΠΙΣΚΟΠΗΣΗ» strip, save buttons locked for the session | `wn5a:24-26`, `wn5a:449-451` |
| No search match | table hidden, strip with «Καθάρισμα ×» | `wn5:764`, `wn5:1895-1899` |
| Renderer crash | banner + old board (see N2) | `wn5:466-490` |
| Many rows | all rendered; points 2 per column (1 at ≤1600px) + «+N»; queue 3 (2) cards + expand; printed week spills to more pages | `wn5:37-44`, `wn5:811`, `core/week-paper.js:20-30` |

---

## 3. Shared pieces

| Piece | Used by | Note |
|---|---|---|
| `core/week-paper.js` | both boards' printed week | pure: data in, HTML out; counts its own headers from the rows it draws (`:1-8`); shrinks rows 6.6→4.4 mm then adds pages (`:20-30`) |
| `core/route-diagram*.js` | national ✈ «Διαδρομή», orders week view, pallets week view | not used on the International board (I12) |
| `wi4-*` CSS classes | both (`wn5` root is `class="wi4 wn5"`, `wn5:625`) | the national board already reuses International's bar, tabs, day and queue classes — a real shared component layer exists in CSS but not in JS |
| `WI4.v2Decide` | both feature switches | one three-state rule (`wi4l:422`, `wn5:123-131`) |
| `modules/preorder.js` | International board, daily ops, orders | one predicate `isPreorder` for every screen (`:23-25`) |

## 4. Findings count

| Tag | International | National | Total |
|---|---|---|---|
| [BROKEN] | 2 | 2 | 4 |
| [MISSING] | 1 | 2 | 3 |
| [EXTRA] | 3 | 1 | 4 |
| [INCONSISTENT] | 8 | 8 | 16 |
| [LOCKED] | 2 | 2 | 4 |
| **Total** | 16 | 15 | 31 |

Not covered: the internals of each national dialog beyond its entry point and title (forms, handover, road, compose were read at header + outline level, not line by line); the old national board's markup (`wn:433-3198`) beyond its entry, gate and function list; pixel/layout behaviour (nothing was rendered).
