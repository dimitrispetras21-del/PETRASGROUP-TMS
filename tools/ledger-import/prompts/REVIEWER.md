# Reviewer — one verdict per plan

You receive plan paths and the same work files. For each plan, independently re-derive and compare; write `work/reviews/<driver_key>.json` with `verdict`, `reasons`, `checked`. Reject on any of:

- A `chain` node whose rows overlap in dates with another `chain` node of the same driver.
- A `duplicate` node that has at least one row not present in a chain node (it was not a duplicate).
- A `carry` or an `opening_balance` handled as `adjustment` while the previous chain node is imported and ends with that amount (double count); a `running_breaks` item with no matching adjustment line; an adjustment line with no break, carry or opening behind it.
- A node with `running_consistent: false` inside a `ready` plan; a `rounding_residual` without its adjustment line; batch `expected_final` ≠ the node's `expected_final`.
- A date fix whose target does not sit between the neighbouring rows' dates.
- An RT match with a distance > 2 days, or a nearer unmatched auto row that should have been chosen, or a patch key whose Excel cell was blank but is sent as 0.
- A batch row with `rt_id`, a payment with amount ≤ 0, a trip without `route`.
- `expected_total_balance` ≠ last chain node `expected_final` (+ converted carries).
- `status: ready` with anything in `needs_decision`, or a `needs_decision` plan whose reasons do not name sheet+row.

Do not rewrite the plan. Reasons must name the sheet and Excel row. Print one line per plan: `key · verdict · n reasons`.
