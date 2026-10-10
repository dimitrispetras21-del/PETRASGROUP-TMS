# Weekly International v4: technical design (one-night build, closed flag)

Date: 10/10/2026 (night) · Author: principal engineer (Claude) · Branch: `feat/wi-v4`
Based on: `origin/main 626f0820` · Plan: `docs/weekly-intl-redesign/PLAN.md` (Φ0–Φ9) ·
Decisions: `docs/DECISION_LOG.md`, entries dated 2026-10-09 and 2026-10-10.
Figma `KO7l2AfucR3HJEDIg1Yptr`: board «ΕΚΔΟΧΗ 9/10» `1097:2254`, sheet 14 `1064:2254`,
sheet 15 `1115:2653`, sheet 16 `1123:2716`, rules sheet `958:747`. All of them were read for
this document with the Figma MCP, read-only.

**Revision 2 (10/10 night, review round 1).** 44 findings (2 P1, 21 P2, 21 P3). 43 were
fixed in place, and 1 was partly rejected because one of its examples is factually wrong.
Every finding was checked against the code, and §k «Review log» records the outcome. The biggest changes are these:
- a failed save no longer rebuilds rows (§e.14);
- `FEATURES.WI_V2` is a real kill switch with three states (§b);
- the v4 fallback is sticky (§a.4);
- the separate `_seen` snapshot is gone, and `_expect` is read from `WINTL.data` (§g.4);
- the conflict check is an atomic compare-and-set (§g.2);
- presence has a TTL, a whitelist, a key per tab and a server-side lever (§g.1, §g.2, §g.5);
- NO_TRUCK is never silent (§d.2);
- unknown data has its own state (§d.2a);
- E/I are not bound (§d.4).

> **Σύνοψη για τον owner.** Χτίζουμε απόψε όλο το νέο Εβδομαδιαίο (Φ0–Φ8) σε **νέα αρχεία**,
> πίσω από τον διακόπτη `FEATURES.WI_V2 = 'off'`. Με τον διακόπτη κλειστό ο σημερινός πίνακας
> μένει ίδιος byte-προς-byte, και το αποδεικνύουμε με αυτόματη σύγκριση HTML. Κάθε εγγραφή
> της νέας προβολής καλεί τις **ίδιες** συναρτήσεις με σήμερα. Τίποτα δεν αντιγράφεται.
> Το SQL 068, το deploy του Worker, ο αριθμός αιτημάτων του Cloudflare και το άνοιγμα του
> διακόπτη μένουν για σένα το πρωί (§j). Κανένας ρόλος δεν κερδίζει και δεν χάνει δικαίωμα.
> Ο διακόπτης έχει τρεις θέσεις (`'off'|'pilot'|'on'`). Στο `'off'` η νέα προβολή δεν ανοίγει
> σε κανέναν, ακόμη κι αν κάποιος τη δοκίμασε πριν.

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

All four files also go into `sw.js` `APP_SHELL`. One wrong path there fails `cache.addAll`, and
with it the whole service-worker update. So WP0 adds a static check
(`tests/sw-app-shell.test.js`): every `APP_SHELL` entry exists on disk.

**Frozen contract stub (WP0).** `tests/wi4-contract.stub.js` lists every signature of
`WI_INTERNAL`, `WIV2` and `WI4Actions` as no-op stubs with JSDoc. That includes the cycle
between the last two: `WIV2.rowIdOf`, `WIV2.conflict`, `WI4Actions.openRowMenu`,
`WI4Actions.conflictDialog` and `WI4Actions.datePanel`. It also lists the `core/api.js` opts
shapes: `atPatch(t,id,f,opts)`, `atSafePatch(t,id,f,opts)` and `_atRetry(fn,retries,opts)`.
- WP2, WP4, WP5 and WP6 write unit tests against it.
- `tests/wi4-contract.test.js` asserts that each real module exports every name in the stub,
  with the same arity.
- A signature change is a coordinator commit to the stub, never a silent drift between
  packages.

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
    extracts it is `tests/wi-weekly-doors.test.js`. That test adds `'_wiDateWrite'` to `NAMES`.
    `_wiDateWrite` calls `_wiExpectOpt`, so the test also adds `_wiExpectOpt: () => undefined`
    to its vm world. Without it, `await inp.onchange()` (line 100) throws inside the try,
    `reportError` fires and the patch assertions fail.
  - `_wiSaveImportMatch` and `_wiSaveFromPopover`: each gains one `_wiExpectOpt(...)` argument
    on its first PATCH. The tests that extract them (`tests/weekly-impjoin.test.js` and any other
    that greps them) stub `_wiExpectOpt: () => undefined`. That is exactly the flag-off
    behaviour. There is no `_wiSeenNote` any more (§g.4).
  - `tests/critics/units.test.js:11` asserts `UNITS.length === 13`. WP3 owns that file and
    changes the count to 14 when it adds the `weekly_intl_v2` unit.
- **Formatting rule for every new function in `weekly_intl.js`:**
  - `function name(...){` at column 0, with **no space before `{`**. The `many` regex in
    `weekly-stock-round0/1`, `weekly-impjoin` and `own-rt-join` is `\)\{`, without the ` ?`
    that the doors regex has.
  - the closing `}` alone at column 0, followed by a newline.

  Every existing extracting regex can then capture the new functions.
- `WI_SRC=<path>` already lets a test run against another copy of the file. The identity rig
  (§h) uses the same idea for HTML.

### a.4 Hooks added to `weekly_intl.js`
Each hook is a single statement and inert when v4 is off. `_wiV2Active()` is:
`typeof WIV2!=='undefined'&&WIV2.active()`.

`WIV2.active()` is true only when **all** of these hold:
- the decision of §b is v4;
- `WIV2._broken !== true`;
- `currentPage === 'weekly_intl'`.

| Where (origin/main line) | Hook | Why |
|---|---|---|
| `_wiPaint` 1082, first line | `if(_wiV2Active()&&WIV2.paint()!==false) return;` | `renderWeeklyIntl`, relay/carrier/docs late loads and ~15 write paths repaint through `_wiPaint`. If `WIV2.paint()` throws, it returns `false` and the old board paints. **The fallback is sticky:** it sets `WIV2._broken = true` for the rest of the session, so `active()` is false until reload. It shows one banner («Η νέα προβολή απέτυχε — δείχνουμε την παλιά μέχρι την επόμενη φόρτωση») and sends one `logError`. Every other hook (`_wiRepaintRow`, `_wiShelfPaint`, `_wk3FeedTog`, conflicts) then routes to v1 against v1 DOM, never to v4 against a board it did not draw. |
| `_wiRepaintRow` 2811, first line | `if(_wiV2Active()) return WIV2.repaintRow(rowId);` | Used by popover and assignment paths. |
| `_wiShelfPaint` 7022, first line | `if(_wiV2Active()) return WIV2.shelfPaint();` | It looks for `#content .wk3.wi2` and silently does nothing otherwise. The stock read lands after the first paint, so v4 would never show the strip. |
| `_wiSync` 2293, after the `_syncLog` write | `if(_wiV2Active()) WIV2.onSync(oid,state,msg);` | **Only records and redraws the title-bar counter and the message lines** (§e.14). It never calls `_wiBuildRows`, never replaces a record and never runs a full paint. The old function that called `_wiSync` is often still running with a live `row` and a popover keyed by `row.id`. |
| `_wk3FeedTog` 8003, last line | `if(_wiV2Active()) WIV2.feedTog(side);` | It toggles classes on `.wk3`, which v4 does not have. The localStorage keys `tms_wk3_fl/fr` stay the one memory. |
| the three `if(res?.conflict)` branches (3267, 3687, 3695) | `if(_wiV2Active()) return WIV2.conflict(res,ctx);` placed before today's toast, with `ctx = {slot:'wi-sync-'+rowId, orderId, kind:'match'\|'assign'}` | Today they toast and re-render. `WIV2.conflict` **first undoes what the old function left behind**, and only then asks «Ποια κρατάμε;». See the order below the table. |
| `renderWeeklyIntl` national-carrier fetch 700–714 | `WINTL.data.nlState='loading'` next to `nlBySrc = nlMap`; `='ok'` after the map fills, or when there are no VS ids; `='err'` in the `didFail` branch. In the end states where today's code does not paint ('err', or an empty result), add `if(_wiV2Active()) _wiPaint();` so v4 can leave «φορτώνει» | Today a failed read leaves an empty map and no state, and nothing repaints. v4 would turn that absence into «σκέλος χωρίς μεταφορέα» (facade trap 2). v1 never reads `nlState` and gets no extra paint, so its HTML and behaviour stay identical (an extra v1 paint would close an open popover). The identity rig proves it. |
| `_wiCrossWeekIncoming` (new, §a.5) | resolves `{recs, ok:boolean}` | The v1 chip keeps its silent behaviour. The v4 queue needs to know when W+1 is unknown (§e #2). |
| `_wiPaint` mast markup | `${typeof WIV2!=='undefined'?WIV2.switchHTML():''}` | Returns `''` unless §b allows the switch. Inserted **inline at an existing token boundary**, never on a line of its own, so no whitespace is added to `#content.innerHTML`. The identity rig diffs the HTML byte for byte. |

**`WIV2.conflict(res, ctx)`, in this order:**
1. `_wiSync(ctx.slot, '')`: the slot leaves 'pend', so there is no endless ⟳ and `_syncLog`
   tells the truth.
2. Close `#wi-popover` (`_wiClosePopover`). The disabled Save button and its spinner
   (3664–3665) go with it.
3. `await renderWeeklyIntl()`: the screen goes back to server truth, as it does today. That
   removes the optimistic match that `_wiSaveImportMatch` painted.
4. Show «Ποια κρατάμε;», keyed by `ctx.orderId`. **Closing it (Esc, ×, outside click) means
   «Κράτα του Χ»**, which is what is already on screen after step 3.

This happens in v4 only. With v4 inactive, the hook falls through to today's toast and
re-render.

**Every v4 `document` listener** (keyboard, drag cleanup, edge scroll, resize) starts with
`if(!WIV2.active()||!document.querySelector('#content .wi4')) return;`. SPA navigation does
not remove document listeners, and a v4 key must never act on another page or on the v1
fallback.

### a.5 Extractions inside `weekly_intl.js` (same output, now callable)
| New function | Extracted from | Used by |
|---|---|---|
| `_wiDateWrite(orderId, field, curIso, ymd, hhmm?)` → `{ok, rec, conflict?}` | the `inp.onchange` body of `_wk3PickDate` 1976 | `_wk3PickDate` (unchanged behaviour) and the v4 date panel |
| `_wiPaintMetrics()` → `{expRows, impRows, impPlan, …, metrics}` | top of `_wiPaint` 1083–1117 | `_wiPaint` (same `reportPageMetrics` call) and `WIV2.paint` |
| `_wiCrossWeekIncoming(week)` → `Promise<{recs, ok}>` | the T4 fetch at the end of `_wiPaint` 1235 | the v1 chip (reads `recs`, same output as today) and the v4 queue (W+1 loads today/tomorrow; `ok:false` becomes a queue item, §e #2) |
| `_wiCtxItems(row)`, `_wiImpCtxItems(row, matchedExportRowId)`, `_wiSegCtxItems(rowId, orderId, isImp)`, `_wiPreCtxItems(row)`, `_wiLotCtxItems(row, isImp)`, `_wiLegCtxItems(legOid)`, `_wiRelayCtxItems(relayId, oid)`, `_wiSplitHeaderCtxItems(row)` → HTML string | the item-building half of `_wiCtx` 4472, `_wiImpCtx` 5678, `_wiSegCtx` 6368, `_wiPreCtx` 4547, `_wiLotCtx` 7069, `_wiLegCtx` 5316, `_wiRelayCtx` 5609, `_wiSplitHeaderCtx` 1587 | the old openers (same HTML, then the same show code) and the v4 per-load menu |
| `_wiExpectOpt(orderId, fields)` | new | conflict check (§g.4). Returns `undefined` when v4 is off, so requests stay byte-identical. When v4 is on, it reads the record from `WINTL.data` (exports, imports, adj). `WINTL.data` is the server read the row was painted from, never the optimistic `row.*` fields. It returns `undefined` when the record is missing (for example a group member from another week) or when none of `fields` is checked. **No second copy of the data** (principle 3): there is no `_seen` snapshot and no `_wiSeenNote`. |

### a.6 `WI_INTERNAL`: the explicit API (name → origin/main line)
Added once, at the end of the IIFE, with `Object.freeze`. v4 never calls an underscore function
through `window.*` directly, even when one is exported: the API object is the one list to keep
in sync (principle 3).

**State and data**
`WINTL` (33) · `renderWeeklyIntl` 616 · `buildRows` = `_wiBuildRows` 793 ·
`boardImpRows` = `_wiBoardImpRows` 1079 · `pendingExps` = `_wiPendingExps` 1058 ·
`jumpFirstPendingExp` 1061 · `gaps` = `_wk3Gaps` 1038 · `paintMetrics` (new) ·
`crossWeekIncoming` (new) · `moreStops` = `_wk3MoreStops` 1946 · `css` = `_WI2_CSS` 212 (v4
injects it for the reused popover and the global panel rules; see §c.3 for the `.wk3.wi2`-scoped
part that does not apply).

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
- Sync state: `sync` = `_wiSync` 2293 · `expectOpt` (new).

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
| group member tiles do **not** carry `wk3-seg` | `.wk3-seg` is a global rule with `clip-path` and flex sizing (style.css 7404–7414), so emitting it would pull in old layout. `_wiSegDrop`/`_wiSegDragEnd` clear only `.wk3-seg.dragover` (6274). So v4's own document `dragend`+`drop` listener clears `.wi4 .dragover, .wi4 .dragging, .wi4 .wi4-dh` (§f). |

---

## b. Flag, opt-in, identity

- `config.js`, next to `FEATURES` (377):
  - `FEATURES.WI_V2 = 'off'` (three states, below), `FEATURES.WI_PRESENCE = false`;
  - `const WI_V2_USERS = []`: pilot usernames, as in PLAN §2.1;
  - `const WI_PRESENCE_MS = { active: 5000, idle: 30000, idleAfter: 120000 }`.
  Every new value is born closed (principle 5).
- **Per-browser opt-in:**
  - `app.html?wi4=1#weekly_intl` stores `localStorage['tms_wi4']='1'`;
  - `?wi4=0` stores `'0'`.
  - `weekly_intl_v2.js` reads the parameter once at load and then removes it with
    `history.replaceState`, so a copied link does not spread it.
  - Every localStorage access goes through try/catch. Storage that throws counts as no opt-in.
- **The flag has three states:** `FEATURES.WI_V2: 'off' | 'pilot' | 'on'`. Tonight it ships
  as `'off'`.
  - `'off'` is a central kill switch. It overrides every opt-in. A browser that once loaded
    `?wi4=1` still gets the old board, and the owner never has to ask each user to visit
    `?wi4=0`.
  - Any other value, including a typo, `true`, `undefined` or a stale cached `config.js`
    without the key, is read as `'off'` (principle 5: unknown = closed). One `console.warn`
    names the bad value.
- **Decision** (pure, `WI4.v2Decide({flag, pilot, user, optIn})`):
  1. `flag` is not `'pilot'` and not `'on'` → old board, whatever `optIn` says;
  2. `optIn==='0'` → old board;
  3. `flag==='on'` → v4;
  4. `flag==='pilot'` → v4 if `optIn==='1'` or `pilot.includes(user)`, else old board.
  - Unit cases: `'off'`+`'1'` → old · `'off'`+pilot user → old · `true`+`'1'` → old ·
    `'pilot'`+`'1'` → v4 · `'pilot'`+nothing → old · `'pilot'`+pilot user → v4 ·
    `'pilot'`+pilot user+`'0'` → old · `'on'`+`'0'` → old · `'on'`+nothing → v4.
- **Visible switch:**
  - v4 mast: «Παλιά προβολή» inside «Προβολή ▾».
  - v1 mast: «Νέα προβολή», only when the flag is `'pilot'`/`'on'` **and** either
    `tms_wi4==='0'` (someone who opted in and went back) or the user is a pilot user. Each
    switch sets the key and calls `renderWeeklyIntl()`.
  - With `'off'`, nobody sees either switch.
- **Byte identity with the flag `'off'`, with or without opt-in.** Proof (WP2, `tests/critics/wi4-identity-rig.js`):
  1. Two worktrees are served by the same static server: baseline = `origin/main`, candidate =
     `feat/wi-v4`. The same in-memory facade serves the synthetic fixture week (§h) and the
     clock is frozen.
  2. Capture `#content.innerHTML` after `renderWeeklyIntl()` settles: relays loaded, carriers
     loaded, stock loaded.
  3. For every row, capture `#wi-ctx.innerHTML` after calling, with a synthetic event:
     `_wiCtx`, `_wiImpCtx`, `_wiMatchedImpCtx`, `_wiSegCtx` (per member), `_wiLegCtx`,
     `_wiRelayCtx`, `_wiSplitHeaderCtx`. `_wiPreCtx` and `_wiLotCtx` are not on `window`, so
     they are reached through `_wiCtx`/`_wiImpCtx` on the pre-order and lot rows of the
     fixture, which is how users reach them.
  4. Script one date change, one assignment save and one match. Capture every facade request
     body.
  5. Capture every `reportPageMetrics` call (arguments) and `WINTL._busy` after the paint. The
     side effect moves into `_wiPaintMetrics`, so both must match.
  6. **Zero v4 activity at load with the flag `'off'`.** Before the scripts load, the rig wraps
     `addEventListener` (window and document), `setInterval`, `setTimeout`, `fetch` and
     `MutationObserver`, and records each caller's script URL from the stack. Each of the four
     new files may only define its global. Any listener, timer, observer or fetch from those
     files fails the rig.
  7. The diff of all captures must be empty. Any byte of difference is a NO-GO.
  8. Steps 2–7 run twice: with no `tms_wi4` key, and with `tms_wi4='1'`. With `'off'`, the
     opt-in must change nothing.

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
  The `units.test.js` count goes from 13 to 14 in the same commit (WP3).
- The `styles` unit counts **hex and truncation** in `assets/style.css` (baseline `hex 442`,
  `truncate 28`). WP3 raises each allowance by the exact number it adds, with a `_note` per
  field:
  - `hex`: only the genuinely new values of §c.2 (every token that equals an existing one is a
    `var(...)` and adds 0);
  - `truncate`: the `text-overflow: ellipsis` rules used.

  With a raise for only one of the two, the ratchet stays red. WP3 is accepted only with
  `static.js` green.

### c.2 Tokens (on `:root`; values measured on board 1097:2254)
**Rule: one value, one source.** Where a measured value equals a token that already exists in
`assets/style.css`, the wi4 token is `var(--existing)` and adds no hex (principle 3). WP3 runs
a case-insensitive check: a new hex literal in the wi4 block may equal an existing token's value
only when the meaning differs, and then it is named in the `_note` with that reason.

| Token | Value | Use |
|---|---|---|
| `--wi4-ink` | `var(--surface-dark)` (`#0B1929`, the sidebar navy) | line 1, titles |
| `--wi4-grey-1` | `#344054` (new) | secondary strong text, tab labels |
| `--wi4-grey-2` | `#5b6b7f` (new) | line 2, column headers, meta (5.3:1 on white) |
| `--wi4-grey-3` | `#98a2b3` (new) | placeholders, disabled. **Never for information text** (2.6:1). |
| `--wi4-icon` | `var(--text-dim)` (`#94A3B8`) | icons, arrows, ✓ (never text: 2.57:1) |
| `--wi4-line` | `#eef1f5` (new) | row separator |
| `--wi4-line-2` | `var(--border)` (`#E2E8F0`) | bar borders |
| `--wi4-ctl` | `#d0d5dd` (new) | button borders |
| `--wi4-slot` | `#cbd5e1` (new) | dashed empty slot |
| `--wi4-red` | `var(--danger)` (`#B91C1C`) | rail «τώρα», «ΠΡΟΣ ΑΝΑΘΕΣΗ» border, red words |
| `--wi4-red-bg` | `#fef2f2` (new) | unassigned box, red chips |
| `--wi4-red-ink` | `var(--unassigned)` (`#7F1D1D`) | text on red-bg |
| `--wi4-amber` | `#b45309` (new) | rail «προσοχή» (dashed), amber words |
| `--wi4-amber-bg` | `#fff7ed` (new) | amber chips, national leg «ΠΡΟΣ ΑΝΑΘΕΣΗ» |
| `--wi4-amber-ink` | `#7c2d12` (new) | text on amber-bg |
| `--wi4-delay-bg` | `var(--warn-bg)` (`#FEF3C7`) | «+4ω» chip |
| `--wi4-own` | `#eef2f6` (new) | own-fleet assignment box |
| `--wi4-partner` | `#ddefe3` (new) | partner box |
| `--wi4-partner-line` | `#bfdcc9` (new) | partner border |
| `--wi4-partner-ink` | `#14532d` (new) | partner line 1 |
| `--wi4-partner-sub` | `#3f6b52` (new) | partner line 2 |
| `--wi4-blue` | `#027bbd` (new; same literal as `--map-cli-1`/`--ceo-accent-deep`, map and CEO palettes → listed in the `_note`) | today/future date chip border, focus ring, selection |
| `--wi4-blue-ink` | `var(--accent-text)` (`#0369A1`) | link text, date chip text |
| `--wi4-chip` | `#f1f5f9` (new; same literal as `--border-row`, different meaning → listed in the `_note`) | neutral or estimated date chip |
| `--wi4-split-hd` | `var(--bg-row-alt)` (`#F8FAFC`) | split frame header |
| `--wi4-hover` | `#f6f9fc` (new) | row hover |

**«Unassigned» keeps the system meaning.** The design system's `--unassigned` is `#7F1D1D`
(CLAUDE.md: dark red for an unassigned card), and v4 does not redefine it.
- The v4 «ΠΡΟΣ ΑΝΑΘΕΣΗ» box draws with `--wi4-red-bg` fill, a `--wi4-red` (= `--danger`)
  border and `--wi4-red-ink` (= `--unassigned`) text. The system colour therefore stays the
  ink of the word.
- There is **no** `--wi4-unassigned` alias, so nobody can read it as a second definition of
  «unassigned».
- The softer box (light fill instead of the solid dark-red card) is the ΕΚΔΟΧΗ 9/10 choice,
  which still waits for the owner's pick (§j.6). Until he picks it, it lives only behind the
  flag.

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
- v4 injects `WI_INTERNAL.css` (`_WI2_CSS`) once, like `_wiPaint` does. Only some of it
  applies, though:
  - The **global** part does: the popover shell (`.wi-pop*`, `.wi2-piz`, `.wi2-pop-*`) and
    `.wi-lane-*` (style.css, per the comment at `_WI2_CSS` ~515).
  - The **`.wk3.wi2`-scoped** part does **not**: `.wk3.wi2 .wi-ctx-h` (325) and every
    `.wk3.wi2 .wi-rly-*` (341–361). Panel bodies in `#wi-panel` may also rely on
    `.wk3`-scoped rules.
- The fix: the board rig compares computed styles (font family, size, weight, colour,
  background, padding, border) of every child of `#wi-ctx`, `#wi-panel` and `#wi-popover`
  between v1 and v4, for each menu and each panel the fixture can open. Where they differ, WP3
  adds a `.wi4`-rooted equivalent in the wi4 block. The overlays live outside `.wi4`, so these
  rules are keyed on `body.wi4-on` (a class v4 sets while it is active and removes on page
  change). The overlays are **never** wrapped in `.wk3.wi2`, because that would also pull in
  the old layout rules.
- v4 markup never uses a `wk3-*` or `wi2-*` layout class, so those global rules cannot touch it.
- The only legacy class names v4 emits are the contract hooks of §a.7: `wi-sync`, `wk3-prt`,
  `wi2-gapstk`, `wi-b-ap`, and `wi-ctx-i` for menu items (§e #9). Each sits inside a `.wi4-*`
  wrapper, or inside `#wi-ctx`, which sets its size.

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
  7. A click on «+N» opens the full list through the existing `_wk3MoreStops(str, arr, kind)`
     (1946), the same as today's «+N». The `title` of the chip lists the hidden stops.
- **Measured outcome at 1920:** with both national columns open, a points column is about
  207–217px. Four points need `4×56 + 3×8 = 248px`, so on the main screen a 4-stop column
  shows 3 + «+1». All 4 show only with the national columns collapsed (about 310px each).
  The rule allows this («μόνο αν ούτε έτσι χωράνε»), but the owner said «ως 4 σημεία
  φαίνονται όλα», so it goes to him before the pilot (§j.6). 4-stop orders are 3% of the 300
  measured.
- **Cases:** 1/2/3/4 stops at 207px · 4 stops at 200px (→ 3 + «+1») · 5 and 9 stops ·
  4 stops at 170px with places hidden · single loading with `dateTick` (no ✓ on the point) ·
  two stops, both done (✓ on each) · delay chip «+4ω» kept on a shown point.

### d.2 Flags: `WI4.flags(facts, today) → {level:'red'|'amber'|null, reasons:[{code, level, text, act}]}`
- `facts` is built impurely in v4 (`WIV2.factsOf(row)`) from the row and its records:
  ```
  {kind:'export'|'import'|'leg'|'split'|'relay', saved, partner, loadDate, delDate,
   returnDate, hasReturn, natLegs:[{side:'to'|'from', date, carrier:boolean}],
   natState:'loading'|'ok'|'err', stockState:'loading'|'ok'|'failed'|null,
   pallets, vsCdDate, natDelDate, sameDayClash:string|null, late:boolean,
   preorder:{level}|null, syncErr:string|null, executing:boolean}
  ```
- **One function, three readers:** the row rail, the day header and the queue all read it
  (principle 3). The reasons:

| code | level | rule (rules sheet 958:747 + «ΕΚΔΟΧΗ 9/10») | words (today's vocabulary) |
|---|---|---|---|
| `NO_TRUCK` | red if `loadDate ≤ today+1` (past included); **amber otherwise, never none** | unassigned export or own import | «χωρίς φορτηγό» |
| `EMPTY_RETURN` | none while `returnDate > today+2`; amber `today ∈ [R−2, R]`; red `today > R` | own truck, no import (`hasReturn=false`, `partner=false`) | «κενό γύρισμα · από <μέρα> · τόπος» |
| `NAT_NO_CARRIER` | red if leg date `≤ today+1`; amber otherwise. **Only when `natState==='ok'`** (§d.2a) | a national leg without carrier | «σκέλος χωρίς μεταφορέα» |
| `NAT_UNKNOWN` | amber, one per board (not per row) | `natState==='err'` | «Τα εθνικά σκέλη δεν φορτώθηκαν — δεν σημαίνει ότι δεν έχουν μεταφορέα» |
| `SOURCE_UNKNOWN` | amber, one per failed source | W+1 cross-week read (`ok:false`), relays (`WINTL.relay.state==='err'`), stock read (`WINTL.data.stock.status==='failed'`) | «Δεν φορτώθηκε: <πηγή> — δεν σημαίνει ότι δεν υπάρχουν» |
| `DATE_MISMATCH` | amber | VS import reaches Βέροια after its national delivery date (or an export's VS CD date before its national loading) | «ασυνέπεια ημερομηνιών» |
| `OVER_33` | amber | pallets > 33. 33 is allowed (decision 9/10). | «πάνω από 33π» |
| `SAME_DAY` | amber | `sameDayClash` (from `_wiSameDayConflict`) | the existing sentence |
| `LATE` | amber | `Delivery Performance = Delayed` | «καθυστέρηση» |
| `PREORDER` | `preorderLevel` (≤1 day red, 2–3 amber, else none) | unconverted pre-order | «pre-order χωρίς μετατροπή» |
| `SAVE_FAILED` | red | `syncErr` | «δεν αποθηκεύτηκε» |

- Not flags: a past date without ✓ is grey «δεν δηλώθηκε» on the chip (status lag ≠ delay,
  rules sheet); a partner without import shows «Μόνο εξαγωγή · συνεργάτης».
- `level` = the worst reason.
- **Why NO_TRUCK is never silent.** Every «ΠΡΟΣ ΑΝΑΘΕΣΗ» box is the strongest element on the
  board, and the locked rule is «λωρίδα, λέξη, κεφαλίδα, μετρητής = ίδιο επίπεδο». A box with
  no rail, no day count and no queue item would break that rule. It would also make the
  «χωρίς φορτηγό» total smaller than today's «εκκρεμή» count (`_wiPaint` counts every pending
  row). The ΕΚΔΟΧΗ 9/10 rule is «κόκκινο μόνο για σήμερα–αύριο»: further out is amber, not
  nothing, the same shape as `NAT_NO_CARRIER`. If the amber volume worries anyone, that is an
  owner question, never a silent cutoff.
- **EMPTY_RETURN vs Figma:** the rules sheet makes «από σήμερα» amber (`today ∈ [R−2, R]`),
  while board 1097:2254 and sheet 15 draw it red under ΤΩΡΑ. The rules sheet wins tonight. The
  mismatch goes to the owner (§j.6) and into the visual critic's brief, so it is not
  reported as a defect.
- **Cases:** each code at the boundaries (today−1, today, today+1, today+2, today+3, today+6) ·
  NO_TRUCK at today+3 and today+6 → amber · a partner row never gets `EMPTY_RETURN` · an
  executing row with no truck · two reasons → worst wins · `natState` 'loading' and 'err' → no
  `NAT_NO_CARRIER` on any row, and on 'err' exactly one `NAT_UNKNOWN`.
- **Fixture invariant:** every «ΠΡΟΣ ΑΝΑΘΕΣΗ» box in the fixture paint has a rail and a queue
  item, and the board rig asserts it.

### d.2a Unknown ≠ empty (rules sheet «Άγνωστο ≠ άδειο»)
Data that has not been read is never drawn as «χωρίς ανάθεση», 0 or blank (facade trap 2,
principle 1).

| Source | State seam | While loading | On failure |
|---|---|---|---|
| national legs (`nlBySrc`) | `WINTL.data.nlState` (§a.4 hook) | national cells show «—» with title «δεν φορτώθηκε ακόμη»; no flag, no count | cells «—» with title «απέτυχε — δεν σημαίνει ότι δεν έχουν μεταφορέα»; one `NAT_UNKNOWN` queue item; day headers say «εθνικά σκέλη: δεν φορτώθηκαν» instead of a count |
| stock | `WINTL.data.stock.status` (exists) | strip as today (`_wiShelfInner` already renders loading) | strip as today (failed text) + one `SOURCE_UNKNOWN` |
| relays | `WINTL.relay.state` (exists) | relay items closed, as today | the banner of §e #21 + one `SOURCE_UNKNOWN` |
| W+1 loads | `_wiCrossWeekIncoming().ok` | not counted yet | one `SOURCE_UNKNOWN` «φορτώσεις W+1»; the queue counter shows «≥N» |
| documents | none (`OrderDocs.preloadIndex` swallows failures, order-docs.js 134) | paperclip absent, as today | paperclip absent, as today. Documents are **never** used in a flag, count or queue item, so their absence claims nothing. Adding a state to order-docs.js is out of scope tonight (§j). |

Totals and the queue are recomputed when each source lands. While a source is 'loading',
the queue header carries «φορτώνει…» after the number, so a jump is announced, not silent.

### d.3 Day header and queue
- `WI4.dayCounts(rowsFacts, today) → {trucks, byCode:{NO_TRUCK:n, …}, todayEmpty:n}`.
  - Text: «4 φορτηγά · 1 κενό γύρισμα (3 ημέρες) · 1 σκέλος χωρίς μεταφορέα».
  - **Plurals, from one table `WI4.PLURAL`** (decided copy, round 11):
    `φορτηγό/φορτηγά` · `φορτίο/φορτία` · `κενό γύρισμα/κενά γυρίσματα` ·
    `σκέλος χωρίς μεταφορέα/σκέλη χωρίς μεταφορέα` · `εκκρεμές/εκκρεμή` ·
    `επείγον/επείγοντα` · `ημέρα/ημέρες`. `WI4.plural(n, key)` → «1 κενό γύρισμα»,
    «2 κενά γυρίσματα».
  - **Parenthesis rule for empty returns:** «(N από σήμερα)» when N of them start today, else
    «(N ημέρες)» with the oldest gap in days. Figma: «2 κενά γυρίσματα (1 από σήμερα)».
  - Unit cases: n=1 and n=2 for every key, and both parenthesis forms.
  - Today's header shows «σήμερα» in lowercase blue (`--wi4-blue-ink`) after the date, as on
    the board, not «ΣΗΜΕΡΑ».
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
  - `st = {menuOpen, panelOpen, popoverOpen, dialogOpen, datePanelOpen, modalOpen, paletteOpen, onPage, rootPresent, hasFocusRow}`.
    `modalOpen` covers the order form `#modalOverlay.open` and any `.mf-overlay`, where focus
    sits on buttons and not on inputs. `paletteOpen` = `CMD.open`. `onPage` =
    `currentPage==='weekly_intl'`. `rootPresent` = `#content .wi4` exists (it is false on the
    v1 fallback).
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

- **Never acts:**
  - inside `input`, `textarea`, `select` or contenteditable;
  - with ctrl, meta or alt held (so ⌘K and ⌘Z keep today's meaning);
  - while `#wi-ctx`, `#wi-panel`, the popover, the v4 date panel or a dialog is open. Their
    own handlers keep ↑↓/Esc, e.g. `_wiCtxKeydown` 4072;
  - while the order form or an `.mf-overlay` is open, or the command palette is open;
  - when not on the page, or when the `.wi4` root is absent (v1 fallback).
- **The part switch is not bound tonight.** No E/I, and `ArrowLeft`/`ArrowRight` → `null`.
  - Week navigation stays in `core/ui.js:407` as today.
  - The 10/10 design binds ←/→ to export/import and `[`/`]` to the week. PLAN §5.2 leaves
    the clash with `ui.js:407` as an open owner question, so neither binding ships until he
    answers (§j.6).
  - E/I were an invention of revision 1 and are dropped: they would teach dispatchers a
    binding nobody decided.
- **The v4 date panel stops ←/→ from changing the week.** `ui.js:407` is a bubble-phase
  `document` listener that ignores only inputs. While the panel is open, v4 installs a
  capture-phase `window` keydown listener that handles ←/→ (move one day in the calendar) and
  Esc, then calls `stopPropagation()`, so the document listener never sees them. The listener
  is removed when the panel closes.
- **Opening the popover from a key or a queue card.** `_wiOpenPopover` reads
  `e.currentTarget.getBoundingClientRect()` (3519), so v4 passes a synthetic event
  `{currentTarget: assignBoxEl, stopPropagation(){}, preventDefault(){}}`, as weekly_natl does
  (2732). `assignBoxEl` is the row's assignment box, resolved by order id at the moment of the
  call.
- Nothing destructive is bound. Delete and clear stay behind their menu confirms.
- **The «?» sheet is built from the live keymap** (`WI4.KEYMAP`, the same object `keyAction`
  reads), so it lists only keys that work. The Figma rows ←→, `[ ]` and ⌘Z «αναίρεση» are
  left out until they exist (there is no undo today; §j).
- **Cases:** each key with a Latin and a Greek `key` but the same `code` · inside an input ·
  with meta · menu open · order form open · palette open · off-page · root absent · ←/→ return
  `null` · E and I return `null` · the «?» list equals the keys of `KEYMAP`.

### d.5 Conflict data
- `WI4.CONFLICT_LABELS`: `Truck`, `Trailer`, `Driver`, `Partner`, `Partner Truck Plates`,
  `Is Partner Trip`, `Matched Import ID`, `Loading DateTime`, `Delivery DateTime`, `VS CD Date`.
- `WI4.sameValue(a, b, label)`:
  - `null`, `undefined`, `''` and `[]` are equal;
  - **checkbox labels** (`Is Partner Trip`): `false` equals absent. A nullable column that
    rt_sync coalesces to `false` would otherwise give undefined vs false;
  - arrays compare as sorted joined strings;
  - numbers numerically;
  - **only for the date labels** (`Loading DateTime`, `Delivery DateTime`, `VS CD Date`) **and
    only when both strings match the ISO-8601 regex**
    `^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$`: compare by epoch
    milliseconds, so `Z` equals `+00:00`. V8 `Date.parse` accepts strings like `'12'` or
    `'AB 1 2'`, so a looser rule would make two different plates compare as equal and miss a
    real conflict;
  - everything else after `String().trim()`.
- `WI4.buildExpect(changedFields, record)` → `{label: record.fields[label]}` for the checked
  labels present in `changedFields`. Returns `undefined` if there are none or if `record` is
  missing.
- `WI4.describeConflict(err409, labelsGreek)` → dialog text: who, when, theirs vs mine.
- `WI4.beatDelay({visible, lastInputAgoMs, failures, lastStatus, retryAfterMs, serverNextMs, cfg})`
  → ms, `null` (stop for now) or `'stop'` (stop for the session):
  - hidden → `null` (stop; resume on visible);
  - `lastStatus` 401 → `'stop'` (session expired, §g.4); 403 → `'stop'`; 410 or a body
    `stop:true` → `'stop'`;
  - otherwise the base is `max(serverNextMs || 0, active|idle)`, where active = input within
    `idleAfter`. **Never below 2500 ms**;
  - 404 → back-off 60 s, ×2 each time, cap 600 s;
  - 5xx or network error → 15 s, ×2, cap 120 s;
  - 429 → `retryAfterMs` (from the JSON body, §g.2) or 5 s. **A 429 is not 'paused'**: it is
    our own pacing, not an outage.
- **Shared vectors:** one file, `worker/test/fixtures/expect-vectors.json`
  (`[{label, a, b, same}]`), runs against `WI4.sameValue` **and** against the Worker's
  comparator (§g.2). It lives under `worker/test/` because WP8's branch
  (`deploy/worker-presence`, cut from `deploy/worker-temp-cmr`) has no `tests/fixtures/`. It
  reaches main through the post-deploy sync commit of `worker/test`.
  - Until that sync, `feat/wi-v4` holds a copy of the same file at the same path, and WP8's
    branch holds the original.
  - `tests/wi4-vectors-hash.test.js` (on `feat/wi-v4`) compares the sha256 of the copy with a
    constant that WP8 writes into `worker/test/fixtures/expect-vectors.sha256`. The
    coordinator cherry-picks that one file into `feat/wi-v4`. Drift fails loudly.
  - The front test reads the vectors from `worker/test/fixtures/expect-vectors.json`, never
    from a second path (principle 3).
  - Vectors include: `'12'` vs `'AB 1 2'` (different); ISO `Z` vs `+00:00` on a date label
    (same); the same pair on a non-date label (different); `false` vs absent on
    `Is Partner Trip` (same); `['recA','recB']` vs `['recB','recA']` (same).

---

## e. Rendering plan (board «ΕΚΔΟΧΗ 9/10» + sheets 14–16)

`WIV2.paint()` builds one string and sets `#content.innerHTML`. It keeps today's model:
full re-render, inline handlers carrying `row.id`. Then it runs one layout pass: measure the
points column width, compute points per row with `WI4.points`, and adjust only the nodes that
need it. It never reflows per stop the way `_wi2FitStops` does.

| # | Element | Data / behaviour comes from |
|---|---|---|
| 1 | **Title bar:** «Εβδομαδιαίο Διεθνών · 3–9 Οκτωβρίου» · «Ενημερώθηκε πριν 2΄» next to the title (exact time in the title attribute; orange «N αλλαγές · Ανανέωση» from presence §g, with «από Χ» only under the rule of §g.1 step 4) · presence avatars · week tabs (‹ W−3…W+3 ›, «Σήμερα»; the W+1 tab carries a badge with the number of W+1 loads that load this week or tomorrow, the **same number** as the queue's next-week items, from `_wiCrossWeekIncoming`; when that read failed the badge is «—» with title «δεν φορτώθηκε»). Buttons in sheet 15 order: «Προβολή ▾» · Pre-order (counter) · Σάρωση · Νέα παραγγελία | `WINTL._loadedAt`, `TmsWeek`, `preorderCounterHtml`, `_wiPreorder`/`_wiScan`/`_wiNewOrder`, `OrdersCommon.scanButton/newOrderButton`. «Προβολή ▾» = Εκτύπωση (`_wiPrintWeek`), CSV (`_wiExportCSV`), Ανανέωση (`renderWeeklyIntl`), Πλήρης οθόνη (`_wiFullscreen`), Κατάσταση filter (today's 4 options, applied by v4 dimming), εθνικές στήλες on/off (`_wk3FeedTog`), «Παλιά προβολή», and once per session the note «ο έλεγχος "το άλλαξε άλλος" δεν είναι ενεργός ακόμη» when `TMS_EXPECT_LIVE===false` (§g.3). «Λεπτομέρειες» is not offered: its chips (exec, cross-week) become queue reasons. «Σήμερα» is not on the Figma tabs; it is kept because it is today's button. |
| 2 | **Queue band** (sheet 15): «ΕΠΟΜΕΝΑ · 17 — 7 επείγοντα · 10 προσοχή», search box (/), the 3 most urgent as cards with one button each, «Όλα 17 ▾». No «Όλα στην W42 →»: it came from the superseded «Φορτώνουν σήμερα–αύριο» band, and sheet 15 dropped it. W+1 is reached through the badged week tab (#1) | `WI4.queue` over: the flags of every row and sub-row, stock items (`_wiLotState`, `_wiLooseLate`), pre-orders, W+1 loads today–tomorrow (`_wiCrossWeekIncoming`), imports ±1 week not drawn on the board (already in `WINTL.data.imports`, `adj`), and the unknown-source items of §d.2a. **A failed source is never a smaller number:** it becomes one item «Δεν φορτώθηκε: <πηγή> — δεν σημαίνει ότι δεν υπάρχουν», and the counter reads «≥17». Card buttons call existing actions only: Ανάθεση → `_wiOpenPopover`/`_wiOpenImpPopover` (synthetic event, §d.4); Νέα εισαγωγή → `_wiNewImport`; Κομμάτια → `_wiStockLooseOpen`; Εθνικά → `navigate('weekly_natl')`; Ημερομηνία → date panel; Άνοιγμα → `_wk3Edit`; Παρτίδα → `_wiStockLotOpen`; Μετατροπή → `_wk3Edit` (pre-order conversion, as `_wiPreCtx`); Ξαναδοκίμασε (unknown source) → `renderWeeklyIntl()` or `_wiRelayReload()`. A card stores the **order id** and resolves the row at click time. A click on the card body scrolls to the row and highlights it. |
| 3 | **«Όλα N ▾» panel:** ΤΩΡΑ / ΠΡΟΣΟΧΗ sections, Q = next, Esc closes | `WI4Actions.queuePanel()`, same items. Resolved items disappear on the next paint. |
| 4 | **Stock strip** «ΑΠΟΘΕΜΑ · 4 · 2 προς έλεγχο» + chips + «3 κομμάτια χωρίς φορτηγό · 1 εκπρόθεσμο» (locked: as today) | `_wiShelfInner(st)` inside `<div id="wi-shelf">`, wrapped in `.wi4-shelf`. Same words and numbers as the queue, because both read the same functions. Repaint through the `_wiShelfPaint` hook → `WIV2.shelfPaint()`. `_wiShelfFit` on paint and resize. |
| 5 | **Column header:** «‹ ΠΡΟΣ ΒΕΡΟΙΑ · ΕΞΑΓΩΓΗ · 34 φορτία · ανά ημέρα εκφόρτωσης · ΠΑΛ. · ΑΝΑΘΕΣΗ · ΕΝΤΟΛΗ · ΕΙΣΑΓΩΓΗ · 25 φορτία · ΠΑΛ. · ΑΠΟ ΒΕΡΟΙΑ ›» | counts from `_wiPaintMetrics`. A click on ΠΡΟΣ/ΑΠΟ toggles the column (`_wk3FeedTog`). The texts contain the five words `kanban.spec.js` checks. |
| 6 | **Day header:** «ΤΡΙΤΗ 6/10 · 4 φορτηγά · 2 κενά γυρίσματα (1 από σήμερα)», chevron; collapsed only if `WI4.collapsible`; today's header adds «σήμερα» in lowercase blue; empty day = one line «Καμία κίνηση». Counts and words come from `WI4.dayCounts` + `WI4.plural` (§d.3) | grouping = today's `_wiAllRowsHTML` rules: exports by delivery day, imports by loading day, Σαβ–Παρ seeded, extra «μεταφέρθηκε · W37» sections after Friday. Sort by client and then VS, as today. Open state is kept in `WINTL.ui.v4Days` keyed by date, so it survives repaints within the session. |
| 7 | **Export row** (32px): index (number, or a presence initial, plus the `wi-sync` slot) · ΠΡΟΣ ΒΕΡΟΙΑ (VS only: «ΠΕΛΑΤΗΣ Α → Βέροια Τετ» / carrier tile) · date chip + «ΑΝΑΦ.» under it · loadings · → · deliveries · pallets + PE + attachment · assignment box + paper-plane · import leg · ΑΠΟ ΒΕΡΟΙΑ. **Decided details** (round 11, PLAN Φ2, rules sheet): (a) a groupage shows «N φορτία» in place of ΑΝΑΦ.; (b) ΑΝΑΦ. also sits under the date of the matched import; (c) the only date allowed outside the chip is the inline VS warning «φτάνει 14/10 · παράδοση 12/10» (DATE_MISMATCH); (d) a date already done (✓) is plain grey text with no frame; the chip turns red **only** when the row has no truck; (e) own-fleet plates stay dark blue (ΕΚΔΟΧΗ, locked), with the colour measured on the board and mapped to an existing token where it matches (§c.2 rule); (f) no separator line under the last row of a day | `_wiGrpOrder`; `_wk3Arr`/`_wi2Split` for points; `_wk3StFlags` (✓ and loaded/delivered); `_wk3VsCd` (≈ estimate); `_wi2Carrier` logic re-rendered in wi4 markup from `WINTL.data.nlBySrc` (only when `nlState==='ok'`, §d.2a); `OrderDocs.badge` (attachment); `Pallet Exchange` (PE). Click on the date chip → date panel (#10) on «Φόρτωση»; click on the ≈ VS estimate or the VS warning → date panel on «Βέροια». Click on the name → `_wk3Edit`. Click on an empty point → `_wiRota` (group) as today. Click on «+N» → `_wk3MoreStops`. Right-click → per-load menu (#9). The board rig checks (a)–(f) as structure. |
| 8 | **Assignment box:** own = `--wi4-own` + plates in DM Mono / driver; partner = green + border, name / plates · driver; «ΠΡΟΣ ΑΝΑΘΕΣΗ» = red border, the strongest element; split parent = «2 σκέλη» chip. Rails: left 3px from `WI4.flags`. | `row.truckLabel/partnerLabel/…` (as in `_wiRowHTML` 2496). Click → `_wiOpenPopover(event,row.id)`, or `_wiOpenImpPopover` for an import-only row. Print buttons stay `wk3-prt` with `data-shq` (share menu). Partner rates stay visible in the popover, unchanged (owner 10/10). |
| 9 | **Per-load actions menu** (paper-plane + right-click; Figma 1047:1926 / sheet 14) | §e.9 below. |
| 10 | **Date panel** (replaces the hidden native input; sheet 16 D/E): a **field switch** «Φόρτωση · Εκφόρτωση · Βέροια» (Βέροια only on VS orders), with the title following it («Ημερομηνία φόρτωσης / εκφόρτωσης / Βέροιας»); load identity (client · from — to); month calendar (Σάβ-first week); time input (none for Βέροια: VS CD Date stays date-only, as today); line «Αλλάζει και τις στάσεις και τη Βέροια όπου υπάρχει. Η Εβδομάδα δεν αλλάζει από εδώ.»; Άκυρο / Αλλαγή; presence note, verbatim: «Ο Χ έχει ανοιχτή αυτή την ημερομηνία από πριν 20″. Αν αποθηκεύσετε και οι δύο, θα σου πει ποια μένει.»; conflict block «Ποια κρατάμε;» | Today the row has clickable Loading, Delivery and VS CD chips (1464/1467/2572/2676/2679), and sheet 14 #6 shows a delivery change made from the board. v4 draws only the loading chip, so the other two fields are reached through the switch, and nothing is lost. Anchored in `#wi-panel` space but a v4 element (`.wi4-datep`). It stores the **order id**, the field and the value it showed at open (`curIso`). Save → `WI_INTERNAL.dateWrite(oid, field, curIso, ymd, hhmm)`, the same `atSafePatch` + `invalidateCache` + `syncOrderDownstream(…,{changedFields:[field]})` as today, plus `_expect = {[field]: curIso}` when v4 is active. On success: moved-row trace (#15) → `renderWeeklyIntl()`. The success line never shows ✓ before the write has answered. The rig has one case per field. |
| 11 | **Sub-rows** (28px, in the column of their load): local driver «ΤΟΠΙΚΗ ΦΟΡΤΩΣΗ · Οδηγός Β · Σάβ 3/10 05:00» in the export column and «ΤΟΠΙΚΗ ΠΑΡΑΔΟΣΗ · Οδηγός Β · Τρί 6/10 14:00 · άλλο φορτηγό ΧΥΖ9876» in the import column (from `Relay.kindFor`: `relay_delivery`; the «άλλο φορτηγό <πινακίδα>» suffix only when the relay truck differs from the row's); rota «ΣΚΕΛΟΣ ΡΟΤΑΣ · ίδιο φορτηγό» + «× αποσύνδεση»; split frame header «ΣΠΑΣΜΕΝΗ ΣΕ 2 ΣΚΕΛΗ · ΠΕΛΑΤΗΣ Β → ΠΑΡΑΛΗΠΤΗΣ Γ · 30π · αλλαγή φορτηγού στο σημείο Χ» + leg rows «↳1/↳2» with their own assignment | relays: `WINTL.relay.byOrder`, `_wiRelayIdsOfRow`, `_wiRelayTip`, `Relay.kindFor`; click `_wiRelayOpen`, right-click `_wiRelayCtx` · rota: `WINTL._legs`, `_wiLegPidsOfRow`; unlink `_wiRotUnlink`; menu `_wiLegCtx` · split: `WINTL._splitLegs`, header click `_wk3Edit(parent)`, menu `_wiSplitHeaderCtx`; leg rows are full rows (#7) with the index replaced by «↳N». |
| 12 | **National columns** ΠΡΟΣ / ΑΠΟ ΒΕΡΟΙΑ: line 1 client · day, line 2 carrier tile (own navy text / partner green / «ΠΡΟΣ ΑΝΑΘΕΣΗ» amber dashed, or red within today–tomorrow); collapsible with memory. While `nlState` is 'loading' the tile is «—» (title «δεν φορτώθηκε ακόμη»), and on 'err' it is «—» (title «απέτυχε — δεν σημαίνει ότι δεν έχουν μεταφορέα»). **Never «ΠΡΟΣ ΑΝΑΘΕΣΗ» for an unread leg** | `nlBySrc` + `nlState` (§a.4 hook; the `_wiPaint()` after it reaches v4 through the hook), `tms_wk3_fl/fr`. |
| 13 | **Empty return / void cells:** «Κενό γύρισμα · από Τρί 6/10 · Τόπος, CZ» + «+ Νέα εισαγωγή» (+ «ή κομμάτι από ΑΠΟΘΕΜΑ»); «Μόνο εξαγωγή · συνεργάτης»; import-only row: left cell «Χωρίς εξαγωγή · αυτή την εβδομάδα» (dashed) | `gapCell`/`parCell` rules of `_wiRowHTML`; «+ Νέα εισαγωγή» → `_wiNewImport(row.id)`; `<span class="wi2-gapstk" data-row>` filled by `_wiStockGapLink`. The cell is the drop target (§f). |
| 14 | **Save failure** (sheet 14 #5): a 24px message line under the row «Δεν αποθηκεύτηκε — … · Ξαναδοκίμασε · κλείσιμο ×»; title bar «1 αλλαγή δεν αποθηκεύτηκε» in place of «Ενημερώθηκε» | §e.14 below. |
| 15 | **Moved-row trace** (sheet 14 #6): «↓ Πήγε στην Πέμπτη 8/10 — ΠΕΛΑΤΗΣ Α → ΠΑΡΑΛΗΠΤΗΣ Δ +2» at the old position for 10 s; a click scrolls to the new row | before the `renderWeeklyIntl()` of a v4 date save, `WIV2.noteMove(oid, oldDay, label)`. After the paint, the trace is inserted if the day changed. Keyed by order id. |
| 16 | **Search 1/N** (sheet 14 #8): non-matching rows dim (`.wi4-dim`), counter «1/6», Enter = next, Esc clears; matches client, place, plates, driver, ΑΝΑΦ. | `WIV2.search(q)` over `row.truckLabel/driverLabel/partnerLabel/partnerPlates` + the records' `Client Name`, Summaries, `Reference`. `WINTL.filter` is reused as the stored query, so it survives repaints. `_wiApplyFilter` is never called in v4 (it hides rows; v4 dims them). |
| 17 | **Keyboard focus + «?» sheet** (sheet 15 C/D): blue ring only after keyboard use (root class `wi4-kbd`, set on keydown, cleared on mousedown); focus kept in `WINTL.ui.v4Focus = orderId`; «?» opens the shortcuts sheet | `WI4.keyAction` → `WI4Actions.run(action)`, which calls the same openers as clicks. |
| 18 | **Presence** (sheet 16): avatars + «Χρήστης Α, Χρήστης Β · εδώ τώρα · ↻ ζωντανά» in the title bar; the initial replaces the row number for a row someone has open (tooltip «Χρήστης Α · αλλάζει την ημερομηνία φόρτωσης · από 08:41»); note inside the date panel/menu (#10 wording); paused state «Ζωντανή εικόνα σε παύση — δεν ξέρουμε ποιος άλλος είναι μέσα · ξαναδοκιμάζει»; 403 state «Η ζωντανή εικόνα δεν είναι διαθέσιμη για τον ρόλο σου». **Never «κανείς».** | `WI4Presence.others()`, `WI4Presence.state()` (§g). Every presence string (name, action label) goes through `escapeHtml`, and the action text shown is looked up from the whitelist (§g.1), never the stored string. **A beat never triggers a paint:** `WIV2.presencePatch()` updates only the avatar strip, the index cells of the rows involved (found by `data-oid`) and the note in an open panel. It never calls `WIV2.paint`/`_wiPaint`, so an open popover, menu, date panel, search focus and scroll position survive. The rig asserts that the popover stays open, with focus and scroll unchanged, across 3 beats. With `FEATURES.WI_PRESENCE=false`, nothing about presence is drawn at all: no claim either way. |
| 19 | **Conflict dialog** «Ποια κρατάμε;» | §g.4. |
| 20 | **States not designed yet** (Φ8): «φορτώνει», «άδεια εβδομάδα», 1440 width, all days open | tonight: «φορτώνει» = today's spinner and watchdog card (they live in `renderWeeklyIntl`, unchanged); empty week = today's «Άδειο φύλλο — W41» text in wi4 type; 1440 = same grid with `minmax(0,1fr)`, national columns follow the stored toggle (default = as today, open). All flagged for the owner to review against the Figma he still has to draw (§j). |
| 21 | **Relay read failed** (contract #6/#7, DESIGN.md Α7): when `WINTL.relay.state==='err'`, the same text as `_wiPaint` 1192, «Οι τοπικές παραδόσεις/φορτώσεις δεν φορτώθηκαν … δεν σημαίνει ότι δεν υπάρχουν · ↻ Ξαναδοκίμασε», in wi4 type under the title bar, plus one `SOURCE_UNKNOWN` queue item. While 'loading', relay items stay closed, as today | `WINTL.relay.state`, button → `_wiRelayReload()`. The board rig sets the relay read to 500 and expects the banner and the queue item. |
| 22 | **Unknown sources** (§d.2a): «—» cells with an explanatory title; one queue item per failed source | §d.2a. |

### e.9 Per-load actions menu
**Layout** (Figma 1047:1926 / sheet 14):
- header «ΑΒΓ1234 · Οδηγός Α / Σάβ 3/10 → Τρί 6/10 · 2 εξαγωγές · 1 εισαγωγή»;
- section **truck**;
- section **ΕΞΑΓΩΓΗ · φορτίο**, or «GROUPAGE ΕΞΑΓΩΓΗΣ · 2 φορτία → …» with one «▸» line per
  member, each opening its own submenu;
- section **ΕΙΣΑΓΩΓΗ · φορτίο**.

Hovering a section highlights its load in the row.

**Where it renders.** Inside the existing `#wi-ctx`, with `.wi-ctx-i` buttons; submenus are
nested `.wi-ctx-i` groups.
- `_wiCtxKeydown` (document listener 4084, reads `#wi-ctx` with `display:block`) then gives
  ↑↓/Esc for free.
- `_wiCtxShow`/`_wiCtxClose` place and close it as today.
- Each item's own `;_wiCtxClose()` closes it after the action.
- A menu outside `#wi-ctx` would stay open after an action and have no keyboard, so there is
  none.

**How items are gathered** (`WI4Actions.openRowMenu(e, orderId)`):
1. Re-resolve `row.id` from the order id (`WIV2.rowIdOf`). Call `_wiBlockReadOnly()` exactly
   where `_wiCtx` calls it, and nowhere else.
2. Collect HTML from the item builders: `_wiCtxItems(row)`, `_wiImpCtxItems(impRow, row.id)`
   (matched), `_wiSegCtxItems(...)` per member (submenus), `_wiPreCtxItems`/`_wiLotCtxItems`
   when they apply, `_wiRelayCtxItems` and `_wiSplitHeaderCtxItems`.
3. Parse the HTML with `DOMParser` and **move the parsed `<button>` nodes** into the v4
   structure (`importNode`). The `onclick` attribute is never re-stringified: re-emitting a
   decoded `getAttribute('onclick')` into an attribute would break on quotes.
4. **Dedupe by exact `onclick` string, keeping the first.** A matched pair otherwise shows
   «Ανάθεση…» (`_wiPanelAssign(<exportRowId>,false)`) and «+ Κομμάτι από απόθεμα…» twice,
   once from `_wiCtxItems` and once from `_wiImpCtxItems`. `_wiSegCtxItems` emits «Ανάθεση…»
   once per member.
5. **Section by handler name** (`WI4.menuSection(fn)`):
   - truck: `_wiPanelAssign`, `_wiClear`, stock piece → truck;
   - import: `_wiUnmatchRow`/`_wiUnmatch` and the `_wiImpCtxItems` set;
   - export: everything else.

   Truck-section handlers are **dropped from member submenus**, because Figma shows each truck
   item once and no Ανάθεση in the submenus.
6. **«Άνοιγμα παραγγελίας»** is added as the first item of every load section (ΕΞΑΓΩΓΗ,
   ΕΙΣΑΓΩΓΗ, each member submenu) → `_wk3Edit('<orderId>')`.
   - It is not a new action: it is the existing name click and the O key.
   - Without it, a load drawn only as a tile has no menu path to its form.
   - A split leg keeps «Αρχική παραγγελία…» instead.
   - Role gate: none, as today's name click.
   - It is the **only** v4-only item, listed as such in the parity test.

**Relabels** (decision 10/10: one name per thing). One map, applied in v4 only:
- to menu labels;
- and, through the v4 `MutationObserver` on `#wi-panel`, to the **titles and primary buttons
  of the panels those items open**, so «Groupage εξαγωγών…» never opens a panel titled
  «Ομαδοποίηση».

| Old string (where) | v4 |
|---|---|
| «Ομαδοποίηση…» (menu) · «Ομαδοποίηση» (panel title 4328, button 4326) | «Groupage εξαγωγών…» · «Groupage εξαγωγών» · «Groupage εξαγωγών» |
| same handler `_wiPanelGroupBuild(rowId,false)` on a row that is already in a group | «Groupage εξαγωγών… (πρόσθεση)». The suffix is derived from row state in v4 and is not a new action. |
| «+ Εισαγωγή στο φορτίο…» (menu) · «+ Εισαγωγή στο φορτίο» (panel title 4437) | **open: two handlers, one name?** See below. |
| «Εκτύπωση…» (per load) | «Εκτύπωση / WhatsApp…» |
| «Εκτύπωση όλων» (1609, split/group level) | «Εκτύπωση / WhatsApp όλων…» |
| «Ακύρωση groupage» | «Βγάλε από το groupage» |

v1 is not touched: the map runs only on v4-rendered menus and on `#wi-panel` while
`body.wi4-on` is set. The identity rig proves v1 stays byte-identical.

**Two handlers under one label.** `_wiPanelJoinLoad` («+ Εισαγωγή στο φορτίο…») and
`_wiPanelGroupBuild(..,true)` («Groupage εισαγωγών…») are different actions. Revision 1 mapped
both to «Groupage εισαγωγών…», and in the merged menu both can appear. The owner's words were
«άρα είναι το groupage», but two items with the same label in one menu are ambiguous.
- Tonight: `_wiPanelGroupBuild(..,true)` = «Groupage εισαγωγών…», and `_wiPanelJoinLoad` =
  «Groupage εισαγωγών · σε αυτό το φορτίο…».
- The final wording goes to the owner (§j.6).
- The parity test asserts **labels are unique per menu**.

**Parity test** (`tests/wi4-menu-parity.test.js`, per fixture row):
- every old handler string appears at least once in the v4 menu (except truck handlers in
  member submenus, by rule 5);
- no `onclick` appears twice in one menu;
- labels are unique per menu;
- every relabel-map key occurs in some builder's output **or panel string** (a rename in old
  code fails loudly);
- the only v4-only `onclick` is `_wk3Edit(...)` for «Άνοιγμα παραγγελίας».

**Visuals.** Icons come from a map keyed on handler name (`WI4.MENU_ICON`). The hint letters
on items (A on Ανάθεση, P on Εκτύπωση, O on Άνοιγμα) are read from `WI4.KEYMAP`, the one
source the keyboard and the «?» sheet also read. «⤷» is replaced by the submenu icon.
«Καθυστέρηση…» is **not shown** until the 067 Worker is live and the owner says so.

### e.14 Save failure (`_wiSync` 'err')
- **`WIV2.onSync(oid, state, msg)` only records and redraws:** the title-bar counter, and the
  24px message line under the row of that order id.
  - It never calls `_wiBuildRows`, never replaces a record in `WINTL.data` and never repaints
    the board.
  - Why: `_wiBuildRows` resets `WINTL.rows=[]` and `_seq=0`, so every row object is replaced
    and ids can shift.
  - The old function that reported 'err' is often still running. `_wiSaveImportMatch`, for
    example, goes on writing inherited assignments with its `row` after `_wiSync('err')`.
    `window._wiPendingMatch.rowId` (consumed by orders_intl minutes later), the popover ids
    `#wsd-v-*_p_{rowId}`, `_wiSegDrag.rowId` and the ⚠ attribution are all keyed by row id. A
    rebuild there would retarget them.
- **Showing what is written.** The re-read goes through the existing path,
  `renderWeeklyIntl()`, debounced until all of these hold:
  1. no `'pend'` entry is left in `WINTL._syncLog` (the action has settled);
  2. no `#wi-popover`, `#wi-panel`, `#wi-ctx`, v4 date panel, `#modalOverlay.open` or
     `.mf-overlay` is open;
  3. `window._wiPendingMatch` is unset;
  4. `currentPage === 'weekly_intl'`.

  Until then the row keeps its last paint and the message line says «Δεν αποθηκεύτηκε — η
  σειρά θα ξαναδιαβαστεί μόλις κλείσει ό,τι είναι ανοιχτό». The page is never repainted while
  the user is on another page, so another page's `#content` is never overwritten.
- **If that re-read itself fails** (same network cause), the error line stays and adds «δεν
  ξέρουμε τι γράφτηκε — Ανανέωση». A clean row is never shown.
- **«Ξαναδοκίμασε»** stores the **order id** and the kind of action, and resolves the row with
  `WIV2.rowIdOf` at click time. It **reopens the same action UI** for that order (popover,
  date panel or menu) and never blindly replays a write. «×» deletes the `_syncLog` entry.
- The old functions already call `reportError`/`logError` → `app_errors`.
- **Rig cases** (board rig, in-memory facade):
  1. a write failing (500) while the popover of **another** row is open → the PATCH from that
     popover targets the right order;
  2. a write failing while the new-import form is open (`_wiPendingMatch` set) → after the
     form saves, the match PATCH targets the export the user chose.

  Both pass only on the PATCH bodies and the fake table rows.
- **Known debt:** some old failure and refusal messages say «#N» (row numbers). The rules
  sheet says «ποτέ στον αύξοντα αριθμό γραμμής». The message line in v4 prefixes the client
  and route of the order, but the old text after it is kept verbatim. Rewording those strings
  is Φ9 debt, listed in §j.

**Numbering:** continuous per week, as on the board (exports and import-only rows together).
`WINTL._rowNo` is written too, so any old reader stays correct.

**Metrics:** `reportPageMetrics('weekly_intl', …)` with the same keys, from `_wiPaintMetrics`.

---

## f. Drag & drop in v4 (keyed by order id)

| Target | Markup v4 emits | Handler (unchanged) |
|---|---|---|
| import cell of an export row (empty return, partner-only, matched) | `<div id="wi-ci-{row.id}" class="wi4-imp" ondragover="event.preventDefault();this.classList.add('wi4-dh')" ondragleave="this.classList.remove('wi4-dh')" ondrop="event.stopPropagation();_wiDropOnRow(event,{row.id})">` | `_wiDropOnRow` → `_wiDropImport` reads the id from `dataTransfer` (`WI_DND_IMP`): empty cell = match (`_wiSaveImportMatch`), a load = join (`_wiImpJoin`) |
| member points of a group (tiles) | exactly today's strings (2423–2427), copied verbatim: `draggable="true" ondragstart="event.stopPropagation();_wiSegDragStart(event,${rowId},'${o.id}')" ondragover="event.preventDefault();event.stopPropagation();_wiSegDragOver(event,${rowId},'${o.id}')" ondragleave="event.stopPropagation();this.classList.remove('dragover')" ondrop="event.stopPropagation();_wiSegDrop(event,${rowId},'${o.id}')" ondragend="event.stopPropagation();_wiSegDragEnd(event)"`. Without `event.preventDefault()` in `ondragover`, the drop never fires. `rowId` is **the group's own row id**, never the export row it is painted in (the same rule as `_wiRowHTML` 2640). | reorder → `_wiSaveSegOrder`; an import dropped on an import tile → `_wiSegDrop` finds `closest('[id^="wi-ci-"]')` → join |
| whole matched group (grip ⋮⋮) | `ondragstart="event.stopPropagation();_wiImpDragStart(event,'{lead}',true)"` | as today |
| free import row (source) | row `draggable="true" ondragstart="event.stopPropagation();_wiImpDragStart(event,'{impId}')" ondragend="_wiImpDragEnd()"` | as today |
| popover drop zone `#wi-piz-{rowId}` | rendered by `_wiOpenPopover` (old code) | `_wiDropOnPanel` |

Risks and how they are closed:
- **Stale `_wiDragging`.** Since 8/10 the import id travels in `dataTransfer`. v4 never sets
  `window._wiDragging` itself; only `_wiImpDragStart` does.
- **Hover classes.** v4 adds one `document` listener (`dragend` + `drop`, guarded as in §a.4)
  that clears `.wi4 .wi4-dh, .wi4 .dragover, .wi4 .dragging`. The reasons:
  - `_wiImpDragEnd` clears only `.wk3-leg.imp.dh`, which v4 does not emit;
  - `_wiSegDragEnd`/`_wiSegDrop` clear only `.wk3-seg.dragover`, while
    `_wiSegDragStart/Over` add `dragging`/`dragover` to whatever element is current.

  Without the listener, those classes would stick on v4 tiles after a refused or ignored
  drop. v4 tiles do not carry `wk3-seg` (§a.7).
- **Edge auto-scroll.** It scrolls `.wk3-sheet` today. v4 adds its own `dragover` listener on
  its scroll container while `window._wiDragging` is set.
- **Stale row ids.** `row.id` is a per-build sequence: `_wiBuildRows` restarts at 1, so an old
  id can point to a **different** row. Inline handlers are always fresh, because every rebuild
  repaints. But anything async that v4 opens (date panel, menu, queue panel, retry) stores the
  **order id** and re-resolves `row.id` with `WIV2.rowIdOf(orderId)` at click time. Focus,
  open days, traces and error lines are all keyed by order id or date.
  - No v4 code calls `_wiBuildRows`. Rows are rebuilt only by `renderWeeklyIntl()`, which is
    debounced past open overlays (§e.14).
  - Old state keyed by row id (`_wiPendingMatch.rowId`, popover ids, `_wiSegDrag.rowId`) is
    therefore never retargeted under the user by a v4 action.
- **Drag verdict before the drop** (R3 9/10, rules «Σύρσιμο») is designed but not built
  tonight (§j.7): today's drop handlers decide only on drop.
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
  user_sub   text NOT NULL,                          -- JWT sub (username)
  tab_id     text NOT NULL CHECK (tab_id ~ '^[a-z0-9]{8,16}$'),  -- random per browser tab, not personal data
  user_name  text NOT NULL,
  role       text NOT NULL CHECK (role IN ('owner','management','accountant','dispatcher','warehouse')),
  board      text NOT NULL CHECK (board IN ('weekly_intl')),
  week       int  CHECK (week BETWEEN 1 AND 53),
  record_id  text CHECK (record_id ~ '^rec[A-Za-z0-9]{6,30}$'),  -- order legacy id open, or null
  part       text CHECK (part IN ('truck','export','import')),
  action     text CHECK (action IN ('view','menu','assign',
                 'date:Loading DateTime','date:Delivery DateTime','date:VS CD Date')),
  since      timestamptz,                                          -- when this record/action started
  seen_at    timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,                                 -- seen_at + clamped TTL
  PRIMARY KEY (user_sub, tab_id)
);
ALTER TABLE public.presence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.presence FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.presence TO service_role;
```

- **Values are born closed too (principle 5).** `action` is a whitelist, enforced twice: by the
  SQL `CHECK` and by the Worker (§g.2). `record_id` and `tab_id` are regex-checked. Nothing
  free-text that a colleague's browser renders is stored.
- **Key `(user_sub, tab_id)`.** Two visible windows of the same user no longer overwrite each
  other's record or action context. One window's `pagehide` leave deletes only its own row.
  `others` is deduplicated by `user_sub`: one avatar per person, holding the union of that
  person's open records.
- **`presence_beat(p_sub, p_tab, p_name, p_role, p_board, p_week, p_record, p_part, p_action, p_ttl_ms, p_leave, p_changes_since, p_names) RETURNS jsonb`**
  - `SECURITY INVOKER`, `SET search_path = public, pg_temp`;
  - `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated`; `GRANT EXECUTE … TO service_role`.
- **Body:**
  1. `p_leave` → `DELETE` own row `(p_sub, p_tab)` and return `{others:[]}`.
  2. Otherwise `INSERT … ON CONFLICT (user_sub, tab_id) DO UPDATE`.
     - `since` is kept when `record_id` and `action` are unchanged, else set to `now()`.
     - `expires_at = now() + make_interval(secs => least(greatest(p_ttl_ms, 7500), 90000) / 1000.0)`.
       The client sends `1.5 × its next interval`, and the server clamps it to 7.5–90 s.
  3. Return `others`: rows with `user_sub <> p_sub AND board = p_board AND expires_at > now()`,
     grouped by `user_sub`.
     - **Each row is visible until its own TTL**, so an idle user who beats every 30 s (TTL
       45 s) never blinks out between beats. Revision 1's fixed 15-second window did exactly
       that: the board said nobody was there for half the time.
  4. Return `changes` `{n, last_by, last_at, auto_n}`:
     ```sql
     FROM audit_log a
     JOIN orders o ON (o.legacy_id = a.record_id OR o.id::text = a.record_id)
     WHERE a.table_name = 'orders'
       AND o.type = 'International'
       AND a.created_at > greatest(p_changes_since, now() - interval '15 minutes')
     ```
     - The join covers both key styles. Worker writes store `record_id` = legacy id and
       `actor` = username; trigger writes store `id::text` and `actor` = `trigger:…` with
       `role` = 'system' (013:44, 028:60, 023:33, 020:27).
     - **Human changes** (`n`, `last_by`, `last_at`): `a.actor <> p_sub AND a.role IN
       ('owner','management','accountant','dispatcher','warehouse')`. `actor LIKE 'trigger:%'`,
       `'migration:%'` and `role = 'system'` are excluded, so the user's own saves (and the
       triggers they cause) never paint a permanent «N αλλαγές από trigger:rt_sync».
     - **Automatic changes** (`auto_n`): `role = 'system'` rows **not** caused by the caller.
       A trigger row is attributed to the caller when the caller has a human row on the same
       order within the same second. They show separately as «N αυτόματες ενημερώσεις», never
       under a person's name.
     - **`p_changes_since` is clamped server-side** to at most 15 minutes ago, so a forged or
       stale value cannot force a large `audit_log` scan every 5 s.
     - **Names:** `last_by` is returned only when `p_names` is true. The Worker sets it from
       its existing `AUDIT_READERS` list (`owner`, `management`: the roles that can read
       `/audit` today). Every other role gets the count only. This is the same rule as today's
       audit access, so no role gains anything. Whether dispatchers should see names is an
       owner question (§j.6).
  5. Housekeeping: `DELETE … WHERE expires_at < now() - interval '1 day'`.
- No audit row per beat: presence is not a data change.
- `_verify`:
  - the table exists, RLS is on, 0 grants to anon/authenticated/PUBLIC;
  - function `EXECUTE` only for `service_role`;
  - the `CHECK` constraints are present;
  - `count(*) ≤ 12` (6 users × at most 2 tabs; PLAN Φ7 said ≤ 6 rows with one row per user);
  - the indexes on `audit_log` (`created_at`, `record_id`), so the owner sees whether the
    `changes` query needs one before it runs every 5 seconds.
- `_test`:
  - two subs beat and each sees the other;
  - an **idle beat with TTL 45 s is still returned 30 s later**;
  - a row past its `expires_at` is not returned;
  - the same sub in two tabs → two rows, one entry in `others`;
  - leave removes only its own tab;
  - `action = 'x<script>'` is rejected by the CHECK;
  - `p_changes_since` a week ago is clamped to 15 minutes;
  - a `trigger:rt_sync` row with `role='system'` counts in `auto_n`, never in `n`;
  - the caller's own Worker row is not counted;
  - a trigger row keyed by `id::text` joins to its order.
- `_dryrun`: everything in a transaction that ends in `ROLLBACK`.
- `_rollback`: `DROP FUNCTION`, `DROP TABLE`.

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
  2. `var PRESENCE_ACTIONS = ["view","menu","assign","date:Loading DateTime","date:Delivery DateTime","date:VS CD Date"];`
     It is the same list as the SQL `CHECK`, and a Worker test compares the two strings.
  3. Router, before the facade match (5790):
     `if (url.pathname === "/presence" && request.method === "POST") return handlePresence(request, origin, env);`
  4. `handlePresence`:
     - **Server lever first:** if `env.PRESENCE_OFF === "1"`, answer
       `410 {stop:true}` before any DB call. The client stops for the session (§g.4).
     - `getCaller` (401) → role in `PRESENCE_ROLES` (403).
     - Parse and validate the body: `board === 'weekly_intl'`; `week` an integer 1–53;
       `tab` matching `/^[a-z0-9]{8,16}$/`; `record` matching `/^rec[A-Za-z0-9]{6,30}$/` or
       null; `part` in the set; `action` in `PRESENCE_ACTIONS` or null; `ttl_ms` an integer;
       `leave` boolean; `changes_since` ISO or null. Anything else → `400`.
     - Name, sub and role are taken **only from the JWT**, never from the body.
     - Per-isolate guard: the same `(sub, tab)` more often than once per 2 s → `429` with body
       `{error:'too fast', retry_after_ms: 2500}`.
       - The value is in the JSON because `Retry-After` is not readable cross-origin
         (`corsHeaders` sets no `Access-Control-Expose-Headers`). That header is not added:
         it would change every response of the app for one feature.
       - The client already paces at ≥ 2.5 s (§g.4), so the guard catches only misbehaving
         tabs.
     - `dbRpc(env, 'presence_beat', …)` with `p_names = AUDIT_READERS.includes(caller.role)`.
     - Answer `jsonOk({others, changes, now, next_ms})`. `next_ms` comes from
       `env.PRESENCE_MS` (integer ≥ 2500, default 5000), so the owner can throttle to 10 s or
       30 s from the Cloudflare dashboard without a Pages deploy (§g.5).
     - RPC failure → `jsonError('presence unavailable', 503)` plus `console.error`. Never a
       200 with an empty list.
  5. **Conflict check in `handleFacadeUpdate`** (3259), after `readRowBefore` (3285) and
     before the write:
     - `body._expect` is a top-level body key, so `buildWriteRow` never sees it and it is
       never logged as an unknown field.
     - At most 12 labels. Each must exist in `cfg.fields`, `cfg.aliases` or `cfg.links`;
       otherwise `400`. A typo must not turn the check off silently.
     - **Labels are canonicalised before comparing:** label → column (fields, aliases or
       links) → the canonical read label from `columnToLabel(cfg)`. ORDERS has two labels on
       one column (`'Cross-dock Date'` 1350 and `'VS CD Date'` 1425), and `columnToLabel`
       returns only the last. Without this step, an `_expect` on `'Cross-dock Date'` (which
       the 400-validation accepts) would always conflict. The 409 answers in the caller's own
       labels.
     - `before === undefined` (the before-read failed): write as today and answer
       `_expectChecked: "skipped"`. It is an indication, not a lock: a failed read never
       blocks work at 06:00. The front shows a quiet note.
     - `before === null` (no such row): fall through to today's 404 path, unchanged.
     - Otherwise `cur = await shapeOneStrict(before, cfg, env)`.
       - It is the same shaping as `shapeOneWithLinks` (2668), so formats compare like for
         like. But it **throws** on a link-resolve or computed re-read error, where
         `shapeOneWithLinks` only logs and returns the record without those labels.
       - A throw is handled like the failed before-read: `_expectChecked: "skipped"`, the
         write proceeds, one `console.error`. A missing `Truck` caused by a transient
         PostgREST error must never become a false 409 that shows the current value as empty.
       - `shapeOneWithLinks` itself is not changed: every other path keeps its forgiving
         behaviour.
     - **Diff, ignoring what cannot be lost:**
       `diff = labels.filter(l => !expectSame(l, body._expect[l], cur.fields[l]) && !expectSame(l, body.fields[l], cur.fields[l]))`.
       If the server already holds what the user is writing, nothing can be lost. That removes
       most own-cascade false positives, for example a trigger that already set the same
       truck on a rota leg.
     - If `diff` is not empty → **409**, nothing written:
       `jsonOk({error:{type:'conflict', fields:diff, by, at, current: pick(cur.fields, labels)}}, origin, env, 409)`.
       - `by`/`at` come from the newest `audit_log` row with `table_name = cfg.pg` and
         `record_id IN (recId, String(before.id))` whose `before_data`/`after_data` touch a
         column in `diff`.
       - Worker rows store `after_data` as `JSON.stringify(...)` text, so the check parses
         it; trigger rows store jsonb.
       - Actor `trigger:%`, `migration:%` or role `system` → `by: 'auto'` («αυτόματη
         ενημέρωση»).
       - No matching row → `by: null`, `at: null`. The dialog then says «άλλαξε από τότε που
         το άνοιξες» without a name, rather than guessing a colleague from yesterday.
       - `by` is a username only when `AUDIT_READERS.includes(caller.role)`. Otherwise it is
         `'user'` («άλλος χρήστης»), the same rule as `changes` (§g.1).
     - **Atomic compare-and-set** (same precedent as 4335–4346):
       - the write is a PATCH with `legacy_id=eq.<recId>` plus, for each checked column, a
         filter on the raw value from the `before` row already in hand: `col=eq.<raw>`, or
         `col=is.null` for nulls;
       - the filters are built with `URLSearchParams`, so `+00:00` and spaces are encoded;
       - a column whose body value equals `cur` is left out of the filter (see the diff
         rule);
       - the write goes through a new `dbUpdateWhere(env, table, params, patch)`, a sibling of
         `dbUpdate` 323 with the same headers. `dbUpdate` is unchanged for every other caller;
       - **0 rows returned → the same 409** (with `by` looked up as above). No
         check-then-write window remains, and the request count is the same.
     - Success: the normal record plus `_expectChecked: true`.
     - `expectSame(label, a, b)` mirrors `WI4.sameValue` and runs the shared vectors file
       (`worker/test/fixtures/expect-vectors.json`, §d.5).
     - Requests without `_expect` take exactly today's path: same `dbUpdate`, same requests.
     - Batch PATCH (`handleFacadeBatchUpdate`) gets no check.
- **Tests** (`worker/test/presence.test.mjs`, `worker/test/expect-conflict.test.mjs`): the real
  bundle in Node with `fetch` stubbed, following `temp-per-cmr.test.mjs`.
  - Presence: 401 without a token · 403 for an unknown role · 400 on a bad body, including an
    `action` outside the whitelist and an HTML string · RPC args built from the JWT, not the
    body · `p_names` true only for owner/management · 429 with `retry_after_ms` in the body ·
    `PRESENCE_OFF=1` → 410 with no RPC · `next_ms` from `PRESENCE_MS` · 503 on RPC failure ·
    `PRESENCE_ACTIONS` equals the SQL CHECK list.
  - Conflict: no `_expect` → identical request sequence · matching `_expect` → write +
    `_expectChecked` · mismatch → 409 shape and **no** PATCH to PostgREST · mismatch where
    body equals current → no 409 · CAS PATCH carries the raw-value filters · CAS returns 0
    rows → 409 · failed before-read → `skipped` · **link resolve fails → no 409, write
    happens, `skipped`** · `before === null` → today's 404 · unknown label → 400 ·
    `'Cross-dock Date'` and `'VS CD Date'` compare as the same column · attribution with a
    `trigger:rt_sync` row keyed by `id::text` → `by:'auto'` · no audit row → `by:null` · the
    vectors file.
- **Deploy guard markers**, added to CLAUDE.md «σημάδι ανά λειτουργία» only **after** the
  deploy: `PRESENCE_ROLES` and `_expectChecked`.

### g.3 `core/api.js` (applies only to requests that carry `_expect`)
- `atPatch(tableId, recId, fields, opts)`:
  - `opts.expect` → body `{fields, typecast:true, _expect}`. With no `opts` the body is
    byte-identical to today.
  - Offline queueing drops `_expect`: a replay later would compare against a stale read.
    The comment says so.
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
  ακόμη» (principle 1). `_expectChecked:true` sets it to `true`; `'skipped'` leaves it as is
  and shows the quiet note for that save.
- **Dead code** (PLAN §2.9). It is **not part of the flag work**, so it goes in **its own
  commit** with **its own DECISION_LOG entry** and can be reverted alone:
  - `atTrackVersion`/`atTrackVersions`, the dormant `'Last Modified'` check in `atSafePatch`
    and `atAutoRefresh` (1161). Verified: no caller in `core/`, `modules/` or `app.html`, and
    no `'Last Modified'` label in the Worker. → They go.
  - `atPresenceStart` (local only, called from `app.html:227`) stays for now: other pages read
    its BroadcastChannel cache invalidation. It is not used by v4. Its localStorage half is
    removed in Φ9 with the old board.
  - `delivN`, `lateN`, `parRows` (weekly_intl.js 1122–1127, each defined once and never read):
    `_wiPaintMetrics` is the phase that touches `_wiPaint` (PLAN §2.9), so they are dropped
    from the extraction. That is WP2's separate dead-code commit, and the identity rig proves
    the HTML is unchanged.
- Tests: `tests/api-expect-conflict.test.mjs`, following `api-stock-refusals.test.mjs`:
  - no opts → body has no `_expect`;
  - expect → body has it;
  - 409 conflict → one fetch only, and the error carries the fields;
  - 409 without opts → retried as today;
  - `atSafePatch` returns `{conflict:true}`;
  - the offline path drops `_expect`.

### g.4 Front: presence client, `_expect` and dialog
- **`core/wi4-presence.js`** (`WI4Presence`). Started by `WIV2.paint()` only when
  `FEATURES.WI_PRESENCE` is true. Stopped when the page changes or when `WIV2.active()`
  turns false.
  - Plain `fetch(PROXY_URL + '/presence', {method:'POST', headers:{Authorization, 'Content-Type':'application/json'}, body})`.
    Never `_enqueue` or `_atRetry`: a beat must not queue behind writes or retry.
  - `tab_id`: 12 random `[a-z0-9]` characters, made once per tab, kept in
    `sessionStorage` (try/catch; in memory if storage throws).
  - **Pacing:** at most one beat per 2.5 s, whatever happens. Context changes (open menu,
    then date panel within a second) are **coalesced into the next allowed beat**, never sent
    as extra requests. Revision 1's 500 ms debounce against a 2.5 s server guard produced 429s
    in normal use.
  - Schedule from `WI4.beatDelay`: `max(next_ms from the server, 5 s)` while visible and
    active (input within 2 min), 30 s idle. Stop on `visibilitychange: hidden`, and resume
    with an immediate beat. Each beat sends `ttl_ms = 1.5 × the delay it will wait next`.
  - **Statuses:**
    - 404 means the endpoint is not deployed (60 s → 600 s) → `paused`;
    - 5xx or network: 15 s → 120 s → `paused` «Ζωντανή εικόνα σε παύση»;
    - 429: wait `retry_after_ms` from the body. **Not** paused: it is our own pacing;
    - **401**: stop and call the existing session-expiry path (`tmsSessionExpired`) **once**.
      Never a «σε παύση» loop of doomed beats after the 8-hour JWT ends;
    - **403**: stop for the session, one `logError`, state `forbidden` → «Η ζωντανή εικόνα δεν
      είναι διαθέσιμη για τον ρόλο σου»;
    - **410 or `stop:true`**: stop for the session (the owner's `PRESENCE_OFF`), state `off`;
      nothing is drawn.
  - `pagehide` → `fetch(…, {keepalive:true, body:{tab, leave:true}})`.
  - `setContext({week, record, part, action})` from the v4 openers: date panel, menu, and the
    popover. The popover goes through a `MutationObserver` on `#wi-popover`, owned by v4, so
    the old popover code stays as it is. `#wi-popover` lives inside `#content` and is
    re-created by every full paint, so **the observer is re-attached at the end of every
    `WIV2.paint()`** (and disconnected first).
  - `action` is always one of the whitelist values. The tooltip text is looked up from it
    («αλλάζει την ημερομηνία φόρτωσης» etc.), never taken from the server string.
  - State: `others` (≤ 6 people), `changes`, `status: 'off'|'live'|'paused'|'forbidden'`,
    `lastOk`.
  - A beat result calls `WIV2.presencePatch()` (§e #18), never a paint.
- **Which writes carry `_expect`.** Only the decision write, not the cascade. The value sent is
  what the user saw, read from **server truth**:
  1. `_wiDateWrite`: `{[field]: curIso}`. That is the value the v4 date panel captured from
     the `WINTL.data` record when it opened (`_wk3PickDate` in v1 sends none).
  2. `_wiSaveFromPopover`: the **first** PATCH of the action only (3686, primary order;
     `Truck/Trailer/Driver/Partner/Partner Truck Plates/Is Partner Trip`), with
     `_wiExpectOpt(orderId, labels)`. Group members and the matched import follow without
     `_expect`. A 409 there writes nothing.
  3. `_wiSaveImportMatch`: the first export PATCH (3266):
     `_wiExpectOpt(orderId, ['Matched Import ID'])`.
  - **`_wiExpectOpt` reads the `WINTL.data` record** (exports, imports, adj) at call time.
    - Those records are the server read the row was painted from. The optimistic updates of
      the old functions write `row.*` (for example `row.importId` at 3240), not
      `WINTL.data`, so the old value is still there.
    - The few places that do mutate `WINTL.data` (6514, 6546) write the value they just
      saved, which is server truth for that field.
    - `_wiSaveFromPopover` ends with `await renderWeeklyIntl()` (3814), so cascades that
      triggers wrote (rt_sync on rota legs) are re-read before the next action.
    - Whatever is still stale is covered by the Worker rule «body equals current → no
      conflict».
  - It returns `undefined` when v4 is inactive, when the record is not in `WINTL.data` (a
    group member from another week), or when no label is checked. Then no `_expect` is sent
    and the request is today's.
  - Why only changed fields: triggers write `orders`, so comparing whole rows would raise false
    conflicts (PLAN §4).
- **Dialog**, inside the date panel and as a small modal elsewhere:
  - Text: «Ο Χρήστης Α την άλλαξε πριν 5″: Πέμ 8/10 → Παρ 9/10 · Η δική σου επιλογή: Σάβ 10/10. Ποια κρατάμε;»
    - The name is shown only when `by` is a username (§g.2).
    - `by:'user'` → «Άλλος χρήστης την άλλαξε…»;
    - `by:'auto'` → «Άλλαξε από αυτόματη ενημέρωση…»;
    - `by:null` → «Άλλαξε από τότε που την άνοιξες…».
    - Every value goes through `escapeHtml`.
  - **Date panel:** «Κράτα του Χ» = re-read the order and repaint · «Γράψε τη δική μου» =
    resend with `_expect = conflict.current`. If it changed again, it is another 409.
  - **Assignment and match** (old functions, through the hook; order of §a.4): the screen has
    already gone back to server truth before the dialog shows.
    - «Κράτα του Χ» = close.
    - «Ξανάνοιξε την ανάθεση» = reopen the popover on the fresh truth, with the row resolved
      by order id. The popover's form state is not replayed blindly.
  - Closing the dialog in any way = «Κράτα του Χ».
- **Rig cases:**
  - assign → assign on a rota leg of the same RT (same truck) → no 409;
  - cancel-member (`_wiCancelGroupMember`) → assign that member → no 409;
  - edit the matched import from its own row after a match → no 409;
  - a date change on VS CD after a Loading change that 028 cascaded → no 409;
  - a real change by a second user between open and save → 409 with the right fields;
  - a match 409 → after the dialog appears, the import cell is empty, the slot is not ⟳ and
    the popover is closed.

### g.5 Request budget and the server-side lever
- Cloudflare Workers Free = 100,000 requests/day for **the whole app**. Exceeding it fails
  every Worker request: the whole TMS goes down, not just presence.
- Worst case at 5 s: 6 users × 9 h × 720 beats/h = 38,880/day. Idle (30 s) and hidden (0)
  tabs bring it far lower; a second visible tab per user can at most double it.
- **Levers, fastest first:**
  1. **`PRESENCE_OFF=1`** (Worker env var, set in the Cloudflare dashboard, no Pages deploy):
     every beat answers 410, and every open tab stops beating at its next beat (within
     ≤ 30 s), for the session. The only extra request is that one 410 per tab.
  2. **`PRESENCE_MS`** (Worker env var): `next_ms` in every answer. Set it to 10000 or 30000
     and every open tab follows from its next beat.
  3. `FEATURES.WI_PRESENCE=false` (front, needs a push + `SW_VERSION`): only for new loads.
     Tabs open since 05:30 keep the old `config.js`, which is why levers 1 and 2 exist.
- The 404 back-off (endpoint not deployed) caps at 600 s, about 6 requests/hour/tab. Only a
  410 stops beats completely.
- Both env vars are plain vars. If the owner adds them, they must also go into
  `wrangler.toml`, or the next deploy removes them (CLAUDE.md: «Ό,τι plain var λείπει από το
  `wrangler.toml` σβήνεται»). §j.3 says so.
- Tonight the client ships at 5 s / 30 s / stop, behind `FEATURES.WI_PRESENCE=false`. The
  owner's 14-day number decides 5 s vs 10 s or a paid plan (PLAN §5.6) before he turns it on.

---

## h. Test and verification strategy

1. **Units** (`node --test`, from the worktree; no `node_modules` needed):
   - `tests/wi4-logic.test.js`;
   - `tests/api-expect-conflict.test.mjs`;
   - `tests/wi4-menu-parity.test.js`: the rules of §e.9 (every old handler at least once, no
     duplicate onclick, unique labels, map keys exist in menus or panels, one v4-only item);
   - `tests/wi4-contract.test.js`: every module exports the names of `tests/wi4-contract.stub.js`
     with the same arity;
   - `tests/sw-app-shell.test.js`: every `APP_SHELL` path exists;
   - `tests/wi4-vectors-hash.test.js`: the vectors copy matches WP8's hash (§d.5);
   - `tests/wi4-presence.test.js`: pacing ≥ 2.5 s with coalescing, TTL sent, 401 → session
     expiry once, 403 → forbidden, 410 → stop, 429 → not paused, observer re-attached;
   - the updated extracting tests, and `tests/critics/units.test.js` at 14;
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
     - keyboard map, including order form/palette open and off-page (no action); search 1/N;
       moved-row trace;
     - save failure (facade 500) while another row's popover is open, and while the
       new-import form holds `_wiPendingMatch` (§e.14): the PATCH targets the right order;
     - date panel: one write per field (Φόρτωση, Εκφόρτωση, Βέροια);
     - relay read 500 → banner + queue item (§e #21); national read 500 and slow → «—», no
       `NAT_NO_CARRIER`, one `NAT_UNKNOWN` (§d.2a); W+1 read 500 → queue item and «≥N»;
     - presence live, paused (404), 429 (not paused), 401, 403, 410; the popover stays open
       with focus and scroll unchanged across 3 beats;
     - conflict 409 for date, assignment and match, plus the rig cases of §g.4 (no false 409 on
       own cascades; a match 409 leaves the cell empty, no ⟳, popover closed);
     - `_expectChecked` absent → note;
     - paint failure (`WIV2.paint` forced to throw) → v1 board, banner once, `_broken` set,
       and no v4 hook or listener acts afterwards;
     - computed-style comparison v1 vs v4 of `#wi-ctx`, `#wi-panel`, `#wi-popover` children
       (§c.3);
     - every «ΠΡΟΣ ΑΝΑΘΕΣΗ» box has a rail and a queue item (§d.2);
     - row details (a)–(f) of §e #7;
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
     until no P1/P2 remains. The critic's brief lists the **known, intended differences**, so
     they are not reported as defects: EMPTY_RETURN «από σήμερα» amber, not red (§d.2); no E/I,
     ←→, [ ] or ⌘Z in the «?» sheet (§d.4); 4 stops show as 3 + «+1» with the national columns
     open (§d.1); no «Όλα στην W42 →» (§e #2); «Άνοιγμα παραγγελίας» present (§e.9).
6. **The five data-path questions, for every write v4 can trigger** (PR table; SELECT counts
   after the pilot, never writes tonight):

| Action | Endpoint | Table · columns | Proof (rig tonight / SELECT after pilot) | On failure | Role right (`PERMISSIONS`) |
|---|---|---|---|---|---|
| date change | `PATCH /v0/…/tblgHlNmLBH3JTdIM/{rec}` (+ `_expect`) | `orders.loading_datetime` / `delivery_datetime` / `cross_dock_date` (+ downstream sync: `national_loads`, `ramp`, RT by trigger) | PATCH body + read-back; `SELECT loading_datetime … WHERE legacy_id=…` | row re-reads, message stays, `app_errors` | the same as today: orders PATCH for owner/dispatcher/management/accountant; warehouse GET only → 403 |
| assignment | same + PA writes (`partner_assignments`) | `orders.truck_id/trailer_id/driver_id/partner_id/partner_truck_plates/is_partner_trip/partner_rate` | unchanged function `_wiSaveFromPopover` | unchanged + dialog on 409 | unchanged |
| match / join / unmatch | same | `orders.matched_import_id`, `group_id`, vehicle on the import | unchanged functions | unchanged | unchanged |
| groupage reorder | same | `orders.group_id` suffix | `_wiSaveSegOrder` (read-back exists) | toast as today + failure line | unchanged |
| presence beat | `POST /presence` | `presence.*` (068) | `SELECT count(*) FROM presence` ≤ 12 (6 users × 2 tabs) | «σε παύση» (5xx/404), session expiry (401), «δεν είναι διαθέσιμη» (403), stop (410) | `PRESENCE_ROLES` (all 5); names in `changes`/409 only for `AUDIT_READERS` |

7. **Static:** `node --check` on every changed JS file; `tests/critics/static.js` ratchet; grep
   that `worker/src` on `feat/wi-v4` equals `origin/main`.

---

## i. Work breakdown

**File-ownership rule:** one package owns a file for the whole night. Shared files (`app.html`,
`sw.js`, `config.js`, `docs/DECISION_LOG.md`) belong to the coordinator only. Every package
commits on its own branch `wi4/<wp>` cut from `feat/wi-v4`. The coordinator cherry-picks onto
`feat/wi-v4`: no merges (the classifier blocks them), never `main`.

**Integration seams are files, not prose:**
- `tests/wi4-contract.stub.js` (WP0) freezes `WI_INTERNAL`, `WIV2`, `WI4Actions` and the
  `core/api.js` opts shapes;
- `worker/test/fixtures/expect-vectors.json` (WP8, copied by WP1 with a hash check) freezes
  the comparator.

| WP | Owns (exclusive) | Depends on | Parallel? | Acceptance |
|---|---|---|---|---|
| **WP0** coordinator scaffold | `config.js` (`WI_V2:'off'`, `WI_PRESENCE:false`, `WI_V2_USERS`, `WI_PRESENCE_MS`), `app.html` script tags, `sw.js` `APP_SHELL`, stub headers of the four new files, `tests/wi4-contract.stub.js`, `tests/wi4-contract.test.js`, `tests/sw-app-shell.test.js` | — | first (minutes) | `node --check`; flag-off app loads; stub lists every signature of §a.6, §e.9, §e.14, §g.3; APP_SHELL test green; identity-rig baseline captured |
| **WP1** pure logic | `core/wi4-logic.js`, `tests/wi4-logic.test.js`, the `feat/wi-v4` copy of `worker/test/fixtures/expect-vectors.json` + `.sha256`, `tests/wi4-vectors-hash.test.js` | WP0 stub; WP8 vectors (hash) | yes | every signature in §d (incl. `v2Decide` tri-state, `PLURAL`, `KEYMAP` without E/I, `sameValue(a,b,label)`, `beatDelay` with 401/403/410/`serverNextMs`, `NO_TRUCK` never silent, `NAT_UNKNOWN`/`SOURCE_UNKNOWN`); all cases in §d pass; node and browser both load it |
| **WP2** old-module seams | `modules/weekly_intl.js`, the extracting tests it must touch (doors world gets `_wiExpectOpt`; impjoin etc. stub it), `tests/critics/wi4-identity-rig.js`, `tests/wi4-menu-parity.test.js` | WP0 | yes | §a.4–a.6 exactly (hooks incl. `nlState` seam, sticky fallback contract, inline mast expression; no `_wiSeenNote`); new functions written `){`; 410/410 units green; identity rig diff **empty** for board HTML, every menu, every request body, `reportPageMetrics` args and `WINTL._busy`, with **zero** v4 listeners/timers/fetches at load, with and without `tms_wi4='1'`. **Separate commit:** removal of `delivN/lateN/parRows` (identity rig still empty) |
| **WP3** CSS | `assets/style.css` (wi4 block only), `tests/critics/units.js`, `tests/critics/units.test.js` (13 → 14), `docs/redesign/baseline.json` entries | this doc | yes | tokens of §c.2 with `var(--existing)` wherever equal; no `--wi4-unassigned`; `styles.hex` raised only by the genuinely new values and `styles.truncate` by the exact count, each with a `_note`; `.wi4`/`body.wi4-on` equivalents for the `.wk3.wi2`-scoped overlay rules (§c.3); no shared selector changed; `static.js` green |
| **WP4** board renderer | `modules/weekly_intl_v2.js` | WP1, WP2 API, WP3 classes, WP0 stub | yes, against the stub; integrates after WP1/2/3 | §e rows 1–8, 11–16, 18, 20–22 and §e.14; §d.2a; §f; `WIV2.paint/repaintRow/shelfPaint/onSync/feedTog/conflict/switchHTML/active/rowIdOf/presencePatch/noteMove`; `onSync` never rebuilds; `_broken` sticky; every document listener guarded; no hex; no `wk3-*`/`wi2-*` layout classes; contract test green |
| **WP5** actions | `modules/wi4_actions.js` | WP1, WP2 builders, WP0 stub | yes | §e #3, #9 (= §e.9), #10 (field switch, capture-phase ←/→), #17, #19; menu inside `#wi-ctx` from moved nodes; dedupe + section rules; panel relabel via observer; menu-parity test green; date write body equals today's plus `_expect` only when active |
| **WP6** API | `core/api.js`, `tests/api-expect-conflict.test.mjs` | WP0 stub | yes | §g.3; every existing api test green; no-opts requests byte-identical. **Separate commit + its own DECISION_LOG text handed to the coordinator:** removal of `atTrackVersion(s)`, the `'Last Modified'` check and `atAutoRefresh` |
| **WP7** presence client | `core/wi4-presence.js`, `tests/wi4-presence.test.js` (fetch stubbed) | WP1 | yes | §g.4: per-tab id, ≥ 2.5 s pacing with coalescing, TTL, 404/5xx paused, 429 not paused, 401 → `tmsSessionExpired` once, 403 forbidden, 410/stop → off, observer re-attach API, never «κανείς», no paint call |
| **WP8** Worker | branch `deploy/worker-presence` from `origin/deploy/worker-temp-cmr`: `worker/src/index.js`, `worker/test/presence.test.mjs`, `worker/test/expect-conflict.test.mjs`, `worker/test/fixtures/expect-vectors.json` + `.sha256` | — (it owns the vectors) | yes | §g.2: `PRESENCE_ACTIONS` whitelist, `PRESENCE_OFF`/`PRESENCE_MS`, `retry_after_ms` in body, `p_names` from `AUDIT_READERS`, label canonicalisation, `shapeOneStrict`, `before===null` → 404, body-equals-current rule, attribution with both key styles, CAS via `dbUpdateWhere`; 158/158 + new tests green; guard markers (the three + `tblStockLots: {` + `"Move Kind": "move_kind"`) still present; **pushed, not deployed** |
| **WP9** SQL | `worker/migrations/drafts/068_presence*.sql` (5 files) | — | yes | §g.1: PK `(user_sub, tab_id)`, `expires_at`, action/record/tab CHECKs, `changes` join on both key styles, human vs `auto_n`, clamp, `p_names`; each file one `DO` block; header «ΔΕΝ ΕΚΤΕΛΕΣΤΗΚΕ»; reviewed by a second agent for grants, RLS and CHECKs |
| **WP10** fixture + board rig | `tests/fixtures/wi4-week.json`, `tests/critics/wi4-board-rig.js` | fixture first (no deps); rig runs after WP4/5 | fixture yes; rig after integration | every case in §h.2; rig scenarios of §h.4 green; overflow and contrast scans green |
| **WP11** integration + evaluation | `feat/wi-v4` cherry-picks, stamps (`?v=` + `SW_VERSION`), `docs/DECISION_LOG.md` entries (v4 build; dead-code removal as its own entry), `docs/weekly-intl-redesign/` evaluation notes | all | last; repeat | all gates of §h green; independent critics (visual with the brief of §h.5, dispatcher, code review) until no P1/P2 remains; flag still `'off'` |

Order of the night:
1. WP0.
2. In parallel: WP1, WP2, WP3, WP6, WP7, WP8, WP9 and the WP10 fixture. WP1 takes the vectors
   file from WP8 as soon as WP8 commits it, and until then works against the contract.
3. WP4 and WP5 (they may start on the stub while step 2 runs).
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
3. **Worker deploy** of `deploy/worker-presence`, after 15:00:
   - the full guard before and after (the three, `tblStockLots: {`, `"Move Kind": "move_kind"`);
   - bindings checked through the CF API;
   - smoke: login, one save, one `POST /presence`;
   - if you want the levers ready, add `PRESENCE_MS = "5000"` (and later `PRESENCE_OFF`) to
     `wrangler.toml` **and** the dashboard. A plain var missing from `wrangler.toml` is wiped
     by the next deploy.

   After it:
   - sync `worker/src` + `worker/test` to main;
   - add `PRESENCE_ROLES` and `_expectChecked` to CLAUDE.md as feature markers.
   - If 067 goes first, the branch is rebased on it before the deploy.
4. **Review of `feat/wi-v4`:** SHA to the coordinator → independent reviewer → GO →
   fast-forward to main with the flag **`'off'`**, then `cmp` on Pages.
5. **Pilot:** which dispatcher (PLAN §5.1). Then `FEATURES.WI_V2='pilot'` with
   `WI_V2_USERS=['…']`, or `'pilot'` plus `?wi4=1` on that browser. One day; then count
   `app_errors` and Cloudflare requests. Back to `'off'` stops it for everyone at once.
6. **Open questions**, one at a time:
   - **ΕΚΔΟΧΗ 9/10 or the main board?** The DECISION_LOG entry of 10/10 ends «Εκκρεμεί:
     επιλογή owner ανάμεσα στις δύο», and no later entry records a choice. PLAN adopts the
     ΕΚΔΟΧΗ implicitly, and so does this design (soft boxes, red only today–tomorrow). If you
     pick it, the rules sheet «Χρώματα»/«Θέλουν δράση» is updated («Navy ιδιόκτητο», «Κόκκινο
     = χωρίς ανάθεση»). If you pick the main board, the tokens of §c.2 change and nothing else.
   - ←/→ for export/import and `[ ]` for the week (the 10/10 design), or ←/→ stays week as in
     `ui.js:407`? (§5.2) Tonight **nothing is bound** for the part switch.
   - names of colleagues in «N αλλαγές από Χ» and in the 409 dialog: tonight only
     owner/management (the roles that read `/audit` today) see names; everyone else sees «άλλος
     χρήστης». Should dispatchers see names?
   - `_wiPanelJoinLoad` and `_wiPanelGroupBuild(..,true)` are two actions; tonight they are
     «Groupage εισαγωγών · σε αυτό το φορτίο…» and «Groupage εισαγωγών…». One name or two?
   - 4 stops at 1920 with the national columns open show 3 + «+1» (the column is ~207px, 4
     points need 248px). All 4 show only with the national columns collapsed. Accept, or
     narrow the national columns?
   - EMPTY_RETURN «από σήμερα»: the rules sheet says amber, and board/sheet 15 draw it red.
     Tonight: amber (rules sheet).
   - amber volume: NO_TRUCK is now amber for every unassigned load beyond tomorrow. If the
     queue feels flooded, decide a rule; it is never a silent cutoff.
   - city on line 2 or country only? (owner sheet item)
   - Inter for Greek text? (owner sheet item; tonight DM Sans as decided)
   - order form beside or over the board (§5.3; tonight: over, as today);
   - «στάλθηκε στον οδηγό» (§5.4; not built, needs a new column);
   - 067 «Καθυστέρηση» (§5.5; hidden until then);
   - 1440: national columns closed by default? (§5.7; tonight: as today);
   - Φ8 Figma for «φορτώνει», empty week, all days open, 1440 (tonight: minimal versions,
     marked for review);
   - distance «≈ km» in the match list (rules sheet): needs coordinates, not built.
7. **Designed, not built tonight** (each needs a new write or a new behaviour, so it waits
   for its own GO):
   - **Αναίρεση** (rules sheet: match/unmatch, delivery order, date; sheet 14 #4/#6 «✓
     Αποθηκεύτηκε — … · Αναίρεση · 10 δευτ.»). There is no undo today. A date undo would go
     through the same `_wiDateWrite` with the previous value and its own `_expect`, but
     match/unmatch undo touches the cascade and needs its own design. The success line never
     shows ✓ before the write has answered.
   - **Drag verdict** on the target before the drop, and the server verdict after it,
     re-reading only the two rows (R3 9/10, rules «Σύρσιμο»). Today the handlers decide on
     drop only.
   - **Temperature question** before a join or groupage write when temperatures differ
     (10/10). It would add a confirm step inside old write paths.
   - **Stop reorder inside a single order** (sheet 14 «Αλλαγή σειράς σημείων»). It is decided
     in DECISION_LOG 10/10 (drag within the column, ✓ locked, simple change = save + Αναίρεση,
     last-point change = question), so it is **decided and deferred**, not open. It needs a new
     `order_stops` write. Groupage member reorder works through the existing
     `_wiSaveSegOrder`.
   - **A state for the documents index** (order-docs.js swallows failures). Until then,
     documents never feed a flag, count or queue item (§d.2a).
8. **Known debt for Φ9:**
   - old failure and refusal messages that say «#N» (row numbers) are kept verbatim behind a
     client/route prefix; rewording them is Φ9;
   - `atPresenceStart`'s localStorage half goes with the old board.

**Safe defaults tonight:**
- `FEATURES.WI_V2='off'` (overrides every opt-in), `WI_V2_USERS=[]`,
  `FEATURES.WI_PRESENCE=false`;
- conflict check self-detecting through `_expectChecked`;
- no part-switch keys (no E/I); ←/→ change the week as today; the «?» sheet lists only bound
  keys;
- «Καθυστέρηση» hidden;
- no role gate added or removed: `_wiBlockReadOnly` is called exactly where the old openers
  call it; audit names follow today's `AUDIT_READERS`;
- partner rates visible as today;
- no auto-match;
- status vocabulary unchanged.

---

## k. Review log (revision 2, round 1)

All 44 findings were checked against `origin/main 626f0820` before the doc was changed.
Accepted means fixed in the section named. «Partly rejected» means the fix was adopted but one
claim in the finding is factually wrong, and the reason is given.

| # | Sev | Finding (short) | Outcome | Where |
|---|---|---|---|---|
| 1 | P1 | `onSync` rebuilds rows mid-action, so state keyed by row id is retargeted | accepted (verified `_wiBuildRows` 794 resets `rows`/`_seq`) | §a.4, §e.14, §f |
| 2 | P2 | `WI_V2=false` is no kill switch | accepted | §b |
| 3 | P2 | non-sticky fallback | accepted | §a.4 |
| 4 | P2 | `_seen` snapshot goes stale → false 409 | **partly rejected:** example (1) is wrong. `_wiSaveFromPopover` ends with `await renderWeeklyIntl()` (3814), and revision 1 refreshed `_seen` there, so the rt_sync cascade was re-read. Examples (2)–(4) hold. The fix (no snapshot, read `WINTL.data`, «body equals current» rule) is adopted in full, and so are both rig cases | §a.5, §g.2, §g.4 |
| 5 | P2 | audit_log mixed keys/actors in attribution and `changes` | accepted (verified 013/020/023/028/030 write `trigger:%` with role `system` and `id::text`). Human/auto split uses the existing `role` column | §g.1, §g.2 |
| 6 | P2 | `shapeOneWithLinks` swallows errors; `before===null` | accepted (verified 2684–2695, 2928) | §g.2 |
| 7 | P2 | 15 s window vs 30 s idle beat | accepted (per-row TTL) | §g.1 |
| 8 | P2 | 429 in normal use, one row per user, `Retry-After` unreadable | accepted (verified `corsHeaders` 20–30 has no expose header) | §g.1, §g.2, §g.4 |
| 9 | P2 | `action` free text / XSS; unbounded `changes_since`; names to all roles | accepted; names follow `AUDIT_READERS` (owner, management, verified at 195), owner asked | §g.1, §g.2, §e #18, §j.6 |
| 10 | P2 | no server-side lever for the budget | accepted | §g.2, §g.5 |
| 11 | P2 | conflict hook leaves ⟳, a disabled button and an optimistic match | accepted | §a.4 |
| 12 | P2 | `nlBySrc` absence becomes «χωρίς μεταφορέα» | accepted (verified 700–714) | §a.4, §d.2, §d.2a, §e #12 |
| 13 | P2 | relay error banner missing | accepted | §e #21 |
| 14 | P2 | presence could repaint every 5 s | accepted | §e #18, §g.4 |
| 15 | P2 | duplicate hex tokens; `--wi4-unassigned` ≠ system; `styles.hex` ratchet | accepted (verified style.css 57/61/72/74/75/161; baseline `styles.hex 442`) | §c.1, §c.2 |
| 16 | P3 | doors world lacks stubs; units count 13; `){` regex | accepted (verified `units.test.js:11`, impjoin regex 32–34) | §a.3, §c.1 |
| 17 | P3 | `.wk3.wi2`-scoped overlay CSS does not apply | accepted | §c.3 |
| 18 | P3 | menu outside `#wi-ctx`; re-stringified onclick; duplicate label | accepted (verified `_wiCtxBtn` 4050) | §e.9 |
| 19 | P3 | tile drag handler strings; sticky classes | accepted; the `wk3-seg` class is **not** adopted because it is a global layout rule (style.css 7404), so v4 clears its own classes | §a.7, §f |
| 20 | P3 | keyboard «never acts» gaps; synthetic event; ←/→ under the date panel | accepted (verified `ui.js:407` bubble listener) | §d.4 |
| 21 | P3 | `sameValue` too loose; two labels on one column; checkbox | accepted (verified 1350/1425) | §d.5, §g.2 |
| 22 | P3 | vectors file copied across branches | accepted | §d.5 |
| 23 | P3 | non-atomic check | accepted (CAS via `dbUpdateWhere`, precedent 4335–4346) | §g.2 |
| 24 | P3 | identity rig gaps (whitespace, unexported menus, metrics, load activity, APP_SHELL) | accepted (verified `_wiPreCtx`/`_wiLotCtx` are not on `window`) | §a.1, §a.4, §b |
| 25 | P3 | 401/403 in presence; observer lost on paint | accepted | §g.4 |
| 26 | P3 | failed cross-week fetch / failed re-read | accepted | §a.5, §d.2a, §e #2, §e.14 |
| 27 | P3 | work breakdown seams (units.test, contract, dead code) | accepted | §a.1, §g.3, §i |
| 28 | P1 | NO_TRUCK invented cutoff | accepted. The ΕΚΔΟΧΗ entry reads «κόκκινο μόνο για σήμερα–αύριο», i.e. amber beyond, never none | §d.2 |
| 29 | P2 | «Άνοιγμα παραγγελίας» missing | accepted | §e.9 |
| 30 | P2 | duplicate menu items after merge | accepted | §e.9 |
| 31 | P2 | panels keep old names | accepted (verified 4326/4328/4437; the import panel already says «Groupage εισαγωγών») | §e.9 |
| 32 | P2 | E/I invented; «?» lists non-existent keys | accepted (DECISION_LOG 10/10 binds ←→/[ ], PLAN §5.2 open) | §d.4, §j |
| 33 | P2 | Delivery and VS CD edits lost from the board | accepted (field switch) | §e #7, §e #10 |
| 34 | P2 | unknown ≠ empty for national/docs/stock | accepted. Docs have no state seam (order-docs.js swallows failures), so they are excluded from every count instead | §d.2a |
| 35 | P2 | designed behaviours silently missing | accepted; stop reorder is recorded as **decided and deferred**, not open | §d.1, §j.7 |
| 36 | P3 | plurals, «σήμερα» | accepted | §d.3, §e #6 |
| 37 | P3 | decided row details | accepted | §e #7 |
| 38 | P3 | ΤΟΠΙΚΗ ΠΑΡΑΔΟΣΗ sub-row | accepted | §e #11 |
| 39 | P3 | title bar / queue band details | accepted | §e #1, §e #2 |
| 40 | P3 | EMPTY_RETURN vs Figma | accepted (keep the rules sheet, note it) | §d.2, §h.5, §j.6 |
| 41 | P3 | 4 points at 1920 | accepted (measured, to the owner) | §d.1, §j.6 |
| 42 | P3 | menu icons/hints, verbatim presence note | accepted | §e.9, §e #10 |
| 43 | P3 | `changes` counts automatic writes; «#N» messages | accepted | §g.1, §e.14, §j.8 |
| 44 | P3 | provenance of ΕΚΔΟΧΗ; city/Inter questions; dead counters | accepted. The DECISION_LOG entry belongs to the coordinator (shared file), so the choice is a morning question. Dead counters are removed in WP2's separate commit | §j.6, §g.3, §i |
