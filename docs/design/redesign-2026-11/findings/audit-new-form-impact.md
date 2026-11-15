# New international order form (single load + groupage): impact on the rest of the system

Read-only analysis, 15/11/2026. **Nothing was run**: no app, no database, no Worker, no test. Every statement about "today" comes from reading code and migration files. Confidence is stated where it is not high.

File short names and which copy the line numbers refer to:

- `oi` = `modules/orders_intl.js` **as on `origin/main` (1d0857ac, after PR #314)**. The worktree copy is 22 lines shorter; numbers differ.
- `sh` = `core/stops-helpers.js` on `origin/main`.
- Everything else is the worktree copy (identical to `origin/main` for these files): `wi` = `modules/weekly_intl.js`, `wi2` = `modules/weekly_intl_v2.js`, `wi4l` = `core/wi4-logic.js`, `rt` = `core/rt-feed.js`, `pf` = `core/pallet-feed.js`, `oc` = `core/orders-common.js`, `sync` = `core/order-sync.js`, `od` = `core/order-docs.js`, `wk` = `worker/src/index.js`, `pr` = `print.html`, `m057` = `worker/migrations/057_stock_lots.sql`, `m111` = `worker/migrations/111_intl_form_stops.sql`.
- Board facts marked "(audit)" are taken from `docs/design/redesign-2026-11/findings/audit-groupage-split.md` and `audit-dates-veroia-relay-stock.md`, which carry their own file:line; I re-opened the code only where this analysis depends on it.

---

## 1. Table: works as is / needs change / no answer yet

### A. Data model

| Item | Verdict | Why (evidence) |
|---|---|---|
| "One load" identity | Works as is, with one condition | A groupage is the text `Group ID` on each order (`orders.group_id`, map `wk:1487`). Rows collapse on the board by exact text equality (`wi4l:146-163`, audit). A single load must keep `Group ID` empty: an order with a group cannot become a stock lot (`oi:1463`, base rule `lot_grouped` `m057:1019-1025, 1358-1362`). So "a single load is a groupage of one" can be true on screen only, not in the table. |
| Delivery order per point across orders | Needs change | Today only an order of **orders** is stored, as the text after `|` in `Group ID` (`wi:2430-2443`; write `wi:6953-6973`, audit). For an export group it means delivery order; for an import group the same suffix means **loading** order (`wi:2425-2428`, `pr:835-841`). Two deliveries of one order cannot have another order's point between them. |
| Loading order per point | Needs change | Stored nowhere for an export group; inside one order the points are numbered by `Stop Number` per type (`oi:2890-2910`, `sh` `_stopObjToFields`). The driver sheet orders the "other half" by date (`pr:846-860`). |
| Smallest storage that carries both orders | Needs change (database) | **One nullable whole-number column on `order_stops`** = the point's position inside its load, counted separately among the load's loading points and among its delivery points (a point is one or the other, so one column serves both lists). Empty = today's behaviour (order suffix, then `Stop Number`, then date). No new table. The load identity stays `orders.group_id`. For a single load no new storage is needed: dragging renumbers `Stop Number`, which exists. |
| Worker field map | Needs change (Worker) | The new label must be added to ORDER STOPS `fields` (`wk:1769-1822`). Without it a write answers 200 and drops the value (facade trap 1; the drop is only logged to `facade_unknown_fields`, `wk:783-826`). The 111 labels show the pattern to copy: a write that meets a base without the column is refused 422, never dropped (`wk:1806-1813`). The label also has to be in every `fields:[…]` list of readers that ask for specific stop fields, or it does not arrive. |
| Reefer mode shared by the groupage | Works as is (no storage) | `Refrigerator Mode` stays on each order (`wk:1380`, `oi:2806`). The form writes the same value to all members. Nothing in the base keeps them equal; if that matters it is a check for the auditor, not a column. |
| Per-point pallet exchange yes/no | Works as is (storage) | `order_stops.pallets_exchanged`: empty = every pallet, 0 = none (`oi:2873-2882`, `pf:77-90`). Yes/no maps to empty/0. The count 1..n is section G. |
| Reference per loading point | Works as is | `order_stops.reference`, label `Reference` (`wk:1778`), written by the form since PR #314 (`oi:2897-2901`). |
| Direction once in the header | Works as is | Each order still stores its own `Direction`; today's groups are already one direction (export `GRP-`, import `GI-`, audit §2B). |
| No truck field | Works as is | Today's form already writes no truck except on a new stock piece (`oi:3124`, `oc:531-552`). |
| No brand field | Works as is (form) / Needs change (list) | The form has no brand field; it writes the constant `Brand = 'Petras Group'` on create (`oi:2801`). The catalogue still has a brand filter (`modules/orders_catalog.js:208`), which the proposal removes. |
| Delivery "into stock" inside a groupage | **No answer yet** | The base refuses a lot in a group (`lot_grouped`). The mock-up draws the "Σε πελάτη / Σε απόθεμα" choice inside every order of a groupage. See D. |
| Hidden `National Groupage` tick | Risk of confusion | The form still carries a hidden box `f_Groupage` that writes `National Groupage` (`oi:1122, 2834`) and drives the old GL/CL chain (`oi:3027-3066`). It is a different thing from the new "Groupage" toggle and must not be reused for it. |

### B. Readers of a groupage or of the stop order

| Reader | Verdict | Why (evidence) |
|---|---|---|
| Weekly board: collapse, lead, day of the row (`WI4.groupDt`) | Works as is | Reads `Group ID` equality and the members' dates (`wi4l:146-163, 273-296`). Unchanged as long as every member carries the identical `Group ID` text. |
| Weekly board: numbering of points, "+N" table, drag tiles | Needs change | Lists every stop of every member, loadings by date, deliveries by the order suffix (`wi2:890-900`, `wi:6576-6646`, audit 1.4). Must read the per-point position. The drag on the board writes the suffix; with the windows gone the board becomes read-only for order, so that write path has to go or be redirected. |
| Weekly board: date ticks / date panel | Needs change (already a defect) | The date panel changes the lead order only (audit Β4, `wi2:1246-1253`). With days edited in the form this matters less, but a day changed on the board still leaves the per-point order pointing at old days. |
| Weekly board: Veroia on a group row | Needs change | Veroia information is not drawn on a group row today (`wi2:1246, 1316`, audit 1.4). The new form allows "via Veroia" per loading point inside a groupage. |
| Printed week (`core/week-paper.js`) | Works as is | Pure function over the board's own model (`core/week-paper.js:1-9`); it follows whatever the board builds. Re-check the fit after the board changes. |
| Driver sheet and WhatsApp text | Needs change | `groupRoute` takes the dispatcher's order for one half only and dates for the other (`pr:833-860`), and the cover reads first/last from it (`pr:1299-1310`). Both halves must read the per-point position; a single order's sheet sorts by `Stop Number` (`pr:408, 517`) and stays. Callers pass `orderIds` in suffix order (`wi:6858-6869`, `modules/orders_week_view.js:2066-2070`). |
| Orders catalogue, quick edit | Works as is | One line per order; no group logic except the brand filter. A groupage shows as N orders, which is what the owner asked. Opening one member must open the whole groupage in the form: needs an entry rule (front end). |
| «Παραγγελίες › Εβδομάδα» | Works as is, low confidence on display | Rows come from round-trip legs sorted by `seq` (`modules/orders_week_view.js:290, 1911`); a groupage is "more than one export or import on the trip" (`:1429`). Per-order, so it keeps working; it cannot show interleaved points. |
| Invoicing views | Works as is | Per order: price, invoiced, pallet gate. A stock piece stays without price (CHECK `orders_stock_piece_no_money`, `m057:295-296`). |
| Pallets: feeder, ledger, week, slips per stop | Works as is, with one condition | Movements are keyed by the stop record (`ON CONFLICT (order_stop_id, event_type)`, `m111:224-232`; feeder per stop `pf:94-130`). Re-ordering must **update** stops, never delete and re-create them. `stopsSave` already matches by record id (`sh` `stopsSave`). The exchange count is section G. |
| Round trips, expenses, payroll | Needs change (small) + one decision | A group is one round trip; leg order `seq` is per **order**, derived from the suffix (`rt:262-308`, `rt:472-480`). Interleaved points cannot be expressed per order. Either legs keep a per-order sequence derived from each order's first point, or the route text is built from points. Payroll shows legs (`modules/payroll.js:491-535`). |
| Base rules that create / merge round trips | Needs care | `rt_create_from_order` and `rt_link_split` compare `group_id` with exact equality (`033_rt_create_related.sql:139`, `037_rt_merge_split_pairs.sql:152, 190-193`). The fix that compares only the part before `|` is still in `drafts/` (`drafts/066_rt_group_base_join.sql:44-45`); whether it is live was not checked. See risk 1. |
| Partner assignments and partner fee | No answer yet | One rate is copied to every member and one partner-assignment row per member is made (`wi:3860-3877, 4032-4056`, audit C-10). Per truck or per order is an open owner question; the new form adds members to assigned loads, which makes it bite sooner. |
| National side for orders through Veroia | Works as is per order | After the cutover the base makes one shipment per national-side stop (`m111:110-126`); the form only reads the result (`oi:2139-2145`, `_syncVeroiaSwitch` `oi:2146-2190`). Runs per order, so N orders = N independent results. What "loading order" means for a point that the national truck brings to Veroia: no answer (see list 2). |
| Ramp | Works as is | Ramp sync is by date, fire-and-forget (`sync:113-122`); cross-dock stop per order (`oi:2913-2935`). |
| Daily Ops | Works as is | Collapses export loadings by the part of `Group ID` before `|`, else by truck (`modules/daily_ops.js:887-900`); stops by `Stop Number` inside an order (`:391, 1292`). It will not show the dragged loading order across orders. |
| Dashboards, metrics | Works as is | Read `Group ID` only for the stock predicate (`core/metrics.js:54`, `modules/dashboard.js:233`, `modules/ceo_dashboard.js:165`). |
| AI chat | Works as is, low confidence | Reads orders with `Group ID` as a field (`core/ai-chat.js:1338`); not traced further. |
| Command palette | Not determined | No `Group ID` use found; how it opens an order that is in a groupage was not traced. |
| CSV exports | Works as is | One line per order (`core/orders-list.js:134-141`, `modules/orders_week_view.js:2177`). The board's CSV scope problem (audit Β16) is unrelated. |
| Audit trail | Works as is | Every facade write is audited per record (`wk` `auditMany`, `facadeBatchCreate`). A groupage save = N + stops entries, not one. |

### C. Sync after a save

| Item | Verdict | Why (evidence) |
|---|---|---|
| Steps that run per order today | — | In order: owner's warehouse charge (`oi:2730`); ORDERS create or guarded patch (`oi:3145-3153`); read-back of stock link, "as per CMR", pre-order mark (`oi:3160-3182`); scan file and form files upload (`oi:3191-3200`); scan learning (`oi:3205-3235`); stops save + hours read-back (`oi:3241-3257`); pallet feeder then round-trip feeder (`oi:3260-3261`); Veroia sync (`oi:3263-3280`); ramp / caches (`oi:3269-3272`, `sync:29-133`); lot mark (`oi:3287-3291`); piece join on the board (`oi:3294-3297`); close, pending match, repaint, next scan (`oi:3323-3363`). |
| Must stay once per order | Works as is if looped | ORDERS write and its read-backs, stops, files, pallet feeder, Veroia sync, lot mark. |
| Must run once per groupage | Needs change | Round-trip feeder (it gathers the whole group itself, `rt:403-480`; N parallel calls is how a group lands on two trips), ramp sync, pending match from an empty import box (`oi:3328-3337`, consumed by the first order only today), repaint, the past-33 question, the per-point order write, the "new member inherits the load's truck / match" write. |
| Order 3 of 5 fails | Needs change | Today the form remembers **one** created id (`INTL_ORDERS._createdId`, `oi:2718, 3183`) because a retry once created four orders in three minutes (`oi:2714-2717`). With N orders a naive loop leaves 1–2 complete, 3 possibly without stops, 4–5 missing, and a second press re-creates 1–2. Two facts help: a batch create on the facade is one transaction, max 10 rows (`wk` `facadeBatchCreate`: "every row lands or none does"), and the stops are a separate write (`sh` `stopsSave`), so "order without points" remains the one possible half state. |
| Offline | Needs change | A single create offline returns a fake id and queues (`core/api.js:905-909`); stops cannot attach to it. A groupage must not be saved offline. |
| Duplicate-reference questions | Needs change | Two native confirms per new order with a reference (`oi:3071-3107`) → up to 2N dialogs. |

### D. Stock

| Item | Verdict | Why (evidence) |
|---|---|---|
| Piece rules in the base | Works as is | Same customer as the lot (`piece_mismatch`), loads only at the lot's warehouse (`piece_pickup`), has pallets (`piece_empty`), not more than what is left (`over_draw`), lot not pre-order / invoiced / closed / cancelled, one loading point, no price, no exchange, not a pre-order, not a split leg (`m057:295-305, 1254-1284`). None depends on where the piece is created. |
| Piece fields from the form | Works as is | `OrdersStock.pieceFields` forces lot link, customer, Import, warehouse as loading 1, exchange off, no price (`oc:531-552`); the form reads back that the link landed (`oi:3160-3164`). |
| Piece = import | No answer for export | The lock is in the form only (`oi:1061`, `oc:540`); the base does not look at direction. The proposal leaves "piece in an export groupage" open. |
| "A piece cannot go to a partner" | Works as is on the board, not in the form | Front-end rule: the stock entry is hidden on a partner row (`wi:7605-7609`) and the assignment save refuses a partner on a row or group holding a piece (`wi:3793-3817`). The base accepts it (`wi:7121`). A piece added in the form to a groupage **already on a partner** has no check. |
| Piece created without a truck | Needs change | Today a piece joins a truck in the same act (`wi:8069-8135`) or waits on the shelf. In the form it gets a `Group ID` but no truck: by the one definition "on a truck = truck or partner" (`oc:457-461`) it is loose, so it shows on the stock shelf **and** as a member of the groupage, and the base refuses loading or delivery until it has a truck (`piece_no_truck`, `m057:1318`). If the groupage already has a truck, the piece must take it at save, with the board's lead re-read (`wi:8101-8115`). |
| Lot list in the picker | Needs change (rule exists) | Phase 1 offers warehouses abroad only; a piece out of a Greek warehouse is a national move (`oi:1936-1942`). The mock-up lists a lot in Aspropyrgos. |
| "Into stock" on a new single order | Works as is | One delivery = the chosen warehouse, no Veroia, pallets > 0 (`oi:2969-2983`, `oi:2832`); order saved, then the lot mark as a second write with read-back (`oc:599-616`); a refused mark keeps the form open with "Ξανά: σήμανση παρτίδας" (`oi:2074-2095`). |
| "Into stock" on an existing order | Works as is, but the choice is not free | Only the mark is sent, the form must be otherwise unchanged, and the order must already have the lot's shape: one delivery abroad, no Veroia, no legs, no group (`oi:2771-2783, 1460-1477`). A central "Σε πελάτη / Σε απόθεμα" switch on an existing order will often have to be shown disabled with the reason. |
| Who may tick it | Works as is | Screen: owner, dispatcher (`oc:479`, `oi:1445`). Worker `stock_lots`: owner, dispatcher write; accountant PATCH; management read (`wk:515-675`). |
| What else the tick writes | Works as is | Nothing at save. Later: the warehouse pallet movement at intake "Delivered" (`pf:217-300`); a lot is never auto-matched to an export (`oi:3328-3333`); the owner's warehouse charge is a separate owner-only write (`oi:1664`, `wk` COSTS_PERMS). |
| "Into stock" inside a groupage | **No answer yet** | Refused by the base today (`lot_grouped`). |

### E. Scan

| Item | Verdict | Why (evidence) |
|---|---|---|
| Several files | Exists, different shape | Up to 10 files, scanned one after the other; then the forms open **one by one**, Save → next (`oi:3661-3746`, `oi:3362`). |
| File types | Needs change | Scan reads images and PDF; Word only when engine v2 is on in that browser (`oi:3444-3450`, `core/scan-engine-v2.js:67-72`); 10 MB. Attachments accept pdf, jpg, png, doc, docx, eml, msg, txt up to 15 MB (`od:26-37`, `wk:6830-6840`). The mock-up says "PDF, εικόνα, Excel, email": Excel is accepted by neither; email can be attached but not read. |
| Where the file is attached | Needs change | One global slot `window._scanPendingDoc`, uploaded after the create of the one order (`oi:4110`, `oi:3191-3193`), cleared when the form closes. N orders need one slot per order. |
| Reference per loading point from the scan | Works as is | `_scanOpen` puts each stop's ref on the stop and joins several into the order's Reference (`oi:4048-4055, 4068-4076`). |
| Scan learning | Needs change | `window._scanResult` is one slot; pairing form i with file N once poisoned the shared examples (`oi:3735-3739`). Must be per order block. |
| File that cannot be read | Needs change | Today a failed file is skipped with a console line (`oi:3714`); the proposal wants an empty order with the file attached. |
| One file that holds several orders | No answer yet | The proposal says one file = one order. |
| Scanned direction differs from the header | No answer yet | The scan fills `Direction` per file (`oi:4038`). |

### F. Other features

| Feature | Verdict | Why |
|---|---|---|
| Pre-order | No answer yet (groupage) / Needs port (single) | Converting = opening the same record in the form; the save clears the mark (`oi:3117-3121, 3179-3182`). Must be carried into the new form. A pre-order as a member of a groupage is not designed (the proposal says so); a piece can never be a pre-order (CHECK). |
| Duplicate | Works for one order / No answer for a groupage | The copy drops `Group ID`, assignment, match, stock labels (`oi:923-926`) and refuses a piece (`oi:920`). "Copy the whole groupage for next week" is not in the proposal. |
| Split order | Needs a rule | Not offered on a group today (`wi:4817`, audit); the base allows depth one only. "Κάν' το groupage" on a split order or on a leg, and "split" on a groupage member, have no stated behaviour. |
| Forwarding leg | Works as is | Board-only, uses `Rotation ID`; candidates exclude the same group (audit §4). Not touched by the form. |
| Local driver | Works as is | A line of LOCAL MOVES tied to one order (`core/relay.js:372-456`, audit §5); the base sets its day from the order. |
| Week shift | Needs change (small) | `Plan Week Start` is written on the row's lead order only (`wi:6038-6063`, audit). When the per-point order changes which order is the lead, the row can jump week. Write it on every member. |
| Matched import | Needs change | Every member of an export group must carry the group's one matched import (migration 106 header). An order added in the form to a matched load must receive it; an import groupage started from an export's empty box must be matched once, as a load, not through the first saved order (`oi:3328-3337`). |

### G. Existing data

| Item | Verdict | Why |
|---|---|---|
| Old groupages open in the new form | Needs change | Members must be found by the part of `Group ID` before `|`, on the server, not only in the loaded week (the clear action already does this, `wi:4110-4116`, audit). Two shapes exist: with and without suffix. |
| What is missing on them | — | Export groups: loading order (default: by loading day, then `Stop Number`). Import groups: delivery order. Per-point positions on all. They can be derived at first open, no migration needed, if "empty = old rule" is kept. |
| Same base id used by two groups | Risk | A group id can be reused after its first order left (`wi:6472, 6704-6705`, audit C-13). Reading by base would open two loads as one. Not checked in the data. |
| Groups that hold a pre-order, a split leg, mismatched trucks | Risk | The export build list never filtered them (audit Α1, C-2, C-4). The form must show them and say so, not hide them (owner's rule). |
| How many exist | Not determined | 16 export groupages on 8/11 per the header of migration 106; no count of import groups; base not read. |
| Per-stop exchange **count** | Needs a decision | Stored in `order_stops.pallets_exchanged` as 1..n on a loading point (`oi:2873-2882`, "30 pallets, 10 with exchange"). Read by the pallet feeder for the pending loading quantity (`pf:70-87`), by the pallets week view (`modules/pallets_week.js:73-76`), and by the base when it writes the delivery movement (`m111:211-222`). A yes/no form that writes "yes = empty" over a stored 10 changes the customer's pallet balance from 10 to 30. A form that leaves it untouched keeps a number nobody can see. How many stops carry a count: not determined. |

### H. Roles (Worker `PERMISSIONS`, `wk:515-675`; plain facts)

| Step | owner | dispatcher | management | accountant | warehouse |
|---|---|---|---|---|---|
| Orders | all | GET POST PATCH DELETE | GET POST PATCH | GET PATCH | GET |
| Order stops | all | GET POST PATCH DELETE | GET | GET PATCH | GET |
| Stock lots (mark / unmark / close) | all | GET POST PATCH DELETE | GET | GET PATCH | — |
| Local moves | all | GET POST PATCH DELETE | GET | GET | GET |
| Partner assignments | all | all four | all four | GET | — |
| Attach a file (`/docs/upload`) | role with orders POST or PATCH (`wk` `handleDocsUpload`) | yes | yes | yes | no |
| Scan examples | all | GET POST | GET POST | GET POST | — |
| Round-trip feed (`/costs/rt`) | all four | all four | GET | GET POST | — |
| Warehouse charge of a lot | owner only | — | — | — | — |


---

## 2. What the owner must decide before building (business questions, in order)

1. **Does a loading point that goes through Veroia have a place in the loading order?** Example: export groupage, Bayern Frucht loads in Naoussa "via Veroia", Donau Markt loads directly in Skydra. The international truck never goes to Naoussa; it loads Bayern's pallets at Veroia. Is the list "1 Veroia, 2 Skydra", or "1 Naoussa, 2 Skydra" as the mock-up draws it?
2. **May an order inside a groupage be delivered into stock?** Example: one truck to Hungary with three orders, two for customers and one that stays in the Budapest warehouse as a lot. Today the base refuses a lot inside a load. If yes, a base rule changes; if no, the "Σε απόθεμα" choice is hidden or disabled inside a groupage.
3. **The count "10 of 30 pallets with exchange" on a loading point: keep or drop?** Example: a stop saved last week with 30 pallets, 10 with exchange. With yes/no only, is it now 30 with exchange (the customer's pallet balance changes by 20), or does the old 10 stay and count although the form shows only "Ναι"?
4. **Partner fee on a groupage: per truck or per order?** Example: three orders on one partner truck at 2.400. Today 2.400 is written on each of the three. When a fourth order is added in the form, does it get 2.400 too, nothing, or is 2.400 the truck's and split?
5. **An order added to a groupage that already has a truck: does it take the truck, the driver, the matched import and "Ανατέθηκε" at once?** Example: Thursday the load is on ΚΗΙ 4521 and matched with a return import; Friday a fourth order is added in the form. (Corrective entry after the truck has left: it must also work when the load is already on the road.)
6. **Removing an order from a groupage in the form («×» on its line): what happens to it?** It becomes a single load without truck (as "Βγάλε από το groupage" today), or it is deleted? Example: order 2 of 3 was entered by mistake versus order 2 will travel next week on another truck.
7. **Two orders that both already exist: how are they joined now that the board's window is gone?** Example: two exports entered on Monday by two people. Open one, press "Groupage", then "add an existing order" from a list? The proposal has "+ Παραγγελία", "Από αρχείο", "Κομμάτι από απόθεμα" only.
8. **A stock piece in a groupage that has no truck yet: where does it show?** Example: the 5 pallets from Budapest, groupage without truck. By today's rule it is "a piece without a truck" on the stock shelf and is counted as waiting. Is that right, or is it "planned" once it sits in a groupage?
9. **May a stock piece ride a partner now?** Example: the import groupage with the Budapest piece is later given to a partner on the board. Today the board refuses it. Stays refused, or becomes a warning?
10. **Stock piece in an export groupage: yes or no?** (already open in the proposal). Example: 5 pallets from the Budapest lot delivered in Vienna on an export truck passing through.
11. **Lots in Greek warehouses in the picker?** Example: the mock-up lists a lot in Aspropyrgos. Today only warehouses abroad are offered; a piece out of a Greek warehouse is a national move.
12. **Order of points on the round trip and on payroll.** Example: delivery order München (A), Augsburg (B), Rosenheim (A). The driver's sheet can print exactly this; the trip and the payroll line list orders, not points. Is "A, B" enough there?
13. **Pre-order and groupage.** Example: a pre-order "Lidl, export, Monday" exists; the dispatcher builds a groupage and wants it as order 2. Convert first, or allow it inside?
14. **Split order and groupage.** Example: an order already split in two legs: may "Κάν' το groupage" be pressed on it or on a leg? May a groupage member be split?
15. **"Διπλασιασμός" of a whole groupage.** Example: the same three customers every Tuesday. Copy one order only (today), or the whole load with its two orders?
16. **Which file types must be READ, not only attached?** Example: the mock-up names Excel and email. Today the scan reads PDF and images (Word in the new engine); Excel cannot even be attached.
17. **One file with several orders.** Example: one Lidl PDF with ten orders. One order per file (proposal), or one order per order found?
18. **A scanned file whose direction is not the groupage's.** Example: an import order dropped into an export groupage. Warn and keep, or leave it out as a single load?
19. **Reefer mode "one for all": what if an old groupage disagrees?** Example: two members "Συνεχής", one "Start-Stop". Which one wins when it opens, or does it show the disagreement until someone picks?

## 3. Technical work

**Database** (each with dry run, after 15:00, owner's approval)
1. One nullable whole-number column on `order_stops` for the point's position in its load. Confirm which triggers on `order_stops` fire on an update of it (the national bridge, the date-follow rules); it must be a quiet column.
2. Decide and, if needed, run the round-trip rule that compares the group by its base (`drafts/066`), or guarantee identical `Group ID` text at all times (see risk 1). First find out whether 066 is live.
3. Only if the owner says yes to question 2: relax `lot_grouped` for "a lot as a member of a load".
4. Auditor checks: members of one load disagree on truck / matched import / reefer; a load whose points have positions on some stops and not on others; a piece with a group and no truck.
5. Nothing for reefer, direction, reference, yes/no exchange.

**Worker** (deploy only from the PR's worktree, guard before and after, new marker in the guard list)
1. Map the new stop label in ORDER STOPS, with the 111-style refusal when the column is missing.
2. Optional but strongly advised: one "save a load" route that writes orders, stops, group identity and positions in one transaction, so "3 of 5" cannot exist. Without it, at least use the existing atomic batch create for the orders.
3. If Excel / other types must be attached: extend the allowed file types of `/docs/upload`.
4. Messages of new refusals in plain words (customer, route, day), no record codes.

**Front end**
1. The form: order blocks, one state object per order (created id, stop ids, files, scan result, stock context) instead of the single globals (`_createdId`, `_scanPendingDoc`, `_scanResult`, `_stock`, `_markPending`).
2. Save: validate all, then orders, then stops, then group identity and positions; per order pallets and Veroia; once per load round trip, ramp, match, repaint. Retry writes only what is missing. No groupage save offline. One summary of duplicate references instead of 2N dialogs.
3. Open: read every member by group base from the server; derive missing positions; show members that should not be there, with the reason.
4. "Κάν' το groupage", add to an assigned load (inherit truck, driver, match, status; partner fee per decision 4), remove a member (decision 6: the leg leaves the trip before the vehicle, as today).
5. Stock: piece picker (lots with pallets left, abroad only unless decided), the board's join logic moved behind one function used by both; "into stock" switch with its disabled reasons.
6. Scan: results fill order blocks; failed file → empty block with the file; per-block learning; file-type list equal to what is really read.
7. Readers: board numbering and "+N" table, driver sheet and WhatsApp (`groupRoute`), round-trip leg order, Daily Ops, week view. One function that returns "the points of a load in order", used by all (today four places each have their own rule).
8. Board: remove the two build windows, the rota card, the tile drag; add the read-only summary, "Άνοιγμα στη φόρμα", "Κάν' το groupage". Keep assignment, clear, dissolve, forwarding, local driver, week shift (write on all members).
9. Catalogue: remove the brand filter; opening a member opens the load.
10. Version bump in `app.html` and `sw.js`, screenshots asked ↔ done.

**Existing-data migration**
1. Count first (read-only): groups by kind, groups with mixed suffix / no suffix, bases used by two groups, groups with a pre-order or a leg, stops with an exchange count 1..n, members that disagree on truck or match.
2. No rewrite needed if "empty position = old rule". If positions are back-filled, do it per load from the suffix and the days, in one guarded block, with before/after counts.
3. Exchange counts: per decision 3, either leave, or convert with a list for the accountant.

**Tests**
1. Pure tests for "points of a load in order" (old data without positions, positions on all, mixed, a point through Veroia, a piece).
2. Save plan tests: N orders, failure at each step, retry writes nothing twice; add to assigned load; remove a member.
3. Driver sheet and WhatsApp order equal to the panel's order (same fixture).
4. Round-trip feed called once per load; a load never lands on two trips.
5. Stock: piece in a load without truck, with own truck, with partner; lot inside a load (refused or allowed per decision).
6. Pallet feeder with yes/no and with an old count.
7. Worker: the new label is written and read back; refused when the column is missing; guard marker.
8. The whole node suite before the PR; the form opened and saved by hand on every path before push (project rule for order creation).

## 4. Risks, ranked (what writes wrong data or loses data if built naively)

1. **A load split over two round trips.** The base links members by exact `Group ID` text. If the form saves members one by one, or rewrites the text on some members before others, a member that gets its truck in that window starts a second trip; only the owner can merge them (it happened on 7/10). Adding an order to an assigned load is exactly this case. Costs and payroll then sit on the wrong trip.
2. **Half-saved groupage and double orders on retry.** Orders 1–2 written, 3 without points, 4–5 missing; a second press re-creates 1–2. Each extra order feeds pallets, ramp and possibly a national shipment.
3. **The pallet-exchange count silently changed or silently kept.** "Yes" written as "all pallets" over a stored 10 moves the customer's pallet balance; left untouched it keeps counting a number no screen shows.
4. **Stops deleted and re-created during a reorder.** Pallet movements, the national shipment of a Veroia point and local-driver lines are tied to the stop record. A reorder must only renumber. (Today's save already matches by record; a rewrite of the form must keep that.)
5. **The new position label not in the Worker map.** The save answers "success", nothing is stored, the driver sheet prints the old order. Needs a read-back in the form and the 422 in the Worker.
6. **New member without the load's truck or match.** The board shows the row as assigned (it reads the lead) while one order has no truck in the table, or the import disappears from the board because the lead has no match (both seen before: audit C-2, case of 8/11 behind migration 106).
7. **Partner fee multiplied.** Each added member copies the full rate and makes its own payable line.
8. **Old groups opened wrongly.** Reading by group base joins two loads that reused an id; reading only the loaded week shows 2 of 3 members and a save rewrites the order without the third.
9. **Stock piece counted twice or stuck.** In a groupage without truck it is both "waiting on the shelf" and "planned"; it cannot be marked loaded until a truck is written on it; given to a partner it carries a cost the stock rules never expected.
10. **"Into stock" inside a groupage.** Order saved, lot mark refused: an ordinary order to a warehouse, invoiced at full price at intake with no stock behind it (the case the form guards against today for single orders).
11. **Scan files crossed.** One global slot for the file and for the learning example: the PDF of order 2 attached to order 3, or corrections of one customer stored as examples of another.
12. **Offline save.** Orders queued with fake ids, points and group never attached.
13. **Reefer overwritten on old members.** Opening an old groupage and saving pushes one reefer mode onto members that had another, without anyone choosing it.
14. **Two sources for the order of points** if the old suffix is kept "for compatibility" next to the new positions: the board and the driver sheet will disagree the first time only one is updated.

## 5. What could not be determined from the code

- Whether the group-by-base rule for round trips (066) is live in the base; it is still in `drafts/`.
- Which triggers fire on an update of `order_stops` and whether a new column would wake them.
- Whether the atomic batch create in the repo's Worker is the one running in production (the front-end comment in `core/api.js:1004-1008` still says "until it is deployed").
- How many groupages exist, of which kind, and how many have a reused base id, mixed members, or disagreeing trucks / matches.
- How many stops carry an exchange count 1..n.
- Whether profit and loss adds the partner fee of every member of a groupage (audit question Δ, still open).
- How the command palette and the AI chat open or describe an order that is in a groupage.
- Whether the facade can filter `Group ID` by prefix (needed to read old members with and without suffix in one request).
- Whether scan engine v2 (Word) is on for the team's browsers; it is a per-browser switch.
- The base's behaviour for a piece that carries a `Group ID` but no truck in the monitoring checks (057b was not opened).
- Anything about the live app's behaviour: none of the above was tried on screen.
