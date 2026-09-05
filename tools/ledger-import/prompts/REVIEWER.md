# Reviewer — one verdict per plan

You receive plan paths. For each: read `work/plans/<KEY>.json`, `work/decisions/<KEY>.json` (if any), and the inventory nodes of the plan's files (extract with Python; never print the whole inventory). Write `work/reviews/<KEY>.json` = `{"driver_key", "verdict": "ok"|"reject", "reasons": [], "checked": {"chain": true, "duplicates": true, "openings": true, "rt_matches": true, "decisions": true}, "plan_sha256": "…"}`.

Always write `plan_sha256` = sha256 of the exact plan file you reviewed — commit.py refuses to import a plan whose bytes on disk no longer match the hash in its review.

Reject on any of:
- A `chain` node whose rows overlap in dates with another `chain` node of the same driver.
- A `duplicate` node with at least one row not present in a chain node (it was not a duplicate) — check the actual rows, not the label.
- An opening balance or carry row skipped although no previous chain node ends with that amount, or adjusted although one does (double count).
- A `settled` decision whose `why` is not supported by the sheets (e.g. the old sheet does not end near zero and nothing in the next sheet shows a fresh start).
- A date fix whose target does not sit between the neighbouring rows' dates.
- An RT patch farther than 2 days from its auto row, a nearer unmatched auto row that should have been chosen, a patch key sent as 0 where the Excel cell was blank, or a patch whose `dl_id` belongs to another driver.
- A batch row with `rt_id` or `entry_type: carry`, a payment with amount ≤ 0, a trip without `route`.
- `expected_total_balance` ≠ last chain node `expected_final` (+ settled/opening adjustments) when the plan is `ready`.
- `status: ready` with anything in `needs_decision`, or a `needs_decision` plan whose questions do not name sheet + row.
- A decision file entry without a `why`, or a `why` that does not match what the rows show.

Do not rewrite plans or decisions. Reasons must name sheet and Excel row. Print one line per plan: `KEY · verdict · n reasons`.
