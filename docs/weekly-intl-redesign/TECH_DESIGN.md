# Weekly International v4: technical design (one-night build, closed flag)

Date: 10/10/2026 (night) · Author: principal engineer (Claude) · Branch: `feat/wi-v4`
Based on: `origin/main 626f0820` · Plan: `docs/weekly-intl-redesign/PLAN.md` (Φ0–Φ9) ·
Decisions: `docs/DECISION_LOG.md`, entries dated 2026-10-09 and 2026-10-10.
Figma `KO7l2AfucR3HJEDIg1Yptr`: board «ΕΚΔΟΧΗ 9/10» `1097:2254`, sheet 14 `1064:2254`,
sheet 15 `1115:2653`, sheet 16 `1123:2716`, rules sheet `958:747`. All of them were read for
this document with the Figma MCP, read-only.

> **Σύνοψη για τον owner.** Χτίζουμε απόψε όλο το νέο Εβδομαδιαίο (Φ0–Φ8) σε **νέα αρχεία**,
> πίσω από τον διακόπτη `FEATURES.WI_V2 = false`. Με τον διακόπτη κλειστό ο σημερινός πίνακας
> μένει ίδιος byte-προς-byte, και το αποδεικνύουμε με αυτόματη σύγκριση HTML. Κάθε εγγραφή
> της νέας προβολής καλεί τις **ίδιες** συναρτήσεις με σήμερα. Τίποτα δεν αντιγράφεται.
> Το SQL 068, το deploy του Worker, ο αριθμός αιτημάτων του Cloudflare και το άνοιγμα του
> διακόπτη μένουν για σένα το πρωί (§j). Κανένας ρόλος δεν κερδίζει και δεν χάνει δικαίωμα.

---

## a. Module boundary

### a.1 Decision
The v4 board is a **second renderer of the same state**, not a second module of the page.

- `modules/weekly_intl.js` keeps everything it does today:
  - loading (`renderWeeklyIntl` 616);
  - row building (`_wiBuildRows` 793);
  - every write, panel, popover and menu action;
  - the DOM contract that those writes reach into.
- The v4 render code lives in **new files** and reads/writes only through:
  - `window.WINTL` (the state object, already global);
  - a frozen `window.WI_INTERNAL` API object, added at the end of the IIFE of `weekly_intl.js`.
- `weekly_intl.js` gains only **guarded one-line hooks** (§a.4). With v4 inactive, every hook
  falls through to the existing code path. The output stays identical.

New files and the one global each one defines:

| File | Global | What it owns |
|---|---|---|
| `core/wi4-logic.js` | `WI4` | Pure functions only (§d). Works as a browser global and as a node module. |
| `core/wi4-presence.js` | `WI4Presence` | Heartbeat client, presence store, conflict-dialog data (§g). |
| `modules/weekly_intl_v2.js` | `WIV2` | Activation, board shell, rows, queue, search, feedback states, shelf host. |
| `modules/wi4_actions.js` | `WI4Actions` | Per-load menu, date panel, conflict dialog UI, keyboard + «?», queue «Όλα N ▾» panel. |

Load order in `app.html`:
1. `core/wi4-logic.js` and `core/wi4-presence.js`, after `core/relay.js`.
2. `modules/weekly_intl_v2.js` and `modules/wi4_actions.js`, right after `modules/weekly_intl.js`.

All four files also go into `sw.js` `APP_SHELL`.

### a.2 Why a new file and not branching inside `weekly_intl.js`
1. **The regex tests.** Eleven test files extract functions from `weekly_intl.js` by name with
   `/(?:async )?function NAME\([^)]*\) ?\{[\s\S]*?\n\}\n/` and evaluate them in a `vm` world
   that has only the globals each test stubs (see `tests/wi-weekly-doors.test.js:24`).
   - An `if (v2) … else …` inside a renderer adds new identifiers to the extracted body.
   - Every extracting test would then need a stub for them.
   - A misplaced closing brace shifts what the regex captures, and the test fails for a reason
     unrelated to the change.
2. **Byte identity is provable only if the old path is untouched.** A guard at the *top* of a
   function, which returns early, leaves the rest of the body textually identical.
3. **Φ9 cleanup is a file deletion, not surgery.** After a stable week, the old renderers go
   and `weekly_intl_v2.js` becomes the only renderer.
4. **One owner per file tonight.** Parallel agents never edit the same file (§i).

### a.3 How the extracting tests stay green
- **No function that a test extracts is renamed or reordered.** Extracted names, measured on
  `origin/main`: `_wk3PickDate`, `_wiSaveImportMatch`, `_wiClear`, `_wiSplitCtxItems` and
  ~90 others. None of the render functions is extracted: `_wiPaint`, `_wiRowHTML`,
  `_wiAllRowsHTML`, `_wiCtx`, `_wiImpCtx`, `_wiSegCtx`, `_wiRepaintRow`.
- **Two extracted functions do change**, because principle 3 forbids copying their write logic.
  The tests that extract them are updated **in the same work package** (WP2):
  - `_wk3PickDate`: its write moves into the new `_wiDateWrite` (§a.5). The only test that
    extracts it is `tests/wi-weekly-doors.test.js`, which adds `'_wiDateWrite'` to `NAMES`.
  - `_wiSaveImportMatch`: it gains `_wiExpectOpt(...)` / `_wiSeenNote(...)`. The test that
    extracts it, `tests/weekly-impjoin.test.js`, stubs both (`_wiExpectOpt: () => undefined`,
    `_wiSeenNote() {}`). That is exactly the flag-off behaviour.
- **Formatting rule for every new function in `weekly_intl.js`:**
  - `function name(...) {` at column 0;
  - the closing `}` alone at column 0, followed by a newline.

  Future tests can then extract them with the same regex.
- `WI_SRC=<path>` already lets a test run against another copy of the file. The identity rig
  (§h) uses the same idea for HTML.

### a.4 Hooks added to `weekly_intl.js`
Each hook is a single statement and inert when v4 is off. `_wiV2Active()` is:
`typeof WIV2!=='undefined'&&WIV2.active()`.

| Where (origin/main line) | Hook | Why |
|---|---|---|
| `_wiPaint` 1082, first line | `if(_wiV2Active()&&WIV2.paint()!==false) return;` | `renderWeeklyIntl`, relay/carrier/docs late loads and ~15 write paths repaint through `_wiPaint`. `WIV2.paint()` returns `false` after logging if it throws: the old board paints and a banner says so (principle 1). |
| `_wiRepaintRow` 2811, first line | `if(_wiV2Active()) return WIV2.repaintRow(rowId);` | Used by popover and assignment paths. |
| `_wiShelfPaint` 7022, first line | `if(_wiV2Active()) return WIV2.shelfPaint();` | It looks for `#content .wk3.wi2` and silently does nothing otherwise. The stock read lands after the first paint, so v4 would never show the strip. |
| `_wiSync` 2293, after the `_syncLog` write | `if(_wiV2Active()) WIV2.onSync(oid,state,msg);` | Feeds the failure states (§e.12). |
| `_wk3FeedTog` 8003, last line | `if(_wiV2Active()) WIV2.feedTog(side);` | It toggles classes on `.wk3`, which v4 does not have. The localStorage keys `tms_wk3_fl/fr` stay the one memory. |
| the three `if(res?.conflict)` branches (3267, 3687, 3695) | `if(_wiV2Active()) return WIV2.conflict(res,ctx);` placed before today's toast | Today they toast and re-render. v4 shows «Ποια κρατάμε;». |
| `_wiPaint` mast markup | `${typeof WIV2!=='undefined'?WIV2.switchHTML():''}` | Returns `''` unless the browser opted in before (§b). Byte-identical otherwise. |

### a.5 Extractions inside `weekly_intl.js` (same output, now callable)
| New function | Extracted from | Used by |
|---|---|---|
| `_wiDateWrite(orderId, field, curIso, ymd, hhmm?)` → `{ok, rec, conflict?}` | the `inp.onchange` body of `_wk3PickDate` 1976 | `_wk3PickDate` (unchanged behaviour) and the v4 date panel |
| `_wiPaintMetrics()` → `{expRows, impRows, impPlan, …, metrics}` | top of `_wiPaint` 1083–1117 | `_wiPaint` (same `reportPageMetrics` call) and `WIV2.paint` |
| `_wiCrossWeekIncoming(week)` → `Promise<recs>` | the T4 fetch at the end of `_wiPaint` 1235 | the v1 chip and the v4 queue (W+1 loads today/tomorrow) |
| `_wiCtxItems(row)`, `_wiImpCtxItems(row, matchedExportRowId)`, `_wiSegCtxItems(rowId, orderId, isImp)`, `_wiPreCtxItems(row)`, `_wiLotCtxItems(row, isImp)`, `_wiLegCtxItems(legOid)`, `_wiRelayCtxItems(relayId, oid)`, `_wiSplitHeaderCtxItems(row)` → HTML string | the item-building half of `_wiCtx` 4472, `_wiImpCtx` 5678, `_wiSegCtx` 6368, `_wiPreCtx` 4547, `_wiLotCtx` 7069, `_wiLegCtx` 5316, `_wiRelayCtx` 5609, `_wiSplitHeaderCtx` 1587 | the old openers (same HTML, then the same show code) and the v4 per-load menu |
| `_wiExpectOpt(orderId, fields)` / `_wiSeenNote(orderId, rec)` | new | conflict check (§g.3). Returns `undefined` when v4 is off, so requests stay byte-identical. |
| `_wiSeenSnapshot()` | new; called in `renderWeeklyIntl` right after the ORDERS fetch | stores `WINTL._seen[oid]`: the conflict-checked labels **as read from the server**, never the optimistic paint |

### a.6 `WI_INTERNAL`: the explicit API (name → origin/main line)
Added once, at the end of the IIFE, with `Object.freeze`. v4 never calls an underscore function
through `window.*` directly, even when one is exported: the API object is the one list to keep
in sync (principle 3).

**State and data**
`WINTL` (33) · `renderWeeklyIntl` 616 · `buildRows` = `_wiBuildRows` 793 ·
`boardImpRows` = `_wiBoardImpRows` 1079 · `pendingExps` = `_wiPendingExps` 1058 ·
`jumpFirstPendingExp` 1061 · `gaps` = `_wk3Gaps` 1038 · `paintMetrics` (new) ·
`crossWeekIncoming` (new) · `seenSnapshot` (new) · `css` = `_WI2_CSS` 212 (v4 injects it so the
reused popover, panels and menus look exactly as today; see §c.3).

**Reading helpers (logic, no v1 markup)**
`currentWeek` 109 · `weekStart` 111 · `weekRange` 112 · `fmt` 114 · `raw` 122 · `clean` 119 ·
`stFlags` = `_wk3StFlags` 2010 · `vsCd` = `_wk3VsCd` 1965 · `arr` = `_wk3Arr` 1854 ·
`locs` = `_wk3Locs` 1832 · `split` = `_wi2Split` 2032 · `flatLocName` 2061 · `placeStr` 2380 ·
`clientName` 2095 · `grpOrder` 2331 · `giSortRecs` 3045 · `sameDayConflict` 2310 ·
`busy` = `_wk3Busy` 1812 · `weekOf` 2283 · `relayIdsOfRow` 5395 · `legPidsOfRow` 5386 ·
`impIdsOf` 5376 · `relayById` 5576 · `relayTip` 5437 · `relayOrder` 5371 · `impGroupRowOf` 6822 ·
`recOf` 6788 · `isPiece` 6786 · `isLot` 6787 · `lotHeld` 6795 · `stockOn` 6785 ·
`stockSkip` 6804 · `shelved` 6846 · `loose` 6816 · `pieceIn` 6833 · `lotState` 6933 ·
`shelfLots` 6941 · `looseLate` 6955 · `shelfHas` 6916 · `apBadge` 6871 · `lotBadge` 6880 ·
`apTip` 6863 · `stockGapLink` 7272.

**Behaviours and writes (called, never copied)**
- Assignment and dates: `openPopover` 3414 · `openImpPopover` 6710 · `closePopover` 3581 ·
  `saveFromPopover` 3587 · `clear` 3886 · `dateWrite` (new) · `pickDate` 1976.
- Drag and drop: `dropOnRow` 2980 · `dropImport` 3001 · `impDragStart` 2847 · `impDragEnd` 2833 ·
  `dragImpId` 2832 · `segDragStart` 6260 · `segDragOver` 6267 · `segDrop` 6290 ·
  `segDragEnd` 6272.
- Matching and groups: `saveImportMatch` 3127 · `unmatch` 2879 · `unmatchRow` 2895 ·
  `newImport` 2939 · `impJoin` 5995 · `cancelGroupMember` 6469 · `toggleGroup` 6705 ·
  `rota` 6600 · `rotUnlink` 5276.
- Order form: `edit` = `_wk3Edit` 1956.
- Print and export: `print` 6698 · `printImp` 2975 · `printGroup` 6565 · `printImpGroup` 6583 ·
  `menuPrint` 4461 · `printWeek` 6718 · `exportCSV` 8047 · `fullscreen` 2964.
- Relays: `relayOpen` 5581 · `relayGrpToggle` 5501 · `relayReload` 5363.
- Stock: `stockLoad` 6899 · `stockPrime` 6894 · `stockLotsOpen` 6995 · `stockLotOpen` 7099 ·
  `stockLooseOpen` 7239 · `stockOpenPiece` 7217 · `shelfInner` 6959 · `shelfFit` 7011 ·
  `shelfWheel` 7016.
- Creation: `newOrder` 990 · `scan` 999 · `preorder` 1016.
- Menus: `ctxClose` 4056 · `ctxShow` 7058 · `leaveFs` 7048 · `anchorFor` 4090 ·
  `blockReadOnly` 586 (the gate that exists today; v4 calls it where the old opener calls it,
  and nowhere else).
- Menu item builders: `ctxItems` · `impCtxItems` · `segCtxItems` · `preCtxItems` ·
  `lotCtxItems` · `legCtxItems` · `relayCtxItems` · `splitHeaderCtxItems` (all new, §a.5).
- Sync state: `sync` = `_wiSync` 2293 · `expectOpt` · `seenNote` (new).

### a.7 The DOM contract v4 must keep (the old writes reach into it)
| Contract | Used by |
|---|---|
| containers `#wi-rows`, `#wi-ctx`, `#wi-popover`, `#wi-panel` | menus, popover, panels; `_wiStockTipsRefresh` 6885 and `_wiStockGapLinksRefresh` 7278 query `#wi-rows` |
| export row element `id="wi-row-{row.id}"` + `data-row-id` | `_ccJump` in `_wiJumpFirstPendingExp`, `_wiAnchorFor` 4090 |
| free import row element `id="wi-imp-{orderId}"` + `data-row-id` + `draggable` | `_wk3Gaps` 1042 |
| import drop cell `id="wi-ci-{row.id}"` | `_wiDropOnRow`, `_wiSegDrop` 6304 (`closest('[id^="wi-ci-"]')`) |
| sync slot `<span class="wi-sync" id="wi-sync-{row.id}">` in the index cell | `_wiSync` (38 call sites) |
| `.wi2-gapstk[data-row]` inside the empty-return box | `_wiStockGapLinksRefresh` |
| `.wi-b-ap[data-oid]` (from `_wiApBadge`) | `_wiStockTipsRefresh` |
| `#wi-shelf` (from `_wiShelfInner`) | `_wiShelfFit` |
| print buttons keep `class="wk3-prt" data-shq data-shtitle` | `shareMenuDelegate` (right-click share menu) |

---

## b. Flag, opt-in, identity

- `config.js`, next to `FEATURES` (377):
  - `FEATURES.WI_V2 = false`, `FEATURES.WI_PRESENCE = false`;
  - `const WI_V2_USERS = []`: pilot usernames, as in PLAN §2.1;
  - `const WI_PRESENCE_MS = { active: 5000, idle: 30000, idleAfter: 120000 }`.
  Every new value is born closed (principle 5).
- **Per-browser opt-in:**
  - `app.html?wi4=1#weekly_intl` stores `localStorage['tms_wi4']='1'`;
  - `?wi4=0` stores `'0'`.
  - `weekly_intl_v2.js` reads the parameter once at load and then removes it with
    `history.replaceState`, so a copied link does not spread it.
  - Every localStorage access goes through try/catch. Storage that throws counts as no opt-in.
- **Decision** (pure, `WI4.v2Decide({flag, pilot, user, optIn})`):
  1. `optIn==='0'` → old board;
  2. `optIn==='1'` → v4;
  3. otherwise `flag || pilot.includes(user)`.
- **Visible switch:**
  - v4 mast: «Παλιά προβολή» inside «Προβολή ▾».
  - v1 mast: «Νέα προβολή». Shown only when `tms_wi4==='0'` (someone who opted in and went
    back) or for a pilot user. Each sets the key and calls `renderWeeklyIntl()`.
  - Nobody who never opted in sees either switch.
- **Byte identity with the flag off and no opt-in.** Proof (WP2, `tests/critics/wi4-identity-rig.js`):
  1. Two worktrees are served by the same static server: baseline = `origin/main`, candidate =
     `feat/wi-v4`. The same in-memory facade serves the synthetic fixture week (§h) and the
     clock is frozen.
  2. Capture `#content.innerHTML` after `renderWeeklyIntl()` settles: relays loaded, carriers
     loaded, stock loaded.
  3. For every row, capture `#wi-ctx.innerHTML` after calling, with a synthetic event:
     `_wiCtx`, `_wiImpCtx`, `_wiMatchedImpCtx`, `_wiSegCtx` (per member), `_wiLegCtx`,
     `_wiRelayCtx`, `_wiSplitHeaderCtx`, `_wiPreCtx`, `_wiLotCtx`.
  4. Script one date change, one assignment save and one match. Capture every facade request
     body.
  5. The diff of all three captures must be empty. Any byte of difference is a NO-GO.

---

## c. CSS

### c.1 Rules
- Only additions to `assets/style.css`, under one block headed
  `/* ── Weekly Intl v4 (wi4-*) — FEATURES.WI_V2 ── */`.
- Every new selector starts with `.wi4` (the v4 root) or `.wi4-*`. No shared selector
  (`wi-*`, `wk3-*`, `wi2-*`) is edited. Weekly National shares those.
- No hex inside any JS file: the ratchet in `docs/redesign/baseline.json` and
  `tests/critics/static.js`. Add a `weekly_intl_v2` unit to `tests/critics/units.js`, covering
  `modules/weekly_intl_v2.js` and `modules/wi4_actions.js`, with allowance `hex 0, truncate 0`.
  CSS truncation (`text-overflow: ellipsis`) is counted in the `styles` unit: raise its
  allowance by the exact number used, with a `_note`.

### c.2 Tokens (on `:root`; values measured on board 1097:2254)
| Token | Value | Use |
|---|---|---|
| `--wi4-ink` | `#0b1929` | line 1, titles |
| `--wi4-grey-1` | `#344054` | secondary strong text, tab labels |
| `--wi4-grey-2` | `#5b6b7f` | line 2, column headers, meta (5.3:1 on white) |
| `--wi4-grey-3` | `#98a2b3` | placeholders, disabled. **Never for information text** (2.6:1). |
| `--wi4-icon` | `#94a3b8` | icons, arrows, ✓ |
| `--wi4-line` | `#eef1f5` | row separator |
| `--wi4-line-2` | `#e2e8f0` | bar borders |
| `--wi4-ctl` | `#d0d5dd` | button borders |
| `--wi4-slot` | `#cbd5e1` | dashed empty slot |
| `--wi4-red` | `#b91c1c` | rail «τώρα», unassigned border, red words |
| `--wi4-red-bg` | `#fef2f2` | unassigned box, red chips |
| `--wi4-red-ink` | `#7f1d1d` | text on red-bg |
| `--wi4-amber` | `#b45309` | rail «προσοχή» (dashed), amber words |
| `--wi4-amber-bg` | `#fff7ed` | amber chips, national leg «ΠΡΟΣ ΑΝΑΘΕΣΗ» |
| `--wi4-amber-ink` | `#7c2d12` | text on amber-bg |
| `--wi4-delay-bg` | `#fef3c7` | «+4ω» chip |
| `--wi4-own` | `#eef2f6` | own-fleet assignment box |
| `--wi4-partner` | `#ddefe3` | partner box |
| `--wi4-partner-line` | `#bfdcc9` | partner border |
| `--wi4-partner-ink` | `#14532d` | partner line 1 |
| `--wi4-partner-sub` | `#3f6b52` | partner line 2 |
| `--wi4-unassigned` | `var(--wi4-red)` | alias, so the vocabulary reads in CSS |
| `--wi4-blue` | `#027bbd` | today/future date chip border, focus ring, selection |
| `--wi4-blue-ink` | `#0369a1` | link text, date chip text |
| `--wi4-chip` | `#f1f5f9` | neutral or estimated date chip |
| `--wi4-split-hd` | `#f8fafc` | split frame header |
| `--wi4-hover` | `#f6f9fc` | row hover |

Type and geometry:
- **Fonts:** DM Sans; plates in DM Mono Medium 12.
- **Sizes:** line 1 = 12 Medium; line 2 = 10.5 Regular; day header = 12.5 SemiBold; column
  header = 10 SemiBold, letter-spaced, `--wi4-grey-2`.
- **Row heights:** 32px row; 28px sub-row (relay, rota, split leg); 24px message line.
- **Grid at 1920** (Figma «Row 14»): `32px 140px 12px minmax(0,1fr) 12px 204px 12px minmax(0,1fr) 12px 140px`.
  The two `1fr` columns measure 621px each. A collapsed national column is `18px`, as today.
- **Inside a leg** (export and import alike): `70px 8px minmax(0,1fr) 8px 13px 8px minmax(0,1fr) 8px 72px`.
  The columns are: date/ref · loadings · arrow · deliveries · pallets + PE + attachment.
- **Assignment cell:** box 28px high, radius 5, plus the 22px paper-plane button, radius 5.
- **Date chip:** 18px high, radius 4.
- **Rails:** 3px. Solid = `--wi4-red`, dashed = `--wi4-amber`. Shape and colour both carry the
  level, because red and amber measured 1.2:1 for red-green colour-blind readers (10/10).

### c.3 Reused CSS
- v4 injects `WI_INTERNAL.css` (`_WI2_CSS`) once, like `_wiPaint` does. The popover
  (`.wi-pop*`, `.wi2-piz`, `.wi2-pop-*`), the panels (`.wi-rly-*`, `.wi-lane-*`) and the menu
  header (`.wi-ctx-h`) then look exactly as today.
- v4 markup never uses a `wk3-*` or `wi2-*` layout class, so those global rules cannot touch it.
- The only legacy class names v4 emits are the contract hooks of §a.7: `wi-sync`, `wk3-prt`,
  `wi2-gapstk`, `wi-b-ap`. Each sits inside a `.wi4-*` wrapper that sets its size.

---

## d. Pure logic: `core/wi4-logic.js`

Plain functions on plain objects. No DOM, no `WINTL`, no `Date.now()` (`today` and `now` are
arguments). The file ends with
`if (typeof module!=='undefined') module.exports=WI4; else window.WI4=WI4;`.
Tests: `tests/wi4-logic.test.js` (`node --test`, zero dependencies).

### d.1 Points: `WI4.points(stops, widthPx, opts) → {shown, more, hidePlace}`
- **Input:**
  - `stops = [{n, label, place, pallets, done, delayH}]`, already in stop order;
  - `widthPx` = width of one points column, measured **once per paint** from the column header;
  - `opts = {min:56, gap:8, badge:12, chip:34, placeMin:46, dateTick:boolean}`.
- **Rules:**
  1. `n ≤ 4`: show all if `n*min + (n-1)*gap ≤ width`. Otherwise show the largest `k` that fits
     together with a «+N» chip.
  2. `n ≥ 5`: the first 3 and «+(n−3)», shrunk the same way if even 3 do not fit.
  3. «+N» carries the pallet sum of the hidden stops: `more = {count, pallets}`.
  4. `hidePlace = (perPoint − badge) < placeMin`. The place hides and the label keeps the width.
  5. **No double tick:** a column with exactly one stop never shows a ✓ on the point when
     `opts.dateTick` is true (the date chip already shows it).
  6. A single stop has no number badge: the name and place render as today.
- **Cases:** 1/2/3/4 stops at 207px · 4 stops at 200px (→ 3 + «+1») · 5 and 9 stops ·
  4 stops at 170px with places hidden · single loading with `dateTick` (no ✓ on the point) ·
  two stops, both done (✓ on each) · delay chip «+4ω» kept on a shown point.

### d.2 Flags: `WI4.flags(facts, today) → {level:'red'|'amber'|null, reasons:[{code, level, text, act}]}`
- `facts` is built impurely in v4 (`WIV2.factsOf(row)`) from the row and its records:
  ```
  {kind:'export'|'import'|'leg'|'split'|'relay', saved, partner, loadDate, delDate,
   returnDate, hasReturn, natLegs:[{side:'to'|'from', date, carrier:boolean}],
   pallets, vsCdDate, natDelDate, sameDayClash:string|null, late:boolean,
   preorder:{level}|null, syncErr:string|null, executing:boolean}
  ```
- **One function, three readers:** the row rail, the day header and the queue all read it
  (principle 3). The reasons:

| code | level | rule (rules sheet 958:747 + «ΕΚΔΟΧΗ 9/10») | words (today's vocabulary) |
|---|---|---|---|
| `NO_TRUCK` | red if `loadDate ≤ today+1` (or past); amber if `= today+2`; else none | unassigned export or own import | «χωρίς φορτηγό» |
| `EMPTY_RETURN` | none while `returnDate > today+2`; amber `today ∈ [R−2, R]`; red `today > R` | own truck, no import (`hasReturn=false`, `partner=false`) | «κενό γύρισμα · από <μέρα> · τόπος» |
| `NAT_NO_CARRIER` | red if leg date `≤ today+1`; amber otherwise | a national leg without carrier | «σκέλος χωρίς μεταφορέα» |
| `DATE_MISMATCH` | amber | VS import reaches Βέροια after its national delivery date (or an export's VS CD date before its national loading) | «ασυνέπεια ημερομηνιών» |
| `OVER_33` | amber | pallets > 33. 33 is allowed (decision 9/10). | «πάνω από 33π» |
| `SAME_DAY` | amber | `sameDayClash` (from `_wiSameDayConflict`) | the existing sentence |
| `LATE` | amber | `Delivery Performance = Delayed` | «καθυστέρηση» |
| `PREORDER` | `preorderLevel` (≤1 day red, 2–3 amber, else none) | unconverted pre-order | «pre-order χωρίς μετατροπή» |
| `SAVE_FAILED` | red | `syncErr` | «δεν αποθηκεύτηκε» |

- Not flags: a past date without ✓ is grey «δεν δηλώθηκε» on the chip (status lag ≠ delay,
  rules sheet); a partner without import shows «Μόνο εξαγωγή · συνεργάτης».
- `level` = the worst reason.
- **Cases:** each code at the boundaries (today−1, today, today+1, today+2, today+3) · a partner
  row never gets `EMPTY_RETURN` · an executing row with no truck · two reasons → worst wins.

### d.3 Day header and queue
- `WI4.dayCounts(rowsFacts, today) → {trucks, byCode:{NO_TRUCK:n, …}, todayEmpty:n}`.
  - Text: «4 φορτηγά · 1 κενό γύρισμα (3 ημέρες) · 1 σκέλος χωρίς μεταφορέα».
  - Rows, sub-rows, split legs and national legs all count, so the totals equal the queue
    (decision 10/10 round 11).
- `WI4.queue(items, today) → ordered items`. An item is `{code, level, group:'stop'|'cost'|'look', date, age, key, rowKey, act}`.
  - Order: red before amber. Inside a level:
    1. `stop`: what stops a load (`NO_TRUCK`, `NAT_NO_CARRIER`, `SAVE_FAILED`), nearest
       loading first;
    2. `cost`: `EMPTY_RETURN` and the stock «εκπρόθεσμο», oldest gap first;
    3. `look`: the rest, by date.
  - Ties break by `key` (order id), never by fetch order.
- `WI4.collapsible(dayFacts) → boolean`: true only when every row has a truck and a return
  (or a partner) and no reason at all. Rules sheet: «Σύμπτυξη ημέρας».
- `WI4.openDay(days, today)`: the first day holding a red reason, else today.
- **Cases:** 10 queue scenarios (PLAN Φ3 «έτοιμο όταν»). Fixture invariant: for every day,
  `dayCounts` totals = queue items of that day = rails drawn.

### d.4 Keyboard: `WI4.keyAction(ev, st) → action|null`
- **Input:**
  - `ev = {code, key, shift, ctrl, meta, alt, targetTag, editable}`;
  - `st = {menuOpen, panelOpen, popoverOpen, dialogOpen, hasFocusRow}`.
- **Map** (by `e.code`, so a Greek layout works: A=Α, D=Δ, P=Π, N=Ν, O=Ο):

| key | action |
|---|---|
| `ArrowUp` / `ArrowDown` | `rowPrev` / `rowNext` |
| `Enter` | `menu` |
| `KeyA` | `assign` |
| `KeyD` | `date` |
| `KeyP` | `print` |
| `KeyN` | `newImport` (empty return only) |
| `KeyO` | `open` |
| `KeyQ` | `queueNext` |
| `Slash` | `search` |
| `Shift+Slash` | `help` |
| `Escape` | `escape` |
| `KeyE` / `KeyI` | `partExport` / `partImport` |

- **Never acts:**
  - inside `input`, `textarea`, `select` or contenteditable;
  - with ctrl, meta or alt held (so ⌘K and ⌘Z keep today's meaning);
  - while `#wi-ctx`, `#wi-panel`, the popover or a dialog is open. Their own handlers keep
    ↑↓/Esc, e.g. `_wiCtxKeydown` 4072.
- **`ArrowLeft`/`ArrowRight` → `null`.** Week navigation stays in `core/ui.js:407` as today.
  Using ←/→ for export/import is owner question PLAN §5.2, so **E/I** stand in until the owner
  answers. `[`/`]` is not bound (`←/→` already change week).
- Nothing destructive is bound. Delete and clear stay behind their menu confirms.
- **Cases:** each key with a Latin and a Greek `key` but the same `code` · inside an input ·
  with meta · menu open · ←/→ return `null`.

### d.5 Conflict data
- `WI4.CONFLICT_LABELS`: `Truck`, `Trailer`, `Driver`, `Partner`, `Partner Truck Plates`,
  `Is Partner Trip`, `Matched Import ID`, `Loading DateTime`, `Delivery DateTime`, `VS CD Date`.
- `WI4.sameValue(a, b)`:
  - `null`, `undefined`, `''` and `[]` are equal;
  - arrays compare as sorted joined strings;
  - numbers numerically;
  - two strings that both parse as datetimes compare by epoch milliseconds, so `Z` equals
    `+00:00`;
  - everything else after `String().trim()`.
- `WI4.buildExpect(changedFields, seenFields)` → `{label: seenValue}` for the checked labels
  present in `changedFields`. Returns `undefined` if none.
- `WI4.describeConflict(err409, labelsGreek)` → dialog text: who, when, theirs vs mine.
- `WI4.beatDelay({visible, lastInputAgoMs, failures, lastStatus, retryAfterMs, cfg})` → ms or
  `null`:
  - hidden → `null` (stop);
  - active (input within `idleAfter`) → `active`; idle → `idle`;
  - 404 → back-off 60 s, ×2 each time, cap 600 s;
  - 5xx or network error → 15 s, ×2, cap 120 s;
  - 429 → `retryAfterMs` or 30 s.
- **Shared vectors:** `tests/fixtures/wi4-expect-vectors.json` (`[{a, b, same}]`) runs against
  `WI4.sameValue` **and** against the Worker's comparator (§g.2). Two implementations, one
  truth that fails loudly if they drift (principle 3).

---

## e. Rendering plan (board «ΕΚΔΟΧΗ 9/10» + sheets 14–16)

`WIV2.paint()` builds one string and sets `#content.innerHTML`. It keeps today's model:
full re-render, inline handlers carrying `row.id`. Then it runs one layout pass: measure the
points column width, compute points per row with `WI4.points`, and adjust only the nodes that
need it. It never reflows per stop the way `_wi2FitStops` does.

| # | Element | Data / behaviour comes from |
|---|---|---|
| 1 | **Title bar:** «Εβδομαδιαίο Διεθνών · 3–9 Οκτωβρίου» · «Ενημερώθηκε πριν 2΄» next to the title (exact time in the title attribute; orange «N αλλαγές από Χ · Ανανέωση» from presence §g) · presence avatars · week tabs (‹ W−3…W+3 ›, «Σήμερα») · Pre-order (counter) · Σάρωση · Νέα παραγγελία · «Προβολή ▾» | `WINTL._loadedAt`, `TmsWeek`, `preorderCounterHtml`, `_wiPreorder`/`_wiScan`/`_wiNewOrder`, `OrdersCommon.scanButton/newOrderButton`. «Προβολή ▾» = Εκτύπωση (`_wiPrintWeek`), CSV (`_wiExportCSV`), Ανανέωση (`renderWeeklyIntl`), Πλήρης οθόνη (`_wiFullscreen`), Κατάσταση filter (today's 4 options, applied by v4 dimming), εθνικές στήλες on/off (`_wk3FeedTog`), «Παλιά προβολή». «Λεπτομέρειες» is not offered: its chips (exec, cross-week) become queue reasons. |
| 2 | **Queue band** (sheet 15): «ΕΠΟΜΕΝΑ · 17 — 7 επείγοντα · 10 προσοχή», search box (/), the 3 most urgent as cards with one button each, «Όλα 17 ▾», «Όλα στην W42 →» | `WI4.queue` over: the flags of every row and sub-row, stock items (`_wiLotState`, `_wiLooseLate`), pre-orders, W+1 loads today–tomorrow (`_wiCrossWeekIncoming`), and imports ±1 week not drawn on the board (already in `WINTL.data.imports`, `adj`). Card buttons call existing actions only: Ανάθεση → `_wiOpenPopover`/`_wiOpenImpPopover`; Νέα εισαγωγή → `_wiNewImport`; Κομμάτια → `_wiStockLooseOpen`; Εθνικά → `navigate('weekly_natl')`; Ημερομηνία → date panel; Άνοιγμα → `_wk3Edit`; Παρτίδα → `_wiStockLotOpen`; Μετατροπή → `_wk3Edit` (pre-order conversion, as `_wiPreCtx`). A click on the card body scrolls to the row and highlights it. |
| 3 | **«Όλα N ▾» panel:** ΤΩΡΑ / ΠΡΟΣΟΧΗ sections, Q = next, Esc closes | `WI4Actions.queuePanel()`, same items. Resolved items disappear on the next paint. |
| 4 | **Stock strip** «ΑΠΟΘΕΜΑ · 4 · 2 προς έλεγχο» + chips + «3 κομμάτια χωρίς φορτηγό · 1 εκπρόθεσμο» (locked: as today) | `_wiShelfInner(st)` inside `<div id="wi-shelf">`, wrapped in `.wi4-shelf`. Same words and numbers as the queue, because both read the same functions. Repaint through the `_wiShelfPaint` hook → `WIV2.shelfPaint()`. `_wiShelfFit` on paint and resize. |
| 5 | **Column header:** «‹ ΠΡΟΣ ΒΕΡΟΙΑ · ΕΞΑΓΩΓΗ · 34 φορτία · ανά ημέρα εκφόρτωσης · ΠΑΛ. · ΑΝΑΘΕΣΗ · ΕΝΤΟΛΗ · ΕΙΣΑΓΩΓΗ · 25 φορτία · ΠΑΛ. · ΑΠΟ ΒΕΡΟΙΑ ›» | counts from `_wiPaintMetrics`. A click on ΠΡΟΣ/ΑΠΟ toggles the column (`_wk3FeedTog`). The texts contain the five words `kanban.spec.js` checks. |
| 6 | **Day header:** «ΤΡΙΤΗ 6/10 · 4 φορτηγά · 1 κενό γύρισμα (3 ημέρες)», chevron; collapsed only if `WI4.collapsible`; «ΣΗΜΕΡΑ» on today; empty day = one line «Καμία κίνηση» | grouping = today's `_wiAllRowsHTML` rules: exports by delivery day, imports by loading day, Σαβ–Παρ seeded, extra «μεταφέρθηκε · W37» sections after Friday. Sort by client and then VS, as today. Open state is kept in `WINTL.ui.v4Days` keyed by date, so it survives repaints within the session. |
| 7 | **Export row** (32px): index (number, or a presence initial, plus the `wi-sync` slot) · ΠΡΟΣ ΒΕΡΟΙΑ (VS only: «ΠΕΛΑΤΗΣ Α → Βέροια Τετ» / carrier tile) · date chip + «ΑΝΑΦ.» under it · loadings · → · deliveries · pallets + PE + attachment · assignment box + paper-plane · import leg · ΑΠΟ ΒΕΡΟΙΑ | `_wiGrpOrder`; `_wk3Arr`/`_wi2Split` for points; `_wk3StFlags` (✓ and loaded/delivered); `_wk3VsCd` (≈ estimate); `_wi2Carrier` logic re-rendered in wi4 markup from `WINTL.data.nlBySrc`; `OrderDocs.badge` (attachment); `Pallet Exchange` (PE). Click on the date chip → date panel (#10). Click on the name → `_wk3Edit`. Click on an empty point → `_wiRota` (group) as today. Right-click → per-load menu (#9). |
| 8 | **Assignment box:** own = `--wi4-own` + plates in DM Mono / driver; partner = green + border, name / plates · driver; «ΠΡΟΣ ΑΝΑΘΕΣΗ» = red border, the strongest element; split parent = «2 σκέλη» chip. Rails: left 3px from `WI4.flags`. | `row.truckLabel/partnerLabel/…` (as in `_wiRowHTML` 2496). Click → `_wiOpenPopover(event,row.id)`, or `_wiOpenImpPopover` for an import-only row. Print buttons stay `wk3-prt` with `data-shq` (share menu). Partner rates stay visible in the popover, unchanged (owner 10/10). |
| 9 | **Per-load actions menu** (paper-plane + right-click; Figma 1047:1926 / sheet 14): header «ΑΒΓ1234 · Οδηγός Α / Σάβ 3/10 → Τρί 6/10 · 2 εξαγωγές · 1 εισαγωγή»; section **truck**; section **ΕΞΑΓΩΓΗ · φορτίο** (or «GROUPAGE ΕΞΑΓΩΓΗΣ · 2 φορτία → …»); one «▸» line per member opening its own submenu; section **ΕΙΣΑΓΩΓΗ · φορτίο**. Hovering a section highlights its load in the row. | `WI4Actions.openRowMenu(e, orderId)`: re-resolves `row.id` from the order id, calls `_wiBlockReadOnly()` exactly where `_wiCtx` does, then gathers HTML from the item builders: `_wiCtxItems(row)`, `_wiImpCtxItems(impRow, row.id)` (matched), `_wiSegCtxItems(...)` per member (submenus), `_wiPreCtxItems`/`_wiLotCtxItems` when those apply, `_wiRelayCtxItems`, `_wiSplitHeaderCtxItems`. Parsed into descriptors `{label, onclick, danger, disabled, title}` with `DOMParser`. **The onclick strings are kept verbatim.** Items are grouped by handler name (`WI4.menuSection(fn)`): `_wiPanelAssign`, `_wiClear`, stock piece → truck; `_wiUnmatchRow`/`_wiUnmatch`, the `_wiImpCtxItems` set → import; the rest → export. **Relabels** (decision 10/10, one name per thing) come from a map applied to labels only: «Ομαδοποίηση…» → «Groupage εξαγωγών…» · «+ Εισαγωγή στο φορτίο…» and «Groupage εισαγωγών…» → «Groupage εισαγωγών…» · «Εκτύπωση…» → «Εκτύπωση / WhatsApp…» · «Ακύρωση groupage» → «Βγάλε από το groupage». A unit test asserts every map key occurs in some builder's output, so a rename in old code fails loudly. «Καθυστέρηση…» is **not shown** until the 067 Worker is live and the owner says so. Menu keyboard = existing `_wiCtxKeydown` (it reads `#wi-ctx`). |
| 10 | **Date panel** (replaces the hidden native input; sheet 16 D/E): title «Ημερομηνία φόρτωσης», load identity (client · from — to), month calendar (Σάβ-first week), time input, line «Αλλάζει και τις στάσεις και τη Βέροια όπου υπάρχει. Η Εβδομάδα δεν αλλάζει από εδώ.», Άκυρο / Αλλαγή; presence note when someone else has it open; conflict block «Ποια κρατάμε;» | Anchored in `#wi-panel` space but a v4 element (`.wi4-datep`). Save → `WI_INTERNAL.dateWrite(oid, field, curIso, ymd, hhmm)`, which is the same `atSafePatch` + `invalidateCache` + `syncOrderDownstream(…,{changedFields:[field]})` as today, plus `_wiExpectOpt`. On success: moved-row trace (#13) → `renderWeeklyIntl()`. VS CD Date stays date-only, as today. |
| 11 | **Sub-rows** (28px, in the column of their load): local driver «ΤΟΠΙΚΗ ΦΟΡΤΩΣΗ · Οδηγός Β · Σάβ 3/10 05:00»; rota «ΣΚΕΛΟΣ ΡΟΤΑΣ · ίδιο φορτηγό» + «× αποσύνδεση»; split frame header «ΣΠΑΣΜΕΝΗ ΣΕ 2 ΣΚΕΛΗ · ΠΕΛΑΤΗΣ Β → ΠΑΡΑΛΗΠΤΗΣ Γ · 30π · αλλαγή φορτηγού στο σημείο Χ» + leg rows «↳1/↳2» with their own assignment | relays: `WINTL.relay.byOrder`, `_wiRelayIdsOfRow`, `_wiRelayTip`; click `_wiRelayOpen`, right-click `_wiRelayCtx` · rota: `WINTL._legs`, `_wiLegPidsOfRow`; unlink `_wiRotUnlink`; menu `_wiLegCtx` · split: `WINTL._splitLegs`, header click `_wk3Edit(parent)`, menu `_wiSplitHeaderCtx`; leg rows are full rows (#7) with the index replaced by «↳N». |
| 12 | **National columns** ΠΡΟΣ / ΑΠΟ ΒΕΡΟΙΑ: line 1 client · day, line 2 carrier tile (own navy text / partner green / «ΠΡΟΣ ΑΝΑΘΕΣΗ» amber dashed, or red within today–tomorrow); collapsible with memory | `nlBySrc` (loaded late; the existing `_wiPaint()` call after it now reaches v4 through the hook), `tms_wk3_fl/fr`. |
| 13 | **Empty return / void cells:** «Κενό γύρισμα · από Τρί 6/10 · Τόπος, CZ» + «+ Νέα εισαγωγή» (+ «ή κομμάτι από ΑΠΟΘΕΜΑ»); «Μόνο εξαγωγή · συνεργάτης»; import-only row: left cell «Χωρίς εξαγωγή · αυτή την εβδομάδα» (dashed) | `gapCell`/`parCell` rules of `_wiRowHTML`; «+ Νέα εισαγωγή» → `_wiNewImport(row.id)`; `<span class="wi2-gapstk" data-row>` filled by `_wiStockGapLink`. The cell is the drop target (§f). |
| 14 | **Save failure** (sheet 14 #5): the row re-reads and shows what is written; a 24px message line under it «Δεν αποθηκεύτηκε — έμεινε όπως ήταν, … · Ξαναδοκίμασε · κλείσιμο ×»; title bar «1 αλλαγή δεν αποθηκεύτηκε» in place of «Ενημερώθηκε» | `WINTL._syncLog` (state `err`, `msg`) via the `_wiSync` hook. `WIV2.onSync` re-reads the order with `atGetOne`, replaces it in `WINTL.data`, runs `_wiBuildRows` and repaints. «Ξαναδοκίμασε» **reopens the same action UI** for that order (popover, date panel or menu). It never blindly replays a write. «×» deletes the `_syncLog` entry. The old functions already call `reportError`/`logError` → `app_errors`. |
| 15 | **Moved-row trace** (sheet 14 #6): «↓ Πήγε στην Πέμπτη 8/10 — ΠΕΛΑΤΗΣ Α → ΠΑΡΑΛΗΠΤΗΣ Δ +2» at the old position for 10 s; a click scrolls to the new row | before the `renderWeeklyIntl()` of a v4 date save, `WIV2.noteMove(oid, oldDay, label)`. After the paint, the trace is inserted if the day changed. Keyed by order id. |
| 16 | **Search 1/N** (sheet 14 #8): non-matching rows dim (`.wi4-dim`), counter «1/6», Enter = next, Esc clears; matches client, place, plates, driver, ΑΝΑΦ. | `WIV2.search(q)` over `row.truckLabel/driverLabel/partnerLabel/partnerPlates` + the records' `Client Name`, Summaries, `Reference`. `WINTL.filter` is reused as the stored query, so it survives repaints. `_wiApplyFilter` is never called in v4 (it hides rows; v4 dims them). |
| 17 | **Keyboard focus + «?» sheet** (sheet 15 C/D): blue ring only after keyboard use (root class `wi4-kbd`, set on keydown, cleared on mousedown); focus kept in `WINTL.ui.v4Focus = orderId`; «?» opens the shortcuts sheet | `WI4.keyAction` → `WI4Actions.run(action)`, which calls the same openers as clicks. |
| 18 | **Presence** (sheet 16): avatars + «Χρήστης Α, Χρήστης Β · εδώ τώρα · ↻ ζωντανά» in the title bar; the initial replaces the row number for a row someone has open (tooltip «Χρήστης Α · αλλάζει την ημερομηνία φόρτωσης · από 08:41»); note inside the date panel/menu; paused state «Ζωντανή εικόνα σε παύση — δεν ξέρουμε ποιος άλλος είναι μέσα · ξαναδοκιμάζει». **Never «κανείς».** | `WI4Presence.others()`, `WI4Presence.state()` (§g). With `FEATURES.WI_PRESENCE=false`, nothing about presence is drawn at all: no claim either way. |
| 19 | **Conflict dialog** «Ποια κρατάμε;» | §g.4. |
| 20 | **States not designed yet** (Φ8): «φορτώνει», «άδεια εβδομάδα», 1440 width, all days open | tonight: «φορτώνει» = today's spinner and watchdog card (they live in `renderWeeklyIntl`, unchanged); empty week = today's «Άδειο φύλλο — W41» text in wi4 type; 1440 = same grid with `minmax(0,1fr)`, national columns follow the stored toggle (default = as today, open). All flagged for the owner to review against the Figma he still has to draw (§j). |

**Numbering:** continuous per week, as on the board (exports and import-only rows together).
`WINTL._rowNo` is written too, so any old reader stays correct.

**Metrics:** `reportPageMetrics('weekly_intl', …)` with the same keys, from `_wiPaintMetrics`.

---

## f. Drag & drop in v4 (keyed by order id)

| Target | Markup v4 emits | Handler (unchanged) |
|---|---|---|
| import cell of an export row (empty return, partner-only, matched) | `<div id="wi-ci-{row.id}" class="wi4-imp" ondragover="event.preventDefault();this.classList.add('wi4-dh')" ondragleave="this.classList.remove('wi4-dh')" ondrop="event.stopPropagation();_wiDropOnRow(event,{row.id})">` | `_wiDropOnRow` → `_wiDropImport` reads the id from `dataTransfer` (`WI_DND_IMP`): empty cell = match (`_wiSaveImportMatch`), a load = join (`_wiImpJoin`) |
| member points of a group (tiles) | `draggable="true"` + `_wiSegDragStart/Over/Drop/End(event, groupRowId, orderId)`. **The group's own row id**, never the export row it is painted in (the same rule as `_wiRowHTML` 2640). | reorder → `_wiSaveSegOrder`; an import dropped on an import tile → `_wiSegDrop` finds `closest('[id^="wi-ci-"]')` → join |
| whole matched group (grip ⋮⋮) | `ondragstart="event.stopPropagation();_wiImpDragStart(event,'{lead}',true)"` | as today |
| free import row (source) | row `draggable="true" ondragstart="event.stopPropagation();_wiImpDragStart(event,'{impId}')" ondragend="_wiImpDragEnd()"` | as today |
| popover drop zone `#wi-piz-{rowId}` | rendered by `_wiOpenPopover` (old code) | `_wiDropOnPanel` |

Risks and how they are closed:
- **Stale `_wiDragging`.** Since 8/10 the import id travels in `dataTransfer`. v4 never sets
  `window._wiDragging` itself; only `_wiImpDragStart` does.
- **Hover classes.** v4 adds one `document` listener (`dragend` + `drop`) that clears
  `.wi4-dh`. `_wiImpDragEnd` clears only `.wk3-leg.imp.dh`, which v4 does not emit.
- **Edge auto-scroll.** It scrolls `.wk3-sheet` today. v4 adds its own `dragover` listener on
  its scroll container while `window._wiDragging` is set.
- **Stale row ids.** `row.id` is a per-build sequence: `_wiBuildRows` restarts at 1, so an old
  id can point to a **different** row. Inline handlers are always fresh, because every rebuild
  repaints. But anything async that v4 opens (date panel, menu, queue panel, retry) stores the
  **order id** and re-resolves `row.id` with `WIV2.rowIdOf(orderId)` at click time. Focus,
  open days, traces and error lines are all keyed by order id or date.
- **Proof:** the rig runs every target with the `weekly-impjoin-rig` scenarios J1/J2/J9/J10/J16
  and `rota-matched-import-rig` against v4 (§h).

---

## g. Presence and conflict check

### g.1 SQL set 068 (`worker/migrations/drafts/`)
Files: `068_presence.sql`, `068_presence_dryrun.sql`, `068_presence_rollback.sql`,
`068_presence_test.sql`, `068_presence_verify.sql`. One `DO` block each. The header says
«ΔΕΝ ΕΚΤΕΛΕΣΤΗΚΕ — owner, μετά τις 15:00».

```sql
CREATE TABLE public.presence (
  user_sub   text PRIMARY KEY,                       -- JWT sub (username)
  user_name  text NOT NULL,
  role       text NOT NULL CHECK (role IN ('owner','management','accountant','dispatcher','warehouse')),
  board      text NOT NULL CHECK (board IN ('weekly_intl')),
  week       int  CHECK (week BETWEEN 1 AND 53),
  record_id  text CHECK (char_length(record_id) <= 40),            -- order legacy id open, or null
  part       text CHECK (part IN ('truck','export','import')),
  action     text CHECK (char_length(action) <= 40),               -- 'assign' | 'date:Loading DateTime' | 'menu' …
  since      timestamptz,                                          -- when this record/action started
  seen_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.presence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.presence FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.presence TO service_role;
```

- **`presence_beat(p_sub, p_name, p_role, p_board, p_week, p_record, p_part, p_action, p_leave, p_changes_since) RETURNS jsonb`**
  - `SECURITY INVOKER`, `SET search_path = public, pg_temp`;
  - `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated`; `GRANT EXECUTE … TO service_role`.
- **Body:**
  1. `p_leave` → `DELETE` own row and return `{others:[]}`.
  2. Otherwise `INSERT … ON CONFLICT (user_sub) DO UPDATE`. `since` is kept when `record_id`
     and `action` are unchanged, else set to `now()`.
  3. Return `others`: rows with `user_sub <> p_sub AND board = p_board AND seen_at > now() - interval '15 seconds'`.
  4. Return `changes`: `{n, last_by, last_at}` from `audit_log` where `table_name = 'orders'`,
     `actor <> p_sub`, `created_at > p_changes_since`, joined to `orders` with
     `type = 'International'`. This feeds «N αλλαγές από Χ · Ανανέωση».
  5. Housekeeping: `DELETE … WHERE seen_at < now() - interval '1 day'`.
- No audit row per beat: presence is not a data change.
- `_verify`: table exists, RLS on, 0 grants to anon/authenticated/PUBLIC, function `EXECUTE`
  only for `service_role`, `count(*) ≤ 6` (PLAN Φ7).
- `_test`: two subs beat, each sees the other; leave removes the row; a 20-second-old row is
  not returned.
- `_dryrun`: everything in a transaction that ends in `ROLLBACK`.
- `_rollback`: `DROP FUNCTION`, `DROP TABLE`.
- `_verify` also lists the indexes on `audit_log` (`created_at`): the owner sees whether the
  `changes` query needs one before it runs every 5 seconds.

### g.2 Worker (branch `deploy/worker-presence`, never `feat/wi-v4`)
- **Base:** `origin/deploy/worker-temp-cmr` (`bb8ba2db`) = the live Worker `2f2851c0`.
  - Measured: `git diff origin/deploy/worker-temp-cmr origin/main -- worker/src` is empty, so
    main is already synced to it.
  - The undeployed 067 chain (`origin/deploy/worker-stop-delay`, `15458d57`) is **not**
    included: nothing in v4 needs it, and including it would deploy 067 without its own
    owner decision.
  - If 067 is deployed first, this branch is rebased on it before deploy: one chain (rules
    4/10). Check: `git merge-base --is-ancestor <live source> deploy/worker-presence`.
- **`worker/src` on `feat/wi-v4` stays byte-equal to main.** It changes on main only through the
  post-deploy sync commit (rule 1 of 4/10).
- **Changes in `worker/src/index.js`:**
  1. `var PRESENCE_ROLES = ["owner","management","accountant","dispatcher","warehouse"];`
     An explicit list, no wildcard, not part of `PERMISSIONS`. Presence is not a table
     permission, so a future role is born without it (principle 5).
  2. Router, before the facade match (5790):
     `if (url.pathname === "/presence" && request.method === "POST") return handlePresence(request, origin, env);`
  3. `handlePresence`:
     - `getCaller` (401) → role in `PRESENCE_ROLES` (403);
     - parse and validate the body: `board === 'weekly_intl'`, `week` an integer 1–53,
       `record` matching `/^rec[A-Za-z0-9]{6,30}$/` or null, `part` in the set, `action` ≤ 40
       characters, `leave` boolean, `since` ISO or null;
     - name, sub and role are taken **only from the JWT**, never from the body;
     - per-isolate guard: the same sub more often than once per 2.5 s → `429` with
       `Retry-After: 5`;
     - `dbRpc(env, 'presence_beat', …)` → `jsonOk({others, changes, now})`;
     - RPC failure → `jsonError('presence unavailable', 503)` plus `console.error`. Never a
       200 with an empty list.
  4. Conflict check in `handleFacadeUpdate` (3259), after `readRowBefore` (3285) and before
     `dbUpdate`:
     - `body._expect` is a top-level body key, so `buildWriteRow` never sees it and it is
       never logged as an unknown field.
     - At most 12 labels. Each must exist in `cfg.fields`, `cfg.aliases` or `cfg.links`;
       otherwise `400`. A typo must not turn the check off silently.
     - `before === undefined` (the read failed): write as today and answer
       `_expectChecked: "skipped"`. Indication, not a lock: a failed read never blocks work
       at 06:00. The front shows a quiet note.
     - Otherwise `cur = await shapeOneWithLinks(before, cfg, env)`: the same shaping a GET
       produces, so the formats compare like for like. Then
       `diff = labels.filter(l => !expectSame(body._expect[l], cur.fields[l]))`.
     - If `diff` is not empty:
       - read the latest `audit_log` row for `(cfg.pg, recId)` → `{actor, created_at}`;
       - return `jsonOk({error:{type:'conflict', fields:diff, by:actor||null, at:created_at||null, current: pick(cur.fields, labels)}}, origin, env, 409)`;
       - nothing is written.
     - Success: the normal record plus `_expectChecked: true`.
     - `expectSame` mirrors `WI4.sameValue` and runs the shared vectors.
     - Known limit, written in a comment: check-then-write is not atomic. The window is
       milliseconds; presence plus this check is an indication, not a lock (owner, solution A).
     - Requests without `_expect` take exactly today's path.
     - Batch PATCH (`handleFacadeBatchUpdate`) gets no check.
- **Tests** (`worker/test/presence.test.mjs`, `worker/test/expect-conflict.test.mjs`): the real
  bundle in Node with `fetch` stubbed, following `temp-per-cmr.test.mjs`.
  - Presence: 401 without a token · 403 for an unknown role · 400 on a bad body · RPC args
    built from the JWT, not the body · 429 guard · 503 on RPC failure.
  - Conflict: no `_expect` → identical request sequence · matching `_expect` → write +
    `_expectChecked` · mismatch → 409 shape and **no** PATCH to PostgREST · failed
    before-read → `skipped` · unknown label → 400 · the vectors file.
- **Deploy guard markers**, added to CLAUDE.md «σημάδι ανά λειτουργία» only **after** the
  deploy: `PRESENCE_ROLES` and `_expectChecked`.

### g.3 `core/api.js` (applies only to requests that carry `_expect`)
- `atPatch(tableId, recId, fields, opts)`:
  - `opts.expect` → body `{fields, typecast:true, _expect}`. With no `opts` the body is
    byte-identical to today.
  - Offline queueing drops `_expect`: a replay later would compare against a stale read.
    Comment says so.
- `_atRetry(fn, retries, opts)`: with `opts.conflict === true`, a `409` returns immediately,
  with no retry and no toast. Without it, the 409 behaves as today (silent retry → «Save
  failed»), so other pages are untouched.
- `atPatch` with `opts.expect`, on a 409 whose JSON has `error.type === 'conflict'`:
  - throws `Error('conflict')` with `e.conflict = {fields, by, at, current}` and
    `e._noRetry = true`;
  - no `showErrorToast` (v4 shows the dialog);
  - one `logError(…, 'atPatch 409 conflict')`, so `app_errors` keeps a trace.
- `atSafePatch(tableId, recId, fields, opts)`: when `opts.expect` is set, it skips the dormant
  `_recordVersions` check and calls `atPatch(…, opts)`. A conflict error becomes the return
  value `{conflict:true, ...e.conflict}`. That is the shape the three existing
  `if(res?.conflict)` branches already handle.
- **Capability detection:** if a PATCH carrying `_expect` answers 2xx without `_expectChecked`,
  set `window.TMS_EXPECT_LIVE = false` (this Worker ignores the check) and log once. v4 then
  shows, once per session in «Προβολή ▾», «ο έλεγχος "το άλλαξε άλλος" δεν είναι ενεργός
  ακόμη» (principle 1). With `_expectChecked:true` it becomes `true`.
- **Dead code** (PLAN §2.9), decided here and logged in DECISION_LOG:
  - `atTrackVersion`/`atTrackVersions` and the `'Last Modified'` check: no caller since the
    cutover → they go.
  - `atPresenceStart` (local only, called from `app.html:227`) stays for now: other pages read
    its BroadcastChannel cache invalidation. It is not used by v4. Its localStorage half is
    removed in Φ9 with the old board.
- Tests: `tests/api-expect-conflict.test.mjs`, following `api-stock-refusals.test.mjs`:
  - no opts → body has no `_expect`;
  - expect → body has it;
  - 409 conflict → one fetch only and the error carries the fields;
  - 409 without opts → retried as today;
  - `atSafePatch` returns `{conflict:true}`;
  - the offline path drops `_expect`.

### g.4 Front: presence client and dialog
- **`core/wi4-presence.js`** (`WI4Presence`). Started by `WIV2.paint()` only when
  `FEATURES.WI_PRESENCE` is true; stopped when the page changes.
  - Plain `fetch(PROXY_URL + '/presence', {method:'POST', headers:{Authorization, 'Content-Type':'application/json'}, body})`.
    Never `_enqueue` or `_atRetry`: a beat must not queue behind writes or retry.
  - Schedule from `WI4.beatDelay`: 5 s while visible and active (input within 2 min), 30 s
    idle, stop on `visibilitychange: hidden`, resume with an immediate beat.
  - Back-off: 404 means the endpoint is not deployed (60 s → 600 s); 5xx/network 15 s → 120 s;
    429 obeys `Retry-After`. Any failure → state `paused`: «Ζωντανή εικόνα σε παύση».
  - `pagehide` → `fetch(…, {keepalive:true, body:{leave:true}})`.
  - `setContext({week, record, part, action})` from the v4 openers: date panel, menu, popover
    (a `MutationObserver` on `#wi-popover`, owned by v4, so the old popover code stays as it
    is). The beat is sent within 500 ms, debounced.
  - State: `others` (≤ 6), `changes`, `status: 'off'|'live'|'paused'`, `lastOk`.
- **Dialog**, inside the date panel and as a small modal elsewhere:
  - Text: «Ο Χρήστης Α την άλλαξε πριν 5″: Πέμ 8/10 → Παρ 9/10 · Η δική σου επιλογή: Σάβ 10/10. Ποια κρατάμε;»
    The name comes from presence (sub → name) or falls back to the username; `by: null` →
    «άλλαξε από αυτόματη ενημέρωση».
  - **Date panel:** «Κράτα του Χρήστη Α» = re-read the order and repaint · «Γράψε τη δική μου»
    = resend with `_expect = conflict.current`. If it changed again, another 409.
  - **Assignment and match** (old functions, through the hook): «Κράτα του Χ» = re-read and
    repaint · «Ξανάνοιξε την ανάθεση» = re-read, repaint, reopen the popover on the fresh
    truth. The popover's form state is not replayed blindly.
- **Which writes carry `_expect`** (only the decision, not the cascade). Each case sends the
  values the user saw, from `WINTL._seen`, refreshed by `_wiSeenNote` after each successful
  write:
  1. `_wiDateWrite`: `{[field]: seen}`.
  2. `_wiSaveFromPopover`: the **first** PATCH of the action only (3686, primary order;
     `Truck/Trailer/Driver/Partner/Partner Truck Plates/Is Partner Trip`). Group members and
     the matched import follow without `_expect`. A 409 there writes nothing.
  3. `_wiSaveImportMatch`: the first export PATCH (3266): `{'Matched Import ID': seen}`.
  - `_wiExpectOpt` returns `undefined` unless v4 is active, so the old board's requests stay
    identical.
  - Why only changed fields: triggers write `orders`, so comparing whole rows would raise
    false conflicts (PLAN §4).

### g.5 Request budget
- Cloudflare Workers Free = 100,000 requests/day for the whole app.
- Worst case: 6 users × 9 h × 720 beats/h = 38,880/day. With idle and hidden tabs it is far
  lower.
- Tonight the client ships at 5 s / 30 s / stop, behind `FEATURES.WI_PRESENCE=false`. The
  owner's 14-day number decides 5 s vs 10 s or a paid plan (PLAN §5.6) before he turns it on.

---

## h. Test and verification strategy

1. **Units** (`node --test`, from the worktree; no `node_modules` needed):
   - `tests/wi4-logic.test.js`;
   - `tests/api-expect-conflict.test.mjs`;
   - `tests/wi4-menu-parity.test.js`: every handler string of the old builders appears in the
     v4 menu for the same row; the relabel-map keys exist;
   - the updated extracting tests;
   - the Worker tests in `worker/test`.

   Baseline on 626f0820: **410/410** in `tests/*.test.{js,mjs}` and **158/158** in
   `worker/test`. Both must stay green, plus the new ones.
2. **Synthetic fixture week** `tests/fixtures/wi4-week.json`, committed. It holds only invented
   names, plates, drivers and references, and is used by units and rigs. It covers:
   - 1–9 stops, VS export and VS import, groupage export (×3) and import (GI ×2);
   - a matched pair, a partner without import, an empty return at every flag boundary;
   - an import-only own truck, a free import, rota, local relay, split;
   - a pre-order, a lot and a piece, 34 pallets, a same-day clash;
   - a national leg with and without carrier, a date mismatch;
   - an empty day, a «μεταφέρθηκε» row.
3. **Real-week snapshot (local only):** a HAR replay of a real week through
   `tests/critics/auth.js`. It is stored under `.har/` or `.local/`, both git-ignored, and is
   **never committed** (public repo). If no fresh HAR exists tonight, the owner records one in
   the morning (§j). Tonight the synthetic week is the gate.
4. **Rigs** (Playwright, run from the main repo path with `PW_BASE_URL` pointing at the
   worktree; memory note «Κριτές από worktree»):
   - `tests/critics/wi4-identity-rig.js`: flag-off identity (§b).
   - `tests/critics/wi4-board-rig.js`: an in-memory facade, as in `weekly-impjoin-rig.js`; the
     proof is the PATCH bodies and the rows of the fake table, never a toast. Scenarios:
     - paint at 1920×1080 with the sidebar collapsed;
     - every drop target of §f;
     - menu parity, per-load sections, submenus;
     - date panel write (body + `syncOrderDownstream` call);
     - keyboard map; search 1/N; save failure (facade 500); moved-row trace;
     - presence live, paused (404) and 429; conflict 409 for date, assignment and match;
     - `_expectChecked` absent → note;
     - the J1/J2/J9/J10/J16 equivalents of `weekly-impjoin-rig` and `rota-matched-import-rig`
       on v4.
   - **Overflow scan** inside the board rig: every text node under `.wi4` with
     `scrollWidth > clientWidth + 1` must carry a `title` with the full text, or the check fails.
   - **Contrast scan:** computed colour vs background ≥ 4.5:1 for every text node that is not
     a placeholder.
5. **Figma comparison.** The fixture is synthetic, so pixels are not compared. Checked instead:
   - **structure:** grid column x/width within ±1px of 32/140/621/204/621/140 at 1920;
     rows 32/28/24px; fonts, sizes, weights and token colours from computed style;
   - **side by side:** the rig screenshot next to the Figma PNG of 1097:2254 and sheets 14–16,
     reviewed by an independent visual critic who scores and lists differences, in rounds
     until no P1/P2 remains.
6. **The five data-path questions, for every write v4 can trigger** (PR table; SELECT counts
   after the pilot, never writes tonight):

| Action | Endpoint | Table · columns | Proof (rig tonight / SELECT after pilot) | On failure | Role right (`PERMISSIONS`) |
|---|---|---|---|---|---|
| date change | `PATCH /v0/…/tblgHlNmLBH3JTdIM/{rec}` (+ `_expect`) | `orders.loading_datetime` / `delivery_datetime` / `cross_dock_date` (+ downstream sync: `national_loads`, `ramp`, RT by trigger) | PATCH body + read-back; `SELECT loading_datetime … WHERE legacy_id=…` | row re-reads, message stays, `app_errors` | the same as today: orders PATCH for owner/dispatcher/management/accountant; warehouse GET only → 403 |
| assignment | same + PA writes (`partner_assignments`) | `orders.truck_id/trailer_id/driver_id/partner_id/partner_truck_plates/is_partner_trip/partner_rate` | unchanged function `_wiSaveFromPopover` | unchanged + dialog on 409 | unchanged |
| match / join / unmatch | same | `orders.matched_import_id`, `group_id`, vehicle on the import | unchanged functions | unchanged | unchanged |
| groupage reorder | same | `orders.group_id` suffix | `_wiSaveSegOrder` (read-back exists) | toast as today + failure line | unchanged |
| presence beat | `POST /presence` | `presence.*` (068) | `SELECT count(*) FROM presence` ≤ 6 | «σε παύση» | `PRESENCE_ROLES` (all 5) |

7. **Static:** `node --check` on every changed JS file; `tests/critics/static.js` ratchet; grep
   that `worker/src` on `feat/wi-v4` equals `origin/main`.

---

## i. Work breakdown

**File-ownership rule:** one package owns a file for the whole night. Shared files (`app.html`,
`sw.js`, `config.js`, `docs/DECISION_LOG.md`) belong to the coordinator only. Every package
commits on its own branch `wi4/<wp>` cut from `feat/wi-v4`. The coordinator cherry-picks onto
`feat/wi-v4`: no merges (the classifier blocks them), never `main`.

| WP | Owns (exclusive) | Depends on | Parallel? | Acceptance |
|---|---|---|---|---|
| **WP0** coordinator scaffold | `config.js` (flags + `WI_V2_USERS` + `WI_PRESENCE_MS`), `app.html` script tags, `sw.js` `APP_SHELL`, stub headers of the four new files | — | first (minutes) | `node --check`; flag-off app loads, the identity rig baseline is captured |
| **WP1** pure logic | `core/wi4-logic.js`, `tests/wi4-logic.test.js`, `tests/fixtures/wi4-expect-vectors.json` | this doc | yes | every signature in §d; all cases listed in §d pass; node and browser both load it |
| **WP2** old-module seams | `modules/weekly_intl.js`, the extracting tests it must touch, `tests/critics/wi4-identity-rig.js`, `tests/wi4-menu-parity.test.js` | WP0 | yes | §a.4–a.6 exactly; 410/410 units still green; identity rig diff **empty** for board HTML, every menu and every request body |
| **WP3** CSS | `assets/style.css` (wi4 block only), `tests/critics/units.js` + `docs/redesign/baseline.json` entries | this doc | yes | tokens of §c.2; no shared selector changed (`git diff` shows only additions inside the block); ratchet green |
| **WP4** board renderer | `modules/weekly_intl_v2.js` | WP1, WP2 API, WP3 classes (contract: this doc) | yes, against the contract; integrates after WP1/2/3 | §e rows 1–8, 11–16, 18 (avatars) and 20; §f; `WIV2.paint/repaintRow/shelfPaint/onSync/feedTog/conflict/switchHTML/active/rowIdOf`; no hex; no `wk3-*`/`wi2-*` layout classes |
| **WP5** actions | `modules/wi4_actions.js` | WP1, WP2 builders | yes | §e #3, #9, #10, #17, #19; menu-parity test green; date write body equals today's plus `_expect` only when active |
| **WP6** API | `core/api.js`, `tests/api-expect-conflict.test.mjs` | WP1 vectors (optional) | yes | §g.3; every existing api test green; no-opts requests byte-identical |
| **WP7** presence client | `core/wi4-presence.js`, `tests/wi4-presence.test.js` (schedule, back-off, state; fetch stubbed) | WP1 | yes | §g.4; hidden stops, 404 backs off, paused state, never «κανείς» |
| **WP8** Worker | branch `deploy/worker-presence` from `origin/deploy/worker-temp-cmr`: `worker/src/index.js`, `worker/test/presence.test.mjs`, `worker/test/expect-conflict.test.mjs` | WP1 vectors file | yes | §g.2; 158/158 + new tests green; guard markers (the three + `tblStockLots: {` + `"Move Kind": "move_kind"`) still present; **pushed, not deployed** |
| **WP9** SQL | `worker/migrations/drafts/068_presence*.sql` (5 files) | — | yes | §g.1; each file one `DO` block; header «ΔΕΝ ΕΚΤΕΛΕΣΤΗΚΕ»; reviewed by a second agent for grants and RLS |
| **WP10** fixture + board rig | `tests/fixtures/wi4-week.json`, `tests/critics/wi4-board-rig.js` | fixture first (no deps); rig runs after WP4/5 | fixture yes; rig after integration | every case in §h.2; rig scenarios of §h.4 green; overflow and contrast scans green |
| **WP11** integration + evaluation | `feat/wi-v4` cherry-picks, stamps (`?v=` + `SW_VERSION`), `docs/DECISION_LOG.md` entry, `docs/weekly-intl-redesign/` evaluation notes | all | last; repeat | all gates of §h green; independent critics (visual, dispatcher, code review) until no P1/P2 remains; flag still `false` |

Order of the night:
1. WP0.
2. In parallel: WP1, WP2, WP3, WP6, WP7, WP8, WP9 and the WP10 fixture.
3. WP4 and WP5 (they may start on the contract while 2 runs).
4. WP10 rig.
5. WP11 loops: evaluate → fix → re-evaluate.

---

## j. For the owner in the morning (nothing below is done tonight)

1. **Cloudflare number.** Requests/day over the last 14 days, max and average (dashboard →
   Workers → petras-tms-backend-staging → Metrics). It decides 5 s vs 10 s or the paid plan
   (PLAN §5.6). Until then `FEATURES.WI_PRESENCE=false`.
2. **SQL 068**, after 15:00:
   - `_dryrun` → `068_presence` → `_verify` → `_test`;
   - check that `audit_log(created_at)` has an index before presence goes live.
3. **Worker deploy** of `deploy/worker-presence`, after 15:00, with the full guard before and
   after (the three, `tblStockLots: {`, `"Move Kind": "move_kind"`), bindings checked through
   the CF API, then smoke: login, one save, one `POST /presence`. After it:
   - sync `worker/src` + `worker/test` to main;
   - add `PRESENCE_ROLES` and `_expectChecked` to CLAUDE.md as feature markers.
   - If 067 goes first, the branch is rebased on it before the deploy.
4. **Review of `feat/wi-v4`:** SHA to the coordinator → independent reviewer → GO →
   fast-forward to main with the flag **closed**, then `cmp` on Pages.
5. **Pilot:** which dispatcher (PLAN §5.1). Then `WI_V2_USERS=['…']`, or `?wi4=1` on that
   browser. One day; then count `app_errors` and Cloudflare requests.
6. **Open questions**, one at a time:
   - ←/→ stay week (tonight: yes) and E/I choose export/import, or the reverse? (§5.2)
   - order form beside or over the board (§5.3; tonight: over, as today);
   - «στάλθηκε στον οδηγό» (§5.4; not built — needs a new column);
   - 067 «Καθυστέρηση» (§5.5; hidden until then);
   - 1440: national columns closed by default? (§5.7; tonight: as today);
   - Φ8 Figma for «φορτώνει», empty week, all days open, 1440 (tonight: minimal versions,
     marked for review);
   - drag reorder of the stops of a **single** order (sheet 14 «Αλλαγή σειράς σημείων»): it
     would be a new write to `order_stops`, so it is **not built**. Groupage member reorder
     works through the existing `_wiSaveSegOrder`;
   - distance «≈ km» in the match list (rules sheet): needs coordinates, not built.

**Safe defaults tonight:**
- `FEATURES.WI_V2=false`, `WI_V2_USERS=[]`, `FEATURES.WI_PRESENCE=false`;
- conflict check self-detecting through `_expectChecked`;
- E/I enabled, ←/→ unchanged;
- «Καθυστέρηση» hidden;
- no role gate added or removed: `_wiBlockReadOnly` is called exactly where the old openers
  call it;
- partner rates visible as today;
- no auto-match;
- status vocabulary unchanged.
