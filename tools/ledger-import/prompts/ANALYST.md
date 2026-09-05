# Analyst — one plan per driver

You receive: a list of driver keys, the paths of `work/inventory.json`, `work/map.json`, `work/auto_rows.json`, and `work/plans/`. You write exactly one JSON file per driver key, schema below. You do not call any network, you do not modify any other file, you never guess. Work from the inventory only — do not reopen the xlsx.

## Per driver

1. Load the map entry. Canonical files = `files`. Crosscheck files = `crosscheck` (and any key with `alias_of` pointing here).
2. Collect the inventory nodes of the canonical files. Decide each node's `role`:
   - `out_of_scope` if `out_of_scope` is true (2017–2019 monthly model).
   - `duplicate` if its rows (date, value, advance, expenses) are a subset of another node of the same driver that you keep as `chain`.
   - `chain` otherwise. Order chain nodes by `first_date`. Two chain nodes may not overlap in dates; if they do, put the driver in `needs_decision`.
3. For each chain node take `expected_final` from the inventory node (it is the cached ΠΡΟΟΔΕΥΤΙΚΟ plus the deltas of any trailing rows without a cached value, or `balance_sum` when the sheet has no ΠΡΟΟΔΕΥΤΙΚΟ column). If it is null ⇒ `needs_decision` («no ΠΡΟΟΔΕΥΤΙΚΟ and no ΥΠΟΛΟΙΠΟ column»). If the node has a ΠΡΟΟΔΕΥΤΙΚΟ column and `running_consistent` is false ⇒ `needs_decision` with `raw_final`, `opening_balance`, the breaks and `running_last` (do not "fix" it). If the node has no ΠΡΟΟΔΕΥΤΙΚΟ column and `raw_final ≠ balance_sum` ⇒ `needs_decision` likewise.
3b. **Breaks.** Every item of `running_breaks` becomes one line `{"entry_type": "adjustment", "entry_date": <break entry_date>, "amount": <diff as number>, "note": "διαφορά ΠΡΟΟΔΕΥΤΙΚΟΥ στο Excel, φύλλο <sheet> γρ. <row>: <diff>"}` placed right after the row it belongs to. The ledger must equal the ΠΡΟΟΔΕΥΤΙΚΟ people have been reading, and each unexplained jump must be visible as its own line — never folded into a trip.
3c. **Opening balance.** A node with `opening_balance` behaves like a node that starts with a carry row of that amount: if the previous chain node is imported and its final equals the opening (±0.05) ⇒ nothing to add, set `opening_carry_skipped: true`; otherwise add `{"entry_type": "adjustment", "entry_date": <first row date>, "amount": <opening>, "note": "υπόλοιπο έναρξης φύλλου <sheet> στο Excel"}` as the first line of the node. An opening that matches nothing and exceeds 1,000 in absolute value ⇒ `needs_decision` (name the amount).
3d. **Rounding residual.** A node with `rounding_residual` (|x| ≤ 1.00, accumulated sub-0.05 drifts) gets one last line `{"entry_type": "adjustment", "entry_date": <last row date>, "amount": <residual>, "note": "διαφορά στρογγυλοποίησης Excel, φύλλο <sheet>: <residual>"}` so the batch equals `expected_final` to the cent.
4. A `carry` row (entry_type `carry`) at the start of a chain node: if the previous chain node is imported and its final equals the carry amount ⇒ drop the row and set `opening_carry_skipped: true`. Otherwise convert it to `{"entry_type": "adjustment", "amount": <carry>, "note": "μεταφορά υπολοίπου από Excel <sheet>"}`. A carry anywhere else ⇒ `needs_decision`. Never emit `entry_type: carry` in a batch — the Worker does not know it.
5. Any `unknown` row in a chain node, any row with `date_problem` ⇒ `needs_decision` (list them: sheet, row, reason). Keep going with the rest of the plan so the reviewer sees the full picture, but `status` must be `needs_decision`.
6. Crosscheck: for each crosscheck node, every row (date, value, advance, expenses) must exist in a chain node. Otherwise add to `needs_decision` («crosscheck row not in canonical: …»).
7. **RT overlap.** Auto rows of this `driver_id` from `auto_rows.json`. If none: `cutoff` = null, all rows go to batches. Else `cutoff` = min(entry_date) − 1 day.
   - Rows with entry_date ≤ cutoff ⇒ batches.
   - Trips after cutoff: match to an auto row of the same driver with `|entry_date − auto.entry_date| ≤ 2 days`, nearest first, each auto row at most once, auto rows whose `trip_value` is not null are not matchable. Match ⇒ a `patches` item `{dl_id, trip_value, advance, expenses, note: "Excel: <route> · <entry_date>→<date_end>"}` (omit a key whose Excel cell was blank). No match ⇒ batches.
   - Payments after cutoff ⇒ batches.
   - Auto rows left without a match ⇒ `auto_unmatched`.
8. Batches: one per canonical file, rows from its chain nodes in sheet order, each row = the inventory `entry` (its `note` already carries any repair: inherited date, year fix) minus `carry` handling, plus the break/opening adjustments of 3b/3c, plus `src`. Strip keys with null values except keep `note`. **Never include `rt_id`.** `expected_final` of a batch = Σ row deltas (trip: value − (advance − expenses); payment: −amount; adjustment: +amount) and must equal the last chain node's `running_last` (or `balance_sum`) of that file.
9. `expected_total_balance` = Σ batch finals + Σ patch (value − (advance − expenses)). It must equal the last chain node's `expected_final` (plus carries you converted). If not, you made a mistake — find it or go `needs_decision`.
10. `date_fixes` = every row whose inventory `date_fix` is not null (copy from, to). They are already applied in `entry`.
11. `create_driver` = the map's `create` object or null.

Write `status: "ready"` only when `needs_decision` is empty. Write the file with `ensure_ascii=False`, indent 1. Then print one line per driver: `key · status · rows · patches · total`.

## Schema

(see docs/superpowers/plans/2026-09-05-driver-ledger-excel-import.md → "Plan JSON")
