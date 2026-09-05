# Driver ledger import (Excel → dl_entries)

Order of operations (each stage is idempotent; `work/` is local and gitignored):

1. `python3 tools/ledger-import/fetch.py` — Drive → work/xlsx by fileId
2. `python3 tools/ledger-import/inventory.py` — parse every sheet → work/inventory.json
3. `python3 tools/ledger-import/map_helper.py` — coordinator writes work/map.json by hand, from its output
4. coordinator exports auto RT rows (SQL in plan Task 5) → work/auto_rows.json
5. `python3 tools/ledger-import/make_plan.py` — deterministic plans from work/map.json + work/decisions/<driver_key>.json → work/plans/<driver_key>.json
6. analysts write work/decisions/<driver_key>.json for anything make_plan.py could not settle on its own
7. `python3 tools/ledger-import/verify_plan.py` — invariants over every plan (also rejects cross-plan clashes: I7)
8. Sonnet reviewers write work/reviews/<driver_key>.json, each with `plan_sha256` = sha256 of the exact plan file reviewed
9. `python3 tools/ledger-import/report.py` — owner table (work/report.md) + docs-safe summary
10. owner approval → `python3 tools/ledger-import/commit.py --commit` (needs TMS_JWT in .env.local; re-verifies the plan and its `plan_sha256` before touching a driver)

Tests: `python3 -m unittest discover -s tools/ledger-import/tests -v`
