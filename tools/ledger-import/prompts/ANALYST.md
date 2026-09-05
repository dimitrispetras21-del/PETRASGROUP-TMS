# Analyst — decisions per driver (not plans)

The plan for every driver is built by `python3 tools/ledger-import/make_plan.py <KEY>` from `work/inventory.json`, `work/map.json`, `work/auto_rows.json` and, if present, `work/decisions/<KEY>.json`. You never write a plan. You write **decisions** — the edges of the graph the code cannot settle — and you re-run the builder to see the effect. You do not call any network, you do not modify any file outside `work/decisions/`, you never guess.

## Inputs for a key
- `work/plans/<KEY>.json` — the current draft: `status`, `needs_decision[]`, `warnings[]`, `nodes[]` (role per sheet), `crosscheck{}`, `patches[]`, `auto_unmatched[]`.
- Inventory nodes of the key's files: extract with Python (`json.load` then filter `n['file_id'] in files`); **never print the whole inventory** (35,000 rows). Print only what you need: a node's `first_date`, `last_date`, `n_rows`, `expected_final`, `opening_balance`, `running_breaks`, and a handful of rows around a question.
- `work/map.json[KEY]` — `files` (canonical, in order), `crosscheck`, `_note`.

## What you may decide (schema of `work/decisions/<KEY>.json`)
```json
{"driver_key": "KEY", "confirmed": true,
 "nodes":    [{"file_id": "…", "sheet": "…", "role": "chain|duplicate|out_of_scope", "why": "…"}],
 "openings": [{"file_id": "…", "sheet": "…", "action": "skip|adjust", "why": "…"}],
 "carries":  [{"file_id": "…", "sheet": "…", "row": 4, "action": "skip|adjust", "why": "…"}],
 "settled":  [{"file_id": "…", "sheet": "…", "why": "…"}],
 "matches":  [{"dl_id": 900, "src": {"file_id": "…", "sheet": "…", "row": 160}}, {"dl_id": 901, "src": null}],
 "needs_decision": ["a question only the owner can answer, with sheet and row"]}
```
- **Overlapping sheets** (`επικαλύπτονται χρονικά`): look at both nodes. If one is an extract of the other (same rows, fewer of them, often a year sheet next to a full one) mark the smaller `duplicate`. If they are different periods that merely share an edge date, both stay `chain` and you add nothing — but if the builder still complains, say so in `needs_decision`.
- **Previous sheet closes with X, next starts from 0** (`εξοφλήθηκε εκτός καρτέλας;`): if the next sheet's first rows or its title (`ΝΕΑ ΚΑΡΤΕΛΑ`, `NEW …`) show a fresh start and the old final is small (|X| ≤ 50) or the old sheet ends with a payment that zeroes it within rounding, declare `settled` with the evidence. If X is large and nothing explains it, leave the question for the owner (keep it in `needs_decision`, add the amount and dates).
- **Opening balance / carry row** (`υπόλοιπο έναρξης … χωρίς προηγούμενο φύλλο`): `adjust` when this is the driver's first sheet we import and the balance is real history (the previous ledger is out of scope or missing); `skip` only when a previous chain sheet ends with that amount (the builder already does this automatically — you override only with a reason).
- **RT matches**: the builder matches by nearest date (≤ 2 days). Override with `matches` only when the route or the dates make the automatic choice wrong (e.g. two trips 1 day apart matched crosswise), or set `src: null` to leave an auto row unmatched.
- **Unknown rows, date problems, ΠΡΟΟΔΕΥΤΙΚΟ inconsistent**: these are the owner's. Do not invent a classification. Leave them, but make the question precise: sheet, row, what the cells contain (from `unknown[].cells`), and what the two possible readings would do to the balance.

## Procedure per key
1. `python3 tools/ledger-import/make_plan.py KEY` (prints one line). Read `work/plans/KEY.json` → `status`, `needs_decision`, `warnings`.
2. If `status == ready` and no warnings: write `{"driver_key": "KEY", "confirmed": true}` and move on.
3. Otherwise write the decisions you can justify, re-run the builder, re-read. At most 3 rounds. Whatever remains stays in `needs_decision` — that is a valid outcome.
4. Then `python3 tools/ledger-import/verify_plan.py work/plans/KEY.json` must print `OK`.
5. Print one line: `KEY · status · rows · patches · total · <remaining questions count>`.

Write JSON with `ensure_ascii=False`, indent 1. Every `why` is one sentence naming the evidence (sheet, rows, amounts).
