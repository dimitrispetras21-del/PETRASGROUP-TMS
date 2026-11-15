# Weekly International — feature audit, cluster 2: groupage (export, import), split order, groupage overview

Read-only audit from code, 15/11/2026, worktree `design-petras-tms-redesign-05f337`. **Nothing was run**: no app, no database, no Worker, no test. Every defect below comes from reading code and is marked with a confidence.

Short names for files: `wi` = `modules/weekly_intl.js` · `wi2` = `modules/weekly_intl_v2.js` · `wi4a` = `modules/wi4_actions.js` · `wi4l` = `core/wi4-logic.js` · `wk` = `worker/src/index.js` · `mock` = `docs/design/redesign-2026-11/index.html`.

Common facts used by every feature

- Every write below is a `PATCH` / `POST` / `DELETE` through the facade on table id `tblgHlNmLBH3JTdIM` (ORDERS → Postgres `orders`, read through view `orders_with_derived`), plus `tblaeY5QOHAS1gyE8` (ORDER STOPS → `order_stops`) and `tblUhgqnmiam5MGNK` (PARTNER ASSIGNMENTS → `partner_assignments`), plus `DELETE /costs/rt/:id/legs?order_id=N` for the round trip.
- Labels the cluster writes, all confirmed in the ORDERS map (`wk:1317-1530`): `Group ID`→`group_id` · `Truck`/`Trailer`/`Driver`/`Partner` (links → `truck_id`, `trailer_id`, `driver_id`, `partner_id`) · `Is Partner Trip`→`is_partner_trip` · `Partner Truck Plates`→`partner_truck_plates` · `Partner Rate`→`partner_rate` · `Status`→`status` · `Assigned At`→`assigned_at` · `Matched Import ID`→`matched_import_id` · `Parent Order` (link → `parent_order_id`) · `Leg No`→`leg_no` · `Loading Location 1..10`, `Unloading Location 1..10` (links) · `Loading DateTime`, `Delivery DateTime`, `Loading DateTime 2..10`, `Unloading DateTime 1..10` · `Loading Pallets 1..10`, `Unloading Pallets 1..10` · `Type`→`order_type` · `Direction` · `Client` (link) · `Reference` · `Pallet Type` · `Pallet Exchange` · `Refrigerator Mode` · `Goods` · `Temperature °C` · `Temp Per CMR` · `Veroia Switch` · `Price`→`price`.
- Read-only label: `Total Pallets` is in `computed`, not in `fields` (`wk:1321-1330`); a write of it is dropped. The split code knows this (`wi:4900-4908`).
- Labels read by the board that are **not** in the ORDERS map: `Client Name`, `Client Summary` (the board's own comment says so, `wi:1498-1502`, `wi:2072`), `Matched Export ID` (read at `wi:3244`, no hit in `wk`). `Loading Summary` / `Delivery Summary` are filled in by the board from the stops (`wi:130`), not by the map.
- Roles in the Worker for `orders` (`wk:515-675`): owner all; dispatcher GET/POST/PATCH/DELETE; management GET/POST/PATCH; accountant GET/PATCH; warehouse GET. Round-trip leg removal `/costs/rt` DELETE: owner and dispatcher (`wk:4446-4450`). On the board, only a role with `planning` = full (owner, dispatcher) passes `_wiBlockReadOnly` (`wi:589-593`, toast «Μόνο ανάγνωση για τον ρόλο σου»).
- 33 pallets is a warning, never a refusal (owner 9/10, `wi:4212-4250`). One constant `WI_PAL_CAP=33`.

---

## 1. Export groupage

### A. Flow

**1.1 Build — «Groupage εξαγωγών…»** (v1 label «Ομαδοποίηση…», relabelled `wi4a:86-90`)

1. Entry points: per-load menu of an export row (✈ click, Enter, right-click), section ΕΞΑΓΩΓΗ (`wi:4719-4721`). On a row that is already a group the same item reads «Groupage εξαγωγών… (πρόσθεση)» (`wi4a:340`). Not offered on a split leg (`wi:4719`), on a split parent (it gets the split menu only, `wi4a:228-232`), on a pre-order or a lot row (own menus). Disabled with title «Καμία εξαγωγή χωρίς ανάθεση σε αυτή την εβδομάδα» when there is no candidate.
2. Opens the side panel `#wi-panel`, title «Groupage εξαγωγών», under it the row's line «ημ. φόρτωση τόπος → ημ. παράδοση τόπος» (`wi:4315-4326`, `wi:4497-4546`).
3. Body: header «Ελεύθερες εξαγωγές (N)» (+ « — κύλισε» past 6), one checkbox per candidate: delivery place cut at 28 characters + «(Np)»; under a candidate that takes the sum past 33, amber arithmetic «ΦΑΓΕ = 24 π. + Lidl = 10 π. = 34 > 33» (`wi:6119-6122`, `wi:4234-4236`). Candidates within 33 come first (`wi:4519`). Running sum at the bottom «24p / 33p», past 33 «35p / 33p · > 33» in red (`wi:4231`, `wi:4549-4554`). Nothing pre-checked.
4. Which loads may join (`_wiExpGroupCands`, `wi:4253-4255`): every export row of the loaded week that has **no truck and no partner** (`!r.saved`), is not this row, and is not a stock lot. The base row itself may already have a truck. No other filter (see C-4).
5. Buttons: «Άκυρο», «Ομαδοποίηση» (v4 renames the button after the panel title). No pick → toast «Επίλεξε τουλάχιστον ένα φορτίο».
6. Past 33: one question for the whole action, «Σύνολο 24 + 10 = 34 παλέτες — πάνω από 33. Να μπει;» + the arithmetic line, title «Πάνω από 33 παλέτες», button «Να μπει» (`wi:4245-4250`). Cancel writes nothing.
7. Save (`_wiMerge`, `wi:6466-6479`), once per picked row: the screen merges the rows first and says «Ομαδοποιήθηκε» (+ « (35 π. — πάνω από 33)»), **then** writes. Write = `PATCH` ORDERS `{ 'Group ID': 'GRP-' + last 8 characters of the first order's id }` on **every** order of the row, one request each (`_wiGroupPatch`, `wi:6451-6465`). Then `rtOnOrderSaved(first order)` so the group becomes one round trip.
8. After success: line under the row «Η ομάδα αποθηκεύτηκε».
9. Failure: line «Η ομάδα ΔΕΝ αποθηκεύτηκε στη βάση (λείπει το πεδίο Group ID στον Worker/DB;) — θα χαθεί στην ανανέωση» and toast «Η ομάδα δεν αποθηκεύτηκε στη βάση — θα ισχύει μόνο μέχρι την ανανέωση». No read-back of the value.
10. Half-way: yes. One request per order, no transaction. If some orders took the new `Group ID` and others did not, the next reload shows two rows (rows collapse by exact text equality of `Group ID`, `wi4l:146-163`). The message says "will be lost on refresh", which is not what happens in a partial write.

**1.2 Add a load to an existing group** — the same panel and the same write (1.1) from the group's menu. All members get the plain `GRP-…` again (see C-1, C-2).

**1.3 Pallet sum and the 33 display**

- Row cell: sum of `Total Pallets` of the members; a member with no figure is said, never counted as 0: «28 p +?» with tooltip «Σύνολο ομάδας · 28/33 · 1 στάση χωρίς παλέτες»; no member with a figure → «—» («Οι παλέτες δεν έχουν καταγραφεί σε κανένα μέλος») (`wi:2237-2245`; v4 uses the same rule through `WIV2._pals`, `wi4a:114-120`).
- Colour: normal below 30, orange from 30, red above 33 (`wi:2229`).
- «ΕΠΟΜΕΝΑ» reason «πάνω από 33π», action «Άνοιγμα» (`wi4l:538`, `wi4l:556`).
- Panels: running sum and amber arithmetic (1.1). Success toast names the total past 33.

**1.4 The collapsed row and its expansion** (v4)

- One row for the whole group; where the reference goes it says «N φορτία» (`wi2:1257`). The row is filed on the earliest delivery day of its members, inside the week (`wi4l:263-275`, `wi2:786-791`).
- Both ends list **every stop of every member**, each with its own pallets, loadings by date (`wi2:890-900`). What does not fit folds behind «+N»; a click on «+N» opens a table «# · Σημείο · Τόπος · Παλέτες · Ημέρα» (the day column only when the stops fall on different days) (`wi2:806-828`). A first point of another day carries its day and a divider line (`wi2:858-862`).
- Each point is a click target (opens that member's order) and a drag tile: dragging one tile onto another reorders the group (`wi2:798-804`, `wi:6576-6646`). The drag write = 1.5's write with read-back and `rtOnOrderSaved`; toasts «✓ Σειρά αποθηκεύτηκε» / «Η σειρά δεν αποθηκεύτηκε πλήρως — δοκίμασε ξανά».
- Click on the row body opens the rota card (`wi2:1285`).
- Veroia information is not drawn on a group row (`wi2:1246`, `wi2:1316`).

**1.5 Rota card of a group** (`_wiRota`, `wi:6893-6974`)

1. Opens as a right-side sheet, 480px, dark header «Καρτέλα Ρότας — GRP ×N», line «N παραγγελίες · pallets · truck · driver» or «Προς ανάθεση».
2. Section «Παραγγελίες του group»: one card per member — name (see C-9), «Ref», pallets («— παλ» when unknown), «φόρτωση → παράδοση», button «Επεξεργασία» (closes the card and opens that order's form).
3. Section «Σειρά παράδοσης — βελάκια ↑↓»: numbered list, delivery place, delivery date · name, arrows ↑ ↓. Note under it: «Η σειρά καθορίζει την αρίθμηση στο Weekly και τη διαδρομή στο φύλλο οδηγού.»
4. Footer: «Διάλυση ομάδας» (red, left), «Κλείσιμο», «Αποθήκευση σειράς».
5. Save (`_wiRotaSave`, `wi:6953-6973`): `PATCH` ORDERS `{ 'Group ID': base + '|' + ids in the new order }` on every member; base = the part before `|` of the current value, else `GRP-` + 8 characters. Toast «Η σειρά αποθηκεύτηκε ✓» or «Η σειρά δεν αποθηκεύτηκε πλήρως — δοκίμασε ξανά». The card closes either way. No read-back, no round-trip sync (the drag path has both; see C-8).
6. Half-way: yes; a partial write splits the group in two on the next reload (text equality).
7. The card exists for export groups only; it reads members from the exports list (`wi:6895`).

**1.6 Remove a member — «Βγάλε από το groupage»** (v1 «Ακύρωση groupage»; member submenu «▸», `wi:6678`, `_wiCancelGroupMember` `wi:6762-6855`)

1. Live read of the member's status. Confirm «Αφαίρεση αυτής της παραγγελίας από το groupage; Η παραγγελία φεύγει ΧΩΡΙΣ ανάθεση.», title «Ακύρωση groupage», button «Αφαίρεση». For a member already on the road or delivered the text is longer: «Αφαίρεση από το groupage παραγγελίας που έχει ήδη εκτελεστεί. Η παραγγελία φεύγει ΧΩΡΙΣ ανάθεση και βγαίνει από το δρομολόγιο της ομάδας.» + the list + «…Αφαίρεση παραγγελίας από ΚΛΕΙΣΤΟ δρομολόγιο που έχει κι άλλες παραγγελίες δεν επιτρέπεται — σταματά χωρίς αλλαγές.» + «Η κατάσταση (Status) αυτών των παραγγελιών δεν αλλάζει.» (`wi:3193-3203`).
2. Writes, in order: (a) its leg leaves the round trip, `DELETE /costs/rt/:id/legs?order_id=N`; a failure stops everything: «Η αφαίρεση σταμάτησε — …» (closed trip: «… είναι κλειστό — ζήτα από τον owner»; 403: «χωρίς δικαίωμα αφαίρεσης σκέλους γύρου»). (b) `PATCH` the member `{ 'Group ID': null, Truck: [], Trailer: [], Driver: [], Partner: [], 'Is Partner Trip': false, 'Partner Truck Plates': '' }` + `Status: 'Pending'` only when it was `Assigned`; read back (group and vehicle must be empty) else «Η αφαίρεση από το groupage απέτυχε». (c) the survivors' `Group ID` is rewritten without the member (`wi:6702-6749`); one survivor → its `Group ID` becomes `null`. Failure: «Η παραγγελία αφαιρέθηκε αλλά η σειρά της ομάδας ΔΕΝ ενημερώθηκε πλήρως στη βάση — έλεγξε χειροκίνητα».
3. After success: the member becomes its own unassigned row, toast «Αφαιρέθηκε από το groupage — χωρίς ανάθεση ✓».
4. Half-way: (a) done, (b) failed → the order has no round-trip leg but still carries the truck and the group. (b) done, (c) failed → survivors disagree on `Group ID`.

**1.7 «Επιστροφή στο απόθεμα»** (`wi:6669-6677`, `wi:8150-8158`)

- Replaces «Βγάλε από το groupage» in the member submenu when the member is a stock piece and stock is on and the role may write stock. Disabled «σε κίνηση — δεν επιστρέφει» when the piece is on the road or delivered.
- Same write as 1.6 with other words: confirm «Επιστροφή στο απόθεμα — το κομμάτι μένει χωρίς φορτηγό, με όλα του τα στοιχεία.» (+ a paragraph when the piece has a local driver: «…μένει δηλωμένη, χωρίς φορτηγό. Διάγραψέ την ή άλλαξέ την όταν το κομμάτι μπει ξανά σε φορτηγό.»), title «Επιστροφή στο απόθεμα», button «Επιστροφή», toast «Επέστρεψε στο απόθεμα ✓». Then the stock shelf reloads. Undo is cleared.
- A lone matched piece (not in a group) has its own path from the import section: unmatch + leg off + vehicle off + group off, each read back (`wi:8159-8206`).

**1.8 Dissolve — «Διάλυση groupage»** (`_wiSplit`, `wi:6500-6536`)

1. Entry points: red item in the group's menu (`wi:4732`) — **no confirmation**; «Διάλυση ομάδας» in the rota card — confirm «Διάλυση της ομάδας; Τα φορτία επιστρέφουν ως ανεξάρτητες γραμμές. (Η ανάθεση μένει στην πρώτη γραμμή — οι υπόλοιπες θέλουν δική τους.)», title «Groupage», button «Διάλυση» (`wi:6980-6988`).
2. The screen splits the row first and says «Η ομάδα διαλύθηκε». Then: (a) `PATCH { 'Group ID': null }` on every member; if any fails: «Η ομάδα ΔΕΝ διαλύθηκε στη βάση (Group ID δεν καθαρίστηκε) — καμία ανάθεση δεν αδειάστηκε», full reload, stop. (b) for every member except the first: skip it if it is on the road or delivered; else its leg leaves the round trip, then `PATCH { Truck: [], Trailer: [], Driver: [], Partner: [], 'Is Partner Trip': false, Status: 'Pending' }`, read back.
3. The first member keeps the truck and the round trip.
4. Messages: «Η ομάδα διαλύθηκε αλλά κάποιο μέλος ΔΕΝ αδειάστηκε από ανάθεση/ρότα — έλεγξε χειροκίνητα: …»; «N μέλος είναι ήδη σε μεταφορά/παραδόθηκε — κρατά όχημα, κατάσταση και γύρο».
5. Half-way: yes at both steps; (b) per member is "leg off, then vehicle off", so a stop between the two leaves a member with a truck and no leg.

**1.9 Assignment of a group** (`_wiSaveFromPopover`, `wi:3769-4025`)

- «Ανάθεση…» opens the same assignment box as a single load. Validations: «Επίλεξε φορτηγό ή συνεργάτη»; partner without rate «Το κόμιστρο εξαγωγής είναι υποχρεωτικό για συνεργάτη»; with a matched import «Το κόμιστρο εισαγωγής είναι υποχρεωτικό για συνεργάτη»; same-day double booking → confirm «Πιθανή διπλή δέσμευση» / «Συνέχεια»; members already on the road → confirm «Αλλαγή ανάθεσης σε εκτελεσμένη».
- Save: the same assignment `PATCH` on **every member**, one request each: own truck `{ Truck, Trailer, Driver, 'Is Partner Trip': false, Status: 'Assigned', Partner: [], 'Partner Truck Plates': '' }`; partner `{ Partner, 'Is Partner Trip': true, 'Partner Truck Plates', Status: 'Assigned', Truck: [], Trailer: [], Driver: [], 'Partner Rate' }`; `Assigned At` on the first assignment. The conflict check (`_expect`) rides on the first member only. Then the matched import (and its import-group siblings), round-trip sync per member, one PARTNER ASSIGNMENTS row per member (`wi:4032-4056`), Veroia sync per member, full reload.
- Failure: «Η ανάθεση ΔΕΝ γράφτηκε σε N από M» under the row (v4). Half-way: yes, member by member.
- «Καθαρισμός ανάθεσης» clears every member of the group, also members outside the loaded week (read by `Group ID`), with confirm «Καθαρισμός ανάθεσης; Αδειάζουν N παραγγελίες (όλα τα μέλη της ομάδας).» (`wi:4101-4190`).

**1.10 Driver sheet / WhatsApp for a group**

- Menu item «Εκτύπωση / WhatsApp όλων…» and the printer button left of the assignment («Εξαγωγή: εκτύπωση ομάδας, N έγγραφα») open `print.html?orderIds=a,b,c&leg=export&sheet=driver|partner` in a new tab, members in the saved delivery order (`wi:6858-6869`, `wi2:1193-1195`). The page gives a cover with the whole route, one sheet per order, and **one** WhatsApp text for the group behind «📋 WhatsApp» (`print.html:764-768`, `:846`, `:994`, `:1158`).
- Partner or driver sheet is decided by the row's partner.

### B. Rules and edge cases

- Group identity = the `Group ID` text, identical on all members; rows collapse by exact equality (`wi4l:146-163`); the lead is the first member in read order (delivery date); the lead takes the match of any member (`wi4l:160`).
- Order of deliveries: the part after `|`; no suffix → by delivery date, then id (`wi:2430-2443`). A member not named in the suffix sorts last (position 99).
- "No group" is written as `null`, never `''` (`wi:6436-6452`).
- Split is not offered on a group (`wi:4817`, `wi4l:240`).
- Removing or dissolving: the round-trip leg leaves before the vehicle (`wi:5291-5307`); the round trip itself is never deleted.
- Executing members: remove = allowed after one confirm, status kept (`wi:6764-6780`); dissolve = they are skipped and keep truck and trip (`wi:6489`).
- A stock piece is never written into the suffix by the rewrite (`wi:6706-6713`); it may be dragged first by hand (`wi:6607-6610`).
- `Matched Import ID` is written on every member of an export group at match time (`wi:3386-3390`).
- GROUPAGE LINES / CONSOLIDATED LOADS are not touched by any of this; it is grouping of ORDERS only (`wi:6439`).

### C. Defects and doubts (read from code, not run)

| # | What | Evidence | Scenario → wrong result | Confidence |
|---|---|---|---|---|
| C-1 | Adding a load to a group throws away the saved delivery order | `wi:6472-6473` writes plain `GRP-…` to all members; the order lives after `|` (`wi:2430-2437`) | Group of three, order saved by hand as 3-1-2. Add a fourth load → all four get `GRP-xxxx` → the row and the driver sheet go back to "by delivery date" | high |
| C-2 | A load added to a group that already has a truck does not get the truck | `_wiMerge` writes only `Group ID` (`wi:6466-6479`); the assignment is written per member only by the assignment save (`wi:3871-3884`); the row's truck is read from the lead only (`wi:865-884`) | Group on ΚΗΙ-1234. Add an unassigned load that delivers earlier than the others → after reload it is the lead → the row shows «ΠΡΟΣ ΑΝΑΘΕΣΗ» while the other members still carry the truck. If it delivers later, the row looks assigned but that order has no truck in the table. Whether a database trigger repairs this was not checked | medium |
| C-3 | After «Διάλυση groupage» the loads that left the group are drawn nowhere until the board reloads | `wi:6506-6511` pushes rows without `type`; both renderers file only `type==='export'` / `'import'` (`wi4l:297-298`, `wi:1008`, `wi:1197`); no reload on the success path (`wi:6513-6536`) | Dissolve a group of three → one row stays, two loads vanish; v4 then shows «2 παραγγελίες δεν φαίνονται στον πίνακα: …» and writes to the error log (`wi2:1871-1886`) | medium-high |
| C-4 | The export candidate list does not apply the rules the import side applies | `wi:4253-4255` (only "no assignment, not a lot") versus `_wiJoinCheck` `wi:6213-6240` (cancelled, rota leg, split leg, split parent, piece) | A split order's parent (its assignment is cleared by the split) and an unassigned leg 2 both appear under «Ελεύθερες εξαγωγές». Picking leg 2 folds it into the group; the split frame then shows one leg. A pre-order and a cancelled export (if loaded) can be picked too | medium-high |
| C-5 | Dissolve and «Βγάλε από το groupage» leave the old match on the loads that leave | `Matched Import ID` is on every member (`wi:3386-3390`); neither `wi:6495` nor `wi:6795-6799` clears it | Group matched to an import. Remove one member → after reload that load, without truck, shows the same import as its return; the import is drawn under two rows | medium-high |
| C-6 | «Διάλυση groupage» from the menu writes at once, with no question | `wi:4732` calls `_wiSplit` directly; the rota card asks first (`wi:6982`) | One mis-click on the red line: group cleared on all, trucks cleared on all but the first, legs removed from the round trip; undo does not cover it | high |
| C-7 | A member that leaves a partner group keeps its partner cost | `wi:6795-6799` and `wi:6495` do not clear `Partner Rate`, do not delete the PARTNER ASSIGNMENTS row and do not call the pallet feeder; «Καθαρισμός ανάθεσης» does all three (`wi:4161-4178`). Dissolve also leaves `Partner Truck Plates` (`wi:6495`) | Group of two on a partner, 1.200 € each. Remove one → the order has no partner but still `partner_rate` 1.200 and a live partner assignment row | medium |
| C-8 | «Αποθήκευση σειράς» in the rota card is weaker than the drag | `wi:6963-6969` (no read-back, no `rtOnOrderSaved`) versus `wi:6626-6644` | The save says «✓» on the Worker's 200; the round trip keeps the old leg order until some other save of the group | medium (read-back), low (effect on the trip) |
| C-9 | The rota card names a member by its first loading place, not by its customer | `wi:6909`, `wi:6916` read `Client Name` / `Client Summary`, which are not ORDERS fields (`wi:1498-1502`), and fall to `Loading Summary` | Two members loaded at the same packing house for two customers read as the same name twice | high |
| C-10 | One partner rate is copied to every member of the group | `wi:3860`, `wi:3871-3877`, `wi:4036-4038` | Three orders on one partner truck, rate 2.400 → three orders with `partner_rate` 2.400 and three partner assignment rows of 2.400. If the rate is "per truck", the cost counts three times. Intent unknown: owner to say | medium (as a doubt) |
| C-11 | Grouping two loads that each have their own matched import hides one import | `_wiExpGroupCands` allows a matched, unassigned row; after reload the lead keeps its own match (`wi4l:160`) and the other import is "matched" but drawn under nothing | Two unassigned exports, each already matched to an import, are grouped → the second import disappears from the board (v4 banner «δεν φαίνονται») | medium |
| C-12 | A partial group write is reported as "will be lost on refresh" | `wi:6461-6463` | 3 members, 2 written, 1 failed → on reload two rows, not "no group"; the message points the wrong way | high |
| C-13 | The group id can be reused by a second group | `wi:6472` (id = 8 characters of the first order), `wi:6704-6705` (survivors keep the old base) | Load X led a group, was removed (survivors keep `GRP-X…|b,c`), then leads a new group → `GRP-X…`. The board keeps them apart (different text); a database rule that compares only the part before `|` (migration 066, drafts) would treat them as one group. Not checked in the database | low |
| C-14 | No share menu on the export group's print button | `wi2:1193-1195` (no `data-shq`) versus the import group `wi2:1199-1201` | Right-click on the export group's printer opens the row menu, not «Λήψη PDF · Κοινή χρήση» | medium |
| C-15 | The panel's candidate line shows only the delivery place (28 characters) and pallets | `wi:4515-4518` | Two candidates for the same city cannot be told apart: no customer, no day | high (as a gap) |

### D. The redesign must draw

| Item | Mock-up | Where it should live |
|---|---|---|
| Collapsed group row: mark with member count, both ends with «+N», pallet sum | PRESENT (row 3: layers «3», «+2», 33) | board row |
| Pallet states: sum with unknown member («28 +?»), all unknown («—»), orange from 30, red above 33 | PARTLY (33 drawn; unknown and over-33 states not drawn on a group) | row cell + overview header |
| Expansion: every stop of every member with pallets and day; day divider | PARTLY (overview lists members, one route per member; per-stop pallets and day column not drawn) | overview panel or «+N» table |
| Click on a point opens that member's order | PRESENT (chevron per member row) | overview rows |
| Overview / rota card: header with truck, driver, delivery day, member count, pallets | PRESENT | overview panel |
| Reorder deliveries by drag, «Αποθήκευση σειράς» | PRESENT (grips, button) | overview panel |
| Reorder by keyboard (today ↑ ↓) | MISSING | overview rows |
| Saved / failed state of the order save («Η σειρά δεν αποθηκεύτηκε πλήρως — δοκίμασε ξανά») | MISSING | line in the panel footer |
| Build panel «Groupage εξαγωγών»: candidate list with customer, route, day, pallets; running sum; amber arithmetic past 33; empty state | MISSING (menu entry «Ομαδικό φορτίο με άλλες εξαγωγές» only) | panel from the menu; could be the overview in "add" mode |
| Add a load to an existing group («…(πρόσθεση)») | MISSING | «+ Φορτίο» in the overview |
| Question past 33 («Σύνολο 24 + 10 = 34 παλέτες — πάνω από 33. Να μπει;» / «Να μπει») | MISSING | confirm |
| Remove one member («Βγάλε από το groupage») + its confirm, incl. the longer text for a member on the road | PARTLY (a remove icon on one row only; no confirm drawn) | every overview row |
| «Επιστροφή στο απόθεμα» for a stock piece, and its disabled state «σε κίνηση — δεν επιστρέφει» | MISSING | overview row of a piece |
| Dissolve + confirm | PARTLY («Διάλυση» drawn; no confirm) | overview footer |
| Result messages of dissolve («κρατά όχημα, κατάσταση και γύρο», «ΔΕΝ αδειάστηκε… έλεγξε χειροκίνητα») | MISSING | toast / line under the row |
| Assignment of a group: same box; partner rate (one per truck or per order — owner) | PARTLY (assignment boxes drawn for a single load; nothing says it applies to N orders) | assignment box header «3 παραγγελίες» |
| Driver sheet for the group (cover + N sheets, one WhatsApp text) | PARTLY («Φύλλο οδηγού» button; what it opens is not drawn) | overview footer + menu |
| Member already delivered inside a group (faded point, ✓) | MISSING | overview row state |
| Group that spans two days (member delivers a day later) | PRESENT («!» on Donau Markt) | overview row |
| Menu of a group row: no «Σπάσιμο σε σκέλη» | check the drawn menu: it lists «Σπάσιμο σε σκέλη» on a row captioned as a single load; on a group it must not appear | menu |

---

## 2. Import groupage

### A. Flow

**2.1 «Groupage εισαγωγών…»** (import row with no export, `wi:5965-5983`)

1. Entry: menu of an unmatched import row, section ΕΙΣΑΓΩΓΗ. Hidden on a split leg and on a row that holds a stock piece. Disabled «Καμία ελεύθερη εισαγωγή ή φορτίο φορτηγού σε αυτή την εβδομάδα».
2. Panel «Groupage εισαγωγών» (`wi:4497-4546`), two lists:
   - «Ελεύθερες εισαγωγές (N)»: checkboxes, many may be picked. Candidates (`wi:4608-4609`): import rows of this week that are not matched, not of a neighbouring week, not a lot, hold no piece. Label = first loading place (28 characters) + pallets.
   - «Σε φορτίο φορτηγού (N)»: the import loads that trucks already carry (an export with a matched import), nearest export delivery first; label «πινακίδα ή συνεργάτης ή "χωρίς όχημα" · τόπος παράδοσης της εξαγωγής · πελάτες της εισαγωγής» + pallets. Only one may be picked. A load that cannot take this import is listed disabled with the reason under it.
   - Running sum as in 1.1.
3. Refusal texts (one place, `_wiJoinCheck`, `wi:6213-6240`): «Η … είναι ακυρωμένη — ακυρωμένη παραγγελία δεν μπαίνει σε φορτίο» · «Το φορτίο … έχει ακυρωμένη παραγγελία (…) — δεν δέχεται εισαγωγή» · «… είναι σκέλος προώθησης (ρότα) — δεν μπαίνει σε groupage» · «Το φορτίο … είναι σκέλος προώθησης (ρότα) — δεν δέχεται groupage» · «… είναι παρτίδα — πάει στην αποθήκη, δεν μπαίνει σε φορτίο φορτηγού» · «Το φορτίο … είναι παρτίδα για την αποθήκη — δεν δέχεται άλλη εισαγωγή» · «… είναι κομμάτι αποθέματος — μπαίνει σε φορτηγό μόνο με «+ Κομμάτι από απόθεμα…»» · «Το φορτίο … είναι ένα κομμάτι αποθέματος μόνο του — δεν γίνεται επικεφαλής ομάδας» · «… είναι ήδη στο φορτίο της εξαγωγής … — πρώτα «Αφαίρεση ταιριάσματος» εκεί» · «… είναι σκέλος σπασμένης παραγγελίας / είναι σπασμένη σε σκέλη — δεν μπαίνει σε groupage» · «Το φορτίο … είναι σπασμένη παραγγελία — δεν δέχεται groupage» · «Η … έχει ήδη ανάθεση (φορτηγό …) — πρώτα «Καθαρισμός ανάθεσης» σε αυτήν, μετά πρόσθεσέ τη στο φορτίο».
4. «Ομαδοποίηση» (`wi:4560-4600`): with a truck load picked, every pick is checked against that load **before** the first write; past 33 one question; then the free picks join this row one by one, then the whole group joins the truck load.
5. One join (`_wiImpJoin`, `wi:6277-6433`) — reads first, then writes:
   - Reads: the export still names this load; the load and the joiner as the server has them (members by `Group ID`); same members as on screen; same vehicle; the joiner is not matched to another export; nobody cancelled; pallets unchanged; the joiner has no assignment; the joiner is not alone on a live round trip (if it is, its empty trip is released first, owner only).
   - Race messages (followed by a reload): «Η εξαγωγή άλλαξε φορτίο στο μεταξύ (άλλος χρήστης) — ανανέωση…» · «Το φορτίο ή η εισαγωγή άλλαξε στο μεταξύ…» · «Το όχημα του φορτίου άλλαξε στο μεταξύ…» · «… ταιριάστηκε στο μεταξύ με εξαγωγή…» · «Μια παραγγελία του φορτίου ή της εισαγωγής ακυρώθηκε στο μεταξύ…» · «Οι παλέτες άλλαξαν στο μεταξύ…: … — ανανέωση, ξαναδοκίμασε…» · «… πήρε ανάθεση στο μεταξύ…». Not a race, no reload: «…: N μέλος της ομάδας εκτός αυτής της προβολής — άνοιξε την εβδομάδα τους· δεν γράφτηκε τίποτα» · «Η … είναι ήδη στο φορτίο της εξαγωγής … της W47 (εκτός αυτής της προβολής) — πρώτα «Αφαίρεση ταιριάσματος» εκεί· δεν γράφτηκε τίποτα».
   - Writes: (1) the load's `Group ID` when it has none: `GI-<time code>|<lead id>` on the lead; when it has one without order, the suffix is written on all its members; (2) per joining order one `PATCH { 'Group ID': the load's exact text, + the load's vehicle (Truck/Trailer/Driver or Partner/'Is Partner Trip'/'Partner Truck Plates'), Status: 'Assigned' }` — status is not sent for an order already on the road — each read back (group, truck or partner). The members of the load are not rewritten; the joiner sorts last.
   - While it runs: line under the row «Ένταξη εισαγωγής στο φορτίο…».
   - Success: board rebuilt from its own data (no week spinner), line «… στο φορτίο ✓», toast «Η εισαγωγή ΦΑΓΕ, Verona → Βέροια μπήκε στο ΚΖΗ-1234 · Σαρίδης Γ., μαζί με Lidl · 24 π. ✓» (+ over-33 note). Round-trip sync from the export. Undo cleared.
   - Failure: «Η ένταξη στο φορτίο … ΔΕΝ ολοκληρώθηκε — <order>: <why> · έλεγξε το φορτίο», then a full reload; if nothing landed the load's new group id is taken back.
   - Half-way: yes, per joining order; said and followed by a reload.

**2.2 «Groupage εισαγωγών · σε αυτό το φορτίο…»** (v1 «+ Εισαγωγή στο φορτίο…»)

1. Entry: the ΕΙΣΑΓΩΓΗ section of a truck row that already has a matched import (`wi:5953`), and the member submenu of a matched import group (`wi:6662-6663`).
2. Panel «Groupage εισαγωγών · σε αυτό το φορτίο», under it «φορτίο ΚΖΗ-1234 · Σαρίδης Γ. (ΦΑΓΕ, Lidl · 24 π.)». List «N ελεύθερες εισαγωγές»: «πελάτης · τόπος φόρτωσης · φόρτωση ημέρα (Np)», nearest loading day to the export's delivery first; disabled with reason when it cannot join; amber arithmetic past 33; running sum; empty «Καμία ελεύθερη εισαγωγή σε αυτή την εβδομάδα» (`wi:4629-4655`).
3. «Ένταξη» → the 33 question once → 2.1 step 5 per pick. No pick → «Επίλεξε τουλάχιστον μία εισαγωγή».
4. The same join also runs on drag and drop of an import onto a truck's import cell or onto a group tile (`wi:6589-6594`).

**2.3 Other actions of an import group**

- Reorder: drag of tiles only (`wi:6576-6646`), saved as the suffix of `GI-…`.
- Remove a member: «Βγάλε από το groupage» / «Επιστροφή στο απόθεμα» — 1.6 / 1.7. If the member that leaves is the one the export points at, `Matched Import ID` on every export of the truck row is rewritten to the new lead; failure «Ο νέος επικεφαλής της ομάδας εισαγωγών δεν ενημερώθηκε στην ταιριασμένη εξαγωγή — έλεγξε χειροκίνητα» (`wi:6823-6843`).
- Assignment: saved on the row's orders, then pushed to every sibling read by `Group ID`, each read back; failure «Η ανάθεση γράφτηκε αλλά ΔΕΝ έφτασε σε όλα τα μέλη του groupage εισαγωγών — έλεγξε χειροκίνητα: …» (`wi:3937-3973`).
- Print: «Εισαγωγή: εκτύπωση ομάδας, N έγγραφα», `print.html?orderIds=…&leg=import&sheet=…`; right-click = share menu (`wi:6876-6887`, `wi2:1199-1201`).

### B. How it differs from export

| | Export | Import |
|---|---|---|
| Id | `GRP-` + 8 characters of the first order | `GI-` + time code, suffix from the first join |
| Who may join | any export without assignment | free imports + one truck load; the joiner must have no assignment |
| Checks before writing | none | server re-read of both sides, 7 race checks |
| What the join writes | `Group ID` only | `Group ID` + the load's vehicle + status |
| Read-back | no | yes, per order |
| Lead | first by delivery date | first of the suffix, then loading date (`wi4l:117-124`) |
| Day on the board | earliest delivery of the members | earliest loading of the members |
| Rota card (arrows) | yes | no (drag only) |
| Dissolve all at once | yes | no item; member by member |
| «Μεταφορά εβδομάδας…» | no | yes, on the unmatched row |
| Stock pieces | — | joins only through «+ Κομμάτι από απόθεμα…»; never on a partner |

### C. Defects and doubts (read from code, not run)

| # | What | Evidence | Scenario → wrong result | Confidence |
|---|---|---|---|---|
| C-16 | An import group cannot be dissolved in one action and has no card | `wi:5945-5992` (no dissolve item), `wi:6895-6896` (the card reads exports only) | A wrong group of four imports needs three «Βγάλε από το groupage», each with its confirm | high (as a gap) |
| C-17 | The joiner gets status «Assigned» from a load whose truck row is a partner, without a partner rate or a partner assignment row | `_wiInhOf` `wi:6169-6178` (no rate); `_wiImpJoin` does not call the partner assignment helper | Import joins a partner's return load → the order is on the partner with no rate and no partner assignment row until someone re-saves the assignment (which then demands «Το κόμιστρο εισαγωγής είναι υποχρεωτικό…») | medium |
| C-18 | The "is this import already matched" check before a match reads a field that does not exist | `wi:3244` reads `Matched Export ID` (not in the map) and `Matched Import ID` on the import record (imports do not carry it) | The first lock check never fires; protection rests on the export-side check and the conflict check. Adjacent to this cluster (matching), noted because the join relies on a correct match state | medium |
| C-19 | Free-import candidate label = first loading place only | `wi:4511-4513` | Two imports from the same supplier city cannot be told apart in «Ελεύθερες εισαγωγές»; the truck-load list and 2.2 do show the customer | high (as a gap) |
| C-20 | The 33 question for a whole action counts the base in a different order than the text | `wi:4592-4594` (`adds[0]` = the truck load when one is picked, else this row) | Cosmetic: the arithmetic line names the truck load first even when the dispatcher started from a free import. No wrong write | low |

### D. The redesign must draw

| Item | Mock-up | Where |
|---|---|---|
| Menu entry on an unmatched import | PRESENT («Ομαδικό φορτίο με άλλες εισαγωγές») | import menu |
| Menu entry on a truck that already carries an import («…σε αυτό το φορτίο…») | MISSING | ΕΙΣΑΓΩΓΗ section of the truck menu |
| Build panel with two lists (free imports, many; truck loads, one) | MISSING | panel |
| Candidate that cannot join: listed, disabled, reason under it (12 texts above) | MISSING | panel rows |
| Running sum, amber arithmetic, the 33 question | MISSING | panel |
| Running state «Ένταξη εισαγωγής στο φορτίο…» and the success sentence | MISSING | line under the row + toast |
| Race and "outside this view" messages | MISSING | toast |
| Import group drawn inside a truck row (members as points, drag to reorder, grip to move the whole group to another export) | MISSING (the mock-up draws a single import per truck) | import side of the row |
| Import group on its own row (no export) | MISSING | board row |
| Overview for an import group (members, order, remove, sheet) | MISSING (overview drawn for export only) | the same overview panel, import wording |
| Dissolve for an import group | MISSING (does not exist today either) | overview footer |
| Drag an import onto a truck's import cell = join | MISSING (no drag state drawn) | row drop state |

---

## 3. Split order («ΣΠΑΣΜΕΝΗ ΣΕ N ΣΚΕΛΗ»)

Behind `FEATURES.ORDER_SPLIT`. A split is always two legs; "N" in the header is the count of legs found.

### A. Flow

**3.1 Create — «Σπάσιμο σκέλους…»** (`wi:4815-4838`, panel `wi:4843-4887`, write `wi:4961-5126`)

1. Entry: menu of a single export or import row. Not offered on a group, a rota leg, a split leg, a stock piece or a lot. A row already split shows «Ένωση ξανά» instead.
2. Panel «Σπάσιμο σκέλους», fields:
   - «Σημείο παράδοσης-παραλαβής *» — location search, empty.
   - «Ημερομηνία/ώρα παράδοσης εκεί *» — date and time, empty.
   - «Ποιος εκτελεί το σκέλος 2 (κενό = ΠΡΟΣ ΑΝΑΘΕΣΗ)» — «ΠΡΟΣ ΑΝΑΘΕΣΗ» (default) / «Δικό μας» (Φορτηγό…, Ρυμούλκα…, Οδηγός…) / «Συνεργάτης» (Συνεργάτης…, «Κόμιστρο συνεργάτη (€) — προαιρετικό»).
   - Warning when the order has a local driver: «Η παραγγελία έχει τοπική παράδοση/φόρτωση — μετά το σπάσιμο διάγραψέ την και δήλωσέ την ξανά στο σκέλος που την αφορά.»
   - Buttons «Άκυρο», «Σπάσιμο».
3. Validations: «Σημείο και ημερομηνία παράδοσης-παραλαβής είναι υποχρεωτικά»; «Επίλεξε συνεργάτη ή άφησε ΠΡΟΣ ΑΝΑΘΕΣΗ»; before any write, the order's round trip is read: «Το σπάσιμο δεν ξεκίνησε — …» / «Το δρομολόγιο … είναι κλειστό — το σπάσιμο δεν ξεκίνησε· ζήτα από τον owner».
4. Writes, in order, each checked before the next:
   1. `POST` ORDERS leg 1: copies `Type, Direction, Client, Reference, Pallet Type, Pallet Exchange, Refrigerator Mode, Goods, Temperature °C, Temp Per CMR, Veroia Switch`; all loading points of the order (`Loading Location n`, `Loading DateTime` / `Loading DateTime n`, `Loading Pallets n`); `Unloading Location 1` = hand-over place, `Delivery DateTime` = hand-over time, `Unloading Pallets 1` = sum of the order's `Loading Pallets 1..10`; `Parent Order`, `Leg No: 1`; the order's own `Truck, Trailer, Driver, Partner, Is Partner Trip, Partner Truck Plates`; `Status` = the order's status when assigned, else `Pending`. The response must carry `Parent Order` and `Leg No` 1.
   2. ORDER STOPS of leg 1 (all loadings + the hand-over as delivery), read back.
   3. `POST` ORDERS leg 2: same copied fields; `Loading Location 1` = hand-over, `Loading DateTime` = hand-over time, `Loading Pallets 1` = the sum; all delivery points of the order; `Parent Order`, `Leg No: 2`; the chosen truck/trailer/driver or partner (+ `Partner Rate` when typed); `Status` `Assigned` or `Pending`.
   4. ORDER STOPS of leg 2, read back.
   5. The original order's leg leaves its round trip (`DELETE /costs/rt/:id/legs`).
   6. `PATCH` the original order `{ Truck: [], Trailer: [], Driver: [], Partner: [], 'Is Partner Trip': false, 'Partner Truck Plates': '' }`. Its status is not written (the database derives it from the legs, migration 018, per comment `wi:5152-5158`).
   7. Round-trip sync for leg 1, and for leg 2 when it has an own truck; one PARTNER ASSIGNMENTS row for leg 2 when it is a partner.
5. What stays on the original: customer, price, reference, match, notes. Price is not copied to the legs.
6. Success: toast «Σπάσιμο ✓ — <παραγγελία> σε δύο σκέλη · σημείο αλλαγής: <τόπος>», full reload.
7. Failure messages, one per step: «Το σπάσιμο ΔΕΝ έγινε — αποτυχία στο σκέλος 1, τίποτα δεν γράφτηκε στον γονέα (…)» · «Το σκέλος 1 (…) δημιουργήθηκε αλλά οι ΣΤΑΣΕΙΣ του ΔΕΝ γράφτηκαν — ο γονέας ΔΕΝ αδειάστηκε, το σκέλος 2 ΔΕΝ δημιουργήθηκε. Σβήσε χειροκίνητα το σκέλος 1 ή ξαναδοκίμασε.» · «Το σκέλος 1 (…) δημιουργήθηκε με τις στάσεις του αλλά το σκέλος 2 (…) ΑΠΕΤΥΧΕ — ο γονέας ΔΕΝ αδειάστηκε ακόμη. Σβήσε χειροκίνητα το σκέλος 1 ή ξαναδοκίμασε.» · «Τα δύο σκέλη δημιουργήθηκαν (…) αλλά οι ΣΤΑΣΕΙΣ του σκέλους 2 ΔΕΝ γράφτηκαν — ο γονέας ΔΕΝ αδειάστηκε ακόμη. Έλεγξε/σβήσε χειροκίνητα.» · «Τα δύο σκέλη δημιουργήθηκαν αλλά ο γονέας ΔΕΝ βγήκε από τον γύρο του (…) — … Πάτα «Ένωση ξανά» στη γραμμή … και ξαναδοκίμασε όταν λυθεί.» · «Τα δύο σκέλη δημιουργήθηκαν με τις στάσεις τους (…) αλλά ο γονέας ΔΕΝ αδειάστηκε — άδειασε χειροκίνητα την ανάθεσή του (…)».
8. Half-way: yes at every step, and each is said. States left: an orphan leg 1; two legs with the original still assigned; two legs with the original off the round trip but still carrying the truck.

**3.2 How it is drawn** (v4, `wi2:1420-1438`; v1 `wi:1492-1520`)

- A header line in the original order's place and number: tag «ΣΠΑΣΜΕΝΗ ΣΕ 2 ΣΚΕΛΗ», then «πελάτης → τελική παράδοση · 30π · αλλαγή φορτηγού στο σημείο Χ». Click = the original order's form. Its own ✈ menu.
- Under it two full rows «↳1», «↳2», each with its own assignment box, dates, printer, menu.

**3.3 Each leg's assignment**

- Leg 1 starts with the original's truck or partner. Leg 2 starts with what the panel chose.
- After that each leg is an ordinary row: «Ανάθεση…», «Καθαρισμός ανάθεσης», print, rota leg, local driver, stock piece (not on a leg: `wi:7607`). No «Groupage…», no «Σπάσιμο…». First item «Αρχική παραγγελία…» opens the original's form (`wi:4712`).
- A partner leg of a split never gets its own round trip (`core/rt-feed.js:428-433`).

**3.4 «Ένωση ξανά»** (`wi:5139-5204`)

1. Entry: the split header's menu. Disabled «Ένωση ξανά — μπλοκαρισμένη (σκέλος N <Status>)» with «Δεν γίνεται ένωση — σκέλος ήδη σε εκτέλεση/παραδόθηκε»; for roles other than owner and dispatcher disabled «Μόνο owner/dispatcher — η ένωση αφαιρεί τα σκέλη».
2. Confirm «Ένωση των δύο σκελών ξανά στη γονική παραγγελία; Τα σκέλη ΔΙΑΓΡΑΦΟΝΤΑΙ (με ίχνος audit — όχι Cancelled) και η ανάθεση του σκέλους 1 επιστρέφει στον γονέα.», title «Ένωση ξανά», button «Ένωση».
3. Writes: (a) each leg leaves its round trip; (b) `DELETE` ORDERS for each leg (soft delete in the Worker, with the delete-confirm token); (c) `PATCH` the original with leg 1's `Truck, Trailer, Driver, Partner, Is Partner Trip, Partner Truck Plates` and `Status` `Assigned` or `Pending`, status read back; (d) round-trip sync of the original; reload.
4. Messages: «Κάποιο σκέλος ΔΕΝ διαγράφηκε — η ανάθεση ΔΕΝ επέστρεψε στον γονέα (…), έλεγξε χειροκίνητα: …» · «Τα σκέλη αφαιρέθηκαν, αλλά η ανάθεση ΔΕΝ επέστρεψε σωστά στον γονέα (…) — άνοιξε την παραγγελία και έλεγξε ανάθεση/κατάσταση» · «Ένωση ξανά ✓».
5. Half-way: one leg deleted and one not → the header stays with one leg, the original unassigned; «Ένωση ξανά» can be pressed again.

**3.5 «Αλλαγή σημείου παράδοσης-παραλαβής…»** (`wi:1601-1722`)

1. Entry: the split header's menu. Panel with «Νέο σημείο παράδοσης-παραλαβής *» (prefilled with leg 1's delivery place) and «Νέα ημερομηνία/ώρα εκεί *» (prefilled with leg 1's delivery time). Buttons «Άκυρο», «Αλλαγή». Validation «Σημείο και ημερομηνία είναι υποχρεωτικά»; «Δεν βρέθηκαν και τα δύο σκέλη».
2. Four writes, each read back: `PATCH` leg 1 `{ 'Unloading Location 1', 'Delivery DateTime' }`; `PATCH` leg 2 `{ 'Loading Location 1', 'Loading DateTime' }`; ORDER STOPS of leg 1 (all loadings kept, delivery replaced); ORDER STOPS of leg 2 (loading replaced, all deliveries kept).
3. Messages: «Η αλλαγή σημείου ΔΕΝ έγινε — το σκέλος 1 (…) δεν γράφτηκε, τίποτα άλλο δεν αγγίχτηκε» · «Το σκέλος 1 (…) γράφτηκε με τη νέα τοποθεσία/ώρα αλλά το σκέλος 2 (…) ΔΕΝ γράφτηκε — τα δύο σκέλη ΔΕΝ συμφωνούν πια, διόρθωσε χειροκίνητα» · «Τα δύο σκέλη έχουν πια τη νέα τοποθεσία/ώρα στο ORDERS αλλά οι ΣΤΑΣΕΙΣ του σκέλους 1 (…) ΔΕΝ επιβεβαιώθηκαν — έλεγξε χειροκίνητα» · «Το σκέλος 1 (…) ολοκληρώθηκε πλήρως αλλά οι ΣΤΑΣΕΙΣ του σκέλους 2 (…) ΔΕΝ επιβεβαιώθηκαν — έλεγξε χειροκίνητα» · success «Σημείο παράδοσης-παραλαβής άλλαξε ✓ — … · νέο σημείο: …».
4. Half-way: yes, four steps, each said.

**3.6 Printing all legs** — «Εκτύπωση / WhatsApp όλων…» in the header menu (`wi:1568-1579`): one new tab per leg, each the driver or partner sheet of that leg by its own assignment. Each leg also has its own printer on its row. «Δεν βρέθηκαν σκέλη» when none.

**3.7 Other header items**: «Άνοιγμα παραγγελίας» (the original), «Αφαίρεση ταιριάσματος» when the original is matched (`wi:1565`).

### B. Rules and edge cases

- Depth is one: a leg cannot be split (`wi:4818`; migration 018 CHECK per `wi4l:236`).
- The original keeps customer, price and match and no longer executes (`wi:1523-1526`).
- The hand-over is one place and one time shared by leg 1's delivery and leg 2's loading (`wi:1474-1481`).
- Leg pallets come from the order's flat `Loading Pallets n`, not from `Total Pallets` (`wi:4900-4908`).
- Points come from ORDER STOPS first, flat columns as fallback (`wi:4909-4937`).
- Rejoin deletes legs before restoring the original, because the database re-derives the original's status on every leg change (`wi:5152-5158`).
- Rejoin is refused while a leg is on the road or delivered (`wi:5147`).
- A leg in a group, or a group as a leg: refused on the import side (`wi:6235-6236`); on the export side see C-4.

### C. Defects and doubts (read from code, not run)

| # | What | Evidence | Scenario → wrong result | Confidence |
|---|---|---|---|---|
| C-21 | After a failed step the panel stays open and the message invites a retry that creates a second pair | `wi:5057-5078`: four failure branches return without closing the panel or repainting; only the fifth repaints, and its comment names this very risk (`wi:5085-5086`) | Leg 1 is created, its stops fail → «…ή ξαναδοκίμασε» → «Σπάσιμο» again → a second leg 1 under the same order. Whether the database refuses a duplicate leg number was not checked | medium |
| C-22 | No check that the hand-over time lies between loading and final delivery | `wi:4963-4966` (only "not empty") | Loading Mon, delivery Thu, hand-over typed as the previous Friday → leg 1 delivers before it loads; both legs are filed on the wrong days | high (missing check) |
| C-23 | «Ένωση ξανά» deletes a leg even when its round-trip leg could not be removed | `wi:5173-5174`: a failed lookup is read as "no round trip" and a failed removal is only logged to the console; elsewhere the same pattern was fixed (`wi:5299-5307`) | Leg 2 sits on a closed round trip → removal refused (409) → the leg order is deleted anyway → the trip keeps a leg of a deleted order | medium |
| C-24 | «Ένωση ξανά» drops leg 2's partner without clearing its cost | `wi:5117-5119` creates the partner assignment row for leg 2; rejoin (`wi:5139-5204`) never removes it and restores leg 1's assignment only | Leg 2 on a partner at 600 € → rejoin → the row of 600 € still points at a deleted order. Whether the database hides rows of deleted orders was not checked | medium-low |
| C-25 | The split ignores an existing match | `wi:4815-4838` does not look at the match; leg 1 takes the truck, the original keeps `Matched Import ID`; `rtOnOrderSaved(leg1)` has no match to follow | Export matched to a return import, then split → the import keeps the truck and stays on the old round trip while leg 1 gets a trip of its own; which trip carries the return is not decided anywhere on screen | medium-low (database behaviour not checked) |
| C-26 | `Veroia Switch` and `Reference` are copied to both legs | `wi:4995` | An order through Veroia, split → three orders with the switch on and the same reference. If anything creates national loads from the switch, it may do so three times. Not checked downstream | low-medium |
| C-27 | «Δικό μας» with a driver or trailer but no truck is saved without a word | `wi:5013-5019` | Leg 2 gets a driver, no truck, status «Pending»: a driver on an unassigned leg | medium |
| C-28 | A partner on leg 2 needs no rate and gets no plates and no «Assigned At» | `wi:4879`, `wi:5015-5017`; the normal assignment demands the rate (`wi:3797-3798`) | Leg 2 on a partner with empty rate → planned cost of that leg is empty until someone opens the assignment box | high (inconsistency) |
| C-29 | Leg pallets are 0 when the flat pallet columns are empty | `wi:4904-4908`, `wi:5000`, `wi:5021` | An order whose pallets live only on its stops → both legs get «0» on the hand-over stop, and «0 p» in the header (`wi:1507`, `pals||0`) — "unknown" shown as 0 | medium-low |
| C-30 | «Εκτύπωση όλων» opens two tabs from one click | `wi:1574-1578` | The browser's pop-up blocker lets the first through and stops the second; the user gets leg 1 only, with no message | medium |
| C-31 | The hand-over change does not look at the legs' status and does not sync the round trip | `wi:1622-1722` | Leg 1 already delivered at the old place → its delivery place and time are rewritten after the fact | medium |
| C-32 | A local driver declared on the original stays there after the split | `wi:4850-4854` (a warning only) | The relay keeps pointing at an order that no longer executes until someone deletes and re-declares it by hand | high (known, by design; the redesign should make the move one step) |

### D. The redesign must draw

| Item | Mock-up | Where |
|---|---|---|
| Menu entry «Σπάσιμο σε σκέλη» | PRESENT | row menu (not on a group, a leg, a piece, a lot) |
| Split panel: hand-over place, date and time, who takes leg 2 (none / own truck + trailer + driver / partner + rate), warning about a local driver | MISSING | panel from the menu |
| Validation and "did not start" messages | MISSING | panel |
| Six step-failure messages (what was written, what was not) | MISSING | toast + line under the row |
| Split order on the board | PARTLY (row 8: tag «2 σκέλη», one assignment cell «ΚΗΙ 4521 → Transfrigo · Wien»; no line per leg) | header + two sub-rows, or one row with two assignment cells; each leg needs its own assignment, dates, sheet, menu |
| Hand-over place and time shown | PARTLY («Wien», no time) | header / between the two legs |
| Leg states: leg 2 without truck (red), leg on a partner, leg on the road, leg delivered | MISSING | leg line |
| Split header menu: open order, sheets for all legs, «Ένωση ξανά» (normal, blocked with reason, not for this role), change hand-over point, remove match | MISSING | header menu |
| «Ένωση ξανά» confirm | MISSING | confirm |
| Panel «Αλλαγή σημείου παράδοσης-παραλαβής» (two prefilled fields) + its four failure messages | MISSING | panel |
| Leg menu: «Αρχική παραγγελία…» first; no groupage, no split | MISSING | leg menu |
| Sheets for all legs (two documents) | MISSING | header menu; one packet would avoid the two-tab problem |
| «ΕΠΟΜΕΝΑ» entry for a leg without truck | check: the queue names loads by route; a leg must be named as a leg of its order | queue card |

---

## 4. One overall overview of a groupage load (owner's new request)

### What the board already loads (no new read needed)

The week's exports and imports are read with **all** mapped fields (no field list, `wi:684-685`), and the reference lists (clients, trucks, trailers, drivers, partners, locations) are in memory.

| Overview column | Source already in memory | Note |
|---|---|---|
| Customer | `Client` link → clients list (`orderClientName`, `core/data-helpers.js:28-36`) | never `Client Name` (not a field) |
| Route | `Loading Summary` / `Delivery Summary` filled from the stops (`wi:130`), and the per-stop list with place, day, pallets used by «+N» (`wi2:890-900`) | all stops, not only first → last |
| Pallets per member and sum | `Total Pallets` (computed, read-only) | a member with no figure must show «—» and the sum «28 +?», never 0 (`wi:2237-2245`) |
| Price per member and total | `Price` → `orders.price` is in the map (`wk` ORDERS fields) and comes with every order read; the board does not use it today (no hit for `Price` in `wi`, `wi2`, `wi4a`) | an empty price is absent from the record, so «χωρίς τιμή», never 0; the total must say when it is partial («4.800,00 + 1 χωρίς τιμή») |
| Truck, trailer, driver / partner, plates | row state (`wi:865-884`) | |
| Partner rate | `Partner Rate` on each member | see C-10 before summing |
| Days (loading, delivery), order of deliveries | `Loading DateTime`, `Delivery DateTime`, `Group ID` suffix | |
| Status per member | `Status` | for "delivered" marks |
| Reference, goods, temperature, pallet exchange, Veroia switch | same record | |
| Matched return import (and its group) | `Matched Import ID` + imports list | |


### What it would have to read in addition

1. **Members outside the loaded week.** A member that delivers in another week is not in memory; the overview would show a group of 2 where the table has 3. Read the siblings by `Group ID` (the clear action already does it, `wi:4110-4116`).
2. **Anything about cost or margin**: fuel, tolls, driver pay, kilometres, profit per load. These live on the round trip (`/costs/rt`, `/costs/lines`), which the board does not load for display and which the dispatcher may not read in full. Not for this overview unless the owner asks for an owner-only block.
3. **Invoice state per member** (`Invoiced`) is on the record already; an "invoiced customer is locked" rule exists for national orders (085) — if the overview allows price edits it must respect what the order form respects (not checked here).
4. **Price per pallet / share of the truck**: can be computed from price and pallets in memory; a split of the price between a member and the rest does not exist (`Net Price` is a locked "not built").
5. **The national leg of a member that goes through Veroia** (who carries it to Veroia, when): comes from the national board's data, not from this read; the mock-up's «Μέσω Βέροιας» panel needs it.
6. **A fresh read before showing money.** The board's copy may be minutes old; the total should come from records re-read when the panel opens, or carry the "updated N minutes ago" mark.

### Mock-up versus this list

The drawn «Ομαδικό φορτίο» panel has customer, one route line, pallets, price, «χωρίς τιμή», totals, a day warning, order by drag, remove on one row, «Διάλυση», «Φύλλο οδηγού», «Αποθήκευση σειράς». Not drawn: partial total wording, unknown pallets, member outside the week, delivered member, the return import, partner rate, add a load, the import-group version.

---

## What was not verified

- Nothing was executed; no database row was counted; no trigger or migration body was read except by file name (018, 020, 033, 037, 066).
- `atSafePatch`, the conflict check (`_expect`) and the offline queue in `core/api.js` were not opened; their behaviour is taken from call sites.
- `core/order-sync.js` and `_syncVeroiaSwitch` were not opened; C-26 rests on that gap.
- v4's `_palHTML` (pallet cell) and `_sideOf` beyond its header comment; the v1 group tile markup; the stock join paths (`_wiStockJoin*`) beyond their menu entries.
- `print.html` group cover and WhatsApp text: comments and function names only.
- Whether migration 066 (group id compared by its base) is live: C-13 depends on it.
- The mock-up was read from `index.html` (section `s5` and its script); the two screenshots were not opened.
