# Driver ledger import (Excel → dl_entries)

Order of operations (each stage is idempotent; `work/` is local and gitignored):

1. `python3 tools/ledger-import/fetch.py` — Drive → work/xlsx by fileId
2. `python3 tools/ledger-import/inventory.py` — parse every sheet → work/inventory.json
3. `python3 tools/ledger-import/map_helper.py` — coordinator writes work/map.json by hand
4. coordinator exports auto RT rows (SQL in plan Task 5) → work/auto_rows.json
5. analysts (Haiku) write work/plans/<driver_key>.json, reviewers (Sonnet) write work/reviews/<driver_key>.json
6. `python3 tools/ledger-import/verify_plan.py` — invariants over every plan
7. `python3 tools/ledger-import/report.py` — owner table (work/report.md) + docs-safe summary
8. owner approval → `python3 tools/ledger-import/commit.py --commit` (needs TMS_JWT in .env.local)

Tests: `python3 -m unittest discover -s tools/ledger-import/tests -v`
