# Weekly International — every list the user chooses from

Read-only audit, 15/11/2026, worktree `design-petras-tms-redesign-05f337`. Findings come from reading code; nothing was run, no database was read. `wi` = `modules/weekly_intl.js`, `wi2` = `modules/weekly_intl_v2.js`, `wi4a` = `modules/wi4_actions.js`, `wi4l` = `core/wi4-logic.js`.

Facts that shape every list:

- The board holds the week's exports (by earliest delivery day) and **every import that loads from 8 days before the week to 8 days after it** (`wi:660-682`, `wi4l:95-98`). Imports of the neighbouring weeks are in memory but v4 does not draw them (`wi4l:393`).
- No read filters on Status: cancelled orders, pre-orders, lots, pieces, split legs and rota legs are all rows in memory (`wi:677-682`, `wi4l:132-270`).
- Trucks and drivers are loaded active-only; **trailers and partners are loaded whole** (`wi:685-688`).
- No chooser on this board reads temperature, reefer mode or pallet type (the fields exist in the Worker map; none of the four files compares them).
- 33 pallets is a question, not a block, on every groupage path (owner 9/10, `wi:4213-4251`). Not a bug.

## 1. Table of lists

| # | Where (label, code) | What it offers today | What it should offer | Wrong items a user sees | Conf. | Severity |
|---|---|---|---|---|---|---|
| 1 | «Groupage εξαγωγών…» (v1 name «Ομαδοποίηση…») — `wi:4253-4255`, panel `wi:4497-4547`, write `wi:6466-6479` | Every other export row of the week that has no truck or partner and is not a lot. Nothing else. Shown as delivery place + pallets only (no client, no day). | Unassigned, live exports that the same truck could carry: delivery days close to this one, not a pre-order, not split, not a rota leg, not cancelled. | A pre-order with no points yet; a leg of a split order (its own menu hides grouping, `wi:4718`); the original of a split order; a cancelled export; an export delivering Saturday when this one delivers Friday; an export drawn under «μεταφέρθηκε». Imports are **not** in this list (`type==='export'`). | high | data |
| 2 | «Groupage εισαγωγών…» · part «Ελεύθερες εισαγωγές» — `wi:4608-4609`, panel `wi:4505-4516` | Every other import row of this week not matched to an export, not a lot, with no stock piece. No reason line. Shown as loading place + pallets only. | Free, live imports that could ride together: no vehicle of their own (or exactly one side has), not a rota leg, not split, not cancelled, not a pre-order, loading days close. | A rota leg, a split leg or split original, a cancelled import (all refused only after «Ομαδοποίηση» is pressed); an import that already has its own truck while this one has too; a pre-order (accepted). | high | confusing (pre-order: data) |
| 3 | «Groupage εισαγωγών…» · part «Σε φορτίο φορτηγού (N)» — `wi:4610-4621`, `wi:4521-4528` | Every truck load of the board that already carries an import, whatever its day, nearest first. Named «truck · the **export's** delivery place · import clients». Ones that cannot take this import are listed disabled with the reason. | Only loads this import can really join: the truck's export delivers before this import loads, within a few days. | Reads like a list of exports (the place shown is where the export delivers). A truck delivering Friday offered for an import loading Monday. When this import has its own vehicle, every line is disabled with the same sentence. | high | confusing; date-impossible join is accepted = data |
| 4 | «Groupage εισαγωγών · σε αυτό το φορτίο…» (v1 «+ Εισαγωγή στο φορτίο…») — `wi:4629-4655` | Every unmatched import **in memory, including the two neighbouring weeks** (no `adj` test, unlike list 2), not a rota leg, not a lot, not a piece. Disabled with reason: has own vehicle, cancelled, split. Nearest loading day first. | Free imports loading after this truck's export delivers, within a few days, with no vehicle of their own. | Imports of last week and next week that the board does not draw; imports that load before the truck has delivered its export (enabled); many disabled lines («έχει ήδη ανάθεση…») — the owner's «loads which could not be connected»; pre-orders (enabled). | high | confusing; date-impossible and pre-order joins accepted = data |
| 5 | Adding to an existing export group («Groupage εξαγωγών… (πρόσθεση)») — same list as 1 (`wi4a:345`) | As 1. | As 1. | As 1. | high | data |
| 6 | Group member menu, rota card of a group — `wi:6656-6680`, `wi:6893-6946` | Only the group's own members. | Same. | None found. | high | — |
| 7 | Drop an import on a truck row / «κενό γύρισμα» — target `wi2:1314`, start `wi2:1409`, `wi:2952-2974`, decision `wi:3108-3120`, match `wi:3230-3420` | Every export row's import cell takes a drop. Source: any free import row (not a lot, not already matched). Empty cell = match, full cell = join (list 4's rules). Match refuses only: lot on either side, already matched, a stock piece onto a partner. | Match only when the import loads after the export delivers; never with a cancelled order. | Import loading Monday matched to an export delivering Thursday of the same week; a cancelled import or export matched (the join path refuses cancelled, the match path does not). Drop on a partner row and on a row with no truck are allowed on purpose (owner 8/11 #10; partner import rate exists). | high (no date or cancelled rule in the match path) | data |
| 8 | «Νέα εισαγωγή» on a gap — `wi:3044-3066` | Opens the order form; the new import is matched to that row with the same match as 7. | Same, with the date rule. | A new import dated before the export's delivery is matched without a word. | medium | data |
| 9 | «Χωρίς εξαγωγή» click on an own-truck import row (jump to first export without truck) — `wi:978-993`, `wi2:1404` | First export row in board order with no vehicle, not a leg, not a split original. | The nearest export this truck could take (by day), live ones only. | Jumps to a pre-order or cancelled export, or to one days away from when the truck is free. | medium | confusing |
| 10 | Assignment popover · trucks — `wi:685`, `wi:3624-3640` | Active trucks. Busy ones stay, with «δεσμ. N×…»; open work order and expiring papers are a warning line. Same-day clash asks at save (`wi:3804`). Busy is counted from this board's rows only. | As today (owner decision 13/10: warning only). | A truck busy on a load of another week that is not in memory reads «ελεύθερο». | medium | confusing |
| 11 | Assignment popover · trailers — `wi:686` | **All** trailers, inactive included. Warning line for work order / papers, no busy line. | Active trailers. | A trailer marked inactive is offered and saved. | high (filter absent) | data |
| 12 | Assignment popover · drivers — `wi:687` | Active drivers, busy line, X+2 rule in the text. No licence-expiry warning. | As today. | — | medium | — |
| 13 | Assignment popover · partners — `wi:688` | **All** partners, inactive included. | Active partners. | A partner marked inactive is offered and saved. | high (filter absent) | data |
| 14 | «Σκέλος προώθησης (ρότα)…» · first list (what follows this load) — `wi:5219-5249` | Every row of the week, **exports and imports together**, whose loading is from one day before this load's delivery onward, not already a rota leg. No direction word in the line. No test of assignment, kind or status. | Unassigned live loads only (a leg must arrive without a vehicle, `wi:5388-5424`), with the direction said; not a lot, piece, split, pre-order, cancelled, or an import matched to another truck. | From an export's menu the list shows imports too (the closest match to «I choose export and it shows imports»). Every load that already has a truck is listed and is always refused after «Σύνδεση». A lot is listed (the database refuses it, 057 `lot_grouped`). A group is listed by its first member only. | high | confusing; unassigned pre-order / cancelled / split leg accepted = data |
| 15 | Rota · second list («προσάρτηση αυτού ως σκέλος ΜΕΤΑ από…») — `wi:4403-4426` | Every assigned row whose delivery is up to one day after this load's loading; no lower limit inside the week. Shown even when this load has its own vehicle. | Only when this load has no vehicle; parents that deliver shortly before. | When this load is assigned, every choice in the list ends in the same refusal. A truck that delivered six days earlier is offered. | high | confusing |
| 16 | «Σπάσιμο σκέλους…» — `wi:4843-4887` | Place: any location. Second leg: active trucks, all trailers, active drivers, all partners — plain lists, no busy line, no paper warning, no same-day question. | Same people and vehicles as the assignment popover, with the same warnings. | A truck already loading that day, or an inactive trailer / partner, picked with no warning. | high | confusing (inactive: data) |
| 17 | «Αλλαγή σημείου παράδοσης-παραλαβής…» — `wi:1601-1625` | Any location, any date. | Same. | None by list. | high | — |
| 18 | «Παράδοση / Φόρτωση με τοπικό οδηγό…» — menu `wi:5812-5833`, panel `core/relay.js:262-280` | Offered per order; hidden on VS, cancelled, pre-order, split original; disabled on partner-run and no date. Drivers: all active (external marked; the order's own driver disabled). Other tractor: active trucks minus the order's. Trailers: **all**. | Same; active trailers. | Inactive trailer. No stop is chosen (one point), so no wrong stop. | high | data (small) |
| 19 | «+ Κομμάτι από απόθεμα…» — item `wi:7605-7628`, panel `wi:7662-7697`, loose `wi:7645-7653` | Only on own-truck rows (not partner, split, rota leg, lot, moving load). Lots with pallets left (pre-order lots disabled with reason); loose pieces not moving and not matched to an export in memory. | Same. | None found. Every lot of every warehouse is listed whatever the truck's route — acceptable, the dispatcher decides. | high | — |
| 20 | «Μεταφορά εβδομάδας…» — `wi:5990`, panel `wi:6013-6027`, write `wi:6038-6064` | Only on an unmatched import row. Two targets: the week before and after **the board's week**, with no limit on how far from the real loading day. | Only weeks in which the import can still be shown (one week either side of its real loading week). | From the next week's board, «W+1 →» is offered again. Two weeks from its loading day the import is read by no board (read reach is 8 days) and v4 draws it nowhere. | high (logic); needs a live look | data |
| 21 | «ΕΠΟΜΕΝΑ» — `wi4l:585-628`, `wi2:357-395`, `wi2:612-640` | One card per reason. The rules never read Status. | Live orders only. | A cancelled export without a truck asks «Ανάθεση»; a cancelled own-truck export without import shows «κενό γύρισμα». | high in code; depends on cancelled orders existing | confusing |
| 22 | «Κατάσταση» filter — `wi2:115`, `wi2:2517-2523` | «Χωρίς ανάθεση» = no truck and no partner, exports **and** imports. «Εισαγωγές χωρίς ταίριασμα» = every import row not matched (minus lots and loose pieces). | «Χωρίς ταίριασμα» should mean imports still waiting for a truck. | Under «χωρίς ταίριασμα»: an import a partner carries alone, an own-truck import with no export, a cancelled import, a split leg. Under «χωρίς ανάθεση»: cancelled, pre-orders. | high | confusing |
| 23 | Date panel, conflict dialog, pre-order form, search, queue panel | No candidate list of loads. | — | Not audited further. | — | — |

## 2. Confirmed problems, ranked

Each with the smallest business rule that fixes the list, and what happens when the wrong choice is saved.

1. **Export groupage offers every unassigned export of the week** (list 1, 5). High.
   Rule: offer only live exports without a vehicle that are not a pre-order, a split order or leg, or a rota leg, and that deliver within N days of this one (N from the owner); name each by client, place and day.
   Saved? **Accepted.** The write has no check of its own (`wi:6466`), the Worker has none; only a lot is refused by the database, and lots are already left out.

2. **Week shift can move an import out of sight** (list 20). High in logic, not seen live.
   Rule: an import may be shown only in its own loading week or one week either side; offer only those.
   Saved? **Accepted**, and the read-back passes because the field is written correctly. Nobody is told; the import returns only if someone opens the order.

3. **A match has no day rule and no cancelled rule** (list 7, 8, and the enabled lines of 3 and 4). High.
   Rule: an import can ride a truck only if it loads on or after the day that truck's export delivers; a cancelled order is never matched.
   Saved? **Accepted** by the board, Worker and database. (The join into an existing load refuses cancelled; the first match does not.)

4. **Import-to-load list reaches into the neighbouring weeks and shows many lines that cannot be picked** (list 4). High.
   Rule: list only imports that can be picked — no vehicle of their own, live, loading after this truck delivers and within N days; say in one line how many were left out and why.
   Saved? Disabled lines cannot be saved. Enabled but date-impossible ones and pre-orders are **accepted**.

5. **Rota list mixes exports and imports and lists loads that are always refused** (list 14, 15). High.
   Rule: a load can become a leg only if it has no vehicle; list only those, with «εξαγωγή / εισαγωγή» on each line; leave out lots, pieces, split orders, pre-orders, cancelled and imports matched to another truck; hide the second list when this load already has a vehicle.
   Saved? A load with a vehicle: **refused by the board** before any write (`wi:5415-5424`). A lot: **refused by the database**. An unassigned pre-order, cancelled order or split leg: **accepted**.

6. **Free-imports list of «Groupage εισαγωγών…» shows rows the save refuses, with no reason** (list 2). High.
   Rule: the same test that refuses at save decides what is listed; a pre-order is not grouped.
   Saved? Rota leg, split, cancelled, both-sides-assigned: **refused by the board** (`wi:6213-6245`). Pre-order: **accepted**.

7. **Truck-loads part of «Groupage εισαγωγών…» reads like exports and ignores days** (list 3). High.
   Rule: name a load by its truck and its imports; list only trucks whose export delivers before this import loads.
   Saved? Enabled lines are **accepted** whatever the days.

8. **Inactive trailers and inactive partners are offered** (list 11, 13, 16, 18). High that the filter is absent; unknown whether any are marked inactive today.
   Rule: only active trailers and partners, plus the one already on the load.
   Saved? **Accepted.**

9. **Split panel picks a vehicle blind** (list 16). High.
   Rule: the second leg's vehicle and driver are chosen with the same busy line, paper warning and same-day question as an assignment.
   Saved? **Accepted** without the question.

10. **«ΕΠΟΜΕΝΑ» and «Κατάσταση» count cancelled orders, and «χωρίς ταίριασμα» counts imports that need no match** (list 21, 22). High in code; impact depends on data.
    Rule: a cancelled order raises nothing; «χωρίς ταίριασμα» = imports with no vehicle at all.
    Saved? Nothing is written; clutter only.

11. **Jump from «Χωρίς εξαγωγή» goes to the first export in board order** (list 9). Medium.
    Rule: go to the nearest live export by day after this truck is free.
    Saved? Nothing is written.

On the owner's two examples:
- «It also shows many other loads which could not be connected» — confirmed: lists 3 and 4 print the loads that cannot join as disabled lines, list 2 prints them with no reason at all, list 14 prints every assigned load although none can be a leg.
- «I choose export groupage and it shows me import loads» — **not confirmed for the export groupage panel itself**: its filter is exports only. What does mix directions: the rota panel opened from an export (list 14), and the import groupage panel, whose truck-load lines are named by the export's delivery place (list 3). Also both groupage panels name a candidate by one foreign place and pallets, so an export and an import look the same. Needs the owner to show which panel he meant.

## 3. What the redesign's choosers must show

- Each candidate named the same way everywhere: client, loading place → delivery place, day, pallets, and the word «εξαγωγή» or «εισαγωγή».
- One rule decides both what is listed and what is refused at save; a line that would be refused is not listed.
- What was left out is said in one line with a count and the reason («3 με δικό τους φορτηγό · 2 άλλης εβδομάδας»), never as disabled rows mixed in.
- Day sense is checked before listing: an import loads after the truck's export delivers; grouped loads are within the agreed number of days.
- Cancelled, pre-order, split and rota-leg loads never appear as candidates, from either side.
- A candidate from another week carries its week on the line.
- Vehicle, trailer, driver and partner lists are active-only everywhere, with the same busy and paper warnings in every panel that assigns.
- A target week is offered only if the load can be shown there.
- The running pallet sum stays, with 33 as a question.

## 4. Not determined from the code

- Whether cancelled international orders exist in live data. No screen action that writes «Cancelled» was found in `modules/` or `core/` by a plain search; if there are none, every cancelled-order item above is theoretical.
- Which panel the owner had open when he saw imports under an export choice.
- Whether the database refuses a Group ID or Rotation ID on a split leg or a pre-order: only the stock guards (057) were read; triggers in the live database were not.
- How many trailers and partners are marked inactive.
- Whether the import read's date limits are inclusive; it changes the week-shift case by one day at most.
- What becomes of a group when only its first member is made a rota leg (list 14).
- How a grouped export that joins an already assigned group gets the vehicle (not a list question; not traced).
- Whether there is a «local» driver type to narrow the relay driver list; only «External» is marked.
- Needs a look at the live app: the second week shift (does the import vanish), the wording and length of lists 2–4 on a full week, the rota panel opened from an export.

