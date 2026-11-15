# Weekly International — feature audit, cluster 1: assignment, matching, empty return, clashes, save failures

Read-only audit of the live board (v4 renderer over v1 state). Everything below comes from reading code at the worktree tip on 15/11/2026. Nothing was run, no database was read, no request was sent. "Not verified" marks what the code cannot prove by itself (database triggers, constraints, the deployed Worker).

Short file names: `wi` = `modules/weekly_intl.js`, `wi2` = `modules/weekly_intl_v2.js`, `wi4a` = `modules/wi4_actions.js`, `wi4l` = `core/wi4-logic.js`, `api` = `core/api.js`, `pa` = `core/pa-helpers.js`, `sync` = `core/order-sync.js`, `wk` = `worker/src/index.js`.

Common facts for all five features

- Every write goes to `PATCH /v0/<base>/tblgHlNmLBH3JTdIM/<record>` (facade table ORDERS → Postgres `orders`), through `atSafePatch` → `atPatch` (`api:813`, `api:1294`).
- Labels this cluster writes, and where they land (`wk:1317-1520`). All exist in the ORDERS map; none is silently dropped:

| Label sent | Column | Kind |
|---|---|---|
| `Truck` | `truck_id` | link → `trucks` (`wk:1503`) |
| `Trailer` | `trailer_id` | link → `trailers` (`wk:1504`) |
| `Driver` | `driver_id` | link → `drivers` (`wk:1505`) |
| `Partner` | `partner_id` | link → `partners` (`wk:1502`) |
| `Is Partner Trip` | `is_partner_trip` | field (`wk:1431`) |
| `Partner Truck Plates` | `partner_truck_plates` | field (`wk:1387`) |
| `Partner Rate` | `partner_rate` | field (`wk:1370`) |
| `Status` | `status` | field (`wk:1348`) |
| `Assigned At` | `assigned_at` | field (`wk:1410`) |
| `Matched Import ID` | `matched_import_id` | field (`wk:1386`) |
| `Group ID` (piece leaves its group on unmatch) | `group_id` | field (`wk:1487`) |

- Labels read but not in the map: `Matched Export ID` (`wi:3244`) — never arrives, see defect C2.1. `Order No`, `Week Number`, `Total Pallets` are computed, read-only (`wk:1334-1336`) — correct, they are only read.
- Partner assignment rows: facade table `tblUhgqnmiam5MGNK` → `partner_assignments`; labels `Partner` (link `partner_id`), `Order` (link `order_id`), `Assignment Date`, `Status`, `Partner Rate` — all mapped (`wk:2036-2068`, labels from `config.js:287-292`).
- Trip legs: `DELETE /costs/rt/<trip>/legs?order_id=<n>` and `GET /costs/rt?overlap=1&from=&to=` (`wi:5250`, `wi:5273`).
- Who may do it: the board lets only a role with planning = full act (owner, dispatcher); every entry point calls `_wiBlockReadOnly` and answers «Μόνο ανάγνωση για τον ρόλο σου» (`wi:589-593`). On the Worker, owner and dispatcher hold GET/POST/PATCH on `orders` and full rights on `partner_assignments` (`wk:516-517`, `wk:644`, `wk:690`); the leg DELETE is allowed to owner and dispatcher (`wk:4461`, `wk:4472`).

---

## 1. Assignment (own truck or partner), clearing, reassigning a load on the road

### A. Flow

**Entry points**

1. Click on the assignment box of a row («ΠΡΟΣ ΑΝΑΘΕΣΗ», or the plate / partner name) — `wi2:1156`, `wi2:1170`.
2. Key `A` on the focused row; menu item «Ανάθεση…»; queue card button «Ανάθεση» — `wi4a:1674-1685`, `wi4a:75-80`.
3. Conflict dialog button «Ξανάνοιξε την ανάθεση» — `wi2:2913-2921`.
4. Import-only rows open the same popover (`_wiOpenImpPopover` delegates) — `wi:7003`.

**What opens** — one popover, 600 px, title «Ανάθεση», subtitle = loading day + place → delivery day + place · pallets (`wi:3657-3699`).

| Field | Source list | Default | Notes |
|---|---|---|---|
| «Φορτηγό» | active trucks, by plate (`wi:598`) | the row's truck | type-ahead; Greek look-alike letters, spaces and dashes ignored (`wi:2877-2885`) |
| «Ρυμούλκα» | all trailers, by plate (`wi:599`) | the row's trailer | same plate matching |
| «Οδηγός» | active drivers, by full name (`wi:600`) | the row's driver | list footer: «Οδηγοί: ο κανόνας 561/2006 τηρείται — επιστροφή Χ → επόμενη αναχώρηση Χ+2 (⚡Χ+1 μόνο κατ΄ εξαίρεση)» |
| «Εταιρεία» (section ΣΥΝΕΡΓΑΤΗΣ) | all partners, by company name (`wi:601`) | the row's partner | plain text match |
| «Πινακίδες» | free text, placeholder «π.χ. ΙΑΒ 1099» | the row's partner plates | |
| «Κόμιστρο εξαγωγής €» | number, step 0.01 | the order's `Partner Rate` | |
| «Κόμιστρο εισαγωγής €» | number | the matched import's `Partner Rate` (`wi:881`) | disabled without a matched import; note «ενεργό μόνο με ταιριασμένη εισαγωγή» / «κόμιστρο του σκέλους εισαγωγής (συνεργάτης)» |

Under each truck and driver option, one availability line computed from the rows already on the board (`wi:3606-3627`):
- «✓ ελεύθερο — χωρίς ανάθεση αυτή την εβδομάδα»
- «✓ ελεύθερο — επιστρέφει <ημέρα>, διαθέσιμο για φόρτωση <ημέρα>» (+ « (Χ+2)» for drivers; trucks are free the day after return, drivers two days after)
- «δεσμ. N× αυτή την εβδομάδα · <ημέρα> → <τόπος> · …» (greyed option)

Under each truck and trailer option, a warning line when the vehicle has an open work order or a document expired or due within 14 days (`wi:3636-3638`, `vehicleWarnings`). Warning only.

Other parts of the popover:
- Hint when the row already has a driver: «Για τοπική παράδοση/φόρτωση: δεξί κλικ στη γραμμή → «…με τοπικό οδηγό». Η αλλαγή οδηγού εδώ μεταφέρει ΟΛΟ το δρομολόγιο και τη μισθοδοσία.» (`wi:3671`)
- Lane history: «Ιστορικό γραμμής GR → <χώρα> — N τελευταία κόμιστρα:» with up to 3 items «W<εβδομάδα> · <ποσό>€ · <συνεργάτης>» (`wi:3718-3755`). Lane = Greece + the foreign end's country, same direction. Source: one read per session of all orders with `Is Partner Trip` and a positive `Partner Rate`. Hidden when nothing is found.
- Inline warning strip (same-day clash, see feature 4).
- On export rows: «ΤΑΙΡΙΑΣΜΕΝΗ ΕΙΣΑΓΩΓΗ» zone — the matched import as a chip with «×», or the drop zone «σύρε εισαγωγή εδώ — ή άφησε κενό: θα μετρηθεί στα «κενά» του tally» (`wi:3685-3690`).
- Footer: «sync: ⟳ γράφεται → ✓ γράφτηκε / ⚠ ΔΕΝ γράφτηκε (μένει ορατό)», «Καθαρισμός» (only when assigned), «Αποθήκευση ανάθεσης» / «Ενημέρωση ανάθεσης».

**Validations, in order** (`wi:3792-3845`)

| Check | Text |
|---|---|
| Partner chosen and the load holds a stock piece | the piece-on-own-truck-only refusal (`WI_PIECE_OWN_ONLY`) |
| No partner and no truck | «Επίλεξε φορτηγό ή συνεργάτη» |
| Partner without export fee | «Το κόμιστρο εξαγωγής είναι υποχρεωτικό για συνεργάτη» |
| Partner, matched import, no import fee | «Το κόμιστρο εισαγωγής είναι υποχρεωτικό για συνεργάτη» |
| Own truck, same-day clash | confirm «Πιθανή διπλή δέσμευση» (feature 4) |
| Partner and the import group could not be read | «Η ομάδα εισαγωγών δεν διαβάστηκε — η ανάθεση σε συνεργάτη δεν έγινε» |
| Any touched order is already on the road or delivered | confirm «Αλλαγή ανάθεσης σε εκτελεσμένη» (below) |

**What «Αποθήκευση» sends** (`wi:3853-3895`)

- Own truck: `Truck:[id]`, `Trailer:[id]|[]`, `Driver:[id]|[]`, `Is Partner Trip:false`, `Status:'Assigned'`, `Partner:[]`, `Partner Truck Plates:''`, plus `Assigned At` only on a first assignment.
- Partner: `Partner:[id]`, `Is Partner Trip:true`, `Partner Truck Plates`, `Status:'Assigned'`, `Truck:[]`, `Trailer:[]`, `Driver:[]`, `Partner Rate` (export fee on the row's orders, import fee on the matched import), plus `Assigned At` on a first assignment.
- `Status` is removed from the request for an order that is already on the road or delivered (one live read per order, `wi:3206-3210`).
- Order of requests: one PATCH per order of the row (a groupage = several), then one PATCH for the matched import. Only the first PATCH carries the "what I saw" values for `Truck, Trailer, Driver, Partner, Partner Truck Plates, Is Partner Trip` (`wi:3876`), so only it can answer 409.
- Then, when the import belongs to an import groupage: every other member of the group is read from the server and patched with the same vehicle and status (no fee), and each is read back to confirm (`wi:3937-3976`).

**After success** (`wi:3977-4029`)

1. Popover closes.
2. Trip sync for each export of the row (`rtOnOrderSaved`), not awaited.
3. Partner: one partner-assignment row per order (create or update: partner, date = today, status Assigned, fee). Own truck: partner-assignment rows of these orders are deleted.
4. Row slot ✓ «Η ανάθεση γράφτηκε»; toast «Αποθηκεύτηκε ✓» or «Ενημερώθηκε ✓», plus, when the "changed by another" check did not run: « · χωρίς έλεγχο «το άλλαξε άλλος» σε αυτή την αποθήκευση» / « · ο έλεγχος «το άλλαξε άλλος» δεν έγινε σε αυτή την αποθήκευση» / « · χωρίς έλεγχο «το άλλαξε άλλος» (δεν είναι ενεργός ακόμη)» (`wi:2353-2359`).
5. Veroia chain sync for each export of the row (awaited).
6. Pending pallet movement with the partner is created or removed (`plOnIntlPartnerAssigned`, only for orders with pallet exchange + through Veroia + partner; `core/pallet-feed.js:335-360`).
7. The whole week is read again.

**Failures the user sees**

| Case | What shows |
|---|---|
| Any PATCH fails | line under the row «Δεν αποθηκεύτηκε — η ανάθεση απέτυχε σε X από Y · δεν ξέρουμε ακόμη τι γράφτηκε», then after the re-read one of: «…η ανάθεση έμεινε όπως ήταν», «Η ανάθεση γράφτηκε, αλλά η απάντηση χάθηκε — έλεγξε», «Δεν αποθηκεύτηκε πλήρως — η ανάθεση γράφτηκε σε X από Y · έλεγξε» (`wi2:1903-1933`); buttons «Ξαναδοκίμασε», «· κλείσιμο ×»; ⚠ in the row's number slot; counter in the top bar. Popover stays open with the button re-enabled. |
| 409 on the first PATCH | dialog «Άλλαξε στο μεταξύ» (feature 5) |
| No network | «Χωρίς σύνδεση — η ανάθεση μπήκε σε αναμονή, δεν είναι ακόμη στη βάση» (feature 5) |
| Import-group members not all reached | toast «Η ανάθεση γράφτηκε αλλά ΔΕΝ έφτασε σε όλα τα μέλη του groupage εισαγωγών — έλεγξε χειροκίνητα: …» |
| Veroia chain sync fails | toast «Η αποθήκευση έγινε, αλλά ο συγχρονισμός με National απέτυχε — άνοιξε ξανά και αποθήκευσε» |
| Trip sync fails | toast «P&L: απέτυχε … — ο μετρητής συμφωνίας στο TRIP PnL θα το δείξει», or a pinned banner for a split trip (`core/rt-feed.js:25-31`, `:149`) |
| Partner-assignment row fails | nothing specific: a generic «Save failed» toast from the API layer, console only (`wi:4043-4054`) |
| 403 | «Δεν έχετε δικαίωμα για αυτή την ενέργεια» (`api:476-487`) |

**Reassigning a load already on the road** (`wi:3820-3845`, `wi:3193-3203`)

- Never refused (owner 4/10: the assignment never locks).
- One confirm before any write, title «Αλλαγή ανάθεσης σε εκτελεσμένη», button «Αλλαγή ανάθεσης»: «Αλλαγή ανάθεσης σε παραγγελία που έχει ήδη εκτελεστεί. Το νέο όχημα γράφεται σε όλο το δρομολόγιο (RT) — όλα τα σκέλη του δρομολογίου ακολουθούν, και όσα δεν φαίνονται εδώ.» + one line per executed order «• <πελάτης, διαδρομή> (εξαγωγή|εισαγωγή) — σε μεταφορά|παραδόθηκε» + «Τι γίνεται: μεταφέρεται/σβήνει δρομολόγιο + μισθοδοσία, ακόμη και σε κλειστό δρομολόγιο.» + «Η κατάσταση (Status) αυτών των παραγγελιών δεν αλλάζει.»
- Downstream (per code comments, database side not verified): a trigger copies the order's vehicle onto its round trip and every other leg of it, closed trips included; the driver's payroll line follows the new driver, or is removed / flagged for review when the load goes to a partner.

**Clearing** — «Καθαρισμός» in the popover, «Καθαρισμός ανάθεσης» in the menu (`wi:4101-4194`)

1. Collects every order of the row, the matched import, every member of the export group and of the import group (read from the server). Read failure: «Δεν διαβάστηκαν τα μέλη της ομάδας — ο καθαρισμός ΔΕΝ έγινε».
2. Finds each order's round trip. Any uncertain lookup: «Ο καθαρισμός ΔΕΝ έγινε — <λόγος>».
3. A closed trip that also carries other orders refuses the whole clear: «Ο καθαρισμός ΔΕΝ έγινε — το δρομολόγιο … είναι κλειστό και έχει κι άλλες παραγγελίες· αφαίρεση από κλειστό δρομολόγιο δεν επιτρέπεται — ζήτα από τον owner».
4. One confirm: «Καθαρισμός ανάθεσης;» / «Καθαρισμός ανάθεσης; Αδειάζουν N παραγγελίες (όλα τα μέλη της ομάδας).» / for executed loads the long text with the list (title «Καθαρισμός σε εκτελεσμένη»).
5. Legs leave first from trips shared with other orders; a failure stops everything: «Ο καθαρισμός σταμάτησε (το δρομολόγιο … έχει κι άλλα σκέλη) — …».
6. PATCH per order: `Truck:[]`, `Trailer:[]`, `Driver:[]`, `Partner:[]`, `Is Partner Trip:false`, `Partner Truck Plates:''`, and `Status:'Pending'` only when the live status was `Assigned`.
7. Partner-assignment rows are deleted, except those of executed orders (a run partner trip stays payable).
8. Toast «Η ανάθεση καθαρίστηκε ✓» / «Η ανάθεση καθαρίστηκε σε N παραγγελίες ✓». Failure: «Ο καθαρισμός απέτυχε: …».
9. The group and the match are kept: only the vehicle goes.

### B. Business rules and edge cases

- A row counts as assigned when it has a truck or a partner (`wi:883`). Trailer and driver are optional for an own truck.
- A partner wins over a truck: the save takes the partner branch whenever the row has a partner (`wi:3792`).
- A stock piece never rides a partner, checked on the row, the matched import and the server's import group (`wi:3796`, `wi:3810-3819`).
- `Assigned At` is stamped once, on the first assignment (`wi:3851`).
- Status is never pulled back from "on the road" / "delivered" (`wi:3206-3210`).
- The matched import always follows the export's vehicle; the import fee is a separate number on the import order.
- Partial write: no rollback. Orders that took the new vehicle keep it; group propagation, trip sync, partner rows and the Veroia sync are skipped for that save (`wi:3900-3914`).
- The fee field of a groupage row is one number written on every member (`wi:3859-3875`, `wi:4036-4041`).
- Availability lines know nothing about local relay drivers (`wi:3650-3656`).
- Lane history is country-level on purpose (`wi:3715-3717`).
- Dead branch: the 409 branch after the import's PATCH can never run, because that PATCH carries no "what I saw" values (`wi:3887-3888`).

### C. Defects and doubts (from reading code, not run)

**C1.1 — A load on a partner cannot be moved to an own truck from the popover; the save says «Ενημερώθηκε ✓» and keeps the partner. Confidence: high.**
Evidence: `wi:3774-3784` copies a picker's value into the row only when it is non-empty, `wi:3792` decides "partner" from the row, and no control empties the partner (`wi:3628-3647`, `wi:2874-2899`).
Scenario: export on partner X with fee 2,400. Open «Ανάθεση», pick truck ΚΗΙ 1234 and a driver, press «Ενημέρωση ανάθεσης». Result: the request is the partner request again (truck, trailer, driver sent empty), toast «Ενημερώθηκε ✓», the board re-reads and still shows partner X. The only working path is «Καθαρισμός» first, then assign.
Same root: a trailer or a driver cannot be removed from an own-truck assignment by emptying the box — the old value is sent again.

**C1.2 — A pick in the popover changes the row at once; closing without saving does not undo it. A later match copies the unsaved pick onto the import. Confidence: high for the mechanism, medium for the trip consequences.**
Evidence: each pick writes into the row state (`wi:2887-2899`, `wi:2911-2914`); close only hides the popover (`wi:3763-3767`); the match inherits from the row state (`wi:6169-6178`, `wi:3434-3451`); rows are rebuilt only on a full re-read (`wi:847`).
Scenario: export saved on truck A. Open the popover, pick truck B, close with ✕. Drag an import onto the row. Result: the import is written with truck B (and the read-back check passes, since it compares with the row), while the export still holds truck A in the table. Until the next full re-read the assignment box, the same-day check and the availability lines also show B. A variant: pick a partner, hit the missing-fee toast, close — the row then draws as a partner row and loses its empty-return mark until re-read.

**C1.3 — One fee field, written in full on every order of a groupage; off-board members of an import group get no fee. Confidence: medium (whether the P&L sums it per order is not verified).**
Evidence: `wi:3859-3875` (same `Partner Rate` on each order), `wi:4036-4041` (one partner-assignment row per order, same fee), `wi:3954-3958` (group members reached from the server get no fee and no partner-assignment row).
Scenario: a 3-order export groupage given to a partner for 2,400 → three orders each with 2,400 and three partner rows of 2,400. If costs are summed per order, the trip shows 7,200.

**C1.4 — On an import-only row the partner's fee is entered under the label «Κόμιστρο εξαγωγής €», and the missing-fee message says «εξαγωγής». Confidence: high.**
Evidence: `wi:3676` (fixed label), `wi:3679` (import fee enabled only with `row.importId`, which an import row never has), `wi:3798`.

**C1.5 — A failed partner-assignment write is not said in work words. Confidence: medium.**
Evidence: `wi:4043-4054`, `wi:3993-3996` swallow the error to the console; the only trace is the API layer's generic «Save failed». The order shows the partner and «Αποθηκεύτηκε ✓» while the partner row (the payable) may be missing or carry the old fee.
Scenario: the partner row create returns 500 → toast «Save failed» next to «Αποθηκεύτηκε ✓»; nothing names what did not follow.

**C1.6 — Doubt: the Veroia chain sync after an assignment runs for the row's exports only, not for a matched import that goes through Veroia. Confidence: low (after the national cut-over the national side may not need the international vehicle).**
Evidence: `wi:4014-4018`.

### D. The redesign must draw

| Item | Mock-up | Where it should live |
|---|---|---|
| Truck / trailer / driver pickers | PRESENT | assignment panel |
| Partner company, plates, export fee, import fee | PRESENT | assignment panel |
| Import fee disabled without a matched import, with the reason | PARTLY (a dash, no reason) | assignment panel, note sign on the field |
| Explicit way to switch between own truck and partner that empties the other side | PARTLY (two tabs drawn; the behaviour must be stated, fixes C1.1) | assignment panel |
| A way to remove only the trailer or only the driver | MISSING | clear button inside each picker |
| Availability line per truck / driver (free, returns when, busy N×) | MISSING | picker options |
| Driver rule note (return X → next departure X+2) | MISSING | note sign on the driver picker |
| Vehicle warnings (open work order, document expired or due) | MISSING | picker options |
| Lane history (last 3 fees on the same lane, with week and partner) | MISSING | under the fee field |
| Hint that changing the driver moves the whole trip and payroll | MISSING | note sign next to the driver |
| Matched import chip with «×», or drop zone, inside the panel | MISSING | assignment panel, export rows |
| Fee label that follows the row (import row = import fee) | MISSING | assignment panel |
| «Καθαρισμός» | PRESENT | panel footer and menu |
| Clear confirm (single / N orders / executed loads list) | MISSING | confirm dialog |
| Clear refusal on a closed trip with other orders | MISSING | message |
| Confirm «Αλλαγή ανάθεσης σε εκτελεσμένη» with the list of loads and what follows | MISSING | confirm dialog |
| Required-field messages (truck or partner; export fee; import fee) | PARTLY («!» on the export fee only) | on the fields |
| Stock piece cannot go to a partner | MISSING | message on save |
| Saving state on the row (writing / written / not written) | MISSING | row number slot |
| Save note "check for another user's change did not run" | MISSING | with the success message |
| Assignment box states: to assign / own (plate · trailer, driver) / partner (name, plates) / «—» for a vehicle outside the active list | PARTLY (first three drawn; «—» missing) | row |
| Copy plates | PRESENT (menu) | row hover and menu |

---

## 2. Matching an import to an export

### A. Flow

**Entry points**

1. Drag an import-only row (handle «⋮⋮») onto an export row's import cell — `wi:2952`, `wi2:1314`.
2. Drop on the «ΤΑΙΡΙΑΣΜΕΝΗ ΕΙΣΑΓΩΓΗ» zone of the assignment popover — `wi:3094`.
3. «Νέα εισαγωγή» on the gap cell or on the «Χωρίς εισαγωγή» slot, key `N`, queue card button — opens the order form as Import; the match is written only after the form really creates the order, within 30 minutes, same page, export still unmatched (`wi:3044-3065`).
4. Whole-group grip on an already matched import group, dragged to another export (`wi:2944-2965`).
5. Stock join paths (other cluster) end in the same function.

**Drag rules**

- A lot held for the warehouse cannot be dragged: «Η παρτίδα πάει στην αποθήκη — δεν ταιριάζεται».
- An already matched import (not through the grip): «Αφαίρεσε πρώτα το ταίριασμα της εισαγωγής».
- Drop on an empty import cell = match. Drop on a cell that already holds a load, or on a free import group = join that load (groupage, other cluster) (`wi:3108-3120`).
- A match is allowed before the export has a vehicle (owner 8/11); the cell then reads «Χωρίς εισαγωγή» with «Νέα εισαγωγή» (`wi2:1393-1397`).

**Checks before writing** (`wi:3230-3358`)

| Check | Text |
|---|---|
| Lot on either side | «Η παρτίδα πάει στην αποθήκη — δεν ταιριάζεται» |
| Import already matched (as the server shows it) | «Η εισαγωγή είναι ήδη ταιριασμένη — πρώτα «Αφαίρεση ταιριάσματος»» or «Η εισαγωγή ταιριάστηκε στο μεταξύ από άλλον χρήστη — ανανέωση…» |
| Piece onto a partner export | piece-on-own-truck-only refusal |
| Export already matched to another import | «Η εξαγωγή έχει ήδη φορτίο … — σύρε την εισαγωγή πάνω στο φορτίο για ένταξη» or «Η εξαγωγή ταιριάστηκε στο μεταξύ με άλλη εισαγωγή (άλλος χρήστης) — ανανέωση…» |
| Grip path, export could not be read | «Δεν διαβάστηκε η εξαγωγή — δοκίμασε ξανά» |
| Grip path, old match did not come off fully | «Το νέο ταίριασμα ΔΕΝ έγινε — το παλιό δεν αφαιρέθηκε πλήρως» |

**What a match writes**

1. `Matched Import ID` = the import (the lead of its group) on every export order of the row. The first PATCH carries the "what I saw" value, so it can answer 409 (`wi:3386-3413`).
2. Background step after each export: ramp board sync only (the other downstream steps are switched off for a match, `wi:3400-3402`, `sync:91-101`).
3. When the export already has a vehicle: every member of the import (group) gets the export's assignment — truck, trailer, driver, `Is Partner Trip:false`, `Status:'Assigned'`, partner emptied; or partner, plates, `Is Partner Trip:true`, `Status:'Assigned'` — each read back. Status is not touched on a member already on the road (`wi:3434-3451`). The partner's import fee is not set here.
4. Trip sync for the exports, only when the export has a vehicle (`wi:3471-3475`).
5. The screen is painted before the write; the row slot shows ⟳ then ✓ «Αποθηκεύτηκε» or ⚠.

**What it changes on the import**: nothing of its own when the export has no vehicle (the link lives only on the export). With a vehicle: its truck / trailer / driver or partner / plates, and its status to Assigned.

**Failures**

| Case | What shows |
|---|---|
| Export PATCH fails | row line «Δεν αποθηκεύτηκε — η εισαγωγή … μένει χωρίς φορτηγό / έμεινε χωρίς ταίριασμα»; the import cell shows what the table holds («δεν αποθηκεύτηκε — η εισαγωγή … είναι ακόμη ελεύθερη · μένει η …» or «… μένει ταιριασμένη εδώ»); a thin line on the import's own day «<εισαγωγή> — … · η ένωση με <εξαγωγή> δεν αποθηκεύτηκε» (`wi2:1343-1367`) |
| 409 | dialog with one button «Κράτα την τρέχουσα» |
| No network | «Χωρίς σύνδεση — το ταίριασμα μπήκε σε αναμονή, δεν είναι ακόμη στη βάση» |
| Vehicle did not reach every member | «Το ταίριασμα γράφτηκε αλλά η ανάθεση ΔΕΝ έφτασε σε όλα τα μέλη του groupage εισαγωγών — έλεγξε χειροκίνητα: …» |

**«Αφαίρεση ταιριάσματος»** — «×» on the chip in the popover, menu item (`wi:3000-3039`, `wi:3502-3588`)

1. With a stock piece in the load: confirm «Αφαίρεση ταιριάσματος — η εισαγωγή φεύγει από το φορτηγό. Το κομμάτι της παρτίδας … βγαίνει και από την ομάδα και επιστρέφει στο απόθεμα — χωρίς φορτηγό, με όλα τα στοιχεία.» Otherwise no confirm.
2. `Matched Import ID:''` on every export of the row.
3. When the export had passed its vehicle on: for each import member not on the road — its leg leaves the round trip first, then `Truck:[]`, `Trailer:[]`, `Driver:[]`, `Partner:[]`, `Is Partner Trip:false`, `Partner Truck Plates:''`, `Status:'Pending'`. Members on the road keep vehicle and status: toast «N παραγγελία είναι ήδη σε μεταφορά/παραδόθηκε — κρατά όχημα και κατάσταση».
4. When the export had no vehicle and nothing was passed on, the import keeps its own vehicle and trip (`wi:3486-3498`, `wi:3541`).
5. Toast «Το ταίριασμα αφαιρέθηκε ✓». Failures: «Σφάλμα: …», slot ⚠ «Η αφαίρεση ΔΕΝ γράφτηκε στη βάση — κάνε Ανανέωση», «Το ταίριασμα αφαιρέθηκε αλλά η ανάθεση ΔΕΝ καθαρίστηκε σε όλα τα μέλη του groupage εισαγωγών — έλεγξε χειροκίνητα: …», «Το ταίριασμα αφαιρέθηκε αλλά κομμάτι ΔΕΝ επέστρεψε στο απόθεμα — έλεγξε χειροκίνητα: …».

**Import cell states** (`wi2:1297-1310`): matched import leg · «δεν αποθηκεύτηκε …» · «εισαγωγή εκτός προβολής · άνοιγμα» (matched import outside the ±8-day read, or cancelled) · «Κενό γύρισμα …» (own truck) · «Μόνο εξαγωγή · συνεργάτης» · «Χωρίς εισαγωγή» (no vehicle yet) · blank (split order, lot, pre-order).

### B. Business rules and edge cases

- The link is one text field on the export; the import carries no link back (`wk:1386`; no `Matched Export ID` in the map).
- An import group matches and unmatches as a whole; the group's lead is chosen by stop order, then loading time, then id (`wi:3154`, `wi4l:117`).
- Re-dropping a member of the same import group on its export is a no-op confirmation, not a refusal (`wi:3294-3305`).
- A link to a deleted import does not block a new match (`wi:3285-3304`).
- Lock checks are best effort: a failed read lets the match go on (`wi:3254-3260`, `wi:3320-3324`), except on the grip path.
- Unmatch never asks, except for stock pieces; it cannot be undone as one step.
- A match onto a partner export gives the import the partner but no fee and no partner-assignment row until the assignment is next saved.
- Unmatch writes an empty text, not an empty value, into `Matched Import ID` (`wi:3523`); elsewhere the code insists on empty value for `Group ID` (`wi:3022`). Migration 106 treats both as empty.

### C. Defects and doubts (from reading code, not run)

**C2.1 — The "is this import already matched?" check reads a field that does not exist, so it never fires for a match made by someone else. Two exports can end up pointing at the same import. Confidence: medium-high (no unique rule on the column was found in the migrations; the live database was not checked).**
Evidence: `wi:3244` reads `Matched Export ID` (not in the ORDERS map, `wk:1346-1492`) or the import's own `Matched Import ID` (always empty on an import). The "what I saw" check covers only the target export's own field (`wi:3389`).
Scenario: dispatcher A matches import X to export E1. Dispatcher B's board was loaded earlier and still shows X free. B drags X onto export E2. No check stops it: E2 gets `Matched Import ID = X`, and if E2 has a truck, X takes E2's truck while E1 still points at X and its trip still holds X's leg.

**C2.2 — A match onto a partner export leaves the import without a fee and without a partner row, and nothing on the board says so. Confidence: medium.**
Evidence: `wi:6169-6173` (no fee in what is inherited), `wi:3423-3425`, no partner-row call in `_wiSaveImportMatch`. The fee is demanded only if someone opens and saves the assignment again (`wi:3799`).
Scenario: export on partner X with fee; drag an import on it. The import is now a partner trip with an empty fee and no payable row; the row shows no mark.

**C2.3 — See C1.2: a match inherits unsaved picks from the row state.**

**C2.4 — Doubt: after a match that fails on the second export of a groupage, the first export keeps the new link and no retry is offered for the rest. Confidence: low.**
Evidence: `wi:3386-3413` (loop continues, one flag for all), `wi:3420-3421`.

### D. The redesign must draw

| Item | Mock-up | Where it should live |
|---|---|---|
| Import-only row that can be dragged | PARTLY (title text only, no handle) | row |
| Drop highlight on the import cell | MISSING | row, import side |
| «Κενό γύρισμα» cell with «Νέα εισαγωγή» | PRESENT (amber) | row, import side |
| «Χωρίς εισαγωγή» slot on an export with no vehicle (match before assignment) | MISSING (row 7 is blank) | row, import side |
| «Μόνο εξαγωγή · συνεργάτης» | MISSING (row 1 is blank) | row, import side |
| «εισαγωγή εκτός προβολής · άνοιγμα» | MISSING | row, import side |
| Matched import with its own day, place, pallets | PRESENT | row, import side |
| «Αφαίρεση ταιριάσματος» | PRESENT (menu) | menu and assignment panel chip |
| Unmatch confirm for a load with a stock piece | MISSING | confirm dialog |
| Note that a load on the road keeps vehicle and status on unmatch | MISSING | message |
| Whole-group move to another export | MISSING | grip on the matched import group |
| Drop on a cell that already has a load = join | MISSING | row, import side |
| Refusals (lot, already matched, piece on partner, matched meanwhile by another) | MISSING | messages |
| Failed match: cell shows what is written + line on the import's day | MISSING | row and day |
| Partner export with matched import lacking a fee | MISSING (new, from C2.2) | note sign on the row |
| «Νέα εισαγωγή» in the queue («Κοστίζουν») | PRESENT | queue panel |

---

## 3. The empty-return rule

### A. Flow

Nothing is written. One rule decides the cell, the row's side colour, the day header count and the queue card (`wi4l:597-609`, facts from `wi2:357-398`).

- Who gets it: an export row that is assigned to an own truck (truck present, no partner) and has no matched import.
- Return day R = the delivery day of the last order of the row.
- Nothing while R is more than 2 days ahead. Amber from R−2 to R. Red from the day after R. No delivery day = amber.
- Cell text: «Κενό γύρισμα · από <ημέρα|σήμερα> · <τόπος, χώρα>» with «Νέα εισαγωγή» and, when stock exists, a stock link; tooltip «Κενό γύρισμα — ιδιόκτητος γύρος χωρίς φορτίο επιστροφής. Σύρε εισαγωγή εδώ ή δημιούργησε νέα.» (`wi2:1370-1384`).
- Day header: «N κενό γύρισμα …» (`wi4l:698-702`). Queue: group "cost", button «Νέα εισαγωγή» (`wi4l:555`, `wi4l:711`).
- A row with a red or amber mark is never faded as "done" (`wi2:1278-1280`).

### B. Business rules and edge cases

- A partner never gets it; the cell says «Μόνο εξαγωγή · συνεργάτης» as a fact.
- An unassigned export gets «χωρίς φορτηγό» instead, never both.
- A split order, a forwarding leg and a local relay never get it (`wi2:381`).
- While a match save has failed, the rule follows what the table holds, not the screen (`wi2:379`).
- A matched import that was not read with this week counts as "has a return" and gets its own amber mark «εισαγωγή εκτός προβολής» (`wi2:405`).
- Between R+… and R−3 the cell is still drawn «Κενό γύρισμα» in grey text, without a mark (`wi2:1373`).

### C. Defects and doubts (from reading code, not run)

**C3.1 — Doubt: there is no way to say "this truck really came back empty". Confidence: medium (business gap, not a code fault).**
Evidence: `wi4l:597-609` has no exit other than a match or a partner. Every own-truck export of a past week without an import stays red in that week, is never faded, and keeps its queue card.
Scenario: open last week: a truck that returned empty on purpose still shows red «Κενό γύρισμα» and counts in «Κοστίζουν».

**C3.2 — See C1.2: an unsaved partner pick hides the mark until the next re-read.**

### D. The redesign must draw

| Item | Mock-up | Where it should live |
|---|---|---|
| Amber empty return with place and day | PRESENT | row, import side |
| Red empty return (after the return day) | MISSING | row, import side |
| Grey, unmarked state (return more than 2 days ahead) | MISSING | row, import side |
| «Νέα εισαγωγή» on the cell | PRESENT | row |
| Stock link on the cell when stock exists | MISSING | row |
| Count in the day header | MISSING | day header |
| Queue card under «Κοστίζουν» | PRESENT | queue panel |
| The rule in words for the user | MISSING | note sign on the cell |
| "Returned empty, accepted" (if the owner wants it, C3.1) | MISSING | menu item on the cell |

---

## 4. Same-day clash / busy truck or driver

### A. Flow

Three places, one rule (`wi:2409-2422`):

1. **On the row**: amber word «ίδια μέρα» at the start of the second line of the assignment box; its tooltip is the sentence (`wi2:1157-1158`). Raises a queue item with button «Άνοιγμα» (`wi4l:617`, `wi4l:556`).
2. **In the popover**, the moment a truck or driver is picked: strip «⚠ <πρόταση> — η αποθήκευση θα ζητήσει επιβεβαίωση.» (`wi:2902-2908`).
3. **On save** (own truck only): confirm titled «Πιθανή διπλή δέσμευση», text «Το φορτηγό <πινακίδα> έχει ήδη φόρτωση την ίδια μέρα (<ΜΜ-ΗΗ>).» or «Ο οδηγός <όνομα> έχει ήδη φόρτωση την ίδια μέρα (<ΜΜ-ΗΗ>).» + «Συνέχεια με την ανάθεση;», button «Συνέχεια» (`wi:3802-3805`). Never a hard stop.

Separate, softer signal: the availability lines in the pickers (feature 1) — busy N× this week, or free from a given day.

### B. Business rules and edge cases

- The compared day is the loading day of the first order of each row on the board.
- Only rows of the loaded week (plus the neighbouring imports shown) are compared; another week's load is not seen.
- Trailers are not compared. Partners are never compared.
- The first clash found is reported; truck before driver.
- The date in the sentence is month-day digits («11-17»), not the board's day form.
- Using the same truck on different days is normal and raises nothing.

### C. Defects and doubts (from reading code, not run)

**C4.1 — For an export through Veroia the check uses the supplier's loading day, while the international truck loads at Veroia on the cross-dock day. Confidence: medium.**
Evidence: `wi:2411`, `wi:2415` (always `Loading DateTime`); the board's own "how near" rule uses the Veroia day for the same row (`wi2:369`).
Scenario: truck T carries export A through Veroia (supplier Monday, Veroia Tuesday). T is then given export B loading Monday → warned of a clash that does not exist. Given export C loading Tuesday → no warning, although T is at Veroia loading A that day.

**C4.2 — The matched import's loading day is not compared. Confidence: medium-low (may be intended).**
Evidence: `wi:2415` takes the row's first order, which on an export row is the export.
Scenario: truck T has export + matched import loading Thursday in Wien. T is given another load loading Thursday → no warning.

**C4.3 — See C1.2: unsaved picks on another row count as bookings until the next re-read, so a warning can name a truck that was never saved there.**

### D. The redesign must draw

| Item | Mock-up | Where it should live |
|---|---|---|
| «ίδια μέρα» mark on the row with the sentence | MISSING | assignment cell, note sign |
| Warning inside the assignment panel when the pick clashes | MISSING | assignment panel |
| Confirm «Πιθανή διπλή δέσμευση» on save | MISSING | confirm dialog |
| Busy / free line per truck and driver in the picker | MISSING | picker options |
| Queue item for a same-day clash («Για μια ματιά») | MISSING | queue panel |

Note: the national board mock-up draws «Ο Κ. Τσορλίνης έχει άλλο φορτίο την Τρίτη.» in its day panel; the international board has no counterpart drawn.

---

## 5. Save failures, the 409 dialog, offline queue, stale-data token, downstream sync

### A. Flow

**Row sync slot** (`wi:2383-2408`): ⟳ while writing, ✓ for 4 seconds, ⚠ kept until the table is read again. Keyed by order, so a re-read in between cannot move it to another row.

**Failure line under the row** (`wi2:1935-1948`): text as in features 1 and 2, plus tails «· δεν ξέρουμε ακόμη τι γράφτηκε», «η σειρά θα ξαναδιαβαστεί μόλις κλείσει ό,τι είναι ανοιχτό» (tooltip), «· δεν ξέρουμε τι γράφτηκε» with an extra «Ανανέωση» button when the re-read itself failed. «Ξαναδοκίμασε» reopens the row's menu, never replays the write (`wi2:2841-2848`). «· κλείσιμο ×» hides the line; the ⚠, the counter and the queue item stay until the table has been read (`wi2:2849-2860`).

**Top bar counter**: «N αλλαγή δεν αποθηκεύτηκε» / «N αλλαγές δεν αποθηκεύτηκαν» (`wi2:1677-1680`).

**Automatic re-read after a failure**: every 1.5 s the board checks whether anything is open (popover, panel, menu, date panel, order form, a pending new-import) and re-reads the week when nothing is; after a minute of waiting the line stops promising and says it does not know (`wi2:2782-2833`).

**Queue**: a failed save is a red item, group "stops work", button «Ξαναδοκίμασε» (`wi4l:556`, `wi4l:710`).

**API layer messages** (`api:453-600`, `api:813-870`): 403 «Δεν έχετε δικαίωμα για αυτή την ενέργεια»; 429 «Πολλά αιτήματα — αυτόματη επανάληψη...»; 5xx «Σφάλμα server — δοκιμάστε ξανά» (up to 3 tries); network «Σφάλμα σύνδεσης — δοκιμάστε ξανά»; write refused «Save failed». The board's own writes hold these back (quiet) and speak on the row instead; reads and the partner-row writes do not.

**409 «Ποια κρατάμε;»** (`wk:3826-4154`, `api:855-862`, `wi2:2884-2924`, `wi4a:913-979`)

- Sent only with the first PATCH of an assignment (truck, trailer, driver, partner, partner plates, partner flag), of a match (matched import) and of a date change (other cluster). The Worker compares what the user saw with what the table holds and answers 409 without writing.
- Sequence: slot leaves ⟳ → popover closes → week is read again → dialog titled «Άλλαξε στο μεταξύ».
- Lead line, one of: «<χρήστης> την άλλαξε πριν N΄», «Άλλος χρήστης την άλλαξε …», «Άλλαξε από αυτόματη ενημέρωση», «Την άλλαξες εσύ (άλλη καρτέλα ή πριν την ανανέωση)», «Άλλαξε από τότε που την άνοιξες»; followed by «<πριν> → <τώρα>» per field (plates and names, never ids; unknown = «άλλη τιμή»). A name is shown only to roles that may read the audit trail.
- Second line: «Η δική σου επιλογή: …. Ποια κρατάμε;»
- Buttons — assignment: «Κράτα του <χρήστη>» / «Κράτα την τρέχουσα» / «Κράτα την αυτόματη» and «Ξανάνοιξε την ανάθεση» (reopens the popover on fresh data). Match: only «Κράτα την τρέχουσα». Esc, × and a click outside = keep.
- When the re-read behind the dialog failed: «Δεν ξαναδιαβάστηκε — ό,τι βλέπεις μπορεί να μην είναι η τρέχουσα τιμή.» and one button «Ανανέωση».
- When the check could not run, the success toast says so (feature 1, step 4).

**Offline** (`api:85-240`, `api:839-845`)

- With the browser offline, a PATCH is stored in a local queue (max 50, kept in the browser's storage) and answers as "queued". Toast «Αποθηκεύτηκε τοπικά — θα σταλεί μόλις γυρίσει το internet»; queue full: «Offline queue full (50) — αλλαγή δεν αποθηκεύτηκε».
- The board then says «Χωρίς σύνδεση — η ανάθεση μπήκε σε αναμονή, δεν είναι ακόμη στη βάση» / «…το ταίριασμα μπήκε σε αναμονή…», shows no ✓, and runs none of the follow-up steps (`wi:3915-3924`, `wi:3414-3419`).
- When the network returns the queue is replayed: toast «N αλλαγές συγχρονίστηκαν»; a refused item leaves the queue with a named message; a server error is retried up to 3 flushes.
- App-wide offline banner (`app.html:347`).

**Stale-data token** (`wi2:1689-1718`)

- «↻ Ενημερώθηκε μόλις τώρα / πριν N΄ / πριν Nω», tooltip with the load time; refreshed every 30 s (`wi2:2305-2313`).
- «↻ N αλλαγές από <χρήστη> · Ανανέωση» (a button) and «↻ ζωντανά» exist in code but depend on the presence feature, which is switched off (`config.js:417`, `wi2:1950-1962`).
- «Προβολή ▾ › Ανανέωση» re-reads the week.

**Downstream after a save, and what is said when a part fails**

| Step | When | If it fails |
|---|---|---|
| Vehicle onto the matched import and the import group | assignment, match | named toast, list of loads to check |
| Round trip (create / attach legs / move vehicle) | assignment (exports), match with a vehicle | «P&L: απέτυχε … — ο μετρητής συμφωνίας στο TRIP PnL θα το δείξει», or a pinned banner; not awaited |
| Leg leaves the trip | clear, unmatch | action stops before any vehicle is cleared, with the reason |
| Partner-assignment rows | assignment, clear | console only + generic «Save failed» (C1.5) |
| Partner pallet movement (pending) | assignment, clear | its own toast (pallet feed), not awaited |
| Veroia chain → national side | assignment (exports) | «Η αποθήκευση έγινε, αλλά ο συγχρονισμός με National απέτυχε — άνοιξε ξανά και αποθήκευσε» |
| Ramp board | match, unmatch | logged only, not awaited (`sync:91-101`) |
| Week re-read | after assignment, clear, unmatch | error card of the board |

### B. Business rules and edge cases

- A conflict is an answer, not a failure: nothing was written.
- The check covers the first order only; group members, the matched import and import-group members are written without it.
- A queued change never carries the "what I saw" values, on purpose (`api:840-843`).
- A write that never answered is dropped from the row after a time limit and logged, never left on ⟳ (`wi2:2814-2818`).
- The old board (v1, still reachable from «Προβολή») treats a queued change as saved and shows ✓ (`wi:3880`, `wi:3892`: the offline branch is v4 only).

### C. Defects and doubts (from reading code, not run)

**C5.1 — A change queued offline is replayed without any of the follow-up steps, and can pull the status of a load on the road back to «Assigned». Confidence: medium-high.**
Evidence: the replay is a bare PATCH (`api:179-183`); nothing after it runs the group propagation, partner rows, Veroia sync or pallet step, and the board is not re-read. While offline, the status read used to protect loads on the road fails and is treated as "planning" (`wi:3160-3166`, `wi:3177-3184`, `wi:3206-3210`), so `Status:'Assigned'` stays in the queued request, and the "executed load" confirm is skipped.
Scenario: network drops; the dispatcher changes the truck on a load that is already on the road and presses save (after several seconds of failed reads). On reconnect the order gets the new truck and status Assigned; the other members of its import group keep the old truck; no partner row is made for a partner.

**C5.2 — The replay's own "was it changed meanwhile?" check can never fire. Confidence: high.**
Evidence: it compares a `Last Modified` field (`api:160-170`) that the Worker does not serve (stated in `api:1281-1287`; not in the ORDERS map). The replay therefore always overwrites whatever others saved while the user was offline.
Scenario: A queues a truck change offline at 06:00; B assigns the same load to another truck at 06:10; A reconnects at 06:20 → A's truck silently replaces B's.

**C5.3 — When the offline queue is full the change is dropped, but the board still says «μπήκε σε αναμονή». Confidence: medium (needs 50 queued changes).**
Evidence: `api:89-94` returns without queuing; `api:843-844` answers "queued" anyway; `wi:3921`.

**C5.4 — The board never tells the user that someone else changed the week. Confidence: high (by configuration).**
Evidence: the «N αλλαγές από … · Ανανέωση» token needs the presence feature, which is off (`config.js:417`); there is no periodic re-read (`wi2:2305-2313` refreshes only the "πριν N΄" words). A dispatcher's board can be hours old; the only protections are the 409 on the first order's assignment fields and the server reads inside match / clear. This is what makes C2.1 reachable.

**C5.5 — See C1.5: a failed partner-row write has no message of its own.**

**C5.6 — Doubt: trip sync and the ramp sync are fired without waiting; the week re-read that follows can paint before they finish. Confidence: low.**
Evidence: `wi:3986-3990`, `wi:3400-3402`.

### D. The redesign must draw

| Item | Mock-up | Where it should live |
|---|---|---|
| Row state: writing / written / not written | MISSING | row number slot |
| Failure line under the row with «Ξαναδοκίμασε» and close | MISSING | under the row |
| Wording steps of the failure line (not yet known / stayed as it was / written X of Y / answer lost) | MISSING | under the row |
| Top bar counter of unsaved changes | MISSING | top bar, next to the refresh time |
| Failed save as a queue item («Σταματούν τη δουλειά») | MISSING | queue panel |
| 409 dialog: who, from → to, own choice, two buttons | MISSING | small dialog |
| 409 for a match (one button) | MISSING | small dialog |
| 409 when the re-read failed («Ανανέωση») | MISSING | small dialog |
| Offline: row message "queued, not in the base yet" | MISSING | under the row |
| Offline: app-wide banner and "N changes synced" on return | MISSING | top of the app |
| Refresh time token | PRESENT («07:42» with refresh icon) | top bar |
| "N changes by <user> · Refresh" token | MISSING | top bar |
| Message when the national side did not follow | MISSING | message, names what to do |
| Message when the trip did not follow | MISSING | message / pinned banner |
| Message when the vehicle did not reach all members of an import group | MISSING | message with the loads |
| Message when the partner payable row did not follow (new, from C1.5) | MISSING | message |
| "No right for this action" | MISSING | message |
| Read-only role message | MISSING | message |
