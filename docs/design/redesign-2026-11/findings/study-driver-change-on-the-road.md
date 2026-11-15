# Change of driver on the road: from the national board to the international one

Read-only study, 15/11/2026. Code read in the worktree `design-petras-tms-redesign-05f337`, branch `docs/redesign-2026-11`. For every file named below there is no difference against `origin/main` (checked with `git diff HEAD origin/main`). Nothing was run: no app, no database, no Worker, no test. No file in the repository was changed.

Short names: `road` = `modules/wn5_road.js` · `hand` = `modules/wn5_handover.js` · `wn5` = `modules/weekly_natl_v5.js` · `wn5l` = `core/wn5-logic.js` · `lab` = `core/wn5-labels.js` · `sheet` = `modules/wn5_sheet.js` · `wk` = `worker/src/index.js` · `m072b` = `worker/migrations/072b_plan_vehicle_segments.sql` · `m098`, `m099`, `m095`, `m096`, `m109`, `m011`, `m021`, `m033`, `m097` = the files of the same number in `worker/migrations/` · `feed` = `core/rt-feed.js` · `wi` = `modules/weekly_intl.js` · audits = `docs/design/redesign-2026-11/findings/audit-groupage-split.md` (`AGS`) and `audit-dates-veroia-relay-stock.md` (`ADV`).

---

## The short answer

**The owner most likely means the national «Αλλαγή οχήματος» (migration 072b, `plan_seg_change`, `modules/wn5_handover.js`)**: the same trip and the same loads, and from a point and an hour onwards another driver (and, if needed, another truck or a partner) carries on. The other national feature, «Αλλαγή στον δρόμο» (098/099, `plan_transfer`), moves loads, or parts of loads, from one truck onto other trucks at a point. That is a transshipment, and on the international board the split order already does that job.

Why:
- The owner said «αλλαγή οδηγού» (driver change) and «ίδια περίπτωση» (the same case). Only 072b changes the driver of a running trip without touching its loads: «loads and stops do not change» (`m072b:1276-1279`). It has the «ίδιος οδηγός» switch for the truck-only case (`hand:577`) and the reasons «Ώρες οδηγού (ταχογράφος)», «Κώλυμα οδηγού», «Προγραμματισμένη αλλαγή οδηγού» (`lab:169-171`).
- The owner probably knows the feature under the name «Αλλαγή στον δρόμο» and means its driver-change outcome. To be confirmed with the owner (question Q0 in section 4).

**The international data model cannot hold it today inside one order and one round trip.** An international order has one truck and one driver. Its round trip has one truck and one driver, copied from the order (`feed:543-549`). The payroll has exactly one live line per round trip (`m011:57`, unique index `dl_rt_live`), and that line always follows the round trip's driver (`m011:202-215`). The hourly audit check B-05 «Γύρος με δύο διαφορετικούς οδηγούς» counts any round trip whose orders have two drivers as an error, with the impact «Η μισθοδοσία πάει σε λάθος οδηγό (ένα φορτηγό, ένας οδηγός — 5/9)» (`tms-auditor/checks/B-05.sql:2-17`). B-06 flags any order whose truck or driver differs from its round trip's (`tms-auditor/checks/B-06.sql:2-17`). The national segments are limited to the national trip model (`model = 2`) everywhere: the table's triggers (`m072b:651`, `m072b:661`), `plan_seg_change` (`m072b:1326`, `rt_gone` for any other trip), and the Worker's text for `seg_not_v2`: «Αλλαγή οχήματος γίνεται μόνο σε δρομολόγιο του Εβδομαδιαίου Εθνικών» (`wk:3544`). International trips are `model = 1` (`m109:3-5`).

**The one thing that already works on international is the split order.** It turns one order into two legs at a hand-over point. Each leg is an order with its own assignment. A second own truck on leg 2 «gets its own trip for the driver's payroll but no revenue» (`m021:11-13`). So a driver change can be written today, with no database or Worker change, as a split where leg 2 keeps the same truck and gets the new driver. That is the smallest first version (section 5), with known limits.

---

## 1. How the national features work today

### 1.1 «Αλλαγή οχήματος» at a point (072b), the one the owner most likely means

**Where it opens**
- ✈ menu line «Αλλαγή οχήματος…» for users without `WN_ROAD` (`wn5:2120-2123`). It opens a small first window «Αλλαγή οχήματος» that lists the vehicles so far with their hours, head «ΕΝΑ ΦΟΡΤΗΓΟ ΩΣ ΤΩΡΑ» / «ΕΝΑΣ ΣΥΝΕΡΓΑΤΗΣ ΩΣ ΤΩΡΑ» / «ΜΕ ΑΛΛΑΓΗ ΗΔΗ», and «Συνέχεια ›». This window writes nothing (`hand:341-366`).
- The trip card (click on a truck tile, `wn5:1359`, or on the «⇄» mark, `wn5:1387`). Title «Αλλαγή οχήματος · <truck · driver>», buttons «Αλλαγή οχήματος», «Φύλλα οδηγών (N)», «Καθαρισμός ανάθεσης», then the list «ΤΜΗΜΑΤΑ» with «Διόρθωση» on every segment and «Αφαίρεση» on every segment except the first (`hand:294-334`).
- ✈ «Παράδοση με τοπικό › Κάθοδος | Άνοδος»: the same form, prefilled with the first delivery of that side (day, place, note «Παράδοση με τοπικό»). The local driver takes over from that point, «paid as a trip», and the national truck is free (`wn5:2102-2107`, `wn5:1591-1603`, `hand:562-565`). The «ΤΟΠΙΚΑ» panel recognises these changes by the start of their note (`wn5l:672-698`).
- For `WN_ROAD` users, the «Αλλαγή στον δρόμο» window ends here when the whole load goes to one truck (1.2).

**The form** (`hand:565-613`). Title «Αλλαγή οχήματος». Under it: current truck (or partner) · driver · the trip's days.
| Field | Source and default | Rule |
|---|---|---|
| «Πότε *» day + «ΗΗ:ΛΛ» time | empty (prefilled only from «Παράδοση με τοπικό») | required: «Πότε *: ημέρα και ώρα» (`hand:59`); typed time «1430»/«14.30» → «14:30» (`hand:53`) |
| «Πού *» | free text, placeholder «σημείωση» | required: «Πού *: γράψε το σημείο της αλλαγής» (`hand:60`); stored as text, never a catalogue place (`m072b:401-402`) |
| «Λόγος» | empty; list of 8 in two groups ΑΠΡΟΒΛΕΠΤΟ / ΠΡΟΓΡΑΜΜΑΤΙΣΜΕΝΟ + «Άλλο» (`hand:368-372`, `lab:165-173`) | optional since 095 (`m095:19-29`) |
| «Σημείωση» | empty | optional |
| «Δικό μας» / «Συνεργάτης» toggle | «Δικό μας» | |
| Own: «Φορτηγό *», «Ρυμούλκα», «Οδηγός *» | empty lists (no preselection) (`hand:553-561`) | «Φορτηγό *: διάλεξε φορτηγό», «Οδηγός *: διάλεξε οδηγό» (`hand:62-63`) |
| «ίδιος οδηγός (<name>)» switch | off; disabled when the segment has no driver (`hand:577`) | on = only the truck/trailer changes; the driver box shows the driver who goes on (`hand:443-468`) |
| Partner: «Συνεργάτης *», «Κόμιστρο €», and, partner after partner, «Κόμιστρο <previous partner> €» | the previous rate is prefilled | «Κόμιστρο €: αριθμός 0 ή πάνω» (`hand:25-35`, `hand:99-117`) |

The 8 reasons (`lab:165-173`): «Βλάβη φορτηγού», «Βλάβη ψυγείου», «Ατύχημα», «Ώρες οδηγού (ταχογράφος)», «Κώλυμα οδηγού (ασθένεια κ.λπ.)», «Προγραμματισμένη αλλαγή οδηγού», «Προγραμματισμένη αλλαγή φορτηγού», «Άλλο». The base holds the same list (CHECK `seg_reason_list`, `m072b:436-437`).

**Same truck, new driver** is allowed: the only "nothing changes" refusal is `seg_same`, when truck, trailer, driver, partner and rate are all the same (`m072b:1348-1351`). The user must pick the same truck again by hand, because the truck list opens empty (`hand:556`).

**Preview and save** (one act, decision 44)
- Every edit runs a dry run `POST /plan/rt/:id/handover` 400 ms later (`hand:436-438`, `hand:469-490`). The preview «Μετά την αλλαγή» shows one white row per segment (plates, hours, places), a «⇄ <point> · <day hh:mm> · <reason>» line between them, and one payroll line «Μισθοδοσία: N γραμμή/γραμμές (names)» (`hand:401-410`, `hand:138-150`). That payroll line is drawn by the screen; see «payroll» below for what is actually written.
- Busy: an own truck, trailer or driver already on another trip that calendar day is said in amber before the press, by name, day and places. The save then carries `accept_busy` (096) (`hand:151-173`, `hand:394-398`; `m096:1-15`). If the dry run finds a busy vehicle the screen could not name, the strip carries «Αποθήκευση έτσι κι αλλιώς» (`hand:174-187`).
- «Αλλαγή οχήματος» saves with one `request_id` per open form. A second press returns the first answer (`hand:510-538`, `m072b:1293-1296`). Done: «Η αλλαγή οχήματος γράφτηκε», plus «· το πρώτο πάτημα είχε ήδη αποθηκευτεί» on a replay (`hand:520`).
- Worker route: `POST /plan/rt/(id)/handover` → rpc `plan_seg_change`. Every role may use it, the removal is owner + dispatcher only (`wk:6313-6315`, `wk:6125-6150`).

**Refusals and warnings, with the Worker's Greek** (`wk:3459-3561`, `wk:3637-3648`)
- `seg_time`: «Η ώρα της αλλαγής οχήματος είναι μέσα στο δρομολόγιο και ανάμεσα στις άλλες αλλαγές του» (time must be strictly inside the trip, `m072b:1328`; a change already at that exact time = `seg_time`, `m072b:1334`)
- `seg_unassigned`: «Δρομολόγιο με αλλαγή οχήματος έχει όχημα σε κάθε τμήμα — ανάθεσε πρώτα όχημα, ή χρησιμοποίησε «Καθαρισμός ανάθεσης»» (`m072b:1336-1338`)
- `seg_same`: «Το νέο όχημα είναι το ίδιο με αυτό που ήδη εκτελεί — διάλεξε άλλο»
- `seg_no_vehicle`: «Η αλλαγή οχήματος θέλει φορτηγό ή συνεργάτη»
- `seg_not_v2`: «Αλλαγή οχήματος γίνεται μόνο σε δρομολόγιο του Εβδομαδιαίου Εθνικών»
- `truck_busy`: «Το φορτηγό είναι ήδη σε άλλο δρομολόγιο εκείνες τις ώρες» · `driver_busy`: «Ο οδηγός είναι ήδη σε άλλο δρομολόγιο εκείνες τις ώρες» (passable with `accept_busy`)
- `payroll_locked`: «Η μισθοδοσία του δρομολογίου έχει ήδη ποσά — η αλλαγή οδηγού γίνεται με «Καθαρισμός ανάθεσης» και νέα ανάθεση» (raised by the correction when the driver of a segment that has a payroll line with amounts changes, `m072b:1519-1521`)
- `seg_place_text`: «Γράψε το σημείο της αλλαγής (π.χ. «Λαμία»)» · `seg_reason_list`: «Άγνωστος λόγος αλλαγής οχήματος — διάλεξε από τη λίστα»
- `seg_first`: «Το ΑΡΧΙΚΟ τμήμα ξεκινά με το δρομολόγιο: δεν έχει ώρα, σημείο ή λόγο και δεν αφαιρείται — διόρθωσε το όχημά του»
- `seg_many` (a vehicle set from the assignment on a trip with a change): «Το δρομολόγιο έχει αλλαγή οχήματος — άλλαξε το όχημα στο συγκεκριμένο τμήμα (ΑΡΧΙΚΟ, ΕΝΔΙΑΜΕΣΟ ή ΤΕΛΙΚΟ)»
- Screen-only: «Η αλλαγή οχήματος δεν έχει ανέβει ακόμη (072b)» when the route is missing (`hand:506`)
- Warnings: «Το ίδιο φορτηγό είναι σε διεθνές δρομολόγιο τις ίδιες ημέρες» (`lab:63`). `seg_stop_moved` / `seg_stop_straddles` exist (`lab:83-85`) but the forms drop them (owner 3/11, «no stop text», `hand:482`).

**What is written** (`m072b:1353-1395`)
- Table `rt_vehicle_segments` (one row = the vehicle of a national trip from `from_at` to `to_at`; columns trip_type, truck_id, trailer_id, driver_id, partner_id, partner_rate, place_note, reason, reason_note, created_by, soft delete) (`m072b:397-442`). The segment that holds the time is cut (`to_at = at`), and a new segment is inserted from `at` to the old end. Each write has an audit row (`m072b:1363-1391`).
- The trip itself (`ct_round_trips`) keeps the FIRST segment's vehicle, copied only by the base (trigger `plan_seg_copy`, `m072b:24-25`, `m072b:529`).
- Loads, stops and legs do not change (`m072b:1276-1279`). Which segment executes a stop is decided by the base: «the segment of its arrival» (H-9, `wn5l:633-641`, `m072b:1393-1395`).
- The labels ΑΡΧΙΚΟ / ΕΝΔΙΑΜΕΣΟ / ΤΕΛΙΚΟ are derived, never stored (`m072b:401`, view `v_rt_segments`).

**First driver's and second driver's trip**: one trip, two segments. Truck-busy and driver-busy checks run per segment window, so the first truck is free after the change (`m072b:1392`; the board and `plan_h_busy` read segment windows, `m072b:59-65`).

**Payroll (what the data really does)**
- The planned rule «μία γραμμή ανά οδηγό του κύκλου» (R-41, `docs/national-v5/handover/requirements.md:195-199`; plan item Π3-2, `dl_entries.per_driver`, `docs/superpowers/plans/2026-10-25-national-v5-vehicle-handover.md:635`) **was not found in any migration**. `per_driver` appears in no file under `worker/migrations`, `worker/src` or `db/`. 073 says it adds no column but `ct_cost_lines.partner_id` (`worker/migrations/073_plan_money.sql:43-44`).
- What runs is 011: one live line per trip (`m011:57`), with the trip's driver (`m011:184-185`, `m011:202-215`). The trip's driver is the first segment's (`m072b:529`). **So today the second driver of a national trip with a change gets no payroll line, and the first driver's line covers the whole trip.** The screen's preview line «Μισθοδοσία: 2 γραμμές (…)» (`hand:138-150`) promises more than the base writes. To be measured on live data (section 6).
- Removing a change deletes the payroll line with amounts of a driver who drives no other segment, after a confirmation list (`m072b:886-912`, `m072b:925-942`). The removal window says «η μισθοδοσία του <driver> σβήνεται» (`hand:732`).

**Expenses**: the DKV import matches a national trip per segment window and per truck (`worker/src/import-rules.mjs:386-395`, `:638`). A trip whose segments do not clearly decide goes to the accountant as `review_cycles` (`import-rules.mjs:468`). Removing a segment leaves that truck's cost lines on the trip and notifies the national desk (`m072b:925-935`).

**Pallets**: no pallet row moves at a vehicle change. Pallets belong to stops and legs, which do not change (`m072b:1276-1279`).

**Driver sheet**: one sheet per segment (H5/T27). Each driver sees only his own stops, plus a hand-over line «in» or «out» with the place, day, hour, reason, the other vehicle and driver with phone, and what is on board at that moment (pallets, temperature, references) (`sheet:76-112`). From the trip card: «Φύλλα οδηγών (N)», one button per segment «ΑΡΧΙΚΟ · <truck>» (`hand:324-331`).

**How the row looks afterwards** (national board)
- One tile per segment, side by side: ΑΡΧΙΚΟ with a straight line, each next tile with a slanted edge. Own truck = plate + driver, partner = name + rate or «κόμιστρο λείπει» (`wn5:1347-1361`, `wn5l:287-310`).
- «⇄» replaces the «→» of the side where the next segment starts (`wn5:1375-1388`).
- A sub-line under the trip: «↳ ⇄ <point> · <day time> · <reason>», one item per change (`wn5:1389-1400`).

**Correction and removal**
- «Διόρθωση»: `PATCH /plan/segments/:id` with only the changed keys, a dry run first, no request_id. On the first segment only the vehicle can change (`hand:615-717`).
- «Αφαίρεση»: `POST /plan/segments/:id/remove`, a dry run of its own, then the shared confirm-with-list. Refused with «Η αφαίρεση δεν γίνεται: το προηγούμενο όχημα δεν είναι ελεύθερο ως το τέλος του τμήματος.» when the previous vehicle is busy again. Success toast «Η αλλαγή οχήματος αφαιρέθηκε · <vehicle>» (`hand:719-773`).
- A change entered after the fact is accepted: «Before, on, or after the time (planned, a breakdown, recorded afterwards): the base does not compare with now()» (`m072b:1279`). Nothing in 072b looks at a «closed» trip. Only payroll amounts lock a driver correction (`payroll_locked`).

### 1.2 «Αλλαγή στον δρόμο» (098 + 099), the transshipment

**Where it opens**: ✈ «Αλλαγή στον δρόμο…» and right-click on a point «Αλλαγή στον δρόμο από εδώ…», only with `WN_ROAD` (`wn5:2118-2123`, `modules/wn5_edit.js:72-73`, `road:569-570`).

**The window** (`road:192-204`, `road:569-675`). Title «Αλλαγή στον δρόμο», head «truck · driver · days», side switch ΚΑΘΟΔΟΣ / ΑΝΟΔΟΣ.
- «Πού *»: a catalogue place, or the typed text «ως σημείο με κείμενο». Veroia and the place «TRANSFER POINT» are never offered (`road:115-125`, `road:349-369`).
- «Ημέρα *», «Ώρα», button «όλη η ημέρα» (00:00–23:59). A typed time is written as a one-minute window (`road:58-69`).
- «Λόγος *»: the 8 reasons + «Συνάντηση», «Παράδοση συνεργάτη» (`lab:181-186`). «Σημείωση»: optional.
- «ΦΟΡΤΙΑ ΣΤΟ <truck>»: one row per load on that side, with its pallets (fewer = a split, with the rest on its own line «↳ υπόλοιπο») and «Πάει σε». The «Πάει σε» choices are «μένει στο <truck>» (default), «ΣΤΟΝ ΔΡΟΜΟ» (trips of the board that day), «ΕΛΕΥΘΕΡΑ» (free own trucks = a new trip), and «Νέο φορτίο · φορτηγό αργότερα» (waits at the point). There is also «Όλα σε ▾» (`road:126-151`, `road:174-191`).
- Under each truck: «<truck> · <day> · 9 → 31/33» (`road:311-325`); the new-load column «ΝΕΟ ΦΟΡΤΙΟ · …» (`road:326-347`); busy strip «ΑΠΑΣΧΟΛΗΜΕΝΟ <text>» (`road:292-310`).
- Footer: «Λείπει: σημείο, ημέρα και ώρα, λόγος, παλέτες, φορτηγό για ένα φορτίο τουλάχιστον, ώρες παράδοσης στο άλλο φορτηγό» (`road:103-113`, `road:283`).
- «Συνέχεια ›» = dry run of `POST /plan/transfer` and the preview «ΤΙ ΘΑ ΓΙΝΕΙ»: every truck's chain of points (new points bold with «⇄»), «ξεφορτώνει Nπ» / «φορτώνει», waiting loads «περιμένει στη <point> από <day> · στο προς ανάθεση», and the international's Veroia day moves «<ref> · ημέρα Βέροιας … η ράμπα ακολουθεί» (`road:371-416`).
- When the base says `whole_vehicle`: «Όλα τα φορτία σε ένα άλλο φορτηγό: γράφεται ως αλλαγή οχήματος.» plus «Οδηγός» (default «ίδιος οδηγός (<name>)»). The save is the 072b change of 1.1 (`road:414`, `road:426-446`, `road:503-522`, `road:538-542`).
- «Αποθήκευση» with one request_id per window. Done: «Η αλλαγή στον δρόμο γράφτηκε» or «Η αλλαγή οχήματος γράφτηκε» (`road:530-550`).

**Refusals** (`wk:3569-3573`, `wk:3651-3654`): `transfer_chain` «Φορτίο που ξεφορτώθηκε σε «Αλλαγή στον δρόμο» φορτώνεται μόνο από το φορτηγό που το παραλαμβάνει εκεί — ανανέωσε τη σελίδα» · `transfer_left` «Ένα φορτίο έμεινε στο σημείο της αλλαγής χωρίς φορτηγό — διάλεξε φορτηγό ή «περιμένει εκεί»» · `transfer_at_hub` «Στη Βέροια τα φορτία σπάνε και ανατίθενται από τον Πίνακα Βέροιας, όχι με «Αλλαγή στον δρόμο»» · `transfer_not_on_board` «Το φορτίο δεν είναι πάνω στο φορτηγό τις ώρες που δόθηκαν για «Αλλαγή στον δρόμο» — διάλεξε ώρα μέσα στη διαδρομή του» · `transfer_next_leg` «Το φορτίο έχει ήδη επόμενο φορτηγό από εκεί που ξεφορτώνει — άλλαξε πρώτα εκείνη την ανάθεση και μετά κάνε «Αλλαγή στον δρόμο»» · `rt_stops_transfer_reason` «Άγνωστος λόγος για «Αλλαγή στον δρόμο» — διάλεξε από τη λίστα» · `rt_stops_transfer_place` «Γράψε το σημείο της αλλαγής (π.χ. «Λαμία, πρατήριο»)». Plus the busy codes of 1.1.

**What is written** (`m099:10-27`, `m098:10-25`):
- Truck A gets a new stop at the point, with reason, note and «waits there». Columns `rt_stops.transfer_reason / transfer_note / transfer_waits / transfer_from_stop_id / transfer_place`.
- Each listed load's leg on A is cut at the point and written again. The pallet ledger follows: nothing moves at the point.
- A part may split. Each part goes to a trip of B (existing or new), stays on A, or waits.
- A's stops left with no leg go. The international order's Veroia day follows its Veroia stop.
- Route `POST /plan/transfer` → `plan_transfer`, every role (`wk:6319`, `wk:6142-6144`); national trips only (`m099:185`).

**Payroll / expenses / pallets / driver sheet**: each truck keeps its own trip, so each driver keeps his own trip and payroll line (011). Revenue is shared per pallet over the legs (`m098:15-16` «revenue equal», 073 M-1). No pallet movement at the point (`m098:4`). Each truck's driver sheet shows the new point as one of its stops.

**Undo**: no dedicated undo was found. The stops and legs it made are changed with the ordinary move / delete acts. The 099 rollback refuses while any transfer exists (`m099:38-39`). Not verified further.

### 1.3 What differs between the two
| | «Αλλαγή οχήματος» (072b) | «Αλλαγή στον δρόμο» (099) |
|---|---|---|
| What moves | the vehicle and/or driver; loads stay | loads (or parts) move between trucks |
| Trips | one trip, segments inside it | every truck its own trip |
| Point | free text | catalogue place or free text |
| Time | day + hour, required | day + hour, or «όλη η ημέρα» |
| Reason | optional (095) | required |
| Payroll | 011 one line per trip, the first driver's (per-driver line planned, not built) | one line per trip, each truck's driver |
| Driver sheet | one sheet per segment with a hand-over line | one sheet per truck |
| Correction | «Διόρθωση», «Αφαίρεση» on each segment | ordinary board acts |
| Who sees it | everyone | `WN_ROAD` pilot users only |

---

## 2. What the international side has today that is close

**The split order «Σπάσιμο σκέλους…»** (`wi:4810-4838` menu, panel `wi:4843-4887`, write `wi:4895` onward; flow and line numbers in `AGS` §3, lines 235-341)
- Fields: «Σημείο παράδοσης-παραλαβής *» (catalogue location), «Ημερομηνία/ώρα παράδοσης εκεί *», «Ποιος εκτελεί το σκέλος 2 (κενό = ΠΡΟΣ ΑΝΑΘΕΣΗ)» with «Δικό μας» (Φορτηγό, Ρυμούλκα, Οδηγός) or «Συνεργάτης» (+ optional rate) (`wi:4865`).
- It writes two new orders (leg 1 with the original's vehicle, up to the hand-over; leg 2 from the hand-over with the chosen vehicle), their stops, takes the original off its round trip and clears its vehicle. Six steps, each said if it fails (`AGS` 3.1). Price, customer, reference and match stay on the original.
- The board draws a header «ΣΠΑΣΜΕΝΗ ΣΕ 2 ΣΚΕΛΗ … αλλαγή φορτηγού στο σημείο Χ» and two leg rows «↳1», «↳2», each with its own assignment, dates, sheet and menu (`AGS` 3.2).
- «Αλλαγή σημείου παράδοσης-παραλαβής…» moves the hand-over place and time on both legs (`wi:1562`, `wi:1601-1722`). «Ένωση ξανά» undoes the split while no leg is on the road (`AGS` 3.4).
- Round trips: an own truck on leg 2 gets its own round trip «for the driver's payroll but no revenue». The revenue goes to leg 1's trip (`m021:9-13`). A partner leg never gets a trip of its own: its rate is a planned cost of the sibling's trip (`feed:426-433`, `m021:14-16`).
- Limits relevant here: not offered on a groupage (`AGS` 3.1 step 1, `wi4l:240`); depth one (`AGS` 3B); a matched import stays on the original (`AGS` C-25); no check that the hand-over lies between loading and delivery (`AGS` C-22); a local driver on the original stays there (`AGS` C-32); the panel can create a second pair after a failed step (`AGS` C-21).

**The forwarding leg «⤷ Σκέλος προώθησης (ρότα)…»** (`wi:4723`, `wi:4468`; `ADV` §4): it adds another order to the same truck's round trip after this one. It is the same truck and driver, so it is not a driver change.

**The local driver «Παράδοση/Φόρτωση με τοπικό οδηγό…»** (`wi:5988`, `core/relay.js`; `ADV` §5): a LOCAL MOVES row next to the order. «the international driver stays» (`ADV` §5). It is paid as its own line (060). It is the closest thing to «Παράδοση με τοπικό» on the national side, but on international it does not free the truck and does not change who drives the trip.

**How an international round trip is kept**
- One round trip per physical trip: export, matched import, group members and forwarding legs gathered into one (`feed:403-466`, «a group/rota is ONE round trip», `feed:449-455`). Its truck, trailer and driver are taken from the anchor order (`feed:543-549`), at the moment the order is assigned (`feed:482-487`).
- In the database, 013 keeps the trip's vehicle equal to the order's (`rt_sync_from_order`). 033 creates the round trip for related orders (`m033:1-40`). 037 / 097 merge an export-only and an import-only trip only when they run the same truck, keeping the older trip's driver (`m097:24-34`). 066 compares only the base of the group code (`docs/DECISION_LOG.md:2909`).
- 097 states the known limit plainly: «An import given the export's truck with ANOTHER driver ends on the export's round trip with its own driver on the order: B-06 … and B-05 (two drivers on one round trip) show it within the hour» (`m097:31-34`).
- Payroll: one line per round trip (`m011:57`), driver and dates always follow the trip, and a driver change after amounts are written is flagged `needs_review` (`m011:202-215`).
- The national board shows our trucks' international trips only as busy days (`m109:1-15`).

**Can the international model hold "same load, same truck or another, a second driver from this point on"?**
- Inside one order: **no**. One truck and one driver per order (ORDERS map, `AGS` common facts).
- Inside one round trip: **no**. One truck and one driver per trip (`feed:543-549`). Two drivers on one trip is an audit error (B-05) and leaves the second driver without a payroll line (`m011:57`).
- With the segments of 072b: **no**, model 2 only (`m072b:651`, `m072b:1326`; `wk:3544`).
- With the split: **yes, as two orders**. Leg 2 with the same (or another) truck and the new driver gets its own round trip and payroll line (`m021:11-13`). This works today but with the limits listed under the split above.

---

## 3. The design for international (description only)

**Entry point**: one line in the load's ✈ / right-click menu, the same menu for a single load and a groupage (owner 15/11, `groupage-from-the-form.md:115-121`). Also from the assignment box of an assigned row. Not offered on a row without an assignment: a change hands over a vehicle (same as national, `seg_unassigned`). Name: the owner's «Αλλαγή οδηγού στον δρόμο» is fine as a label. The national board calls the same act «Αλλαγή οχήματος». One name for both boards needs an owner decision (Q9).

**Panel fields and defaults** (same as national 1.1 unless said)
1. «Πότε *»: day + time, both required. Default: empty. Differs because: on international, prefill the day of the first stop not yet done after today, as «Παράδοση με τοπικό» prefills on national (`wn5:1591-1603`).
2. «Πού *»: needs an owner decision. National 072b takes free text (`m072b:401-402`). The international split takes a catalogue location (`wi:4843-4887`). If the first version is built on the split, it must be a catalogue place (or the «TRANSFER POINT» text place of 099).
3. «Λόγος»: the 8-reason list, optional, plus «Σημείωση» (same as national). No placeholder that explains (owner rule: no explanatory text on screen).
4. «Δικό μας / Συνεργάτης» toggle; «Φορτηγό», «Ρυμούλκα», «Οδηγός», and the «ίδιος οδηγός» switch. Differs because the owner asked for a driver change: default the truck and trailer to the current ones and leave the driver empty, the reverse of national, where the truck opens empty (`hand:556`). Whether the truck may change at all needs an owner decision (Q1).
5. Preview «Μετά την αλλαγή» (read only, from a dry run): two lines, «<truck> · <driver 1> · <first day> → <change day hh:mm>» and «<truck> · <driver 2> · <change> → <end>». Under each line, the points it executes, in the saved order per point (owner 15/11, `groupage-from-the-form.md:110`). A point belongs to the driver of its arrival time (national rule H-9, `wn5l:633-641`). **The user does not tick points.** Then one payroll line per driver, and the amber busy line by name, day and places (same as national, `hand:151-173`).
6. Buttons «Άκυρο» and «Αλλαγή οδηγού». One request id per open panel (same as national).

**The row afterwards**: the assignment cell shows two tiles side by side, «<truck> · <driver 1>» then «<truck> · <driver 2>» (same as national, `wn5:1347-1361`). The «→» of the side where driver 2 starts becomes «⇄» (same). A sub-line «↳ ⇄ <point> · <day hh:mm> · <reason>» (same as `wn5:1389-1400`). If built on the split, the board today draws a split header and two leg rows instead (`AGS` 3.2). The redesign should draw one row with two tiles either way, so the user sees one load.

**Driver sheets**: one sheet per driver, each with only his points, and a hand-over line «in» or «out» with place, day, hour, the other driver and phone, and what is on board (same as national, `sheet:76-112`). International sheets come from `print.html?orderIds=…&sheet=driver` per order (`AGS` 1.10). With the split, each leg is an order and gets its own sheet already, but without the hand-over line (`AGS` 3.6, not verified on paper).

**Groupage**: the change applies to the whole load: every member order and every point, in the per-point order (owner 15/11). Differs because international writes are per member, one request each, and half-way states exist (`AGS` 1.9, 1.6). The act must be one write, or it is not safe to build. A member whose deliveries all fall before the change stays wholly with driver 1. The split, which the first version would use, is not offered on a groupage today (`AGS` 3.1); making a groupage splittable is already on the owner's list (`groupage-from-the-form.md:115-121`).

**Matched import for the return**: differs. National has no matched import. The export and its import are one international round trip (`feed:420-425`). By default the new driver keeps the return (the change cuts the trip, and what comes after it is his). Needs an owner decision (Q4). The split today leaves the match on the original order, so the import keeps the old truck and trip (`AGS` C-25). The first version must decide this before it ships.

**Through Veroia**: an export through Veroia starts its international part at Veroia, and the national part lives on the national board (`ADV` §3). A driver change applies to the international part only. A change point before Veroia is a national matter (the national board's own change). Differs, by design. Notices to the national desk are not needed, because the Veroia day does not change.

**A partner's load**: changing from a partner to our truck, or from our truck to a partner, at a point is a vehicle change, not a driver change. National allows both directions, with the previous partner's rate adjustable (`hand:28-35`). On international, a split leg 2 on a partner already exists (rate as planned cost, `m021:14-16`). Needs an owner decision (Q2). A partner's own driver change is not ours: no action offered.

**Entered after the fact**: same as national. Accepted, with no comparison to the current time (`m072b:1279`). It warns, never refuses (owner rule). A change after a driver already has payroll amounts: national refuses the correction with `payroll_locked`. On international, 011 only flags `needs_review` (`m011:202-215`). Needs an owner decision (Q7). Changes on a closed round trip: an international closed trip reopens when it gets an open leg (`feed:489-501`, 046). Whether that is acceptable here needs an owner decision (Q7).

---

## 4. Owner decisions needed

- **Q0. Which national feature is meant?** «Όταν λέτε "αλλαγή οδηγού στον δρόμο, όπως στο Εθνικών", εννοείτε την "Αλλαγή οχήματος" (ίδιο φορτίο, άλλος οδηγός ή φορτηγό από ένα σημείο) ή τη "Μεταφόρτωση" (φορτία σε άλλο φορτηγό);» Example: Αντώνης is out of tachograph hours in Wien, Παύλος continues with ΚΗΙ 6012 to München (vehicle change). Or: in Wien half the pallets go onto ΚΗΙ 2208 (transshipment).
- **Q1. Only the driver, or the truck too?** Example: ΚΗΙ 6012 breaks down in Wien, and ΚΗΙ 2208 with Παύλος carries the load to München.
- **Q2. Can our truck hand over to a partner, or a partner to our truck, at a point?** Example: our truck breaks down in Wien, and Transfrigo takes the load to München for 600 €.
- **Q3. Who is paid what?** Example: Αντώνης drives Βέροια → Wien (2 days), Παύλος drives Wien → München → return (4 days). One trip value split by days, two separate trip values entered by Αλεξία, or one line for the first driver as today? (Note: the per-driver line was planned for national and never built, so today the second national driver also gets nothing.)
- **Q4. The return import: does it stay with the new driver?** Example: the export to München is matched with an import Ulm → Βέροια. After the change in Wien, does Παύλος drive the return, or does Αντώνης come back for it?
- **Q5. Where: a place from the list, or free text?** Example: «Wien» from the list, or «Wien, πρατήριο OMV στην A4».
- **Q6. Can changes be chained?** Example: Αντώνης → Παύλος in Wien on Sunday, then Παύλος → Αντώνης in Ulm on Tuesday (national allows this: ΑΡΧΙΚΟ / ΕΝΔΙΑΜΕΣΟ / ΤΕΛΙΚΟ).
- **Q7. Can it be corrected or removed after the trip closed, or after Αλεξία entered payroll amounts?** Example: the trip ended on Friday, Αλεξία entered Αντώνης's amounts, and on Monday someone sees the change was in Salzburg, not Wien. National refuses the driver correction once amounts exist and does not look at "closed".
- **Q8. What does «ΕΠΟΜΕΝΑ» (the queue) show?** Example: a change saved with the new driver still unknown (allowed or not?), or a change whose new driver is on another trip that day. National requires the driver and only warns about the busy one.
- **Q9. One name on both boards?** Example: «Αλλαγή οδηγού στον δρόμο» on international and «Αλλαγή οχήματος» on national, or one name for both.
- **Q10. Driver sheet: only his own points, or the whole trip?** Example: Παύλος's sheet shows Wien (take-over) → München → Augsburg → Ulm only; Αντώνης's sheet ends with «παράδοση στον Παύλο, Wien, Κυρ 14:30».
- **Q11. Fuel and road costs when the truck changes too (if Q1 = yes).** Example: ΚΗΙ 2208 fuels in Salzburg after the change: that DKV line belongs to this trip, or to ΚΗΙ 2208's own trip?

---

## 5. Technical work, risks, smallest first version

### Work in order (full version: segments on international trips)
1. **Database** (xhigh, owner after 15:00):
   - Allow segments on international trips (`model = 1`), or a twin table for them. `rt_vehicle_segments` and its triggers are bound to `model = 2` (`m072b:651`, `m072b:661`), and so are `plan_seg_*` (`m072b:1326`).
   - Payroll per driver for both models: replace the one-line-per-trip rule (`m011:57`, `m011:184-215`). This was never built even for national (Π3-2).
   - Decide which driver the order and the trip hold, so that 013 `rt_sync_from_order` and the merges 033 / 037 / 097 do not rewrite or merge by the wrong driver (`m097:31-34`).
   - Rewrite the audit checks B-05 / B-06 so that a trip with segments is not red.
   - DKV per segment window for international (the national rule is in `import-rules.mjs:386-395`, `:638`).
2. **Worker** (xhigh): a route for international (open `/plan/rt/:id/handover` to model 1, or a new one), its permission row, its messages (`seg_not_v2` text changes), new guard markers in `CLAUDE.md`. Deploy only from the PR's worktree with the guard.
3. **Front end** (high):
   - `core/rt-feed.js` must stop re-writing the trip's driver from the order on every save (`feed:543-549`, and the PATCH path after it). Otherwise the next save undoes the change.
   - The menu line and panel in the international board (`modules/weekly_intl.js` / `wi4_actions.js`). The national panel `wn5_handover.js` depends on the national board objects (`WN5`, `WN5L`, `PlanIds`), so the panel must be adapted, not reused as it is.
   - Two tiles, «⇄» and the sub-line in `weekly_intl_v2.js`.
   - The hand-over line on the driver sheet in `print.html`.
4. **Tests**: payroll for one driver vs two; groupage applied to every member; matched import; after the fact; correction and removal; busy; the audit checks B-05 / B-06 green on a trip with a change; the full `node --test` suite.

### Risks, ranked by what could write wrong data
1. **The trip's driver re-synced from the order.** `rtOnOrderSaved` and trigger 013 put the order's driver on the trip on every save (`feed:543-549`; `m097:22-24`). Any change that lives only on the trip is silently undone, or makes B-06 red.
2. **Payroll to the wrong driver.** One line per trip that follows the trip's driver (`m011:57`, `m011:202-215`): the second driver unpaid, or the first driver's line moved to the second driver with amounts flagged for review.
3. **Groupage half-written.** International writes go one order at a time (`AGS` 1.9): some members end with the new driver and some without.
4. **Merges by truck.** 037 / 097 merge an export and import trip on the same truck and keep the older trip's driver (`m097:24-34`).
5. **The matched import on the wrong trip** after a split (`AGS` C-25).
6. **DKV on the wrong trip** when the truck changes (international matching is per truck and date span).
7. **A second pair from a retried split** (`AGS` C-21).

### Smallest first version (no database or Worker change)
A menu line «Αλλαγή οδηγού στον δρόμο» that opens the existing split panel preset for this case: leg 2 = «Δικό μας», **same truck and trailer preselected**, driver = the new one, with the hand-over place and time required. It saves with the existing split write.
- What it gives: two legs, each with its driver; driver 2's own round trip and payroll line (`m021:11-13`); the revenue on leg 1's trip; each leg its own driver sheet; correction through «Αλλαγή σημείου παράδοσης-παραλαβής…» and «Ένωση ξανά».
- Before shipping it needs:
  - the time check between loading and delivery (`AGS` C-22), as a warning;
  - the retry guard (C-21);
  - a decision on the matched import (Q4, C-25);
  - a decision on payroll for the hand-over day (Q3).
- It does not cover: groupage (split not offered there), truck change on the same trip, chained changes, and the "one row, two tiles" look. Those need the full version.

---

## 6. What could not be determined from the code

- Whether any national trip in production has two segments with two drivers, and which payroll lines it got. This would confirm that the second driver has no line. A `SELECT` on `rt_vehicle_segments` joined with `dl_entries` is needed.
- Whether a split leg 2 with the **same truck** as leg 1 really gets a separate round trip, or is attached to leg 1's trip by `_rtFind` on shared stops. What 037 / 097 do with two trips of one truck that overlap on the hand-over day. How B-05 / B-06 read it. This needs a test on live data or a test database.
- How many international splits exist and whether any was used as a driver change.
- What `print.html` prints for each leg of a split: whether the hand-over is shown as a stop.
- The Figma frames named in the code (H1–H7, the «Μεταφόρτωση 2/11» page) were not opened.

---

## Check of the sketch (`docs/design/redesign-2026-11/index.html`, section s5, lines 662 and 692-699)

**Fine**
- Menu line «Αλλαγή οδηγού στον δρόμο» in the load's menu, beside «Σπάσιμο σε σκέλη» and «Σκέλος προώθησης» (`index.html:662`).
- «Πού», «Ημέρα» + «Ώρα», «Νέος οδηγός», «Λόγος», «Άκυρο» / «Αποθήκευση»: the national fields, in the national order.
- The title names the load by route (plain-message rule).
- The truck shown as a value next to the driver suits a driver-only change.

**Wrong**
- The example does not hold together. The menu is opened on «Βέροια → Rotterdam · ΚΗΙ 2208 · Παύλος Ράπτης», but the panel is for «Βέροια → München». The panel's truck ΚΗΙ 6012 belongs to the queue item «ΚΗΙ 6012 · Αντώνης Ντίνος … κενό γύρισμα από Ulm». The "new driver" Παύλος Ράπτης is the driver of the other row, so on national this would raise the amber busy warning, and none is drawn.
- «Τα παίρνει ο νέος οδηγός» is drawn as a list the user seems to choose. National decides it from the time: a point goes with the driver of its arrival (`wn5l:633-641`). The list must be read only, part of the preview, and include the return import if there is one.
- «Λόγος» is drawn as a text field with the placeholder «Γιατί αλλάζει». National uses a list of 8 reasons, optional, plus a separate «Σημείωση» (`hand:373-380`). The placeholder is explanatory text, which the owner's rule forbids.
- «Πού» is drawn as a catalogue dropdown (map-pin + chevron). National 072b is free text. That is a decision (Q5), not settled.

**Missing**
- The «ίδιος οδηγός» case and the other way round (truck changes, driver stays); the trailer; «Δικό μας / Συνεργάτης».
- The preview «Μετά την αλλαγή» with two lines and the payroll line; the busy line; refusal and done states.
- The row afterwards: two tiles, «⇄», the «↳ ⇄ <point> · <day hh:mm> · <reason>» sub-line.
- Correction and removal of a change (national «Διόρθωση» / «Αφαίρεση» in the trip card).
- Driver sheets per driver with the hand-over line («Φύλλα οδηγών (2)»).
- Groupage: one change for all members, and the per-point order in the preview.
- The matched import's return in the preview.
