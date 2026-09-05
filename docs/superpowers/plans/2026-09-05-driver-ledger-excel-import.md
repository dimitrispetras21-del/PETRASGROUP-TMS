# Driver Ledger Excel Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import every driver payroll ledger (xlsx) from the Drive folder «μισθοδοσία» into `dl_entries` through the Worker, with the balance of every driver equal to the last ΠΡΟΟΔΕΥΤΙΚΟ of their Excel, without double-counting the 44 auto RT rows.

**Architecture:** A deterministic Python package `tools/ledger-import/` does fetching, parsing (keyword header detection), invariants, reporting and the single write path. Cheap subagents (Haiku 4.5) produce one JSON *plan* per driver (which sheets form the chain, date fixes, Excel↔RT matches); Sonnet 5 reviews each plan; the coordinator (Fable 5.1) owns the Greek-name→driver map and every approval. Only `commit.py`, run by the coordinator with the owner's JWT, writes.

**Tech Stack:** Python 3.9 (`openpyxl 3.1.5`, stdlib `unittest`, `urllib`), `rclone` remote `petras-drive:`, Worker routes `/costs/ledger/import`, `/costs/ledger/:id` (PATCH), `/costs/ledger/:driverId` (GET), `/costs/lookups` (GET), facade `POST /v0/appElT5CQV6JQvym8/tbl7UGmYhc2Y82pPs` (DRIVERS).

Spec: `docs/superpowers/specs/2026-09-05-driver-ledger-excel-import-design.md`.

## Global Constraints

- **Repo is public.** Nothing under `tools/ledger-import/work/` is ever committed (xlsx, inventory, plans, map, logs). Reports committed to `docs/` carry counts and categories, never a driver name next to an amount.
- **Supabase = SELECT only** for agents and coordinator. All writes go through the Worker. Never run `dl_cancel_batch` or any SQL write without the owner's explicit approval in chat.
- **No agent holds `TMS_JWT`.** Only `commit.py`, run by the coordinator, reads it from `.env.local`. It is never printed or logged.
- **Writes only after 15:00** (team works 05:30–14:30).
- **Never guess.** Unknown row shape, ambiguous date, missing balance ⇒ the driver goes to `needs_decision`; the run continues with the other drivers.
- Import rows never carry `rt_id` (Worker returns 400). PATCH only fields that are NULL on the auto row (Worker demands `reason` otherwise; we do not send reasons).
- Amount arithmetic in `Decimal`, quantized to 0.01, `ROUND_HALF_UP`. Balance invariant on **raw columns**: `Σ ΑΞΙΑ − Σ ΕΛΑΒΕ + Σ ΕΞΟΔΑ` = last ΠΡΟΟΔΕΥΤΙΚΟ (±0.01).
- Python 3.9: no `match`, no `X | None` type syntax, no `zoneinfo` dependence.
- Existing `tools/import_driver_ledger.py` and `tools/driver-ledger-map.json` are **not modified**.
- Comments explain *why*, in English. Chat with the owner in Greek.

## File Structure

```
tools/ledger-import/
├── README.md              how to run each stage, in order
├── rules.py               pure functions: header detection, row classification, date fix, balance, RT matching
├── fetch.py               rclone lsjson + copyid → work/xlsx/<fileId>__<name>.xlsx + work/drive-index.json
├── inventory.py           every workbook/sheet → work/inventory.json (nodes with normalized rows)
├── map_helper.py          prints Greek names, DB candidates, roster phones → coordinator writes work/map.json by hand
├── verify_plan.py         deterministic invariants over one plan JSON → ok / reject reasons
├── report.py              aggregates plans + reviews → work/report.md (owner table) + docs-safe summary
├── commit.py              THE write path: create drivers, import batches, PATCH matches, GET proof; dry-run default
├── prompts/
│   ├── ANALYST.md         Haiku analyst instructions (+ plan schema)
│   └── REVIEWER.md        Sonnet reviewer instructions
├── tests/
│   ├── test_rules.py
│   ├── test_inventory.py
│   ├── test_verify_plan.py
│   └── test_commit.py
└── work/                  gitignored: xlsx/, inventory.json, map.json, auto_rows.json, plans/, reviews/, report.md, state.json, logs/
```

Plan JSON (produced by analysts, consumed by verify/report/commit) — `work/plans/<driver_key>.json`:

```json
{
  "driver_key": "ΠΑΠΠΗΣ ΓΙΑΝΝΗΣ",
  "driver_id": 8,
  "create_driver": null,
  "nodes": [
    {"file_id": "1eKb…", "file_name": "ΠΑΠΠΗΣ ΓΙΑΝΝΗΣ.xlsx", "sheet": "Φύλλο1", "role": "chain",
     "expected_final": "79.03", "opening_carry_skipped": false, "why": "single sheet, running col present"}
  ],
  "batches": [
    {"file_id": "1eKb…", "file_name": "ΠΑΠΠΗΣ ΓΙΑΝΝΗΣ.xlsx",
     "rows": [ {"entry_type": "trip", "entry_date": "2024-03-13", "date_end": "2024-03-20", "route": "ΓΕΡΜΑΝΙΑ", "trip_value": 450.0, "advance": 300.0, "expenses": 120.5, "note": null, "src": {"sheet": "Φύλλο1", "row": 5}} ],
     "expected_final": "79.03"}
  ],
  "patches": [ {"dl_id": 1234, "trip_value": 450.0, "advance": 300.0, "expenses": 0.0, "note": "Excel: ΓΕΡΜΑΝΙΑ · 2026-08-14→2026-08-21", "src": {"sheet": "Φύλλο1", "row": 160}} ],
  "cutoff": "2026-08-13",
  "auto_unmatched": [ {"dl_id": 1235, "entry_date": "2026-08-30"} ],
  "date_fixes": [ {"sheet": "Φύλλο1", "row": 36, "from": "2026-12-27", "to": "2025-12-27"} ],
  "needs_decision": [],
  "expected_total_balance": "79.03",
  "status": "ready"
}
```

`status` ∈ `ready` | `needs_decision` | `skip` (with `needs_decision[]` explaining). `role` ∈ `chain` | `duplicate` | `out_of_scope`. Amounts inside `rows`/`patches` are JSON numbers (the Worker validates `typeof === 'number'`); `expected_*` are decimal strings.

---

### Task 1: Scaffolding, gitignore, fetch canonical files by Drive fileId

**Files:**
- Create: `tools/ledger-import/README.md`
- Create: `tools/ledger-import/fetch.py`
- Create: `tools/ledger-import/tests/__init__.py` (empty)
- Modify: `.gitignore` (append one line)

**Interfaces:**
- Produces: `work/drive-index.json` = list of `{id, name, path, size, modified}` for every xlsx in scope; `work/xlsx/<id>__<safe-name>.xlsx` files. Later tasks address files by `id`.

- [ ] **Step 1: Append to `.gitignore`**

```bash
printf '\n# driver ledger import — personal financial data, never commit\ntools/ledger-import/work/\n' >> .gitignore
git add .gitignore && git commit -q -m "chore: ignore tools/ledger-import/work (ledger xlsx + plans stay local)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 2: Write `fetch.py`**

```python
#!/usr/bin/env python3
"""Fetch every ledger workbook from the Drive folder «μισθοδοσία» by fileId.

Why by id and not by name: three names exist twice in the folder root with
different content, and `rclone copy` silently keeps one of them. `lsjson`
gives us the Drive id; `backend copyid` fetches exactly that object.
"""
import json, os, re, subprocess, sys

REMOTE = 'petras-drive:'
ROOT_ID = '1J93m8yBVEa1-RDo7loYpUWKhI03u1pz5'
WORK = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'work')
EXCLUDE_DIRS = ('διαφ ΚΑΡΤΕΛ', 'ΑΞΙΑ ΔΡΟΜΟΛΟΓΙΩΝ ΕΣΩΤΕΡΙΚΟΥ')

def list_drive():
    out = subprocess.run(['rclone', 'lsjson', '-R', '--files-only', '--drive-root-folder-id', ROOT_ID, REMOTE],
                         check=True, capture_output=True, text=True).stdout
    items = []
    for it in json.loads(out):
        path = it['Path']
        if not path.lower().endswith('.xlsx'): continue
        if os.path.basename(path).startswith('~$'): continue          # Excel lock files, 165 bytes
        if any(path.startswith(d + '/') for d in EXCLUDE_DIRS): continue
        items.append({'id': it['ID'], 'name': os.path.basename(path), 'path': path,
                      'size': it['Size'], 'modified': it['ModTime']})
    return items

def safe(name):
    return re.sub(r'[^\w.\- ]', '_', name)

def main():
    os.makedirs(os.path.join(WORK, 'xlsx'), exist_ok=True)
    items = list_drive()
    for it in items:
        dest = os.path.join(WORK, 'xlsx', f"{it['id']}__{safe(it['name'])}")
        it['local'] = dest
        if os.path.exists(dest) and os.path.getsize(dest) == it['size']:
            continue
        subprocess.run(['rclone', 'backend', 'copyid', REMOTE, it['id'], dest], check=True, capture_output=True)
    json.dump(items, open(os.path.join(WORK, 'drive-index.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'{len(items)} workbooks · {sum(1 for i in items if "/" not in i["path"])} in root · '
          f'{sum(1 for i in items if i["path"].startswith("ΣΤΑΜΑΤΗΣΑΝ/"))} in ΣΤΑΜΑΤΗΣΑΝ')

if __name__ == '__main__':
    main()
```

- [ ] **Step 3: Run it**

Run: `python3 tools/ledger-import/fetch.py`
Expected: `138 workbooks · 6x in root · 7x in ΣΤΑΜΑΤΗΣΑΝ` (exact numbers may differ by one or two; must be ≥ 130) and `ls tools/ledger-import/work/xlsx | wc -l` equals the first number.

- [ ] **Step 4: Write `README.md`**

```markdown
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
```

- [ ] **Step 5: Commit**

```bash
git add tools/ledger-import/README.md tools/ledger-import/fetch.py tools/ledger-import/tests/__init__.py
git commit -q -m "ledger-import: fetch workbooks from Drive by fileId (rclone copyid)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `rules.py` — header detection, row classification, date fix, raw balance

**Files:**
- Create: `tools/ledger-import/rules.py`
- Test: `tools/ledger-import/tests/test_rules.py`

**Interfaces:**
- Produces:
  - `detect_header(rows) -> Optional[Header]` where `rows` is a list of tuples (cell values, 1-based positions implied) and `Header = {'row': int, 'cols': {field: col_index}, 'out_of_scope': bool}`; fields: `date, date_end, route, advance, expenses, value, balance, running, cash, bank, seq, official`.
  - `classify(cells) -> dict|None|'STOP'` where `cells = {field: value}` (already picked by column). Returns an entry dict with `entry_type` ∈ `trip|payment_cash|payment_bank|carry`, or `None` for blank, `'STOP'` at ΣΥΝΟΛΟ. Raises `Unknown(reason)`.
  - `fix_date(cur, prev, nxt, today) -> (date, note)|None`.
  - `raw_balance(cells_list) -> Decimal` = Σvalue − Σadvance + Σexpenses.
  - `d2(x) -> Decimal` and `to_date(v) -> date|None`.

- [ ] **Step 1: Write the failing tests**

```python
# tools/ledger-import/tests/test_rules.py
import unittest, datetime as dt, sys, os
from decimal import Decimal
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from rules import detect_header, classify, fix_date, raw_balance, Unknown, d2, to_date

D = dt.date

class TestHeader(unittest.TestCase):
    def test_standard_layout_with_unlabeled_end_date(self):
        # ΑΙΜΙΛΙΟΣ layout: header row 3, B=Α/Α C=ΗΜΕΡΟΜΗΝΙΑ D=(end, unlabeled) E=ΔΡΟΜΟΛΟΓΙΟ F=ΕΛΑΒΕ G=ΕΞΟΔΑ I=ΑΞΙΑ ΔΡΟΜ. J=ΥΠΟΛΟΙΠΟ K=ΠΡΟΟΔΕΥΤΙΚΟ
        rows = [(None,)*11, ('ΚΑΡΤΕΛΑ',) + (None,)*10,
                (None, 'Α/Α', 'ΗΜΕΡΟΜΗΝΙΑ', None, 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', None, 'ΑΞΙΑ ΔΡΟΜ.', 'ΥΠΟΛΟΙΠΟ', 'ΠΡΟΟΔΕΥΤΙΚΟ')]
        h = detect_header(rows)
        self.assertEqual(h['row'], 3)
        self.assertEqual(h['cols']['date'], 3)
        self.assertEqual(h['cols']['date_end'], 4)
        self.assertEqual(h['cols']['route'], 5)
        self.assertEqual(h['cols']['value'], 9)
        self.assertEqual(h['cols']['running'], 11)
        self.assertFalse(h['out_of_scope'])

    def test_shifted_layout_with_lixi_and_metrita(self):
        rows = [('ΗΜΕΡ.', 'ΛΗΞΗ', 'ΜΕΤΡΗΤΑ', 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', None, 'ΚΟΣΤΟΣ', 'ΥΠΟΛΟΙΠΟ', 'ΠΡΟΟΔΕΥΤΙΚΟ')]
        h = detect_header(rows)
        self.assertEqual(h['row'], 1)
        self.assertEqual(h['cols']['date_end'], 2)
        self.assertEqual(h['cols']['cash'], 3)
        self.assertEqual(h['cols']['value'], 8)

    def test_old_monthly_layout_is_out_of_scope(self):
        rows = [(None, 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', None, 'ΑΞΙΑ Δ', None, 'ΗΜΕΡ', 'ΕΠΙΣΗΜΗ', 'ΤΡΑΠΕΖΑ', 'ΥΠΟΛΟΙΠΟ')]
        self.assertTrue(detect_header(rows)['out_of_scope'])

    def test_no_header(self):
        self.assertIsNone(detect_header([('a', 'b'), (1, 2)]))

class TestClassify(unittest.TestCase):
    def test_trip(self):
        e = classify({'date': D(2024, 3, 13), 'date_end': D(2024, 3, 20), 'route': 'ΓΕΡΜΑΝΙΑ', 'advance': 300, 'expenses': 120.5, 'value': 450})
        self.assertEqual(e['entry_type'], 'trip')
        self.assertEqual(e['trip_value'], 450.0)
        self.assertEqual(e['date_end'], '2024-03-20')

    def test_trip_blank_value_is_none(self):
        e = classify({'date': D(2024, 3, 13), 'route': 'ΑΘΗΝΑ', 'advance': 100, 'seq': 12})
        self.assertEqual(e['entry_type'], 'trip')
        self.assertIsNone(e['trip_value'])
        self.assertIsNone(e['expenses'])   # blank stays NULL, explicit 0 would be 0.0

    def test_cash_payment_by_description(self):
        e = classify({'date': D(2024, 4, 1), 'route': 'ΜΕΤΡΗΤΑ', 'advance': 200})
        self.assertEqual(e, {'entry_type': 'payment_cash', 'entry_date': '2024-04-01', 'amount': 200.0})

    def test_bank_payment_by_column(self):
        e = classify({'date': D(2024, 4, 30), 'bank': 500, 'advance': 500})
        self.assertEqual(e['entry_type'], 'payment_bank')
        self.assertEqual(e['amount'], 500.0)

    def test_carry_row(self):
        e = classify({'date': D(2025, 1, 1), 'route': 'ΜΕΤΑΦΟΡΑ ΥΠΟΛΟΙΠΟΥ', 'balance': 123.45})
        self.assertEqual(e['entry_type'], 'carry')
        self.assertEqual(e['amount'], 123.45)

    def test_blank_and_stop(self):
        self.assertIsNone(classify({'date': None, 'route': None}))
        self.assertEqual(classify({'route': 'ΣΥΝΟΛΟ', 'value': 999}), 'STOP')
        self.assertEqual(classify({'date': 'ΣΥΝΟΛΟ'}), 'STOP')

    def test_unknown_raises(self):
        with self.assertRaises(Unknown):
            classify({'date': D(2024, 1, 1), 'route': 'ΔΩΡΟ ΠΑΣΧΑ', 'advance': 150})
        with self.assertRaises(Unknown):
            classify({'route': 'ΓΕΡΜΑΝΙΑ', 'value': 400})       # amounts but no date

class TestFixDate(unittest.TestCase):
    today = D(2026, 9, 5)
    def test_year_typo_in_future_is_fixed(self):
        r = fix_date(D(2026, 12, 27), D(2025, 12, 20), D(2026, 1, 5), self.today)
        self.assertEqual(r[0], D(2025, 12, 27))
        self.assertIn('2026-12-27', r[1])
    def test_in_range_untouched(self):
        self.assertEqual(fix_date(D(2025, 6, 1), D(2025, 5, 1), D(2025, 7, 1), self.today), (D(2025, 6, 1), None))
    def test_ambiguous_returns_none(self):
        # no neighbours to pin the year: two candidate years fit → refuse
        self.assertIsNone(fix_date(D(2026, 12, 27), None, None, self.today))
    def test_end_before_start_is_ambiguous_when_neighbours_do_not_pin(self):
        self.assertIsNone(fix_date(D(2024, 12, 27), D(2025, 12, 20), None, self.today))

class TestBalance(unittest.TestCase):
    def test_raw_balance(self):
        cells = [{'value': 450, 'advance': 300, 'expenses': 120.5}, {'advance': 200}, {'value': None, 'advance': None, 'expenses': 30}]
        self.assertEqual(raw_balance(cells), Decimal('100.50'))
    def test_d2_and_to_date(self):
        self.assertEqual(d2('1.005'), Decimal('1.01'))
        self.assertEqual(to_date(dt.datetime(2024, 1, 2, 10)), D(2024, 1, 2))
        self.assertEqual(to_date('02/01/2024'), D(2024, 1, 2))
        self.assertIsNone(to_date('ΣΥΝΟΛΟ'))

if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m unittest tools.ledger-import.tests.test_rules 2>&1 | tail -3` — module path has a dash, so use: `cd tools/ledger-import && python3 -m unittest tests.test_rules -v 2>&1 | tail -3`
Expected: `ModuleNotFoundError: No module named 'rules'`

- [ ] **Step 3: Write `rules.py`**

```python
"""Pure rules for the ledger import. No I/O, no Worker, no Supabase — so every
rule is testable and the analysts (LLM agents) reason about inputs that were
normalised the same way for every one of the 30 sheet layouts.
"""
import datetime as dt, re, unicodedata
from decimal import Decimal, ROUND_HALF_UP

class Unknown(Exception):
    """A row shape the rules do not recognise. The driver goes to needs_decision;
    we never guess what a payroll row meant."""

# Header keywords per field. Matching is on the upper-cased, accent-stripped cell.
FIELD_KEYS = [
    ('official', ('ΕΠΙΣΗΜ',)),          # 2017-2019 monthly model → whole sheet out of scope
    ('running',  ('ΠΡΟΟΔ',)),
    ('balance',  ('ΥΠΟΛΟΙΠ',)),
    ('value',    ('ΑΞΙΑ', 'ΚΟΣΤΟΣ')),
    ('expenses', ('ΕΞΟΔΑ',)),
    ('advance',  ('ΕΛΑΒΕ',)),
    ('route',    ('ΔΡΟΜΟΛ', 'ΠΕΡΙΓΡΑΦ')),
    ('date_end', ('ΛΗΞΗ', 'ΕΠΙΣΤΡΟΦ')),
    ('date',     ('ΗΜΕΡ',)),
    ('cash',     ('ΜΕΤΡΗΤ',)),
    ('bank',     ('ΚΑΤΑΘΕΣ', 'ΤΡΑΠΕΖ')),
    ('seq',      ('Α/Α',)),
]
REQUIRED = ('advance', 'expenses')

def norm(s):
    s = unicodedata.normalize('NFD', str(s)).upper()
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn').strip()

def d2(v):
    return Decimal(str(v if v not in (None, '') else 0)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

def to_date(v):
    if isinstance(v, dt.datetime): return v.date()
    if isinstance(v, dt.date): return v
    if isinstance(v, str):
        m = re.match(r'^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\s*$', v)
        if m:
            d, mo, y = (int(x) for x in m.groups())
            if y < 100: y += 2000
            try: return dt.date(y, mo, d)
            except ValueError: return None
    return None

def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)

def detect_header(rows):
    """First row where ≥3 distinct fields match wins. `date_end` falls back to the
    unlabeled column right after `date` when it sits before `route` — the most
    common layout labels only the start date and leaves the end date unlabeled."""
    for i, row in enumerate(rows, 1):
        cols = {}
        for j, cell in enumerate(row, 1):
            if cell in (None, ''): continue
            n = norm(cell)
            for field, keys in FIELD_KEYS:
                if field not in cols and any(k in n for k in keys):
                    cols[field] = j; break
        if len(cols) >= 3 and all(f in cols for f in REQUIRED):
            if 'date_end' not in cols and 'date' in cols and 'route' in cols and cols['date'] + 1 < cols['route']:
                cols['date_end'] = cols['date'] + 1
            return {'row': i, 'cols': cols, 'out_of_scope': 'official' in cols}
    return None

def classify(c):
    """c = {field: raw cell}. Returns entry dict, None (blank), or 'STOP' (ΣΥΝΟΛΟ)."""
    desc = norm(c.get('route') or '')
    if 'ΣΥΝΟΛΟ' in desc or 'ΣΥΝΟΛΟ' in norm(c.get('date') or ''): return 'STOP'
    nums = {k: c.get(k) for k in ('advance', 'expenses', 'value', 'balance', 'cash', 'bank')}
    has_amount = any(is_num(v) and v != 0 for v in nums.values())
    date = to_date(c.get('date')) or to_date(c.get('date_end'))
    if not desc and not has_amount and c.get('seq') in (None, ''): return None
    if date is None: raise Unknown('row with amounts/description but no date: %r' % (c.get('route'),))
    iso = date.isoformat()
    adv = float(d2(c['advance'])) if is_num(c.get('advance')) else None
    if 'ΜΕΤΡΗΤ' in desc or (is_num(c.get('cash')) and c.get('cash') != 0 and not is_num(c.get('value'))):
        amt = adv if adv else (float(d2(c['cash'])) if is_num(c.get('cash')) else None)
        if not amt or amt <= 0: raise Unknown('cash payment without positive amount: %r' % (c.get('route'),))
        return {'entry_type': 'payment_cash', 'entry_date': iso, 'amount': amt}
    if 'ΚΑΤΑΘΕΣ' in desc or 'ΤΡΑΠΕΖ' in desc or (is_num(c.get('bank')) and c.get('bank') != 0 and not is_num(c.get('value'))):
        amt = adv if adv else (float(d2(c['bank'])) if is_num(c.get('bank')) else None)
        if not amt or amt <= 0: raise Unknown('bank payment without positive amount: %r' % (c.get('route'),))
        return {'entry_type': 'payment_bank', 'entry_date': iso, 'amount': amt}
    if ('ΜΕΤΑΦΟΡΑ' in desc or 'ΥΠΟΛΟΙΠΟ' in desc) and not is_num(c.get('value')) and not is_num(c.get('advance')):
        if not is_num(c.get('balance')): raise Unknown('carry row without balance: %r' % (c.get('route'),))
        return {'entry_type': 'carry', 'entry_date': iso, 'amount': float(d2(c['balance']))}
    value_present = is_num(c.get('value')) and c['value'] != 0
    # A trip needs a value or a sequence number. A described row with only an
    # advance could be a gift, a loan or a trip — that is a human's call.
    if value_present or c.get('seq') not in (None, ''):
        end = to_date(c.get('date_end'))
        return {'entry_type': 'trip', 'entry_date': iso,
                'date_end': end.isoformat() if end else None,
                'route': (str(c.get('route') or '').strip() or None),
                'trip_value': float(d2(c['value'])) if is_num(c.get('value')) else None,
                'advance': adv,
                'expenses': float(d2(c['expenses'])) if is_num(c.get('expenses')) else None}
    raise Unknown('unrecognised row: %r' % (c.get('route'),))

def fix_date(cur, prev, nxt, today, slack=dt.timedelta(days=400)):
    """Return (date, note). Untouched when plausible. A date in the future or >400
    days out of sequence is repaired only when changing the YEAR alone lands it
    between its neighbours — anything else is None (needs a human)."""
    def plausible(d):
        return d <= today and (prev is None or d >= prev) and (nxt is None or d <= nxt)
    if plausible(cur): return (cur, None)
    if prev is None or nxt is None: return None       # not enough context to pin the year
    cands = set()
    for y in {cur.year - 1, cur.year + 1, prev.year, nxt.year}:
        try: d = cur.replace(year=y)
        except ValueError: continue
        if plausible(d): cands.add(d)
    if len(cands) != 1: return None
    fixed = cands.pop()
    return (fixed, 'ημ/νία Excel %s → %s (έτος)' % (cur.isoformat(), fixed.isoformat()))

def raw_balance(cells_list):
    """Σ ΑΞΙΑ − Σ ΕΛΑΒΕ + Σ ΕΞΟΔΑ over raw cells. Independent of classification,
    so a mis-classified row cannot hide a balance error."""
    tot = Decimal('0')
    for c in cells_list:
        tot += d2(c.get('value') if is_num(c.get('value')) else 0)
        tot -= d2(c.get('advance') if is_num(c.get('advance')) else 0)
        tot += d2(c.get('expenses') if is_num(c.get('expenses')) else 0)
    return tot.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
```

- [ ] **Step 4: Run tests**

Run: `cd tools/ledger-import && python3 -m unittest tests.test_rules -v 2>&1 | tail -4`
Expected: `OK` with 17 tests. If `test_end_before_start_is_ambiguous…` fails, the `prev is None or nxt is None` guard is missing.

- [ ] **Step 5: Commit**

```bash
git add tools/ledger-import/rules.py tools/ledger-import/tests/test_rules.py
git commit -q -m "ledger-import: pure rules — keyword header detection, row classification, year-typo repair, raw balance

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `inventory.py` — every sheet becomes a node with normalized rows

**Files:**
- Create: `tools/ledger-import/inventory.py`
- Test: `tools/ledger-import/tests/test_inventory.py`

**Interfaces:**
- Consumes: `work/drive-index.json` (Task 1), `rules.detect_header/classify/fix_date/raw_balance/to_date`.
- Produces: `work/inventory.json` = `{"generated": iso, "nodes": [Node]}` with
  `Node = {file_id, file_name, path, folder ('root'|'ΣΤΑΜΑΤΗΣΑΝ'), modified, sheet, header_row, cols, out_of_scope, rows: [Row], unknown: [{row, reason, cells}], raw_final: str|None, running_last: str|None, balance_sum: str|None, first_date, last_date, n_rows}` and
  `Row = {row (excel row number), entry (classify() result or null), cells (raw picked cells as JSON-safe), date_fix: {from,to,note}|null, date_problem: str|null}`.
  Also `parse_sheet(ws, today) -> Node-without-file-fields` used by tests.

- [ ] **Step 1: Write the failing test**

```python
# tools/ledger-import/tests/test_inventory.py
import unittest, tempfile, os, sys, datetime as dt
import openpyxl
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from inventory import parse_sheet

def book(rows):
    wb = openpyxl.Workbook(); ws = wb.active
    for r in rows: ws.append(list(r))
    return ws

class TestParseSheet(unittest.TestCase):
    def test_standard_sheet(self):
        ws = book([
            ('ΚΑΡΤΕΛΑ',),
            (None,),
            (None, 'Α/Α', 'ΗΜΕΡΟΜΗΝΙΑ', None, 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', None, 'ΑΞΙΑ', 'ΥΠΟΛΟΙΠΟ', 'ΠΡΟΟΔΕΥΤΙΚΟ'),
            (None, 1, dt.datetime(2024, 3, 13), dt.datetime(2024, 3, 20), 'ΓΕΡΜΑΝΙΑ', 300, 120.5, None, 450, 270.5, 270.5),
            (None, None, dt.datetime(2024, 4, 1), None, 'ΜΕΤΡΗΤΑ', 200, None, None, None, -200, 70.5),
            (None, 2, dt.datetime(2025, 12, 27), None, 'ΑΘΗΝΑ', 100, None, None, 230, 130, 200.5),   # ok
            (None, 3, dt.datetime(2026, 12, 30), None, 'ΠΑΤΡΑ', 100, None, None, 230, 130, 330.5),   # year typo → 2025? no: after 2025-12-27 and before next → fixed to 2025-12-30
            (None, 4, dt.datetime(2026, 1, 4), None, 'ΘΕΣΣΑΛΟΝΙΚΗ', 0, None, None, 80, 80, 410.5),
            (None, None, 'ΣΥΝΟΛΟ', None, None, 700, 120.5, None, 990, None, None),
        ])
        n = parse_sheet(ws, today=dt.date(2026, 9, 5))
        self.assertEqual(n['header_row'], 3)
        self.assertEqual(n['n_rows'], 5)
        self.assertEqual([r['entry']['entry_type'] for r in n['rows']], ['trip', 'payment_cash', 'trip', 'trip', 'trip'])
        self.assertEqual(n['raw_final'], '410.50')
        self.assertEqual(n['running_last'], '410.50')
        self.assertEqual(n['rows'][3]['date_fix']['to'], '2025-12-30')
        self.assertEqual(n['rows'][3]['entry']['entry_date'], '2025-12-30')
        self.assertEqual(n['unknown'], [])
        self.assertEqual(n['first_date'], '2024-03-13')

    def test_unknown_rows_are_collected_not_fatal(self):
        ws = book([('ΗΜΕΡ', 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', None, 'ΑΞΙΑ', 'ΥΠΟΛΟΙΠΟ'),
                   (dt.datetime(2024, 1, 5), 'ΔΩΡΟ ΠΑΣΧΑ', 150, None, None, None, -150)])
        n = parse_sheet(ws, today=dt.date(2026, 9, 5))
        self.assertEqual(len(n['unknown']), 1)
        self.assertIn('ΔΩΡΟ', n['unknown'][0]['reason'])
        self.assertIsNone(n['running_last'])
        self.assertEqual(n['balance_sum'], '-150.00')

    def test_no_header_returns_none(self):
        self.assertIsNone(parse_sheet(book([('x', 'y'), (1, 2)]), today=dt.date(2026, 9, 5)))

if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd tools/ledger-import && python3 -m unittest tests.test_inventory -v 2>&1 | tail -3`
Expected: `ModuleNotFoundError: No module named 'inventory'`

- [ ] **Step 3: Write `inventory.py`**

```python
#!/usr/bin/env python3
"""Parse every workbook in work/xlsx into nodes (one per sheet) with rows already
normalised by rules.py. Reads twice per file: formulas off (data_only=True) so the
cached ΠΡΟΟΔΕΥΤΙΚΟ is visible. Nothing here decides anything — it records."""
import datetime as dt, json, os, sys, warnings
import openpyxl
from rules import detect_header, classify, fix_date, raw_balance, to_date, is_num, d2, Unknown
warnings.filterwarnings('ignore')

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, 'work')
PICK = ('seq', 'date', 'date_end', 'route', 'advance', 'expenses', 'value', 'balance', 'running', 'cash', 'bank')

def jsonable(v):
    if isinstance(v, (dt.datetime, dt.date)): return v.isoformat()[:10]
    if isinstance(v, float) and v != v: return None
    return v

def parse_sheet(ws, today):
    head = list(ws.iter_rows(min_row=1, max_row=min(ws.max_row or 0, 400), values_only=True))
    h = detect_header(head)
    if h is None: return None
    cols = h['cols']
    rows, unknown, cells_used = [], [], []
    for rn, raw in enumerate(ws.iter_rows(min_row=h['row'] + 1, values_only=True), h['row'] + 1):
        cells = {f: (raw[cols[f] - 1] if f in cols and cols[f] <= len(raw) else None) for f in PICK}
        try:
            e = classify(cells)
        except Unknown as ex:
            unknown.append({'row': rn, 'reason': str(ex), 'cells': {k: jsonable(v) for k, v in cells.items()}})
            cells_used.append(cells)      # amounts of unknown rows still count in the raw balance
            continue
        if e == 'STOP': break
        if e is None: continue
        rows.append({'row': rn, 'entry': e, 'cells': {k: jsonable(v) for k, v in cells.items()}, 'date_fix': None, 'date_problem': None})
        cells_used.append(cells)
    # date repair needs neighbours, so it runs after the pass
    dates = [dt.date.fromisoformat(r['entry']['entry_date']) for r in rows]
    for i, r in enumerate(rows):
        prev = max((d for d in dates[:i] if d <= today), default=None)
        nxt = next((d for d in dates[i + 1:] if d <= today), None)
        fx = fix_date(dates[i], prev, nxt, today)
        if fx is None:
            r['date_problem'] = 'date %s not plausible and not repairable by year alone' % dates[i].isoformat()
        elif fx[1]:
            r['date_fix'] = {'from': dates[i].isoformat(), 'to': fx[0].isoformat(), 'note': fx[1]}
            r['entry']['entry_date'] = fx[0].isoformat()
            r['entry']['note'] = fx[1]
        end = r['entry'].get('date_end')
        if end and end < r['entry']['entry_date']:
            r['date_problem'] = (r['date_problem'] or '') + ' date_end %s before entry_date' % end
    running_last = None
    if 'running' in cols:
        for r in reversed(rows):
            v = r['cells'].get('running')
            if is_num(v): running_last = str(d2(v)); break
    balance_sum = None
    if 'balance' in cols:
        vals = [c.get('balance') for c in cells_used if is_num(c.get('balance'))]
        balance_sum = str(sum((d2(v) for v in vals), d2(0))) if vals else None
    ds = sorted(dt.date.fromisoformat(r['entry']['entry_date']) for r in rows)
    return {'sheet': ws.title, 'header_row': h['row'], 'cols': cols, 'out_of_scope': h['out_of_scope'],
            'rows': rows, 'unknown': unknown, 'raw_final': str(raw_balance(cells_used)) if cells_used else None,
            'running_last': running_last, 'balance_sum': balance_sum,
            'first_date': ds[0].isoformat() if ds else None, 'last_date': ds[-1].isoformat() if ds else None,
            'n_rows': len(rows)}

def main():
    today = dt.date.today()
    index = json.load(open(os.path.join(WORK, 'drive-index.json'), encoding='utf-8'))
    nodes = []
    for it in index:
        wb = openpyxl.load_workbook(it['local'], data_only=True, read_only=True)
        for ws in wb.worksheets:
            n = parse_sheet(ws, today)
            if n is None: continue
            n.update({'file_id': it['id'], 'file_name': it['name'], 'path': it['path'],
                      'folder': 'ΣΤΑΜΑΤΗΣΑΝ' if it['path'].startswith('ΣΤΑΜΑΤΗΣΑΝ/') else 'root', 'modified': it['modified']})
            nodes.append(n)
    out = {'generated': dt.datetime.now().isoformat(timespec='seconds'), 'nodes': nodes}
    json.dump(out, open(os.path.join(WORK, 'inventory.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    unk = sum(len(n['unknown']) for n in nodes); probs = sum(1 for n in nodes for r in n['rows'] if r['date_problem'])
    fixes = sum(1 for n in nodes for r in n['rows'] if r['date_fix'])
    mism = sum(1 for n in nodes if n['running_last'] and n['raw_final'] != n['running_last'])
    print('nodes %d · rows %d · unknown rows %d · date fixes %d · date problems %d · out_of_scope %d · raw≠running %d'
          % (len(nodes), sum(n['n_rows'] for n in nodes), unk, fixes, probs, sum(n['out_of_scope'] for n in nodes), mism))

if __name__ == '__main__':
    main()
```

- [ ] **Step 4: Run tests**

Run: `cd tools/ledger-import && python3 -m unittest tests.test_inventory -v 2>&1 | tail -3`
Expected: `OK` (3 tests).

- [ ] **Step 5: Run on the real folder and record the summary line**

Run: `python3 tools/ledger-import/inventory.py`
Expected: one summary line, e.g. `nodes 3xx · rows 1xxxx · unknown rows N · …`. Paste this line into the PR/commit body. If `unknown rows` > 300 or `raw≠running` > 30, stop and report to the coordinator before continuing: the rules need a new case, not the agents.

- [ ] **Step 6: Commit**

```bash
git add tools/ledger-import/inventory.py tools/ledger-import/tests/test_inventory.py
git commit -q -m "ledger-import: inventory — every sheet becomes a node with normalised rows, raw vs cached balance

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `map_helper.py` and the hand-written `work/map.json` (coordinator)

**Files:**
- Create: `tools/ledger-import/map_helper.py`
- Create (local, gitignored): `tools/ledger-import/work/map.json`

**Interfaces:**
- Consumes: `work/inventory.json`, `work/roster.xlsx` (the «Κατάσταση οδηγών.xlsx», Drive id `1-U_cePjdB9YHntTXdhdg50xYm-WrLUCY`, fetched with `rclone backend copyid`), and the current DRIVERS list pasted by the coordinator into `work/drivers.json` as `[[id, full_name, active], …]` (SQL: `select id, full_name, active from drivers where deleted_at is null order by 2;`).
- Produces: `work/map.json`:

```json
{
  "ΠΑΠΠΗΣ ΓΙΑΝΝΗΣ": {"driver_id": 8, "files": ["1eKbZ3pyTVvzj7o9Z3LqReFUi8RPm0GOk"], "crosscheck": ["1NdT7iCJuhTEbGDOU5jUpbJmmYog-dq15"]},
  "ΚΑΓΚΕΛΙΔΗΣ ΝΙΚΟΣ": {"driver_id": null, "create": {"Full Name": "Kagkelidis Nikos", "Phone": "69xxxxxxxx", "Active": true}, "files": ["1mhEZ84CI1VxszhsJMbRgGki8jcIgVc_T"], "crosscheck": []},
  "ΤΣΕΧΟΣ": {"alias_of": "ΒΛΑΧΟΠΟΥΛΟΣ ΧΡΗΣΤΟΣ"}
}
```
  Keys are the Greek *driver key* (file stem without year suffixes). `files` = canonical workbooks in chronological order (usually one). `crosscheck` = older copies. `alias_of` folds a nickname file into another key as crosscheck.

- [ ] **Step 1: Write `map_helper.py`**

```python
#!/usr/bin/env python3
"""Print what the coordinator needs to write work/map.json by hand: one block per
Greek driver key with its workbooks (newest first), the roster phone if the
surname appears in «Κατάσταση οδηγών», and the DB rows sharing a transliterated
surname. Automatic matching was tried and rejected: it paired first names."""
import json, os, re, sys, unicodedata
import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__)); WORK = os.path.join(HERE, 'work')
GR = {'Α':'A','Β':'V','Γ':'G','Δ':'D','Ε':'E','Ζ':'Z','Η':'I','Θ':'TH','Ι':'I','Κ':'K','Λ':'L','Μ':'M','Ν':'N','Ξ':'X','Ο':'O','Π':'P','Ρ':'R','Σ':'S','Τ':'T','Υ':'Y','Φ':'F','Χ':'CH','Ψ':'PS','Ω':'O'}

def strip(s):
    s = unicodedata.normalize('NFD', s.upper()); return ''.join(c for c in s if unicodedata.category(c) != 'Mn')

def translit(s):
    s = strip(s).replace('ΜΠ', 'B').replace('ΝΤ', 'D').replace('ΓΚ', 'G').replace('ΟΥ', 'OU')
    return ''.join(GR.get(c, c) for c in s)

def driver_key(name):
    stem = re.sub(r'\.xlsx$', '', name)
    return re.sub(r'\s*(\d{4}.*|ΑΠΟ .*|ΕΩΣ .*|κατεστραμ.*)$', '', stem).strip()

def roster_phones():
    p = os.path.join(WORK, 'roster.xlsx')
    if not os.path.exists(p): return {}
    ws = openpyxl.load_workbook(p, data_only=True).worksheets[0]
    out = {}
    for r in ws.iter_rows(min_row=3, values_only=True):
        if r[2] and r[3]: out[strip(str(r[2]).split()[0])] = str(r[3])
    return out

def main():
    inv = json.load(open(os.path.join(WORK, 'inventory.json'), encoding='utf-8'))
    drivers = json.load(open(os.path.join(WORK, 'drivers.json'), encoding='utf-8'))
    phones = roster_phones()
    by_key = {}
    for n in inv['nodes']:
        by_key.setdefault(driver_key(n['file_name']), {}).setdefault(n['file_id'], n)
    for key in sorted(by_key):
        sur = strip(key.split()[0]); t = translit(sur)[:5]
        cands = [d for d in drivers if strip(d[1]).upper().replace(' ', '').find(t) >= 0 or t in translit(d[1])]
        print('\n== %s   phone=%s' % (key, phones.get(sur, '-')))
        for fid, n in sorted(by_key[key].items(), key=lambda kv: kv[1]['modified'], reverse=True):
            print('   %s  %-11s %s  %s..%s  sheets=%d' % (fid, n['folder'], n['modified'][:10], n['first_date'], n['last_date'],
                  sum(1 for m in inv['nodes'] if m['file_id'] == fid)))
        for d in cands: print('   DB candidate: id=%s %s active=%s' % tuple(d))

if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Coordinator fetches roster and drivers list, runs helper**

```bash
rclone backend copyid petras-drive: 1-U_cePjdB9YHntTXdhdg50xYm-WrLUCY tools/ledger-import/work/roster.xlsx
# coordinator: run the SQL via Supabase MCP (SELECT), save result as work/drivers.json [[id, full_name, active], ...]
python3 tools/ledger-import/map_helper.py > tools/ledger-import/work/map_helper.out
```

- [ ] **Step 3: Coordinator writes `work/map.json` by hand**

Rules while writing (from the 5/9 analysis):
- One entry per Greek key. `driver_id` from DB when the surname **and** first name agree; nickname keys (ΝΤΡΑΓΚΑΝ/ΝΤΡΑΚΑΝ → Adjimanov Dragan, ΑΙΜΙΛΙΟΣ → Eksuzyan Emil, ΤΣΕΧΟΣ → alias of ΒΛΑΧΟΠΟΥΛΟΣ, ΠΑΡΑΣΤΑΤΙΔΗΣ ΣΑΜΨΩΝ → Nakis Parastatidis) are set explicitly.
- ΧΡΥΣΟΥΛΙΔΗΣ → id 13 (has RTs); id 1 is listed under a top-level key `"_report"` as `"duplicate_driver_ids": [1]`.
- Same-surname different-first-name (ΒΑΙΝΑΛΗΣ ΝΙΚΟΣ vs Vainallis Konstantinos, ΤΟΥΡΑΝΤΖΙΔΗΣ ΛΕΩΝΙΔΑΣ vs Makis, ΚΩΣΤΑΣ ΜΟΥΡΑΤΙΔΗΣ vs Charalampos, ΜΥΛΩΝΑΣ ΓΙΑΝΝΗΣ vs Lazaros) are **different people** ⇒ `create`.
- `create.Active` = `true` if the newest workbook is in root, else `false`. `Full Name` = «Surname Firstname» transliterated like the neighbours in the DB (e.g. Kagkelidis Nikos, Anastasiou Spyros, Karagiannopoulos Iordanis, Vainalis Nikos, Touratzidis Leonidas, Sideris Dimitris, Mpagiatis Vangelis, Doumos Dimitris, Gravas Thomas, Mouratidis Kostas). `Phone` only when the roster has it.
- `files` = canonical workbooks (newest first; multiple only when they cover different periods). Everything else of the same key ⇒ `crosscheck`.

- [ ] **Step 4: Validate the map shape**

Run:
```bash
python3 - <<'PY'
import json; m=json.load(open('tools/ledger-import/work/map.json',encoding='utf-8'))
inv=json.load(open('tools/ledger-import/work/inventory.json',encoding='utf-8'))
ids={n['file_id'] for n in inv['nodes']}
used=set(); bad=[]
for k,v in m.items():
    if k.startswith('_') or 'alias_of' in v: continue
    if not (v.get('driver_id') or v.get('create')): bad.append((k,'no driver_id and no create'))
    for f in v.get('files',[])+v.get('crosscheck',[]):
        if f not in ids: bad.append((k,'unknown file '+f))
        if f in used: bad.append((k,'file used twice '+f))
        used.add(f)
print('keys',len(m),'files covered',len(used),'of',len(ids),'problems',bad[:10])
PY
```
Expected: `problems []` and `files covered` = every workbook id in the inventory (uncovered ids must be listed under `"_report": {"unmapped_files": [...]}` with a reason).

- [ ] **Step 5: Commit the helper only**

```bash
git add tools/ledger-import/map_helper.py
git commit -q -m "ledger-import: map helper — prints keys, workbooks, roster phone, DB candidates for the hand-written map

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Export the auto RT rows (coordinator, SELECT only)

**Files:**
- Create (local): `tools/ledger-import/work/auto_rows.json`

**Interfaces:**
- Produces: `[{dl_id, driver_id, entry_date, date_end, rt_id, rt_code, trip_value, advance, expenses, note}]` — one per live `source='auto'` row. `verify_plan.py` and analysts read it; `commit.py` re-reads it to refuse PATCHing a non-NULL field.

- [ ] **Step 1: Coordinator runs the SQL through the Supabase MCP and saves the JSON**

```sql
select e.id as dl_id, e.driver_id, e.entry_date, e.date_end, e.rt_id, rt.code as rt_code,
       e.trip_value, e.advance, e.expenses, e.note
from dl_entries e left join ct_round_trips rt on rt.id = e.rt_id
where e.source = 'auto' and e.deleted_at is null
order by e.driver_id, e.entry_date, e.id;
```
Save the result array verbatim as `tools/ledger-import/work/auto_rows.json`.

- [ ] **Step 2: Check**

Run: `python3 -c "import json;a=json.load(open('tools/ledger-import/work/auto_rows.json'));print(len(a), sorted({r['driver_id'] for r in a}))"`
Expected: `44` (or the live count) and 19 driver ids. All `trip_value/advance/expenses` null except any the team filled since 5/9 — those rows are excluded from matching by `verify_plan.py`.

---

### Task 6: `verify_plan.py` — invariants over a plan

**Files:**
- Create: `tools/ledger-import/verify_plan.py`
- Test: `tools/ledger-import/tests/test_verify_plan.py`

**Interfaces:**
- Consumes: plan JSON (schema above), `work/inventory.json`, `work/auto_rows.json`, `work/map.json`.
- Produces: `verify(plan, inventory_nodes, auto_rows, map_entry) -> list[str]` (empty = ok). CLI: `python3 verify_plan.py [work/plans/*.json]` prints `OK key` or `REJECT key: reason; reason` and exits 1 if any reject.

- [ ] **Step 1: Write the failing tests**

```python
# tools/ledger-import/tests/test_verify_plan.py
import unittest, sys, os, copy
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from verify_plan import verify

NODE = {'file_id': 'F1', 'file_name': 'X.xlsx', 'sheet': 'S1', 'out_of_scope': False, 'raw_final': '100.00', 'running_last': '100.00', 'running_consistent': True, 'expected_final': '100.00',
        'rows': [{'row': 4, 'entry': {'entry_type': 'trip', 'entry_date': '2024-01-10', 'date_end': None, 'route': 'A', 'trip_value': 400.0, 'advance': 300.0, 'expenses': None}, 'date_problem': None},
                 {'row': 5, 'entry': {'entry_type': 'payment_cash', 'entry_date': '2024-02-01', 'amount': 0.0}, 'date_problem': None}],
        'unknown': []}
AUTO = [{'dl_id': 900, 'driver_id': 8, 'entry_date': '2026-08-14', 'trip_value': None, 'advance': None, 'expenses': None}]
MAP = {'driver_id': 8, 'files': ['F1'], 'crosscheck': []}

def plan(**over):
    p = {'driver_key': 'X', 'driver_id': 8, 'create_driver': None,
         'nodes': [{'file_id': 'F1', 'sheet': 'S1', 'role': 'chain', 'expected_final': '100.00'}],
         'batches': [{'file_id': 'F1', 'file_name': 'X.xlsx', 'expected_final': '100.00',
                      'rows': [{'entry_type': 'trip', 'entry_date': '2024-01-10', 'route': 'A', 'trip_value': 400.0, 'advance': 300.0, 'src': {'sheet': 'S1', 'row': 4}}]}],
         'patches': [{'dl_id': 900, 'trip_value': 450.0, 'advance': 300.0, 'expenses': 0.0, 'note': 'Excel: B', 'src': {'sheet': 'S1', 'row': 6}}],
         'cutoff': '2026-08-13', 'auto_unmatched': [], 'date_fixes': [], 'needs_decision': [],
         'expected_total_balance': '250.00', 'status': 'ready'}
    p.update(over); return p

class TestVerify(unittest.TestCase):
    def test_ok(self):
        self.assertEqual(verify(plan(), [NODE], AUTO, MAP), [])
    def test_batch_balance_mismatch(self):
        p = plan(); p['batches'][0]['rows'][0]['trip_value'] = 100.0
        self.assertTrue(any('batch balance' in e for e in verify(p, [NODE], AUTO, MAP)))
    def test_rt_id_in_import_row_rejected(self):
        p = plan(); p['batches'][0]['rows'][0]['rt_id'] = 5
        self.assertTrue(any('rt_id' in e for e in verify(p, [NODE], AUTO, MAP)))
    def test_patch_on_written_field_rejected(self):
        auto = copy.deepcopy(AUTO); auto[0]['trip_value'] = 10.0
        self.assertTrue(any('not NULL' in e for e in verify(plan(), [NODE], auto, MAP)))
    def test_patch_wrong_driver_rejected(self):
        auto = copy.deepcopy(AUTO); auto[0]['driver_id'] = 9
        self.assertTrue(any('driver' in e for e in verify(plan(), [NODE], auto, MAP)))
    def test_duplicate_patch_target(self):
        p = plan(); p['patches'].append(dict(p['patches'][0]))
        self.assertTrue(any('twice' in e for e in verify(p, [NODE], AUTO, MAP)))
    def test_payment_zero_rejected(self):
        p = plan(); p['batches'][0]['rows'].append({'entry_type': 'payment_cash', 'entry_date': '2024-02-01', 'amount': 0.0, 'src': {'sheet': 'S1', 'row': 5}})
        self.assertTrue(any('amount' in e for e in verify(p, [NODE], AUTO, MAP)))
    def test_total_balance_mismatch(self):
        p = plan(expected_total_balance='999.00')
        self.assertTrue(any('total' in e for e in verify(p, [NODE], AUTO, MAP)))
    def test_needs_decision_status_skips_balance_checks_but_needs_reasons(self):
        p = plan(status='needs_decision', needs_decision=[])
        self.assertTrue(any('needs_decision' in e for e in verify(p, [NODE], AUTO, MAP)))
    def test_inconsistent_node_rejected(self):
        node = dict(NODE); node['running_consistent'] = False
        self.assertTrue(any('inconsistent' in e for e in verify(plan(), [node], AUTO, MAP)))
    def test_file_not_in_map(self):
        self.assertTrue(any('map' in e for e in verify(plan(), [NODE], AUTO, {'driver_id': 8, 'files': [], 'crosscheck': []})))

if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd tools/ledger-import && python3 -m unittest tests.test_verify_plan 2>&1 | tail -2`
Expected: `ModuleNotFoundError: No module named 'verify_plan'`

- [ ] **Step 3: Write `verify_plan.py`**

```python
#!/usr/bin/env python3
"""Deterministic gate between the analysts and the write path. An LLM wrote the
plan; this file refuses anything the Worker or the arithmetic would refuse later,
so a rejection costs seconds instead of a cancelled batch."""
import glob, json, os, sys
from decimal import Decimal
from rules import d2

HERE = os.path.dirname(os.path.abspath(__file__)); WORK = os.path.join(HERE, 'work')
TYPES = ('trip', 'payment_cash', 'payment_bank', 'adjustment')
ROW_FIELDS = {'entry_type', 'entry_date', 'date_end', 'route', 'trip_value', 'advance', 'expenses', 'amount', 'note', 'src'}

def row_delta(r):
    if r['entry_type'] == 'trip':
        return d2(r.get('trip_value')) - (d2(r.get('advance')) - d2(r.get('expenses')))
    if r['entry_type'] == 'adjustment': return d2(r['amount'])
    return -d2(r['amount'])

def verify(plan, nodes, auto_rows, map_entry):
    errs = []
    key = plan.get('driver_key', '?')
    if plan.get('status') == 'needs_decision':
        if not plan.get('needs_decision'): errs.append('status needs_decision without reasons')
        return errs
    if plan.get('status') != 'ready': errs.append('status must be ready or needs_decision'); return errs
    if not plan.get('driver_id') and not plan.get('create_driver'): errs.append('neither driver_id nor create_driver')
    if map_entry is None: errs.append('driver key not in map'); return errs
    by_id = {(n['file_id'], n['sheet']): n for n in nodes}
    chain = [n for n in plan.get('nodes', []) if n.get('role') == 'chain']
    for n in chain:
        if n['file_id'] not in map_entry.get('files', []): errs.append('chain file %s not a canonical file in map' % n['file_id'])
        src = by_id.get((n['file_id'], n['sheet']))
        if src is None: errs.append('chain node %s/%s not in inventory' % (n['file_id'], n['sheet'])); continue
        if src['out_of_scope']: errs.append('chain node %s is out_of_scope layout' % n['sheet'])
        if src['unknown']: errs.append('chain node %s has %d unknown rows — must be needs_decision' % (n['sheet'], len(src['unknown'])))
        if any(r['date_problem'] for r in src['rows']): errs.append('chain node %s has unrepaired dates' % n['sheet'])
        if src.get('running_consistent') is False: errs.append('chain node %s: Excel ΠΡΟΟΔΕΥΤΙΚΟ inconsistent with rows — needs_decision' % n['sheet'])
    auto = {a['dl_id']: a for a in auto_rows}
    total = Decimal('0')
    for b in plan.get('batches', []):
        bal = Decimal('0')
        for i, r in enumerate(b.get('rows', []), 1):
            extra = set(r) - ROW_FIELDS
            if extra: errs.append('batch %s row %d has forbidden fields %s' % (b['file_id'], i, sorted(extra)))   # rt_id lands here
            if r.get('entry_type') not in TYPES: errs.append('batch %s row %d bad entry_type' % (b['file_id'], i)); continue
            if not r.get('entry_date'): errs.append('batch %s row %d no entry_date' % (b['file_id'], i))
            if r['entry_type'] == 'trip' and not r.get('route'): errs.append('batch %s row %d trip without route' % (b['file_id'], i))
            if r['entry_type'] != 'trip' and not (isinstance(r.get('amount'), (int, float)) and (r['amount'] != 0 if r['entry_type'] == 'adjustment' else r['amount'] > 0)):
                errs.append('batch %s row %d amount must be > 0 (≠ 0 for adjustment)' % (b['file_id'], i))
            bal += row_delta(r)
        if str(bal.quantize(Decimal('0.01'))) != str(d2(b.get('expected_final'))):
            errs.append('batch %s balance %s ≠ expected_final %s' % (b['file_id'], bal, b.get('expected_final')))
        total += bal
    seen = set()
    for p in plan.get('patches', []):
        a = auto.get(p.get('dl_id'))
        if a is None: errs.append('patch dl_id %s not an auto row' % p.get('dl_id')); continue
        if a['driver_id'] != plan.get('driver_id'): errs.append('patch dl_id %s belongs to driver %s' % (p['dl_id'], a['driver_id']))
        if p['dl_id'] in seen: errs.append('auto row %s patched twice' % p['dl_id'])
        seen.add(p['dl_id'])
        for f in ('trip_value', 'advance', 'expenses'):
            if f in p and p[f] is not None and a.get(f) is not None: errs.append('patch dl_id %s: %s is not NULL on the auto row' % (p['dl_id'], f))
        total += d2(p.get('trip_value')) - (d2(p.get('advance')) - d2(p.get('expenses')))
    if str(total.quantize(Decimal('0.01'))) != str(d2(plan.get('expected_total_balance'))):
        errs.append('total balance %s ≠ expected_total_balance %s' % (total, plan.get('expected_total_balance')))
    return errs

def main(paths):
    inv = json.load(open(os.path.join(WORK, 'inventory.json'), encoding='utf-8'))['nodes']
    auto = json.load(open(os.path.join(WORK, 'auto_rows.json'), encoding='utf-8'))
    m = json.load(open(os.path.join(WORK, 'map.json'), encoding='utf-8'))
    bad = 0
    for p in sorted(paths or glob.glob(os.path.join(WORK, 'plans', '*.json'))):
        plan = json.load(open(p, encoding='utf-8'))
        errs = verify(plan, inv, auto, m.get(plan.get('driver_key')))
        if errs: bad += 1; print('REJECT %s: %s' % (plan.get('driver_key'), '; '.join(errs)))
        else: print('OK %s (%s)' % (plan.get('driver_key'), plan.get('status')))
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main(sys.argv[1:])
```

- [ ] **Step 4: Run tests**

Run: `cd tools/ledger-import && python3 -m unittest tests.test_verify_plan -v 2>&1 | tail -3`
Expected: `OK` (11 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/ledger-import/verify_plan.py tools/ledger-import/tests/test_verify_plan.py
git commit -q -m "ledger-import: verify_plan — arithmetic, NULL-only patches, forbidden fields, one match per auto row

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Analyst and reviewer prompts

**Files:**
- Create: `tools/ledger-import/prompts/ANALYST.md`
- Create: `tools/ledger-import/prompts/REVIEWER.md`

**Interfaces:**
- Consumes: `work/inventory.json`, `work/map.json`, `work/auto_rows.json`.
- Produces: analysts write `work/plans/<driver_key>.json` (schema in File Structure); reviewers write `work/reviews/<driver_key>.json` = `{"driver_key", "verdict": "ok"|"reject", "reasons": [], "checked": {"chain": true, "duplicates": true, "dates": true, "rt_matches": true}}`.

- [ ] **Step 1: Write `ANALYST.md`**

````markdown
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
````

- [ ] **Step 2: Write `REVIEWER.md`**

````markdown
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
````

- [ ] **Step 3: Commit**

```bash
git add tools/ledger-import/prompts/
git commit -q -m "ledger-import: analyst (Haiku) and reviewer (Sonnet) instructions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: `report.py` — owner table and docs-safe summary

**Files:**
- Create: `tools/ledger-import/report.py`

**Interfaces:**
- Consumes: `work/plans/*.json`, `work/reviews/*.json`, `work/map.json`, `work/inventory.json`, `work/auto_rows.json`.
- Produces: `work/report.md` (for the owner, with names and amounts — local only) and `work/report-public.md` (counts and categories only, to be pasted into `docs/data-audit/2026-09/…`). Function `build(plans, reviews, mapping, nodes, auto) -> (owner_md, public_md)`.

- [ ] **Step 1: Write `report.py`**

```python
#!/usr/bin/env python3
"""Two views of the same run. The owner view has names next to balances and
lives only in work/. The public view has counts and categories and is the only
thing that goes into docs/ — the repo is public."""
import glob, json, os, collections

HERE = os.path.dirname(os.path.abspath(__file__)); WORK = os.path.join(HERE, 'work')

def load_dir(sub):
    return {json.load(open(p, encoding='utf-8'))['driver_key']: json.load(open(p, encoding='utf-8'))
            for p in glob.glob(os.path.join(WORK, sub, '*.json'))}

def build(plans, reviews, mapping, nodes, auto):
    owner, pub = [], []
    owner.append('# Εισαγωγή καρτελών — dry run\n')
    owner.append('| Οδηγός | id | Κατάσταση | Review | Γραμμές | Δρομ. | Πληρ. | PATCH RT | Υπόλοιπο | Εκτός | Σημειώσεις |')
    owner.append('|---|---|---|---|---|---|---|---|---|---|---|')
    kinds = collections.Counter(); status = collections.Counter(); decisions = collections.Counter()
    unknown_desc = collections.Counter(); matches = []; creates = []
    for key in sorted(plans):
        p = plans[key]; r = reviews.get(key, {}); rows = [x for b in p['batches'] for x in b['rows']]
        c = collections.Counter(x['entry_type'] for x in rows); kinds.update(c)
        status[(p['status'], r.get('verdict', '—'))] += 1
        outs = sum(1 for n in p['nodes'] if n['role'] != 'chain')
        notes = []
        if p.get('create_driver'): notes.append('ΝΕΟΣ ΟΔΗΓΟΣ'); creates.append((key, p['create_driver']))
        if p.get('date_fixes'): notes.append('%d διορθ. έτους' % len(p['date_fixes']))
        if p.get('auto_unmatched'): notes.append('%d auto χωρίς Excel' % len(p['auto_unmatched']))
        for d in p.get('needs_decision', []): decisions[d.split(':')[0]] += 1
        owner.append('| %s | %s | %s | %s | %d | %d | %d | %d | %s | %d | %s |' % (
            key, p.get('driver_id') or '—', p['status'], r.get('verdict', '—'), len(rows), c['trip'],
            c['payment_cash'] + c['payment_bank'], len(p['patches']), p['expected_total_balance'], outs, ', '.join(notes)))
        for m in p['patches']: matches.append((key, m['dl_id'], m.get('note', ''), m.get('trip_value'), m.get('advance'), m.get('expenses')))
    for n in nodes:
        for u in n['unknown']: unknown_desc[str(u['cells'].get('route'))[:40]] += 1
    owner.append('\n## Ταιριάσματα Excel → auto RT (PATCH)\n')
    owner.append('| Οδηγός | dl_id | Excel | Αξία | Έλαβε | Έξοδα |\n|---|---|---|---|---|---|')
    owner += ['| %s | %s | %s | %s | %s | %s |' % m for m in matches]
    owner.append('\n## Νέοι οδηγοί που θα δημιουργηθούν\n')
    owner += ['- %s → %s' % (k, json.dumps(c, ensure_ascii=False)) for k, c in creates]
    owner.append('\n## Θέλει απόφαση\n')
    for key in sorted(plans):
        for d in plans[key].get('needs_decision', []): owner.append('- **%s**: %s' % (key, d))
    owner.append('\n## Άγνωστες περιγραφές γραμμών (όλοι οι οδηγοί)\n')
    owner += ['- %s × %d' % (k, v) for k, v in unknown_desc.most_common()]
    pub.append('# Εισαγωγή ιστορικού μισθοδοσίας — συγκεντρωτικά\n')
    pub.append('- Οδηγοί με σχέδιο: %d · έτοιμα/ok: %d · θέλουν απόφαση: %d' % (len(plans), status[('ready', 'ok')], sum(v for k, v in status.items() if k[0] == 'needs_decision')))
    pub.append('- Γραμμές προς εισαγωγή: %d (δρομολόγια %d, μετρητά %d, κατάθεση %d, προσαρμογές %d)' % (sum(kinds.values()), kinds['trip'], kinds['payment_cash'], kinds['payment_bank'], kinds['adjustment']))
    pub.append('- PATCH σε auto γραμμές RT: %d · auto χωρίς αντίστοιχο Excel: %d' % (len(matches), sum(len(p.get('auto_unmatched', [])) for p in plans.values())))
    pub.append('- Νέοι οδηγοί: %d · κόμβοι εκτός (duplicate/out_of_scope): %d' % (len(creates), sum(1 for p in plans.values() for n in p['nodes'] if n['role'] != 'chain')))
    pub.append('- Κατηγορίες «θέλει απόφαση»: ' + ', '.join('%s (%d)' % kv for kv in decisions.most_common()))
    return '\n'.join(owner) + '\n', '\n'.join(pub) + '\n'

def main():
    plans = load_dir('plans'); reviews = load_dir('reviews')
    m = json.load(open(os.path.join(WORK, 'map.json'), encoding='utf-8'))
    nodes = json.load(open(os.path.join(WORK, 'inventory.json'), encoding='utf-8'))['nodes']
    auto = json.load(open(os.path.join(WORK, 'auto_rows.json'), encoding='utf-8'))
    o, p = build(plans, reviews, m, nodes, auto)
    open(os.path.join(WORK, 'report.md'), 'w', encoding='utf-8').write(o)
    open(os.path.join(WORK, 'report-public.md'), 'w', encoding='utf-8').write(p)
    print(p)

if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Smoke test with one hand-made plan**

Run (after at least one plan exists): `python3 tools/ledger-import/report.py | head -8`
Expected: the five public bullet lines with numbers; `work/report.md` opens with the owner table.

- [ ] **Step 3: Commit**

```bash
git add tools/ledger-import/report.py
git commit -q -m "ledger-import: report — owner table (local) and docs-safe summary

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: `commit.py` — the single write path

**Files:**
- Create: `tools/ledger-import/commit.py`
- Test: `tools/ledger-import/tests/test_commit.py`

**Interfaces:**
- Consumes: `work/plans/*.json` with review `ok` and `verify_plan` ok; `work/map.json`; `work/auto_rows.json`; `work/xlsx/` (for sha256); `.env.local` `TMS_JWT`.
- Produces: `work/state.json` `{driver_key: {driver_id, batches: {file_id: batch_uuid}, patched: [dl_id], proof: {...}, done: bool}}`, `work/logs/commit-<ts>.log`. Functions: `ensure_driver(api, key, plan, mapping, state)`, `import_batch(api, plan, batch)`, `apply_patches(api, plan, auto, state)`, `proof(api, plan)`, `run(plans, ..., commit=False)`. `Api` class with `post(path, body)`, `patch(path, body)`, `get(path)` over `urllib`, raising `ApiError(status, text)`.

Worker facts used (verified 5/9 in `worker/src/index.js`):
- `POST /costs/ledger/import` body `{driver_id, file_name, file_hash, rows[]}` → `201 {batch, rows, balance}`; `409` if `file_hash` seen; rows may not carry `rt_id`.
- `PATCH /costs/ledger/:id` body with trip fields (+`note`) → `200` updated row; `400 reason required…` when a field was already written.
- `GET /costs/ledger/:driverId` → `{records: [dl_v_entries rows, newest first, with running_balance], rts: [...]}`.
- `GET /costs/lookups` → `{drivers: [{id, legacy_id, full_name, active}], …}`.
- Facade `POST /v0/appElT5CQV6JQvym8/tbl7UGmYhc2Y82pPs` body `{fields: {"Full Name", "Phone", "Active"}}` → `{id: <legacy_id>, fields}`; numeric id resolved via `/costs/lookups` by `legacy_id`.

- [ ] **Step 1: Write the failing tests**

```python
# tools/ledger-import/tests/test_commit.py
import unittest, sys, os, json
from unittest.mock import MagicMock
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import commit as C

def api_with(responses):
    api = MagicMock()
    api.post.side_effect = responses.get('post', [])
    api.patch.side_effect = responses.get('patch', [])
    api.get.side_effect = responses.get('get', [])
    return api

PLAN = {'driver_key': 'X', 'driver_id': None, 'create_driver': {'Full Name': 'X Y', 'Active': True},
        'batches': [{'file_id': 'F1', 'file_name': 'X.xlsx', 'expected_final': '100.00',
                     'rows': [{'entry_type': 'trip', 'entry_date': '2024-01-10', 'route': 'A', 'trip_value': 400.0, 'advance': 300.0, 'src': {'sheet': 'S', 'row': 4}}]}],
        'patches': [{'dl_id': 900, 'trip_value': 450.0, 'advance': 300.0, 'note': 'Excel: B', 'src': {'sheet': 'S', 'row': 6}}],
        'expected_total_balance': '250.00', 'status': 'ready'}

class TestCommit(unittest.TestCase):
    def test_ensure_driver_creates_then_resolves_numeric_id(self):
        api = api_with({'post': [{'id': 'recNEW', 'fields': {'Full Name': 'X Y'}}],
                        'get': [{'drivers': [{'id': 77, 'legacy_id': 'recNEW', 'full_name': 'X Y', 'active': True}]}]})
        state = {}
        self.assertEqual(C.ensure_driver(api, dict(PLAN), state), 77)
        api.post.assert_called_once_with('/v0/appElT5CQV6JQvym8/tbl7UGmYhc2Y82pPs', {'fields': {'Full Name': 'X Y', 'Active': True}})
        self.assertEqual(state['X']['driver_id'], 77)

    def test_ensure_driver_is_idempotent_from_state(self):
        api = api_with({})
        self.assertEqual(C.ensure_driver(api, dict(PLAN), {'X': {'driver_id': 77}}), 77)
        api.post.assert_not_called()

    def test_import_batch_strips_src_and_checks_balance(self):
        api = api_with({'post': [{'batch': 'b1', 'rows': 1, 'balance': '100.00'}]})
        out = C.import_batch(api, 8, PLAN['batches'][0], file_hash='abc')
        body = api.post.call_args[0][1]
        self.assertEqual(body['driver_id'], 8); self.assertEqual(body['file_hash'], 'abc')
        self.assertNotIn('src', body['rows'][0]); self.assertNotIn('rt_id', body['rows'][0])
        self.assertEqual(out['batch'], 'b1')

    def test_import_batch_balance_mismatch_raises(self):
        api = api_with({'post': [{'batch': 'b1', 'rows': 1, 'balance': '99.00'}]})
        with self.assertRaises(C.Mismatch): C.import_batch(api, 8, PLAN['batches'][0], file_hash='abc')

    def test_apply_patches_only_null_fields(self):
        api = api_with({'patch': [{'id': 900}]})
        auto = [{'dl_id': 900, 'driver_id': 8, 'trip_value': None, 'advance': None, 'expenses': None}]
        C.apply_patches(api, 8, PLAN['patches'], auto, {'X': {}}, 'X')
        api.patch.assert_called_once_with('/costs/ledger/900', {'trip_value': 450.0, 'advance': 300.0, 'note': 'Excel: B'})

    def test_apply_patches_refuses_written_field(self):
        api = api_with({})
        auto = [{'dl_id': 900, 'driver_id': 8, 'trip_value': 1.0, 'advance': None, 'expenses': None}]
        with self.assertRaises(C.Mismatch): C.apply_patches(api, 8, PLAN['patches'], auto, {'X': {}}, 'X')
        api.patch.assert_not_called()

    def test_proof_uses_newest_running_balance(self):
        api = api_with({'get': [{'records': [{'id': 2, 'running_balance': '250.00'}, {'id': 1, 'running_balance': '100.00'}], 'rts': []}]})
        self.assertEqual(C.proof(api, 8), '250.00')

if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd tools/ledger-import && python3 -m unittest tests.test_commit 2>&1 | tail -2`
Expected: `ModuleNotFoundError: No module named 'commit'`

- [ ] **Step 3: Write `commit.py`**

```python
#!/usr/bin/env python3
"""The only file that writes. Dry run by default. Sequential per driver:
ensure driver → import each batch → PATCH matched auto rows → GET proof.
A mismatch stops the whole run (nothing after it is attempted) and prints the
batch ids so the owner can decide on dl_cancel_batch."""
import argparse, datetime as dt, glob, hashlib, json, os, sys, urllib.error, urllib.request
from decimal import Decimal
from rules import d2

HERE = os.path.dirname(os.path.abspath(__file__)); WORK = os.path.join(HERE, 'work')
PROXY = 'https://petras-tms-backend-staging.petrasgroup.workers.dev'
DRIVERS_PATH = '/v0/appElT5CQV6JQvym8/tbl7UGmYhc2Y82pPs'

class ApiError(Exception):
    def __init__(self, status, text): super().__init__('HTTP %s: %s' % (status, text[:300])); self.status = status
class Mismatch(Exception): pass

class Api:
    def __init__(self, token, log): self.token, self.log = token, log
    def _req(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(PROXY + path, data=data, method=method,
                                     headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + self.token})
        self.log.write('%s %s %s\n' % (dt.datetime.now().isoformat(timespec='seconds'), method, path))   # never the token, never the body
        try:
            with urllib.request.urlopen(req, timeout=60) as res: return json.load(res)
        except urllib.error.HTTPError as e: raise ApiError(e.code, e.read().decode(errors='replace'))
    def post(self, path, body): return self._req('POST', path, body)
    def patch(self, path, body): return self._req('PATCH', path, body)
    def get(self, path): return self._req('GET', path)

def read_token():
    for line in open(os.path.join(HERE, '..', '..', '.env.local'), encoding='utf-8'):
        if line.startswith('TMS_JWT='): return line.split('=', 1)[1].strip().strip('"')
    sys.exit('✗ TMS_JWT missing from .env.local (owner token, 8h) — the owner pastes it, agents never see it')

def ensure_driver(api, plan, state):
    key = plan['driver_key']; st = state.setdefault(key, {})
    if st.get('driver_id'): return st['driver_id']
    if plan.get('driver_id'): st['driver_id'] = plan['driver_id']; return st['driver_id']
    fields = {k: v for k, v in plan['create_driver'].items() if v not in (None, '')}
    rec = api.post(DRIVERS_PATH, {'fields': fields})
    legacy = rec['id']
    # the facade answers with legacy_id only; the numeric id lives in /costs/lookups
    drivers = api.get('/costs/lookups')['drivers']
    match = [d for d in drivers if d.get('legacy_id') == legacy]
    if len(match) != 1: raise Mismatch('created driver %s not found in lookups by legacy_id %s' % (fields, legacy))
    st['driver_id'] = match[0]['id']; st['created_legacy_id'] = legacy
    return st['driver_id']

def clean_rows(rows):
    return [{k: v for k, v in r.items() if k != 'src' and v is not None} for r in rows]

def import_batch(api, driver_id, batch, file_hash):
    body = {'driver_id': driver_id, 'file_name': batch['file_name'], 'file_hash': file_hash, 'rows': clean_rows(batch['rows'])}
    out = api.post('/costs/ledger/import', body)
    if d2(out['balance']) != d2(batch['expected_final']):
        raise Mismatch('batch %s server balance %s ≠ expected %s' % (out['batch'], out['balance'], batch['expected_final']))
    return out

def apply_patches(api, driver_id, patches, auto_rows, state, key):
    auto = {a['dl_id']: a for a in auto_rows}
    done = state[key].setdefault('patched', [])
    for p in patches:
        if p['dl_id'] in done: continue
        a = auto.get(p['dl_id'])
        if a is None or a['driver_id'] != driver_id: raise Mismatch('patch %s: not an auto row of driver %s' % (p['dl_id'], driver_id))
        body = {k: p[k] for k in ('trip_value', 'advance', 'expenses', 'note') if k in p and p[k] is not None}
        for f in ('trip_value', 'advance', 'expenses'):
            if f in body and a.get(f) is not None: raise Mismatch('patch %s: %s already written on the auto row' % (p['dl_id'], f))
        api.patch('/costs/ledger/%d' % p['dl_id'], body)
        done.append(p['dl_id'])

def proof(api, driver_id):
    recs = api.get('/costs/ledger/%d' % driver_id)['records']
    return str(d2(recs[0]['running_balance'])) if recs else '0.00'

def file_sha(file_id, index):
    local = next(i['local'] for i in index if i['id'] == file_id)
    return hashlib.sha256(open(local, 'rb').read()).hexdigest()

def run(plans, reviews, auto_rows, index, api, state, commit):
    for key in sorted(plans):
        plan = plans[key]
        if plan['status'] != 'ready' or reviews.get(key, {}).get('verdict') != 'ok':
            print('skip %s (%s / %s)' % (key, plan['status'], reviews.get(key, {}).get('verdict'))); continue
        if state.get(key, {}).get('done'): print('done already %s' % key); continue
        print('%s %s: %d batches, %d patches, expect %s' % ('COMMIT' if commit else 'dry', key, len(plan['batches']), len(plan['patches']), plan['expected_total_balance']))
        if not commit: continue
        driver_id = ensure_driver(api, plan, state)
        st = state[key]; st.setdefault('batches', {})
        for b in plan['batches']:
            if b['file_id'] in st['batches']: continue
            out = import_batch(api, driver_id, b, file_sha(b['file_id'], index))
            st['batches'][b['file_id']] = out['batch']; save(state)
        apply_patches(api, driver_id, plan['patches'], auto_rows, state, key); save(state)
        got = proof(api, driver_id)
        if d2(got) != d2(plan['expected_total_balance']):
            st['proof'] = {'got': got, 'expected': plan['expected_total_balance']}; save(state)
            raise Mismatch('%s: ledger balance %s ≠ expected %s — batches %s' % (key, got, plan['expected_total_balance'], st['batches']))
        st['proof'] = {'got': got, 'expected': plan['expected_total_balance']}; st['done'] = True; save(state)
        print('  ✓ %s balance %s' % (key, got))

def save(state):
    json.dump(state, open(os.path.join(WORK, 'state.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--commit', action='store_true'); ap.add_argument('--only', nargs='*')
    a = ap.parse_args()
    load = lambda sub: {json.load(open(p, encoding='utf-8'))['driver_key']: json.load(open(p, encoding='utf-8')) for p in glob.glob(os.path.join(WORK, sub, '*.json'))}
    plans, reviews = load('plans'), load('reviews')
    if a.only: plans = {k: v for k, v in plans.items() if k in a.only}
    auto = json.load(open(os.path.join(WORK, 'auto_rows.json'), encoding='utf-8'))
    index = json.load(open(os.path.join(WORK, 'drive-index.json'), encoding='utf-8'))
    sp = os.path.join(WORK, 'state.json'); state = json.load(open(sp, encoding='utf-8')) if os.path.exists(sp) else {}
    os.makedirs(os.path.join(WORK, 'logs'), exist_ok=True)
    log = open(os.path.join(WORK, 'logs', 'commit-%s.log' % dt.datetime.now().strftime('%Y%m%d-%H%M%S')), 'a', encoding='utf-8')
    api = Api(read_token(), log) if a.commit else None
    try:
        run(plans, reviews, auto, index, api, state, a.commit)
    except (Mismatch, ApiError) as e:
        print('✗ STOP: %s' % e); sys.exit(2)

if __name__ == '__main__':
    main()
```

- [ ] **Step 4: Run tests**

Run: `cd tools/ledger-import && python3 -m unittest tests.test_commit -v 2>&1 | tail -3`
Expected: `OK` (7 tests).

- [ ] **Step 5: Whole suite**

Run: `python3 -m unittest discover -s tools/ledger-import/tests -v 2>&1 | tail -3`
Expected: `OK`, 37 tests.

- [ ] **Step 6: Commit**

```bash
git add tools/ledger-import/commit.py tools/ledger-import/tests/test_commit.py
git commit -q -m "ledger-import: commit — single write path (create driver, import, PATCH NULL fields, GET proof), dry run default

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Analysis wave (coordinator dispatches agents)

**Files:** none in git. Produces `work/plans/*.json`, `work/reviews/*.json`.

- [ ] **Step 1: Split the map keys** into groups of ≤5 (only keys with `files`, skip `alias_of`). Expected ≈ 14–18 groups.

- [ ] **Step 1b (after Task 10a): build every plan deterministically** — `python3 tools/ledger-import/make_plan.py` then `python3 tools/ledger-import/verify_plan.py`. Keys that come out `ready` with no warnings need no analyst at all; only keys with `needs_decision` or `warnings` go to Step 2.

- [ ] **Step 2: Dispatch one Haiku agent per group of ≤5 keys that need decisions** (Agent tool, `model: "haiku"`, `run_in_background: true`), prompt = contents of `prompts/ANALYST.md` (decisions workflow) + the group's keys + absolute paths of `work/`. All groups in one message so they run concurrently. Analysts write `work/decisions/<key>.json` and re-run `make_plan.py <key>`; they never write plans.

- [ ] **Step 3: Run the gate**

Run: `python3 tools/ledger-import/verify_plan.py`
Expected: every plan `OK … (ready)` or `OK … (needs_decision)`. Any `REJECT` goes back to the same agent (SendMessage with the reject line) — at most two rounds; after that the coordinator fixes the plan by hand and notes it in the report.

- [ ] **Step 4: Dispatch Sonnet reviewers** (`model: "sonnet"`), one per ≤8 plans, prompt = `prompts/REVIEWER.md` + plan paths. Reject ⇒ back to the analyst with the reasons, then re-verify and re-review that plan only.

- [ ] **Step 5: Consolidated decisions for the owner**

Run: `python3 tools/ledger-import/report.py`
Send `work/report.md` to the owner (SendUserFile) with **one** message that asks for: (a) the unknown-description categories (one rule per description), (b) the date problems that were not repairable, (c) approval of the new-driver list, (d) approval of the RT match table. Wait. Encode answers as new rules in `rules.py` (with tests) or as manual edits of the plans, re-run inventory/verify/review for the affected drivers only.

---

### Task 11: Commit wave, proof, record

**Files:**
- Create: `docs/data-audit/2026-09/2026-09-0X-driver-ledger-import.md`
- Modify: `docs/DECISION_LOG.md` (append)

- [ ] **Step 1: Preconditions** — time ≥ 15:00; owner pasted `TMS_JWT=…` into `.env.local`; `verify_plan.py` exit 0; every plan to be written has review `ok`.

- [ ] **Step 2: Dry run**

Run: `python3 tools/ledger-import/commit.py`
Expected: one `dry <key>: …` line per ready driver, `skip` lines for the rest, no network.

- [ ] **Step 3: First driver alone** (the template driver whose balance was verified 5/9 noon = 354,76)

Run: `python3 tools/ledger-import/commit.py --commit --only ΑΙΜΙΛΙΟΣ`
Expected: `✓ ΑΙΜΙΛΙΟΣ balance 354.76`. Then coordinator SQL:
```sql
select count(*), sum(balance_delta) from dl_entries where driver_id = 46 and deleted_at is null;
```
Expected: rows = plan rows (+ auto rows) and sum = 354.76. Mismatch ⇒ stop, report to owner with the batch id, ask whether to run `select dl_cancel_batch('<batch>', 'εισαγωγή με λάθος υπόλοιπο', 'owner');`.

- [ ] **Step 4: Everyone else**

Run: `python3 tools/ledger-import/commit.py --commit`
Expected: `✓` per driver; the script stops at the first mismatch. Re-running skips done drivers (state.json) and re-uses batches already imported (409 would mean state.json was lost — stop and reconcile by hand with `select * from dl_import_batches order by created_at desc`).

- [ ] **Step 5: Proof SQL (coordinator) and screen check (elegktis)**

```sql
select d.id, d.full_name, count(*) rows, sum(e.balance_delta) balance,
       count(*) filter (where e.entry_type='trip' and e.trip_value is null) pending,
       count(distinct e.import_batch) batches
from dl_entries e join drivers d on d.id=e.driver_id
where e.deleted_at is null group by 1,2 order by 2;
select count(*) as rt_gap from dl_v_rt_gap;
select count(*) filter (where source='excel_import' and import_batch is null) as orphan_rows from dl_entries;
```
Expected: every ready driver present with balance = `expected_total_balance` of its plan; `rt_gap = 0`; `orphan_rows = 0`. Dispatch `elegktis` to open Μισθοδοσία and confirm the list shows the same balances for three drivers (template driver included) and that the auto rows patched now show amounts, not «εκκρεμεί».

- [ ] **Step 6: Record**

Write `docs/data-audit/2026-09/2026-09-0X-driver-ledger-import.md` = `work/report-public.md` + the proof SQL results **as counts only** + what stayed out and why (out_of_scope sheets, unmapped files, needs_decision still open, duplicate driver id 1). Append to `docs/DECISION_LOG.md`: revocation of the 5/9 15:45 deferral; RT overlap policy (Excel for amounts, RT for the link); date policy (year-only repair with note, else decision); agent-created drivers without per-record approval (owner 5/9 evening). Update memory file `project_driver_payroll_ledger.md`.

```bash
git add docs/data-audit/2026-09/ docs/DECISION_LOG.md
git commit -q -m "docs: εισαγωγή ιστορικού μισθοδοσίας — συγκεντρωτική αναφορά + αποφάσεις (χωρίς ονόματα/ποσά)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -q origin main
```

---

## Self-review notes (done while writing)

- Spec §1 canonical-by-fileId → Task 1 (`copyid`) + Task 4 map. §2 graph roles → ANALYST steps 2–4, REVIEWER, verify. §3 row rules → Task 2 + inventory date repair; unknown descriptions consolidated → report + Task 10 step 5. §4 overlap → ANALYST step 7, verify (NULL-only, once per auto row), commit `apply_patches`. §5 drivers → map `create`, `ensure_driver` via facade + lookups. §6 roles/models → Task 10. §7 write & proof → Task 11. §8 privacy → `.gitignore`, two reports. §9 alarms → verify + commit stop + proof SQL.
- Names consistent: `driver_key`, `expected_final`, `expected_total_balance`, `patches[].dl_id`, `nodes[].role`, `status`, `Mismatch`, `ensure_driver/import_batch/apply_patches/proof/run`.
- Known simplification: `raw_balance` counts unknown rows' amounts so the sheet invariant still holds even when a row is unclassified; a sheet with unknown rows can never reach `ready`, so nothing unclassified is ever written.

---

### Task 2b: rules v2 + inventory v2 — fit the rules to the real workbooks

**Why this task exists.** The first real run of `inventory.py` over 156 workbooks (259 sheets, 23,404 rows) produced `unknown rows 11190 · date problems 8942 · raw≠running 112`. The coordinator inspected the raw sheets and found five causes, none of them data problems:
1. In many layouts the `ΜΕΤΡΗΤΑ` column holds the **payment description text** (`ΜΕΤΡΗΤΑ`, `KAT.TΡΑΠEZA EUR`, `από TRANS COMBI`) while `ΔΡΟΜΟΛΟΓΙΟ` holds only trip routes. 4,313 such strings. The rules treated `cash` as a number.
2. Greek words typed with **Latin lookalikes** (`KATAΘΕΣΗ FRESH` — Latin K, A, T, A). Keyword matching missed them.
3. **Totals lines** without the word ΣΥΝΟΛΟ (a row with no date, no text, just column sums) were counted as unknown rows and doubled the raw balance (exactly 2× in dozens of sheets). Where ΣΥΝΟΛΟ exists it often sits in the unlabeled first column, which the rules never looked at.
4. The Excel model is uniform: **every row is `ΑΞΙΑ − ΕΛΑΒΕ + ΕΞΟΔΑ`**. Money the driver received is an advance-only row with a label (`ΚΑΥΣΙΜΑ ΠΡΑΤΗΡΙΟ`, `ΑΠΌ ΠΩΛΗΣΗ ΕΥΡΩΠΑΛΕΤΩΝ`, `ΕΠΙΔΟΜΑ ΑΔΕΙΑΣ`) or with no label at all (3,764 rows). Rows with a place name plus advance **and expenses** but no value (`ΘΕΣΣΑΛΟΝΙΚΗ 75/25`) are local trips whose value was never written. The `Α/Α` column was never detected (0 of 259 sheets) because its header is unlabeled or Latin.
5. Sheets are not strictly chronological (payments are logged with earlier dates), so "between prev and next" flagged 8,942 rows. Real anomalies are **spikes**: a date far from all its neighbours. Simulated on the real data: a 200-day spike window against up to 3 neighbours each side finds 101 rows, 98 repairable by a year change, 3 for decision.

Also from the Task 2 review: `ΤΡΑΠΕΖΟΥΝΤΑ` (a destination) matched the bank keyword and silently turned a trip into a payment. In v2 a keyword can only make a payment when the row has **no ΑΞΙΑ**.

**Files:**
- Modify: `tools/ledger-import/rules.py` (replace whole file)
- Modify: `tools/ledger-import/tests/test_rules.py` (replace whole file)
- Modify: `tools/ledger-import/inventory.py` (replace whole file)
- Modify: `tools/ledger-import/tests/test_inventory.py` (replace whole file)

**Interfaces (changed):**
- `classify(cells)` now returns `'TOTALS'` instead of `'STOP'`; entry types are `trip | payment_cash | payment_bank | adjustment | carry`; `entry_date` may be `None` (the caller inherits the previous row's date); payments and adjustments may carry `note`.
- `fix_date(cur, neighbours, today) -> (date, note) | None` — `neighbours` is a list of dates (up to 3 before and 3 after, all ≤ today), no longer `prev, nxt`.
- `detect_header` may set `cols['seq']` by fallback (the unlabeled column left of the date).
- Inventory rows gain `date_inherited: bool`; nodes gain `totals_skipped`, `text_only_skipped` counts. Everything else in the node shape is unchanged.

- [ ] **Step 1: Replace `tests/test_rules.py`**

```python
# tools/ledger-import/tests/test_rules.py
import unittest, datetime as dt, sys, os
from decimal import Decimal
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from rules import detect_header, classify, fix_date, raw_balance, Unknown, d2, to_date, norm

D = dt.date

class TestNorm(unittest.TestCase):
    def test_latin_lookalikes_become_greek(self):
        # norm() is for keyword matching only: Latin letters that look Greek become Greek,
        # so genuine Latin words come out mangled — that is accepted, never displayed.
        self.assertTrue(norm('KATAΘΕΣΗ FRESH').startswith('ΚΑΤΑΘΕΣΗ '))
        self.assertTrue(norm('kat.tΡΑΠEZA eur').startswith('ΚΑΤ.ΤΡΑΠΕΖΑ'))
    def test_accents_stripped(self):
        self.assertEqual(norm('Κατάθεση από ΟΕ'), 'ΚΑΤΑΘΕΣΗ ΑΠΟ ΟΕ')

class TestHeader(unittest.TestCase):
    def test_standard_layout_with_unlabeled_end_date_and_seq(self):
        rows = [(None,)*11, ('ΚΑΡΤΕΛΑ',) + (None,)*10,
                (None, None, 'ΗΜΕΡΟΜΗΝΙΑ', None, 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', None, 'ΑΞΙΑ ΔΡΟΜ.', 'ΥΠΟΛΟΙΠΟ', 'ΠΡΟΟΔΕΥΤΙΚΟ')]
        h = detect_header(rows)
        self.assertEqual(h['row'], 3)
        self.assertEqual(h['cols']['date'], 3)
        self.assertEqual(h['cols']['date_end'], 4)
        self.assertEqual(h['cols']['seq'], 2)          # unlabeled column left of the date
        self.assertEqual(h['cols']['route'], 5)
        self.assertEqual(h['cols']['value'], 9)
        self.assertEqual(h['cols']['running'], 11)
        self.assertFalse(h['out_of_scope'])

    def test_metrita_column_is_not_taken_as_end_date(self):
        # ΜΟΥΡΑΤΙΔΗΣ layout: A=α/α B=ΗΜΕΡ C=ΜΕΤΡΗΤΑ(text) D=ΔΡΟΜΟΛΟΓΙΟ ...
        rows = [(None, 'ΗΜΕΡ.', 'ΜΕΤΡΗΤΑ', 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', 'ΥΠΟΛΟΙΠΟ', 'ΑΞΙΑ Δ', None, 'ΠΡΟΟΔΕΥΤΙΚΟ')]
        h = detect_header(rows)
        self.assertEqual(h['cols']['cash'], 3)
        self.assertNotIn('date_end', h['cols'])
        self.assertEqual(h['cols']['seq'], 1)

    def test_labeled_seq_latin(self):
        rows = [('A/A', 'ΗΜΕΡΟΜΗΝΙΑ', 'ΛΗΞΗ', 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', None, 'ΚΟΣΤΟΣ', 'ΥΠΟΛΟΙΠΟ')]
        h = detect_header(rows)
        self.assertEqual(h['cols']['seq'], 1)
        self.assertEqual(h['cols']['date_end'], 3)
        self.assertEqual(h['cols']['value'], 8)

    def test_old_monthly_layout_is_out_of_scope(self):
        rows = [(None, 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', None, 'ΑΞΙΑ Δ', None, 'ΗΜΕΡ', 'ΕΠΙΣΗΜΗ', 'ΤΡΑΠΕΖΑ', 'ΥΠΟΛΟΙΠΟ')]
        self.assertTrue(detect_header(rows)['out_of_scope'])

    def test_no_header(self):
        self.assertIsNone(detect_header([('a', 'b'), (1, 2)]))

class TestClassify(unittest.TestCase):
    def test_trip(self):
        e = classify({'date': D(2024, 3, 13), 'date_end': D(2024, 3, 20), 'route': 'ΓΕΡΜΑΝΙΑ', 'advance': 300, 'expenses': 120.5, 'value': 450})
        self.assertEqual(e['entry_type'], 'trip'); self.assertEqual(e['trip_value'], 450.0); self.assertEqual(e['date_end'], '2024-03-20')

    def test_trip_blank_value_is_none(self):
        e = classify({'date': D(2024, 3, 13), 'route': 'ΑΘΗΝΑ', 'advance': 100, 'seq': 12})
        self.assertEqual(e['entry_type'], 'trip'); self.assertIsNone(e['trip_value']); self.assertIsNone(e['expenses'])

    def test_place_with_advance_and_expenses_is_pending_trip(self):
        e = classify({'date': D(2021, 5, 15), 'route': 'ΘΕΣΣΑΛΟΝΙΚΗ', 'advance': 75, 'expenses': 25})
        self.assertEqual(e['entry_type'], 'trip'); self.assertIsNone(e['trip_value']); self.assertEqual(e['expenses'], 25.0)

    def test_trapezounta_is_a_trip_not_a_bank_payment(self):
        e = classify({'date': D(2024, 3, 13), 'route': 'ΤΡΑΠΕΖΟΥΝΤΑ', 'advance': 500, 'value': 4000, 'expenses': 300})
        self.assertEqual(e['entry_type'], 'trip'); self.assertEqual(e['trip_value'], 4000.0)

    def test_cash_payment_by_description(self):
        e = classify({'date': D(2024, 4, 1), 'route': 'ΜΕΤΡΗΤΑ ', 'advance': 200, 'expenses': 0, 'value': 0})
        self.assertEqual(e['entry_type'], 'payment_cash'); self.assertEqual(e['amount'], 200.0); self.assertEqual(e['entry_date'], '2024-04-01')

    def test_bank_payment_by_latin_description_in_cash_column(self):
        label = 'KAT.T\u03a1\u0391\u03a0EZA EUR'          # Latin K,A,T,T,E,Z,A around Greek Ρ,Α,Π — as typed in the sheet
        e = classify({'date': D(2020, 8, 31), 'cash': label, 'advance': 500, 'expenses': 0})
        self.assertEqual(e['entry_type'], 'payment_bank'); self.assertEqual(e['amount'], 500.0); self.assertEqual(e['note'], label)

    def test_advance_only_with_label_is_cash_payment(self):
        e = classify({'date': D(2022, 10, 4), 'route': 'ΚΑΥΣΙΜΑ ΠΡΑΤΗΡΙΟ', 'advance': 27, 'expenses': 0, 'value': 0})
        self.assertEqual(e, {'entry_type': 'payment_cash', 'entry_date': '2022-10-04', 'amount': 27.0, 'note': 'ΚΑΥΣΙΜΑ ΠΡΑΤΗΡΙΟ'})

    def test_advance_only_without_label_is_cash_payment(self):
        e = classify({'date': D(2022, 10, 4), 'advance': 400})
        self.assertEqual(e['entry_type'], 'payment_cash'); self.assertEqual(e['amount'], 400.0); self.assertNotIn('note', e)

    def test_bank_payment_by_amount_in_bank_column(self):
        e = classify({'date': D(2024, 4, 30), 'bank': 500, 'route': 'ΚΑΤΑΘΕΣΗ'})
        self.assertEqual(e['entry_type'], 'payment_bank'); self.assertEqual(e['amount'], 500.0)

    def test_negative_advance_is_adjustment(self):
        e = classify({'date': D(2019, 7, 24), 'route': 'ΜΕΤΡΗΤΑ', 'advance': -297.34})
        self.assertEqual(e['entry_type'], 'adjustment'); self.assertEqual(e['amount'], 297.34)

    def test_value_only_credit_is_adjustment(self):
        e = classify({'route': 'ΠΙΣΤΩΣΗ ΛΟΓΟΥ ΛΑΘΟΥΣ ΑΞΙΑΣ ΔΡΟΜ', 'value': 50, 'advance': 0, 'expenses': 0})
        self.assertEqual(e['entry_type'], 'adjustment'); self.assertEqual(e['amount'], 50.0); self.assertIsNone(e['entry_date'])

    def test_payment_keyword_with_value_and_no_advance_is_unknown(self):
        with self.assertRaises(Unknown):
            classify({'date': D(2023, 7, 10), 'route': 'ΜΕΤΡΗΤΑ', 'advance': 0, 'value': 250})

    def test_carry_row(self):
        e = classify({'date': D(2025, 1, 1), 'route': 'ΜΕΤΑΦΟΡΑ ΥΠΟΛΟΙΠΟΥ', 'balance': 123.45})
        self.assertEqual(e['entry_type'], 'carry'); self.assertEqual(e['amount'], 123.45)

    def test_blank_text_only_and_totals(self):
        self.assertIsNone(classify({'date': None, 'route': None}))
        self.assertIsNone(classify({'date': D(2024, 1, 1), 'route': 'ΣΗΜΕΙΩΣΗ'}))                    # text only, no money
        self.assertEqual(classify({'route': 'ΣΥΝΟΛΟ', 'value': 999}), 'TOTALS')
        self.assertEqual(classify({'value': 999, 'advance': 100, '_row_text': 'ΣΥΝΟΛΑ 2023'}), 'TOTALS')
        self.assertEqual(classify({'value': 26030, 'advance': 30014.2, 'expenses': 3225.2}), 'TOTALS')   # numbers only, no date, no text

    def test_no_date_with_label_returns_none_date(self):
        e = classify({'route': 'ΑΠΌ ΠΩΛΗΣΗ ΕΥΡΩΠΑΛΕΤΩΝ', 'advance': 90, 'expenses': 0, 'value': 0})
        self.assertEqual(e['entry_type'], 'payment_cash'); self.assertIsNone(e['entry_date'])

    def test_unknown_advance_and_expenses_without_label(self):
        with self.assertRaises(Unknown):
            classify({'date': D(2024, 1, 1), 'advance': 100, 'expenses': 30})

class TestFixDate(unittest.TestCase):
    today = D(2026, 9, 5)
    def test_year_typo_in_future_is_fixed(self):
        r = fix_date(D(2026, 12, 27), [D(2025, 12, 20), D(2025, 12, 22), D(2026, 1, 5)], self.today)
        self.assertEqual(r[0], D(2025, 12, 27)); self.assertIn('2026-12-27', r[1])
    def test_spike_a_year_off_inside_the_past_is_fixed(self):
        r = fix_date(D(2025, 12, 27), [D(2024, 12, 20), D(2024, 12, 29), D(2025, 1, 5)], self.today)
        self.assertEqual(r, (D(2024, 12, 27), 'ημ/νία Excel 2025-12-27 → 2024-12-27 (έτος)'))
    def test_out_of_order_but_near_is_untouched(self):
        self.assertEqual(fix_date(D(2025, 5, 1), [D(2025, 6, 1), D(2025, 6, 3)], self.today), (D(2025, 5, 1), None))
    def test_no_neighbours_future_is_none(self):
        self.assertIsNone(fix_date(D(2026, 12, 27), [], self.today))
    def test_month_day_swap_is_not_repaired(self):
        self.assertIsNone(fix_date(D(2022, 9, 12), [D(2022, 2, 2), D(2022, 2, 5), D(2022, 2, 7)], self.today))

class TestBalance(unittest.TestCase):
    def test_raw_balance(self):
        cells = [{'value': 450, 'advance': 300, 'expenses': 120.5}, {'advance': 200}, {'value': None, 'advance': None, 'expenses': 30}]
        self.assertEqual(raw_balance(cells), Decimal('100.50'))
    def test_d2_and_to_date(self):
        self.assertEqual(d2('1.005'), Decimal('1.01'))
        self.assertEqual(to_date(dt.datetime(2024, 1, 2, 10)), D(2024, 1, 2))
        self.assertEqual(to_date('02/01/2024'), D(2024, 1, 2))
        self.assertIsNone(to_date('ΣΥΝΟΛΟ'))

if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Run to verify the new tests fail against the old rules**

Run: `cd tools/ledger-import && python3 -m unittest tests.test_rules 2>&1 | tail -3`
Expected: `ImportError: cannot import name 'norm'` (or several failures once `norm` exists).

- [ ] **Step 3: Replace `rules.py`**

```python
"""Pure rules for the ledger import (v2). No I/O, no Worker, no Supabase.

v2 after the first real run over 156 workbooks: the Excel model is uniform —
every line is ΑΞΙΑ − ΕΛΑΒΕ + ΕΞΟΔΑ — so classification is by *shape* first
(which amount columns are filled) and by keyword second. A keyword can only
turn a line into a payment when the line has no ΑΞΙΑ; otherwise ΤΡΑΠΕΖΟΥΝΤΑ
would be a bank deposit.
"""
import datetime as dt, re, unicodedata
from decimal import Decimal, ROUND_HALF_UP

class Unknown(Exception):
    """A row shape the rules do not recognise. The driver goes to needs_decision."""

# Payroll sheets mix Latin lookalikes into Greek words (KATAΘΕΣΗ, KAT.TΡΑΠEZA).
LATIN_TO_GREEK = str.maketrans('ABEHIKMNOPTXYZ', 'ΑΒΕΗΙΚΜΝΟΡΤΧΥΖ')

def norm(s):
    s = unicodedata.normalize('NFD', str(s)).upper()
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn').strip()
    return s.translate(LATIN_TO_GREEK)

FIELD_KEYS = [
    ('official', ('ΕΠΙΣΗΜ',)),          # 2017-2019 monthly model → whole sheet out of scope
    ('running',  ('ΠΡΟΟΔ',)),
    ('balance',  ('ΥΠΟΛΟΙΠ',)),
    ('value',    ('ΑΞΙΑ', 'ΚΟΣΤΟΣ')),
    ('expenses', ('ΕΞΟΔΑ',)),
    ('advance',  ('ΕΛΑΒΕ',)),
    ('route',    ('ΔΡΟΜΟΛ', 'ΠΕΡΙΓΡΑΦ')),
    ('date_end', ('ΛΗΞΗ', 'ΕΠΙΣΤΡΟΦ')),
    ('date',     ('ΗΜΕΡ',)),
    ('cash',     ('ΜΕΤΡΗΤ',)),          # holds TEXT (the payment label) in most layouts
    ('bank',     ('ΚΑΤΑΘΕΣ', 'ΤΡΑΠΕΖ')),
]
SEQ_LABELS = ('Α/Α', 'ΑΑ', 'Α.Α', 'Α.Α.', 'ΝΟ', '#')
REQUIRED = ('advance', 'expenses')
BANK_KEYS = tuple(norm(k) for k in ('ΚΑΤΑΘΕΣ', 'ΤΡΑΠΕΖ', 'ΚΑΤ.', 'EUROBANK', 'ΠΕΙΡΑΙ', 'IBAN'))
ETE_RE = re.compile(r'(^|[^Α-Ω])ΕΤΕ([^Α-Ω]|$)')            # Εθνική Τράπεζα, as a word
ADJUST_KEYS = ('ΠΙΣΤΩΣ', 'ΧΡΕΩΣ', 'ΔΙΟΡΘ', 'ΔΩΡΟ', 'ΕΠΙΔΟΜ', 'ΜΠΟΝ', 'BONUS', 'ΛΑΘ')
CARRY_KEYS = ('ΜΕΤΑΦΟΡΑ', 'ΥΠΟΛΟΙΠΟ')

def d2(v):
    return Decimal(str(v if v not in (None, '') else 0)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)

def num(v):
    """Blank → None (NULL = not recorded); a number, including 0, → float."""
    return float(d2(v)) if is_num(v) else None

def to_date(v):
    if isinstance(v, dt.datetime): return v.date()
    if isinstance(v, dt.date): return v
    if isinstance(v, str):
        m = re.match(r'^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\s*$', v)
        if m:
            d, mo, y = (int(x) for x in m.groups())
            if y < 100: y += 2000
            try: return dt.date(y, mo, d)
            except ValueError: return None
    return None

def detect_header(rows):
    """First row with ≥3 fields incl. ΕΛΑΒΕ and ΕΞΟΔΑ wins. Two fallbacks for
    columns that are almost never labeled: the end date (right after the date,
    before the route) and the Α/Α counter (right before the date)."""
    for i, row in enumerate(rows, 1):
        cols = {}
        for j, cell in enumerate(row, 1):
            if cell in (None, ''): continue
            n = norm(cell)
            if n in SEQ_LABELS:
                cols.setdefault('seq', j); continue
            for field, keys in FIELD_KEYS:
                if field not in cols and any(k in n for k in keys):
                    cols[field] = j; break
        if len(cols) >= 3 and all(f in cols for f in REQUIRED):
            used = set(cols.values())
            if 'date_end' not in cols and 'date' in cols and 'route' in cols and cols['date'] + 1 < cols['route'] and cols['date'] + 1 not in used:
                cols['date_end'] = cols['date'] + 1
            if 'seq' not in cols and 'date' in cols and cols['date'] > 1 and cols['date'] - 1 not in used:
                cols['seq'] = cols['date'] - 1
            return {'row': i, 'cols': cols, 'out_of_scope': 'official' in cols}
    return None

def _has_seq(v):
    return is_num(v) or (isinstance(v, str) and v.strip().isdigit())

def classify(c):
    """c = {field: raw cell, '_row_text': every string cell of the row joined}.
    Returns an entry dict, None (nothing to record), or 'TOTALS' (skip)."""
    if 'ΣΥΝΟΛ' in norm(c.get('_row_text') or '') or 'ΣΥΝΟΛ' in norm(c.get('route') or '') or 'ΣΥΝΟΛ' in norm(c.get('date') or ''):
        return 'TOTALS'
    desc = str(c.get('route') or '').strip()
    pay_desc = ' · '.join(str(c.get(k)).strip() for k in ('cash', 'bank') if isinstance(c.get(k), str) and str(c.get(k)).strip())
    label = (desc or pay_desc)[:200]
    carry_kw = any(k in norm(label) for k in CARRY_KEYS)
    has_amount = any(is_num(c.get(k)) and c.get(k) != 0 for k in ('advance', 'expenses', 'value', 'cash', 'bank')) \
        or (carry_kw and is_num(c.get('balance')))
    has_seq = _has_seq(c.get('seq'))
    if not has_amount and not has_seq: return None                       # blank line, or a text-only note
    date = to_date(c.get('date')) or to_date(c.get('date_end'))
    if date is None and not label and not has_seq: return 'TOTALS'        # numbers alone, no date, no text
    iso = date.isoformat() if date else None                              # None → caller inherits the previous row's date
    adv, exp, val = num(c.get('advance')), num(c.get('expenses')), num(c.get('value'))
    t = norm(label + ' ' + pay_desc)
    bank = any(k in t for k in BANK_KEYS) or bool(ETE_RE.search(t))
    cash = 'ΜΕΤΡΗΤ' in t
    if carry_kw and not val and not adv and not exp:
        if not is_num(c.get('balance')): raise Unknown('carry row without balance: %r' % label)
        return {'entry_type': 'carry', 'entry_date': iso, 'amount': float(d2(c['balance']))}
    if (cash or bank) and val and not adv and not has_seq:
        raise Unknown('payment keyword but the amount is in ΑΞΙΑ: %r' % label)
    if val and not adv and not exp and not has_seq and any(k in t for k in ADJUST_KEYS):
        return {'entry_type': 'adjustment', 'entry_date': iso, 'amount': val, 'note': label}
    if val or has_seq or (exp and desc):                                  # a value, a counter, or expenses on a named line = a journey
        end = to_date(c.get('date_end'))
        return {'entry_type': 'trip', 'entry_date': iso,
                'date_end': end.isoformat() if end else None,
                'route': desc or 'χωρίς περιγραφή (Excel)',
                'trip_value': val, 'advance': adv, 'expenses': exp}
    if adv:                                                               # money handed to the driver, nothing else on the line
        if adv < 0:
            return {'entry_type': 'adjustment', 'entry_date': iso, 'amount': -adv, 'note': ('αρνητικό ΕΛΑΒΕ στο Excel: ' + label).strip(': ')}
        e = {'entry_type': 'payment_bank' if (bank and not cash) else 'payment_cash', 'entry_date': iso, 'amount': adv}
        if label: e['note'] = label
        return e
    if cash or bank:                                                      # amount typed in the ΜΕΤΡΗΤΑ/ΚΑΤΑΘΕΣΗ column itself
        col = num(c.get('cash')) if cash else num(c.get('bank'))
        if col and col > 0:
            e = {'entry_type': 'payment_cash' if cash else 'payment_bank', 'entry_date': iso, 'amount': col}
            if label: e['note'] = label
            return e
        raise Unknown('payment keyword without a positive amount: %r' % label)
    raise Unknown('unrecognised row: %r' % label)

def fix_date(cur, neighbours, today, spike=dt.timedelta(days=200), window=dt.timedelta(days=45)):
    """(date, note) or None. Sheets are not chronological (payments are logged with
    earlier dates), so only a *spike* — a date after today or >200 days away from
    every neighbour — is suspect. It is repaired only when changing the YEAR alone
    lands it within 45 days of the neighbours' span; anything else is a human's call."""
    lo = min(neighbours) if neighbours else None
    hi = max(neighbours) if neighbours else None
    if cur <= today and (not neighbours or lo - spike <= cur <= hi + spike): return (cur, None)
    if not neighbours: return None
    cands = set()
    for y in {cur.year - 1, cur.year + 1} | {d.year for d in neighbours}:
        try: d = cur.replace(year=y)
        except ValueError: continue
        if d <= today and lo - window <= d <= hi + window: cands.add(d)
    if len(cands) != 1: return None
    fixed = cands.pop()
    return (fixed, 'ημ/νία Excel %s → %s (έτος)' % (cur.isoformat(), fixed.isoformat()))

def raw_balance(cells_list):
    """Σ ΑΞΙΑ − Σ ΕΛΑΒΕ + Σ ΕΞΟΔΑ over raw cells — independent of classification."""
    tot = Decimal('0')
    for c in cells_list:
        tot += d2(c.get('value') if is_num(c.get('value')) else 0)
        tot -= d2(c.get('advance') if is_num(c.get('advance')) else 0)
        tot += d2(c.get('expenses') if is_num(c.get('expenses')) else 0)
    return tot.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
```

- [ ] **Step 4: Run the rules tests**

Run: `cd tools/ledger-import && python3 -m unittest tests.test_rules -v 2>&1 | tail -4`
Expected: `OK`, 30 tests. If `test_month_day_swap_is_not_repaired` fails: 2022-09-12 with neighbours in Feb 2022 must produce no candidate (year 2021/2023 lands far away) — check the `window` bound.

- [ ] **Step 5: Replace `tests/test_inventory.py`**

```python
# tools/ledger-import/tests/test_inventory.py
import unittest, sys, os, datetime as dt
import openpyxl
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from inventory import parse_sheet

def book(rows):
    wb = openpyxl.Workbook(); ws = wb.active
    for r in rows: ws.append(list(r))
    return ws

class TestParseSheet(unittest.TestCase):
    def test_standard_sheet(self):
        ws = book([
            ('ΚΑΡΤΕΛΑ',),
            (None,),
            (None, None, 'ΗΜΕΡΟΜΗΝΙΑ', None, 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', None, 'ΑΞΙΑ', 'ΥΠΟΛΟΙΠΟ', 'ΠΡΟΟΔΕΥΤΙΚΟ'),
            (None, 1, dt.datetime(2024, 3, 13), dt.datetime(2024, 3, 20), 'ΓΕΡΜΑΝΙΑ', 300, 120.5, None, 450, 270.5, 270.5),
            (None, None, dt.datetime(2024, 4, 1), None, 'ΜΕΤΡΗΤΑ', 200, None, None, None, -200, 70.5),
            (None, None, None, None, 'ΑΠΌ ΠΩΛΗΣΗ ΕΥΡΩΠΑΛΕΤΩΝ', 90, 0, None, 0, -90, -19.5),   # no date → inherits 2024-04-01
            (None, 2, dt.datetime(2024, 12, 27), None, 'ΑΘΗΝΑ', 100, None, None, 230, 130, 110.5),
            (None, 3, dt.datetime(2025, 12, 30), None, 'ΠΑΤΡΑ', 100, None, None, 230, 130, 240.5),   # spike: a year off → 2024-12-30
            (None, 4, dt.datetime(2025, 1, 4), None, 'ΘΕΣΣΑΛΟΝΙΚΗ', 0, None, None, 80, 80, 320.5),
            (None, None, dt.datetime(2025, 1, 6), None, 'ΣΗΜΕΙΩΣΗ ΧΩΡΙΣ ΠΟΣΑ', None, None, None, None, None, None),
            (None, None, None, None, None, 790, 120.5, None, 990, None, None),                       # totals without the word
            (None, None, 'ΣΥΝΟΛΟ', None, None, 790, 120.5, None, 990, None, None),
        ])
        n = parse_sheet(ws, today=dt.date(2026, 9, 5))
        self.assertEqual(n['header_row'], 3)
        self.assertEqual(n['cols']['seq'], 2)
        self.assertEqual(n['n_rows'], 6)
        self.assertEqual([r['entry']['entry_type'] for r in n['rows']], ['trip', 'payment_cash', 'payment_cash', 'trip', 'trip', 'trip'])
        self.assertEqual(n['rows'][2]['entry']['entry_date'], '2024-04-01')
        self.assertTrue(n['rows'][2]['date_inherited'])
        self.assertIn('προηγούμενη γραμμή', n['rows'][2]['entry']['note'])
        self.assertEqual(n['rows'][4]['date_fix']['to'], '2024-12-30')
        self.assertEqual(n['rows'][4]['entry']['entry_date'], '2024-12-30')
        self.assertEqual(n['raw_final'], '320.50')
        self.assertEqual(n['running_last'], '320.50')
        self.assertEqual(n['totals_skipped'], 2)
        self.assertEqual(n['text_only_skipped'], 1)
        self.assertEqual(n['unknown'], [])
        self.assertEqual(n['first_date'], '2024-03-13')

    def test_unknown_rows_are_collected_not_fatal(self):
        ws = book([('ΗΜΕΡ', 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', None, 'ΑΞΙΑ', 'ΥΠΟΛΟΙΠΟ'),
                   (dt.datetime(2024, 1, 5), None, 100, 30, None, None, -70)])
        n = parse_sheet(ws, today=dt.date(2026, 9, 5))
        self.assertEqual(len(n['unknown']), 1)
        self.assertIsNone(n['running_last'])
        self.assertEqual(n['balance_sum'], '-70.00')
        self.assertEqual(n['raw_final'], '-70.00')

    def test_first_row_without_date_is_unknown(self):
        ws = book([('ΗΜΕΡ', 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', None, 'ΑΞΙΑ', 'ΥΠΟΛΟΙΠΟ'),
                   (None, 'ΜΕΤΡΗΤΑ', 100, None, None, None, -100)])
        n = parse_sheet(ws, today=dt.date(2026, 9, 5))
        self.assertEqual(n['n_rows'], 0)
        self.assertIn('no previous row', n['unknown'][0]['reason'])

    def test_no_header_returns_none(self):
        self.assertIsNone(parse_sheet(book([('x', 'y'), (1, 2)]), today=dt.date(2026, 9, 5)))

if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 6: Replace `inventory.py`**

```python
#!/usr/bin/env python3
"""Parse every workbook in work/xlsx into nodes (one per sheet) with rows already
normalised by rules.py. Reads with data_only=True so the cached ΠΡΟΟΔΕΥΤΙΚΟ is
visible. Nothing here decides anything — it records, and it repairs only what
rules.py allows (year spikes, missing dates inherited from the line above), each
repair written into the row's note."""
import datetime as dt, json, os, warnings
import openpyxl
from rules import detect_header, classify, fix_date, raw_balance, is_num, d2, Unknown
warnings.filterwarnings('ignore')

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, 'work')
PICK = ('seq', 'date', 'date_end', 'route', 'advance', 'expenses', 'value', 'balance', 'running', 'cash', 'bank')
INHERIT_NOTE = 'ημ/νία από προηγούμενη γραμμή (κενή στο Excel)'

def jsonable(v):
    if isinstance(v, (dt.datetime, dt.date)): return v.isoformat()[:10]
    if isinstance(v, float) and v != v: return None
    return v

def add_note(entry, text):
    entry['note'] = (entry['note'] + ' · ' + text) if entry.get('note') else text

def parse_sheet(ws, today):
    head = list(ws.iter_rows(min_row=1, max_row=min(ws.max_row or 0, 400), values_only=True))
    h = detect_header(head)
    if h is None: return None
    cols = h['cols']
    rows, unknown, cells_used = [], [], []
    totals_skipped = text_only = 0
    for rn, raw in enumerate(ws.iter_rows(min_row=h['row'] + 1, values_only=True), h['row'] + 1):
        cells = {f: (raw[cols[f] - 1] if f in cols and cols[f] <= len(raw) else None) for f in PICK}
        cells['_row_text'] = ' '.join(str(v) for v in raw if isinstance(v, str))
        try:
            e = classify(cells)
        except Unknown as ex:
            unknown.append({'row': rn, 'reason': str(ex), 'cells': {k: jsonable(v) for k, v in cells.items() if k != '_row_text'}})
            if cells.get('date') is not None: cells_used.append(cells)   # a dated money line counts even if unclassified
            continue
        if e == 'TOTALS': totals_skipped += 1; continue
        if e is None:
            if any(v not in (None, '') for v in raw): text_only += 1
            continue
        inherited = False
        if e['entry_date'] is None:
            if not rows:
                unknown.append({'row': rn, 'reason': 'row without a date and no previous row to inherit from', 'cells': {k: jsonable(v) for k, v in cells.items() if k != '_row_text'}})
                continue
            e['entry_date'] = rows[-1]['entry']['entry_date']; inherited = True; add_note(e, INHERIT_NOTE)
        rows.append({'row': rn, 'entry': e, 'cells': {k: jsonable(v) for k, v in cells.items() if k != '_row_text'},
                     'date_fix': None, 'date_problem': None, 'date_inherited': inherited})
        cells_used.append(cells)
    dates = [dt.date.fromisoformat(r['entry']['entry_date']) for r in rows]
    for i, r in enumerate(rows):
        nb = [d for d in dates[max(0, i - 3):i] + dates[i + 1:i + 4] if d <= today]
        fx = fix_date(dates[i], nb, today)
        if fx is None:
            r['date_problem'] = 'date %s is a spike and not repairable by year alone' % dates[i].isoformat()
        elif fx[1]:
            r['date_fix'] = {'from': dates[i].isoformat(), 'to': fx[0].isoformat(), 'note': fx[1]}
            r['entry']['entry_date'] = fx[0].isoformat(); add_note(r['entry'], fx[1])
        end = r['entry'].get('date_end')
        if end and end < r['entry']['entry_date']:
            r['date_problem'] = ((r['date_problem'] or '') + ' date_end %s before entry_date' % end).strip()
    running_last = None
    if 'running' in cols:
        for r in reversed(rows):
            v = r['cells'].get('running')
            if is_num(v): running_last = str(d2(v)); break
    balance_sum = None
    if 'balance' in cols:
        vals = [c.get('balance') for c in cells_used if is_num(c.get('balance'))]
        balance_sum = str(sum((d2(v) for v in vals), d2(0))) if vals else None
    ds = sorted(dt.date.fromisoformat(r['entry']['entry_date']) for r in rows)
    return {'sheet': ws.title, 'header_row': h['row'], 'cols': cols, 'out_of_scope': h['out_of_scope'],
            'rows': rows, 'unknown': unknown, 'raw_final': str(raw_balance(cells_used)) if cells_used else None,
            'running_last': running_last, 'balance_sum': balance_sum,
            'first_date': ds[0].isoformat() if ds else None, 'last_date': ds[-1].isoformat() if ds else None,
            'n_rows': len(rows), 'totals_skipped': totals_skipped, 'text_only_skipped': text_only}

def main():
    today = dt.date.today()
    index = json.load(open(os.path.join(WORK, 'drive-index.json'), encoding='utf-8'))
    nodes = []
    for it in index:
        wb = openpyxl.load_workbook(it['local'], data_only=True, read_only=True)
        for ws in wb.worksheets:
            n = parse_sheet(ws, today)
            if n is None: continue
            n.update({'file_id': it['id'], 'file_name': it['name'], 'path': it['path'],
                      'folder': 'ΣΤΑΜΑΤΗΣΑΝ' if it['path'].startswith('ΣΤΑΜΑΤΗΣΑΝ/') else 'root', 'modified': it['modified']})
            nodes.append(n)
    out = {'generated': dt.datetime.now().isoformat(timespec='seconds'), 'nodes': nodes}
    json.dump(out, open(os.path.join(WORK, 'inventory.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    R = [r for n in nodes for r in n['rows']]
    print('nodes %d · rows %d · unknown rows %d · date fixes %d · date problems %d · date inherited %d · totals skipped %d · text-only %d · out_of_scope %d · raw≠running %d'
          % (len(nodes), len(R), sum(len(n['unknown']) for n in nodes), sum(1 for r in R if r['date_fix']), sum(1 for r in R if r['date_problem']),
             sum(1 for r in R if r['date_inherited']), sum(n['totals_skipped'] for n in nodes), sum(n['text_only_skipped'] for n in nodes),
             sum(n['out_of_scope'] for n in nodes), sum(1 for n in nodes if n['running_last'] and n['raw_final'] != n['running_last'])))

if __name__ == '__main__':
    main()
```

- [ ] **Step 7: Run the inventory tests, then the whole suite**

Run: `cd tools/ledger-import && python3 -m unittest tests.test_inventory -v 2>&1 | tail -4` → `OK` (4 tests).
Run: `cd tools/ledger-import && python3 -m unittest discover -s tests 2>&1 | tail -3` → `OK`, 34 tests.

- [ ] **Step 8: Real run**

Run: `python3 tools/ledger-import/inventory.py`
Record the full summary line in the report. Expected order of magnitude: `unknown rows` well under 1,000, `date problems` under 50, `raw≠running` under 40. If any of the three is above that, still commit (the tests pass) but report DONE_WITH_CONCERNS with the line and the top 5 `unknown` reasons (run: `python3 -c "import json,collections;inv=json.load(open('tools/ledger-import/work/inventory.json'))['nodes'];c=collections.Counter(u['reason'].split(':')[0] for n in inv for u in n['unknown']);print(c.most_common(5))"`).

- [ ] **Step 9: Commit**

```bash
git add tools/ledger-import/rules.py tools/ledger-import/tests/test_rules.py tools/ledger-import/inventory.py tools/ledger-import/tests/test_inventory.py
git commit -q -m "ledger-import: rules v2 — shape-first classification, Latin lookalikes, totals lines, Α/Α fallback, date spikes with neighbours, inherited dates (first real run: 11190 unknown → fit)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2c: inventory — running-total breaks and opening balances

**Why.** After rules v2, 84 sheets still have `raw_final ≠ running_last`. The coordinator traced every canonical one: the Excel ΠΡΟΟΔΕΥΤΙΚΟ column is not always `previous + (ΑΞΙΑ − ΕΛΑΒΕ + ΕΞΟΔΑ)`. There are (a) **breaks** — rows where the cached running total jumps by an amount not present in the row (a value typed over the formula, e.g. −100 repeated, or a 0.78 rounding drift), and (b) **opening balances** — the first running value already includes a balance carried from a previous sheet. The ledger must equal the ΠΡΟΟΔΕΥΤΙΚΟ people have been trusting, and every discrepancy must be visible as its own line, so the inventory records each break with its row and amount. The analyst (Task 7) will turn breaks into `adjustment` lines with a note and opening balances into the carry logic; this task only measures.

**Files:**
- Modify: `tools/ledger-import/inventory.py`
- Modify: `tools/ledger-import/tests/test_inventory.py` (add one test)

**Interfaces:**
- Node gains: `opening_balance: str|None` (decimal string, present only when |x| > 0.05), `running_breaks: [{"row": int, "entry_date": "YYYY-MM-DD", "diff": "decimal string"}]`, `running_consistent: bool|None` (None when the sheet has no ΠΡΟΟΔΕΥΤΙΚΟ column). Invariant: `d2(raw_final) + d2(opening_balance or 0) + Σ d2(diff) == d2(running_last)` ⇔ `running_consistent`.
- Summary line replaces `raw≠running N` with `running inconsistent N · sheets with breaks M · opening balances K`.

- [ ] **Step 1: Add the failing test to `tests/test_inventory.py`** (append inside `TestParseSheet`, before `if __name__`):

```python
    def test_running_breaks_and_opening_balance(self):
        ws = book([
            ('ΗΜΕΡ', 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', None, 'ΑΞΙΑ', 'ΥΠΟΛΟΙΠΟ', 'ΠΡΟΟΔΕΥΤΙΚΟ'),
            (dt.datetime(2024, 1, 10), 'ΓΕΡΜΑΝΙΑ', 300, 50, None, 500, 250, 350),       # opening 100: 350 − 250
            (dt.datetime(2024, 1, 20), 'ΜΕΤΡΗΤΑ', 200, None, None, None, -200, 150),
            (dt.datetime(2024, 2, 1), 'ΑΘΗΝΑ', 100, None, None, 230, 130, 180),          # break −100: 150+130=280, cached 180
            (dt.datetime(2024, 2, 9), 'ΠΑΤΡΑ', 0, None, None, 230, 230, None),           # no running on this row
            (dt.datetime(2024, 2, 15), 'ΜΕΤΡΗΤΑ', 400, None, None, None, -400, 10.78),  # 180+230−400 = 10 → +0.78 drift
        ])
        n = parse_sheet(ws, today=dt.date(2026, 9, 5))
        self.assertEqual(n['raw_final'], '10.00')
        self.assertEqual(n['running_last'], '10.78')
        self.assertEqual(n['opening_balance'], '100.00')
        self.assertEqual(n['running_breaks'], [{'row': 4, 'entry_date': '2024-02-01', 'diff': '-100.00'},
                                               {'row': 6, 'entry_date': '2024-02-15', 'diff': '0.78'}])
        self.assertTrue(n['running_consistent'])

    def test_no_running_column_means_consistency_unknown(self):
        ws = book([('ΗΜΕΡ', 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', None, 'ΑΞΙΑ', 'ΥΠΟΛΟΙΠΟ'),
                   (dt.datetime(2024, 1, 10), 'ΓΕΡΜΑΝΙΑ', 300, 50, None, 500, 250)])
        n = parse_sheet(ws, today=dt.date(2026, 9, 5))
        self.assertIsNone(n['running_consistent']); self.assertIsNone(n['opening_balance']); self.assertEqual(n['running_breaks'], [])
```

Also change the existing `test_standard_sheet` expectations: it must now also assert `self.assertEqual(n['running_breaks'], [])`, `self.assertIsNone(n['opening_balance'])`, `self.assertTrue(n['running_consistent'])` (append these three lines at the end of that test).

- [ ] **Step 2: Run to verify it fails**

Run: `cd tools/ledger-import && python3 -m unittest tests.test_inventory 2>&1 | tail -3`
Expected: `KeyError: 'opening_balance'` (or `running_breaks`).

- [ ] **Step 3: Implement in `inventory.py`**

In `parse_sheet`, replace the block that computes `running_last` (from `running_last = None` down to just before `balance_sum = None`) with:

```python
    running_last, opening, breaks, consistent = None, None, [], None
    if 'running' in cols:
        # Walk the cached ΠΡΟΟΔΕΥΤΙΚΟ against our own deltas. Rows without a running
        # value (a blank cell in the middle) accumulate into `acc` until the next
        # cached value. The first cached value fixes the opening balance; every later
        # jump that the row's own amounts do not explain is a break.
        prev_run, acc = None, Decimal('0')
        for r in rows:
            c = r['cells']
            delta = d2(c.get('value') if is_num(c.get('value')) else 0) - d2(c.get('advance') if is_num(c.get('advance')) else 0) + d2(c.get('expenses') if is_num(c.get('expenses')) else 0)
            acc += delta
            run = c.get('running')
            if not is_num(run): continue
            run = d2(run)
            if prev_run is None:
                opening = run - acc
            else:
                diff = run - (prev_run + acc)
                if abs(diff) > Decimal('0.05'):
                    breaks.append({'row': r['row'], 'entry_date': r['entry']['entry_date'], 'diff': str(diff)})
            prev_run, acc = run, Decimal('0')
            running_last = str(run)
        if opening is not None and abs(opening) <= Decimal('0.05'): opening = None
        if running_last is not None:
            raw = raw_balance(cells_used)
            consistent = (raw + (opening or Decimal('0')) + sum((Decimal(b['diff']) for b in breaks), Decimal('0'))).quantize(Decimal('0.01')) == d2(running_last)
```

Add `from decimal import Decimal` to the imports. Add to the returned dict: `'opening_balance': str(opening) if opening is not None else None, 'running_breaks': breaks, 'running_consistent': consistent`.

In `main()`, replace the `raw≠running %d` part of the summary (text and value) with:
`running inconsistent %d · sheets with breaks %d · opening balances %d` and values
`sum(1 for n in nodes if n['running_consistent'] is False), sum(1 for n in nodes if n['running_breaks']), sum(1 for n in nodes if n['opening_balance'])`.

Note: `opening` is computed from the first row that has a cached running value; if that row is not the first data row, `acc` already holds the deltas of the earlier rows — that is intended (the opening is whatever the sheet carried before its first line).

- [ ] **Step 4: Run tests**

Run: `cd tools/ledger-import && python3 -m unittest discover -s tests 2>&1 | tail -3` → `OK`, 36 tests.

- [ ] **Step 5: Real run**

Run: `python3 tools/ledger-import/inventory.py` and record the line. Expected: `running inconsistent` is small (single digits); if it is above 20, report DONE_WITH_CONCERNS with the first 5 inconsistent sheets (file, sheet, raw_final, opening_balance, Σbreaks, running_last).

- [ ] **Step 6: Commit**

```bash
git add tools/ledger-import/inventory.py tools/ledger-import/tests/test_inventory.py
git commit -q -m "ledger-import: inventory measures ΠΡΟΟΔΕΥΤΙΚΟ breaks and opening balances, and whether raw + breaks + opening = cached

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2e: rules — totals need "no date", payment lines may carry expenses

**Why.** The Task 2b review found two classification defects in the brief's own code:
1. `ΣΥΝΟΛ` anywhere in the row text made it a totals line — a dated trip described as `ΣΥΝΟΛΙΚΟ ΦΟΡΤΙΟ 24 ΠΑΛΕΤΕΣ` vanished silently into `totals_skipped`.
2. A `ΜΕΤΡΗΤΑ` line with a small ΕΞΟΔΑ (a bank fee) became a "trip to ΜΕΤΡΗΤΑ" because `(exp and desc)` was tested before the payment keywords.

**Files:**
- Modify: `tools/ledger-import/rules.py` (function `classify` only)
- Modify: `tools/ledger-import/tests/test_rules.py` (add tests)

**Interfaces:** unchanged. New behaviour: a payment line with ΕΞΟΔΑ produces `amount = ΕΛΑΒΕ − ΕΞΟΔΑ` (the Excel arithmetic of the line) with the expenses named in `note`.

- [ ] **Step 1: Add tests** (inside `TestClassify`):

```python
    def test_dated_row_mentioning_synoliko_is_not_totals(self):
        e = classify({'date': D(2024, 5, 10), 'route': 'ΓΕΡΜΑΝΙΑ', 'advance': 300, 'expenses': 50, 'value': 800,
                      '_row_text': 'ΓΕΡΜΑΝΙΑ ΣΥΝΟΛΙΚΟ ΦΟΡΤΙΟ 24 ΠΑΛΕΤΕΣ'})
        self.assertEqual(e['entry_type'], 'trip'); self.assertEqual(e['trip_value'], 800.0)

    def test_synolo_cell_is_totals_even_with_a_date(self):
        self.assertEqual(classify({'date': D(2024, 12, 31), 'route': 'ΣΥΝΟΛΟ', 'value': 9000, 'advance': 5000, 'expenses': 300}), 'TOTALS')
        self.assertEqual(classify({'date': D(2024, 12, 31), 'route': 'ΓΕΝΙΚΟ ΣΥΝΟΛΟ', 'value': 9000}), 'TOTALS')

    def test_payment_line_with_expenses_nets_them(self):
        e = classify({'date': D(2024, 4, 1), 'route': 'ΜΕΤΡΗΤΑ', 'advance': 200, 'expenses': 5, 'value': 0})
        self.assertEqual(e['entry_type'], 'payment_cash'); self.assertEqual(e['amount'], 195.0)
        self.assertIn('ΕΞΟΔΑ 5.00', e['note'])

    def test_payment_line_swallowed_by_expenses_is_unknown(self):
        with self.assertRaises(Unknown):
            classify({'date': D(2024, 4, 1), 'route': 'ΚΑΤΑΘΕΣΗ', 'advance': 5, 'expenses': 5})
```

- [ ] **Step 2: Run** `cd tools/ledger-import && python3 -m unittest tests.test_rules 2>&1 | tail -3` → 3 failures/errors among the new tests.

- [ ] **Step 3: Edit `classify` in `rules.py`**

Replace the first statement of `classify` (the `if 'ΣΥΝΟΛ' in norm(c.get('_row_text') ...: return 'TOTALS'`) and the later `date = ...` line with this block at the top of the function:

```python
    # A totals line is a cell that IS the word ΣΥΝΟΛΟ, or a ΣΥΝΟΛ- mention on a
    # line without a date. A dated line that merely mentions ΣΥΝΟΛΙΚΟ ΦΟΡΤΙΟ in
    # its description is a trip and must not vanish into totals_skipped.
    date = to_date(c.get('date')) or to_date(c.get('date_end'))
    route_n = norm(c.get('route') or '')
    if route_n in ('ΣΥΝΟΛΟ', 'ΣΥΝΟΛΑ', 'ΣΥΝΟΛΟ:', 'ΓΕΝΙΚΟ ΣΥΝΟΛΟ') or \
       (date is None and ('ΣΥΝΟΛ' in norm(c.get('_row_text') or '') or 'ΣΥΝΟΛ' in norm(c.get('date') or ''))):
        return 'TOTALS'
```
(and delete the old `date = to_date(...)` line further down so `date` is computed once).

Insert this block immediately BEFORE the `if val or has_seq or (exp and desc):` trip branch:

```python
    # A payment keyword wins over the "expenses = journey" heuristic: a ΜΕΤΡΗΤΑ
    # line with a 5 € bank fee is a payment of ΕΛΑΒΕ − ΕΞΟΔΑ, not a trip to
    # "ΜΕΤΡΗΤΑ". The net keeps the line's Excel arithmetic (ΑΞΙΑ − ΕΛΑΒΕ + ΕΞΟΔΑ).
    if (cash or bank) and not val and not has_seq and adv and adv > 0:
        net = float(d2(adv - (exp or 0)))
        if net <= 0: raise Unknown('payment line whose expenses cancel the amount: %r' % label)
        e = {'entry_type': 'payment_bank' if (bank and not cash) else 'payment_cash', 'entry_date': iso, 'amount': net}
        note = label
        if exp: note = (label + ' · ' if label else '') + 'ΕΞΟΔΑ %.2f στη γραμμή πληρωμής (καθαρό %.2f)' % (exp, net)
        if note: e['note'] = note
        return e
```

Then add a why-comment above the guard the previous implementer added (`if exp and adv and not (desc or val or has_seq): raise Unknown(...)`):
```python
    # Advance + expenses with no description, value or counter: could be a trip
    # whose route was never typed or cash handed over with a receipt — a human decides.
```

- [ ] **Step 4: Run** the rules tests (34 OK) and the whole suite (`python3 -m unittest discover -s tests 2>&1 | tail -3`; count = previous total + 4).

- [ ] **Step 5: Real run** `python3 tools/ledger-import/inventory.py` — record the line; `totals skipped` should drop noticeably (some of the 2,800 were dated rows) and `unknown rows` may rise slightly; `running inconsistent` must not rise above 9. If it does, report DONE_WITH_CONCERNS with the newly inconsistent sheets.

- [ ] **Step 6: Commit**
```bash
git add tools/ledger-import/rules.py tools/ledger-import/tests/test_rules.py
git commit -q -m "ledger-import: totals need no date (ΣΥΝΟΛΙΚΟ ΦΟΡΤΙΟ is a trip), payment lines net their expenses (review 2b)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6b: verify_plan — identity checks (review of Task 6)

**Why.** The Task 6 review found two gaps in the gate: a plan may carry a `driver_id` different from the map's, and a plan may carry both `driver_id` and `create_driver`. Both would let a whole batch land on the wrong driver.

**Files:**
- Modify: `tools/ledger-import/verify_plan.py`
- Modify: `tools/ledger-import/tests/test_verify_plan.py`

- [ ] **Step 1: Add tests** (inside `TestVerify`):
```python
    def test_driver_id_must_match_map(self):
        self.assertTrue(any('map driver' in e for e in verify(plan(driver_id=9), [NODE], AUTO, {'driver_id': 8, 'files': ['F1'], 'crosscheck': []})))
    def test_driver_id_and_create_driver_together_rejected(self):
        p = plan(create_driver={'Full Name': 'X Y', 'Active': True})
        self.assertTrue(any('both' in e for e in verify(p, [NODE], AUTO, MAP)))
    def test_create_driver_plan_needs_map_create(self):
        p = plan(driver_id=None, create_driver={'Full Name': 'X Y', 'Active': True})
        self.assertTrue(any('map has no create' in e for e in verify(p, [NODE], AUTO, {'driver_id': None, 'files': ['F1'], 'crosscheck': []})))
```
- [ ] **Step 2: Run** `cd tools/ledger-import && python3 -m unittest tests.test_verify_plan 2>&1 | tail -3` → 3 failures.
- [ ] **Step 3: Implement** — in `verify()`, replace the line
```python
    if not plan.get('driver_id') and not plan.get('create_driver'): errs.append('neither driver_id nor create_driver')
    if map_entry is None: errs.append('driver key not in map'); return errs
```
with
```python
    # Identity is the one thing the arithmetic cannot catch: a wrong driver_id
    # writes a perfectly balanced ledger onto the wrong person.
    if not plan.get('driver_id') and not plan.get('create_driver'): errs.append('neither driver_id nor create_driver')
    if plan.get('driver_id') and plan.get('create_driver'): errs.append('both driver_id and create_driver set — pick one')
    if map_entry is None: errs.append('driver key not in map'); return errs
    if map_entry.get('driver_id') and plan.get('driver_id') != map_entry['driver_id']:
        errs.append('plan driver_id %s ≠ map driver_id %s' % (plan.get('driver_id'), map_entry['driver_id']))
    if plan.get('create_driver') and not map_entry.get('create'):
        errs.append('plan creates a driver but the map has no create block for this key')
```
Also delete the unused `key = plan.get('driver_key', '?')` line.
- [ ] **Step 4: Run** the file tests (14 OK) and the whole suite (55 OK).
- [ ] **Step 5: Commit**
```bash
git add tools/ledger-import/verify_plan.py tools/ledger-import/tests/test_verify_plan.py
git commit -q -m "ledger-import: verify_plan checks identity — plan driver_id = map, never both id and create (review 6)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2f: header detection infers unlabeled date/route columns from the data

**Why.** 11 sheets (4 canonical, one with 465 rows) label only `ΕΛΑΒΕ ΕΞΟΔΑ ΥΠΟΛΟΙΠΟ ΑΞΙΑ ΔΡ ΥΠΟΛΟΙΠΟ ΠΡΟΟΔΕΥΤΙΚΟ`; the date and the route sit in unlabeled columns to the left (`[None, 2023-09-14, 'ΘΕΣΣΑΛΟΝΙΚΗ', 0, 0, 0, 60, 60, 60]`). With no `date` column every row was skipped as a totals line — 0 rows, silently. The header row alone cannot say where the date is; the data rows can.

**Files:**
- Modify: `tools/ledger-import/rules.py` (`detect_header` only)
- Modify: `tools/ledger-import/tests/test_rules.py` (add one test)

**Interfaces:** unchanged (`detect_header(rows)` — `rows` already includes the data rows that follow the header, up to 400).

- [ ] **Step 1: Add test** (inside `TestHeader`):
```python
    def test_unlabeled_date_and_route_are_inferred_from_data(self):
        rows = [(None, 'Σεπτέμβριος 2023', None, None, None, None, None, None, None),
                (None, None, None, 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', 'ΥΠΟΛΟΙΠΟ', 'ΑΞΙΑ ΔΡ', 'ΥΠΟΛΟΙΠΟ', 'ΠΡΟΟΔΕΥΤΙΚΟ'),
                (None, None, None, None, None, None, None, None, 0),
                (None, dt.datetime(2023, 9, 14), 'ΘΕΣΣΑΛΟΝΙΚΗ', 0, 0, 0, 60, 60, 60),
                (None, dt.datetime(2023, 9, 15), 'ΑΘΗΝΑ', 100, 20, 80, 230, 150, 210),
                (None, dt.datetime(2023, 9, 20), 'ΜΕΤΡΗΤΑ', 200, 0, 200, 0, -200, 10)]
        h = detect_header(rows)
        self.assertEqual(h['row'], 2)
        self.assertEqual(h['cols']['date'], 2)
        self.assertEqual(h['cols']['route'], 3)
        self.assertEqual(h['cols']['seq'], 1)
        self.assertEqual(h['cols']['value'], 7)
```
- [ ] **Step 2: Run** `cd tools/ledger-import && python3 -m unittest tests.test_rules 2>&1 | tail -3` → 1 failure (`KeyError: 'date'`).
- [ ] **Step 3: Implement.** In `detect_header`, right after `used = set(cols.values())` and before the existing `date_end`/`seq` fallbacks, insert:
```python
            # Unlabeled date/route (the national-driver layout labels only the
            # money columns): infer them from the next 30 data rows — the column
            # left of ΕΛΑΒΕ with the most date cells is the date, the one with
            # the most text cells is the route.
            sample = rows[i:i + 30]
            left = [j for j in range(1, cols['advance']) if j not in used]
            if 'date' not in cols and left:
                best = max(left, key=lambda j: sum(1 for r in sample if len(r) >= j and to_date(r[j - 1]) is not None))
                if sum(1 for r in sample if len(r) >= best and to_date(r[best - 1]) is not None) >= 3:
                    cols['date'] = best; used.add(best)
            left = [j for j in range(1, cols['advance']) if j not in used]
            if 'route' not in cols and left:
                best = max(left, key=lambda j: sum(1 for r in sample if len(r) >= j and isinstance(r[j - 1], str) and r[j - 1].strip()))
                if sum(1 for r in sample if len(r) >= best and isinstance(r[best - 1], str) and r[best - 1].strip()) >= 3:
                    cols['route'] = best; used.add(best)
```
(`to_date` is already defined above `detect_header` in the module; if it is defined below, move the `detect_header` function after it.)
- [ ] **Step 4: Run** the rules tests (35 OK) and the suite (53 OK).
- [ ] **Step 5: Real run** `python3 tools/ledger-import/inventory.py` — record the line. `rows` must rise by roughly 700–900 (the 11 sheets). Then run: `python3 -c "import json;inv=json.load(open('tools/ledger-import/work/inventory.json'))['nodes'];print('sheets without date col:',sum(1 for n in inv if 'date' not in n['cols']))"` — expected 0 or a small number, list them in the report if any remain.
- [ ] **Step 6: Commit**
```bash
git add tools/ledger-import/rules.py tools/ledger-import/tests/test_rules.py
git commit -q -m "ledger-import: infer unlabeled date/route columns from the data rows (11 sheets read 0 rows)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10a: `make_plan.py` — deterministic plan builder; analysts write decisions, not plans

**Why.** Task 10 assumed the Haiku analysts would write each driver's plan JSON (up to 1,300 rows per driver) by hand. An LLM copying thousands of numeric rows is the most expensive and least reliable way to do deterministic work. In graph terms: the code builds the payload from the graph, the agents decide only the edges the code cannot (which sheet continues which, whether an opening balance is a carry, which Excel trip is which RT). So: `make_plan.py` builds `work/plans/<key>.json` from inventory + map + auto rows + an optional `work/decisions/<key>.json`; anything it cannot decide goes to `needs_decision` with a precise question.

**Files:**
- Create: `tools/ledger-import/make_plan.py`
- Test: `tools/ledger-import/tests/test_make_plan.py`

**Interfaces:**
- Consumes: `work/inventory.json` (nodes with `rows[].entry`, `running_breaks`, `opening_balance`, `rounding_residual`, `expected_final`, `running_consistent`, `unknown`, `out_of_scope`, `first_date`, `last_date`, `n_rows`), `work/map.json`, `work/auto_rows.json`, `work/decisions/<key>.json` (optional).
- Produces: `work/plans/<key>.json` in the Plan JSON schema (File Structure section), plus two extra informational keys: `warnings: [str]` and `crosscheck: {file_id: missing_rows}`.
- Function: `build_plan(key, entry, nodes, auto_rows, decision) -> plan` (pure), CLI: `python3 make_plan.py [KEY ...]` (all map keys with `files` when none given).
- Decisions file schema (written by analysts, all keys optional):
```json
{"driver_key": "X",
 "nodes": [{"file_id": "F1", "sheet": "S2", "role": "duplicate", "why": "rows ⊆ S1"}],
 "openings": [{"file_id": "F1", "sheet": "S3", "action": "skip|adjust", "why": "…"}],
 "carries":  [{"file_id": "F1", "sheet": "S3", "row": 4, "action": "skip|adjust", "why": "…"}],
 "settled":  [{"file_id": "F1", "sheet": "S1", "why": "final 120 was paid outside the ledger"}],
 "matches":  [{"dl_id": 900, "src": {"file_id": "F1", "sheet": "S1", "row": 160}}, {"dl_id": 901, "src": null}],
 "needs_decision": ["free text the analyst wants the owner to see"]}
```
`settled` declares that a chain sheet's non-zero final was paid outside the ledger: the builder then adds one `adjustment` of `−final` dated at the sheet's last row with note `«εξόφληση εκτός καρτέλας (απόφαση αναλυτή)»` so the running ledger continues from 0, exactly as the next sheet does.

**Rules the builder applies (each one deterministic):**
1. Nodes of the canonical files: role = decision, else `out_of_scope` if the inventory says so or `n_rows == 0`, else `chain`. Chain nodes ordered by `first_date`.
2. Two chain nodes whose `[first_date, last_date]` overlap ⇒ `needs_decision` («φύλλα … επικαλύπτονται χρονικά»).
3. Auto-duplicate: a chain node all of whose rows `(entry_date, trip_value, advance, expenses, amount)` appear in another chain node of the same driver (as a multiset) is demoted to `duplicate` with a warning — unless a decision names it.
4. Per chain node, in order: opening balance → carry rows → each row (`entry` copied, `src` added; `carry` rows never emitted) → break adjustments right after their row → rounding residual last. Opening/carry action: decision, else `skip` when the previous chain node's final equals the amount ±0.05, else `adjust`; an `adjust` over 1,000 in absolute value without a decision ⇒ `needs_decision`.
5. Continuity: if the previous chain node's final is not 0 (±0.05) and the next node does not skip it (opening/carry) and no `settled` decision covers it ⇒ `needs_decision` («το φύλλο … κλείνει με X και το επόμενο ξεκινά από 0 — εξοφλήθηκε εκτός;»).
6. Node arithmetic: Σ deltas of the node's emitted lines must equal `expected_final` (±0.005) — for the first chain node exactly; for later nodes `expected_final` is compared against Σ deltas of that node alone (its ΠΡΟΟΔΕΥΤΙΚΟ restarts). Mismatch ⇒ `needs_decision` with both numbers.
7. Unknown rows, `date_problem` rows, `running_consistent: false` in a chain node ⇒ `needs_decision` naming sheet and row.
8. Crosscheck files: count rows of their sheets not present in the chain multiset → `crosscheck[file_id] = n` (informational; the reviewer reads it).
9. RT overlap: `auto = rows of this driver_id`; `cutoff = min(entry_date) − 1 day` or null. Trips with `entry_date > cutoff` are matched (decision `matches` first, then nearest by `|entry_date − auto.entry_date|` ≤ 2 days, each auto at most once, auto rows with `trip_value` not null are not matchable). A match becomes a patch `{dl_id, trip_value?, advance?, expenses?, note}` (keys only when the Excel value is not null; note = `Excel: <route> · <entry_date>[→<date_end>]`, plus the row's own note if any) and the row leaves the batch. Payments/adjustments after the cutoff stay. Auto rows left ⇒ `auto_unmatched`.
10. Batches: one per canonical file, rows in node order; `expected_final` = Σ deltas of the batch rows. `expected_total_balance` = Σ batch finals + Σ patch deltas. When continuity holds this equals the last chain node's `expected_final` (+ settled adjustments); if it does not, add `needs_decision` («σύνολο καρτέλας … ≠ τελευταίο ΠΡΟΟΔΕΥΤΙΚΟ …»).
11. `status` = `ready` when `needs_decision` is empty, else `needs_decision`. `date_fixes` collected from rows. `create_driver` from the map. `driver_id` from the map.

- [ ] **Step 1: Write the failing tests**

```python
# tools/ledger-import/tests/test_make_plan.py
import unittest, sys, os, copy
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from make_plan import build_plan

def row(rn, date, typ='trip', **kw):
    e = {'entry_type': typ, 'entry_date': date}
    if typ == 'trip': e.update({'date_end': None, 'route': kw.pop('route', 'R'), 'trip_value': kw.pop('value', None), 'advance': kw.pop('advance', None), 'expenses': kw.pop('expenses', None)})
    else: e['amount'] = kw.pop('amount')
    if 'note' in kw: e['note'] = kw.pop('note')
    return {'row': rn, 'entry': e, 'cells': {}, 'date_fix': kw.pop('fix', None), 'date_problem': kw.pop('problem', None), 'date_inherited': False}

def node(file_id, sheet, rows, **kw):
    n = {'file_id': file_id, 'file_name': file_id + '.xlsx', 'sheet': sheet, 'out_of_scope': False, 'rows': rows, 'unknown': [],
         'running_breaks': [], 'opening_balance': None, 'rounding_residual': None, 'running_consistent': True,
         'first_date': min(r['entry']['entry_date'] for r in rows) if rows else None, 'last_date': max(r['entry']['entry_date'] for r in rows) if rows else None,
         'n_rows': len(rows), 'expected_final': kw.pop('final')}
    n.update(kw); return n

ENTRY = {'driver_id': 8, 'files': ['F1'], 'crosscheck': []}

class TestBuildPlan(unittest.TestCase):
    def test_single_sheet_with_break_and_residual(self):
        n = node('F1', 'S1', [row(4, '2024-01-10', value=500, advance=300, expenses=50), row(5, '2024-01-20', 'payment_cash', amount=200), row(6, '2024-02-01', value=230, advance=100)],
                 running_breaks=[{'row': 6, 'entry_date': '2024-02-01', 'diff': '-100.00'}], rounding_residual='0.07', final='80.07')
        p = build_plan('X', ENTRY, [n], [], None)
        self.assertEqual(p['status'], 'ready', p['needs_decision'])
        types = [r['entry_type'] for r in p['batches'][0]['rows']]
        self.assertEqual(types, ['trip', 'payment_cash', 'trip', 'adjustment', 'adjustment'])
        self.assertEqual(p['batches'][0]['rows'][3]['amount'], -100.0)
        self.assertIn('γρ. 6', p['batches'][0]['rows'][3]['note'])
        self.assertEqual(p['batches'][0]['rows'][4]['amount'], 0.07)
        self.assertEqual(p['batches'][0]['expected_final'], '80.07')
        self.assertEqual(p['expected_total_balance'], '80.07')
        self.assertNotIn('rt_id', p['batches'][0]['rows'][0]); self.assertEqual(p['batches'][0]['rows'][0]['src'], {'file_id': 'F1', 'sheet': 'S1', 'row': 4})

    def test_opening_equal_to_previous_final_is_skipped(self):
        a = node('F1', 'S1', [row(4, '2023-01-10', value=500, advance=300)], final='200.00')
        b = node('F1', 'S2', [row(4, '2024-01-10', value=100, advance=50)], opening_balance='200.00', final='250.00')
        p = build_plan('X', ENTRY, [a, b], [], None)
        self.assertEqual(p['status'], 'ready', p['needs_decision'])
        self.assertEqual([r['entry_type'] for b_ in p['batches'] for r in b_['rows']], ['trip', 'trip'])
        self.assertTrue(next(x for x in p['nodes'] if x['sheet'] == 'S2')['opening_carry_skipped'])
        self.assertEqual(p['expected_total_balance'], '250.00')

    def test_previous_sheet_left_a_balance_and_next_starts_fresh(self):
        a = node('F1', 'S1', [row(4, '2023-01-10', value=500, advance=300)], final='200.00')
        b = node('F1', 'S2', [row(4, '2024-01-10', value=100, advance=50)], final='50.00')
        p = build_plan('X', ENTRY, [a, b], [], None)
        self.assertEqual(p['status'], 'needs_decision'); self.assertTrue(any('εξοφλήθηκε' in d for d in p['needs_decision']))
        # the analyst declares it settled outside the ledger → one −200 adjustment, plan ready, total = 50
        p2 = build_plan('X', ENTRY, [a, b], [], {'settled': [{'file_id': 'F1', 'sheet': 'S1', 'why': 'paid in cash 2023-12'}]})
        self.assertEqual(p2['status'], 'ready', p2['needs_decision'])
        adj = [r for r in p2['batches'][0]['rows'] if r['entry_type'] == 'adjustment']
        self.assertEqual(adj[0]['amount'], -200.0); self.assertEqual(adj[0]['entry_date'], '2023-01-10')
        self.assertEqual(p2['expected_total_balance'], '50.00')

    def test_rt_overlap_matching(self):
        n = node('F1', 'S1', [row(4, '2026-07-01', value=500, advance=300), row(5, '2026-08-15', value=600, advance=300, expenses=20, route='ΓΕΡΜΑΝΙΑ'),
                              row(6, '2026-08-20', 'payment_bank', amount=400), row(7, '2026-08-25', value=230, advance=0, route='ΑΘΗΝΑ')], final='510.00')
        auto = [{'dl_id': 900, 'driver_id': 8, 'entry_date': '2026-08-14', 'date_end': '2026-08-21', 'rt_id': 87, 'rt_code': 'RT-1087', 'trip_value': None, 'advance': None, 'expenses': None, 'note': None},
                {'dl_id': 901, 'driver_id': 8, 'entry_date': '2026-08-30', 'date_end': None, 'rt_id': 88, 'rt_code': 'RT-1088', 'trip_value': None, 'advance': None, 'expenses': None, 'note': None},
                {'dl_id': 950, 'driver_id': 9, 'entry_date': '2026-08-15', 'date_end': None, 'rt_id': 89, 'rt_code': 'RT-1089', 'trip_value': None, 'advance': None, 'expenses': None, 'note': None}]
        p = build_plan('X', ENTRY, [n], auto, None)
        self.assertEqual(p['cutoff'], '2026-08-13')
        self.assertEqual(len(p['patches']), 1); pt = p['patches'][0]
        self.assertEqual(pt['dl_id'], 900); self.assertEqual(pt['trip_value'], 600.0); self.assertEqual(pt['expenses'], 20.0); self.assertIn('ΓΕΡΜΑΝΙΑ', pt['note'])
        self.assertEqual([r['entry_type'] for r in p['batches'][0]['rows']], ['trip', 'payment_bank', 'trip'])   # ΑΘΗΝΑ stays: no auto within 2 days
        self.assertEqual(p['auto_unmatched'], [{'dl_id': 901, 'entry_date': '2026-08-30'}])
        self.assertEqual(p['batches'][0]['expected_final'], '230.00'); self.assertEqual(p['expected_total_balance'], '510.00')
        self.assertEqual(p['status'], 'ready', p['needs_decision'])

    def test_match_override_and_unmatch(self):
        n = node('F1', 'S1', [row(5, '2026-08-15', value=600, advance=300, route='ΓΕΡΜΑΝΙΑ')], final='300.00')
        auto = [{'dl_id': 900, 'driver_id': 8, 'entry_date': '2026-08-14', 'date_end': None, 'rt_id': 87, 'rt_code': 'RT-1087', 'trip_value': None, 'advance': None, 'expenses': None, 'note': None}]
        p = build_plan('X', ENTRY, [n], auto, {'matches': [{'dl_id': 900, 'src': None}]})
        self.assertEqual(p['patches'], []); self.assertEqual(len(p['batches'][0]['rows']), 1)

    def test_unknown_and_inconsistent_go_to_needs_decision(self):
        n = node('F1', 'S1', [row(4, '2024-01-10', value=500, advance=300)], final='200.00', unknown=[{'row': 9, 'reason': 'unrecognised row: ΠΡΟΣΤΙΜΟ', 'cells': {}}], running_consistent=False)
        p = build_plan('X', ENTRY, [n], [], None)
        self.assertEqual(p['status'], 'needs_decision')
        self.assertTrue(any('γρ. 9' in d for d in p['needs_decision'])); self.assertTrue(any('ΠΡΟΟΔΕΥΤΙΚΟ' in d for d in p['needs_decision']))

    def test_duplicate_node_auto_detected_and_decision_role(self):
        a = node('F1', 'S1', [row(4, '2024-01-10', value=500, advance=300), row(5, '2024-02-10', value=100, advance=0)], final='300.00')
        b = node('F1', 'S2', [row(4, '2024-02-10', value=100, advance=0)], final='100.00')
        p = build_plan('X', ENTRY, [a, b], [], None)
        self.assertEqual(next(x for x in p['nodes'] if x['sheet'] == 'S2')['role'], 'duplicate')
        self.assertEqual(p['expected_total_balance'], '300.00')
        p2 = build_plan('X', ENTRY, [a, b], [], {'nodes': [{'file_id': 'F1', 'sheet': 'S2', 'role': 'out_of_scope', 'why': 'test'}]})
        self.assertEqual(next(x for x in p2['nodes'] if x['sheet'] == 'S2')['role'], 'out_of_scope')

    def test_create_driver_and_no_auto(self):
        n = node('F1', 'S1', [row(4, '2026-08-27', value=100, advance=0)], final='100.00')
        entry = {'driver_id': None, 'create': {'Full Name': 'New One', 'Active': True}, 'files': ['F1'], 'crosscheck': []}
        p = build_plan('NEW', entry, [n], [{'dl_id': 1, 'driver_id': 8, 'entry_date': '2026-08-27', 'trip_value': None, 'advance': None, 'expenses': None}], None)
        self.assertIsNone(p['driver_id']); self.assertEqual(p['create_driver']['Full Name'], 'New One'); self.assertIsNone(p['cutoff']); self.assertEqual(p['patches'], [])

if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Run** `cd tools/ledger-import && python3 -m unittest tests.test_make_plan 2>&1 | tail -2` → `ModuleNotFoundError: No module named 'make_plan'`.

- [ ] **Step 3: Write `make_plan.py`**

```python
#!/usr/bin/env python3
"""Deterministic plan builder. The graph (which sheets continue which, what an
opening balance means, which Excel trip is which RT) is decided by people or by
the analyst agents in work/decisions/<key>.json; everything that follows from
those decisions — thousands of rows, break lines, patches, sums — is built here,
the same way every time. Anything the rules cannot settle becomes a precise
needs_decision question instead of a guess."""
import datetime as dt, glob, json, os, sys
from collections import Counter
from decimal import Decimal
from rules import d2

HERE = os.path.dirname(os.path.abspath(__file__)); WORK = os.path.join(HERE, 'work')
TOL = Decimal('0.05')

def delta(e):
    if e['entry_type'] == 'trip': return d2(e.get('trip_value')) - (d2(e.get('advance')) - d2(e.get('expenses')))
    if e['entry_type'] == 'adjustment': return d2(e['amount'])
    return -d2(e['amount'])

def sig(e):
    """Row identity for duplicate/crosscheck comparison: what money moved, when."""
    return (e['entry_type'], e['entry_date'], e.get('trip_value'), e.get('advance'), e.get('expenses'), e.get('amount'))

def adj(date, amount, note, src):
    return {'entry_type': 'adjustment', 'entry_date': date, 'amount': float(d2(amount)), 'note': note, 'src': src}

def clean(e, src):
    out = {k: v for k, v in e.items() if v is not None}
    out['src'] = src
    return out

def build_plan(key, entry, nodes, auto_rows, decision):
    dec = decision or {}
    needs = list(dec.get('needs_decision', [])); warnings = []
    files = entry.get('files', [])
    dec_nodes = {(d['file_id'], d['sheet']): d for d in dec.get('nodes', [])}
    dec_open = {(d['file_id'], d['sheet']): d for d in dec.get('openings', [])}
    dec_carry = {(d['file_id'], d['sheet'], d['row']): d for d in dec.get('carries', [])}
    settled = {(d['file_id'], d['sheet']) for d in dec.get('settled', [])}
    canon = [n for f in files for n in nodes if n['file_id'] == f]
    cross = [n for n in nodes if n['file_id'] in entry.get('crosscheck', [])]
    roles = {}
    for n in canon:
        k = (n['file_id'], n['sheet'])
        roles[k] = dec_nodes[k]['role'] if k in dec_nodes else ('out_of_scope' if n['out_of_scope'] or n['n_rows'] == 0 else 'chain')
    chain = sorted([n for n in canon if roles[(n['file_id'], n['sheet'])] == 'chain'], key=lambda n: (n['first_date'] or '9999', files.index(n['file_id'])))
    # rule 3 — auto-duplicate: every row of A appears in B ⇒ A is an extract of B
    sigs = {(n['file_id'], n['sheet']): Counter(sig(r['entry']) for r in n['rows']) for n in chain}
    for a in list(chain):
        ka = (a['file_id'], a['sheet'])
        if ka in dec_nodes or not a['rows']: continue
        for b in chain:
            kb = (b['file_id'], b['sheet'])
            if kb == ka or b['n_rows'] <= a['n_rows']: continue
            if all(sigs[kb][s] >= c for s, c in sigs[ka].items()):
                roles[ka] = 'duplicate'; chain.remove(a); warnings.append('%s/%s: rows ⊆ %s/%s → duplicate' % (a['file_id'][:8], a['sheet'], b['file_id'][:8], b['sheet'])); break
    # rule 2 — overlapping chain nodes
    for i in range(1, len(chain)):
        if chain[i - 1]['last_date'] and chain[i]['first_date'] and chain[i]['first_date'] < chain[i - 1]['last_date']:
            needs.append('φύλλα %s και %s επικαλύπτονται χρονικά (%s > %s)' % (chain[i - 1]['sheet'], chain[i]['sheet'], chain[i - 1]['last_date'], chain[i]['first_date']))
    plan_nodes = [{'file_id': n['file_id'], 'file_name': n['file_name'], 'sheet': n['sheet'], 'role': roles[(n['file_id'], n['sheet'])],
                   'expected_final': n['expected_final'], 'opening_carry_skipped': False, 'why': dec_nodes.get((n['file_id'], n['sheet']), {}).get('why')} for n in canon]
    pn = {(x['file_id'], x['sheet']): x for x in plan_nodes}
    # rules 4-7 — emit lines per chain node
    lines = []          # (file_id, entry dict with src)
    prev_final = None; prev_node = None; date_fixes = []
    for n in chain:
        k = (n['file_id'], n['sheet']); node_lines = []; src0 = {'file_id': n['file_id'], 'sheet': n['sheet']}
        first_date = n['first_date']; last_date = n['last_date']
        # continuity / settlement of the previous sheet
        opening = d2(n['opening_balance']) if n.get('opening_balance') else None
        first_carry = next((r for r in n['rows'] if r['entry']['entry_type'] == 'carry'), None)
        carries_prev = (opening is not None and prev_final is not None and abs(opening - prev_final) <= TOL) or \
                       (first_carry is not None and prev_final is not None and abs(d2(first_carry['entry']['amount']) - prev_final) <= TOL)
        if prev_node is not None and prev_final is not None and abs(prev_final) > TOL and not carries_prev:
            pk = (prev_node['file_id'], prev_node['sheet'])
            if pk in settled:
                lines.append((prev_node['file_id'], adj(prev_node['last_date'], -prev_final, 'εξόφληση εκτός καρτέλας (απόφαση αναλυτή): %s' % next(d['why'] for d in dec['settled'] if (d['file_id'], d['sheet']) == pk), dict(pk[0] and {'file_id': pk[0], 'sheet': pk[1], 'row': None}))))
            else:
                needs.append('το φύλλο %s κλείνει με %s και το επόμενο (%s) ξεκινά από 0 — εξοφλήθηκε εκτός καρτέλας;' % (prev_node['sheet'], prev_final, n['sheet']))
        # opening balance
        if opening is not None:
            action = dec_open.get(k, {}).get('action') or ('skip' if carries_prev else 'adjust')
            if action == 'skip': pn[k]['opening_carry_skipped'] = True
            else:
                if abs(opening) > 1000 and k not in dec_open: needs.append('υπόλοιπο έναρξης %s στο φύλλο %s χωρίς προηγούμενο φύλλο που να το εξηγεί' % (opening, n['sheet']))
                node_lines.append(adj(first_date, opening, 'υπόλοιπο έναρξης φύλλου %s στο Excel' % n['sheet'], dict(src0, row=None)))
        breaks = {}
        for b in n.get('running_breaks', []): breaks.setdefault(b['row'], []).append(b)
        for r in n['rows']:
            e = r['entry']; src = dict(src0, row=r['row'])
            if r.get('date_fix'): date_fixes.append(dict(r['date_fix'], sheet=n['sheet'], row=r['row']))
            if e['entry_type'] == 'carry':
                ck = (n['file_id'], n['sheet'], r['row'])
                action = dec_carry.get(ck, {}).get('action') or ('skip' if (r is first_carry and carries_prev) else 'adjust')
                if action == 'skip': pn[k]['opening_carry_skipped'] = True
                else:
                    if abs(d2(e['amount'])) > 1000 and ck not in dec_carry: needs.append('μεταφορά υπολοίπου %s στο φύλλο %s γρ. %d χωρίς προηγούμενο φύλλο που να την εξηγεί' % (e['amount'], n['sheet'], r['row']))
                    node_lines.append(adj(e['entry_date'], e['amount'], 'μεταφορά υπολοίπου από Excel %s γρ. %d' % (n['sheet'], r['row']), src))
            else:
                node_lines.append(clean(e, src))
            for b in breaks.get(r['row'], []):
                node_lines.append(adj(b['entry_date'], b['diff'], 'διαφορά ΠΡΟΟΔΕΥΤΙΚΟΥ στο Excel, φύλλο %s γρ. %d: %s' % (n['sheet'], r['row'], b['diff']), dict(src0, row=r['row'])))
        if n.get('rounding_residual'):
            node_lines.append(adj(last_date, n['rounding_residual'], 'διαφορά στρογγυλοποίησης Excel, φύλλο %s: %s' % (n['sheet'], n['rounding_residual']), dict(src0, row=None)))
        for u in n.get('unknown', []): needs.append('%s γρ. %d: %s' % (n['sheet'], u['row'], u['reason']))
        for r in n['rows']:
            if r.get('date_problem'): needs.append('%s γρ. %d: %s' % (n['sheet'], r['row'], r['date_problem']))
        if n.get('running_consistent') is False: needs.append('%s: το ΠΡΟΟΔΕΥΤΙΚΟ του Excel δεν συμφωνεί με τις γραμμές (raw %s, αναμενόμενο %s)' % (n['sheet'], n.get('raw_final'), n['expected_final']))
        node_final = sum((delta(x) for x in node_lines), Decimal('0'))
        if n['expected_final'] is None: needs.append('%s: χωρίς ΠΡΟΟΔΕΥΤΙΚΟ και χωρίς στήλη ΥΠΟΛΟΙΠΟ' % n['sheet'])
        elif abs(node_final - d2(n['expected_final'])) > Decimal('0.005'): needs.append('%s: άθροισμα γραμμών %s ≠ expected_final %s' % (n['sheet'], node_final, n['expected_final']))
        lines.extend((n['file_id'], x) for x in node_lines)
        prev_final, prev_node = node_final, n
    # rule 8 — crosscheck
    chain_sigs = Counter(sig(x) for _, x in lines if x['entry_type'] != 'adjustment')
    crosscheck = {}
    for c in cross:
        missing = sum(max(0, cnt - chain_sigs.get(s, 0)) for s, cnt in Counter(sig(r['entry']) for r in c['rows'] if r['entry']['entry_type'] != 'carry').items())
        crosscheck[c['file_id']] = crosscheck.get(c['file_id'], 0) + missing
    # rule 9 — RT overlap
    driver_id = entry.get('driver_id')
    auto = sorted([a for a in auto_rows if driver_id and a['driver_id'] == driver_id], key=lambda a: a['entry_date'])
    cutoff = None; patches = []; used = set()
    if auto:
        cutoff = (dt.date.fromisoformat(auto[0]['entry_date']) - dt.timedelta(days=1)).isoformat()
        forced = {}; unmatched_forced = set()
        for m in dec.get('matches', []):
            if m.get('src') is None: unmatched_forced.add(m['dl_id'])
            else: forced[(m['src']['file_id'], m['src']['sheet'], m['src']['row'])] = m['dl_id']
        matchable = {a['dl_id']: a for a in auto if a.get('trip_value') is None and a['dl_id'] not in unmatched_forced}
        kept = []
        for fid, x in lines:
            if x['entry_type'] != 'trip' or x['entry_date'] <= cutoff: kept.append((fid, x)); continue
            sk = (x['src']['file_id'], x['src']['sheet'], x['src']['row'])
            target = None
            if sk in forced and forced[sk] in matchable and forced[sk] not in used: target = matchable[forced[sk]]
            else:
                d0 = dt.date.fromisoformat(x['entry_date'])
                cands = sorted((abs((dt.date.fromisoformat(a['entry_date']) - d0).days), a['dl_id']) for a in matchable.values() if a['dl_id'] not in used)
                if cands and cands[0][0] <= 2: target = matchable[cands[0][1]]
            if target is None: kept.append((fid, x)); continue
            used.add(target['dl_id'])
            p = {'dl_id': target['dl_id']}
            for f in ('trip_value', 'advance', 'expenses'):
                if x.get(f) is not None: p[f] = x[f]
            note = 'Excel: %s · %s%s' % (x.get('route', ''), x['entry_date'], ('→' + x['date_end']) if x.get('date_end') else '')
            if x.get('note'): note += ' · ' + x['note']
            p['note'] = note; p['src'] = x['src']; patches.append(p)
        lines = kept
    auto_unmatched = [{'dl_id': a['dl_id'], 'entry_date': a['entry_date']} for a in auto if a['dl_id'] not in used]
    # rule 10 — batches
    batches = []
    for f in files:
        rows = [x for fid, x in lines if fid == f]
        if not rows: continue
        fname = next(n['file_name'] for n in canon if n['file_id'] == f)
        batches.append({'file_id': f, 'file_name': fname, 'rows': rows, 'expected_final': str(sum((delta(x) for x in rows), Decimal('0')).quantize(Decimal('0.01')))})
    total = sum((d2(b['expected_final']) for b in batches), Decimal('0')) + sum((d2(p.get('trip_value')) - (d2(p.get('advance')) - d2(p.get('expenses'))) for p in patches), Decimal('0'))
    if chain and prev_final is not None and not needs and abs(total - prev_final) > Decimal('0.005'):
        needs.append('σύνολο καρτέλας %s ≠ τελευταίο ΠΡΟΟΔΕΥΤΙΚΟ %s' % (total, prev_final))
    if not chain: needs.append('κανένα φύλλο καρτέλας προς εισαγωγή')
    return {'driver_key': key, 'driver_id': driver_id, 'create_driver': entry.get('create'),
            'nodes': plan_nodes, 'batches': batches, 'patches': patches, 'cutoff': cutoff, 'auto_unmatched': auto_unmatched,
            'date_fixes': date_fixes, 'needs_decision': needs, 'warnings': warnings, 'crosscheck': crosscheck,
            'expected_total_balance': str(total.quantize(Decimal('0.01'))), 'status': 'ready' if not needs else 'needs_decision'}

def main(keys):
    inv = json.load(open(os.path.join(WORK, 'inventory.json'), encoding='utf-8'))['nodes']
    m = json.load(open(os.path.join(WORK, 'map.json'), encoding='utf-8'))
    auto = json.load(open(os.path.join(WORK, 'auto_rows.json'), encoding='utf-8'))
    os.makedirs(os.path.join(WORK, 'plans'), exist_ok=True)
    keys = keys or [k for k, v in m.items() if not k.startswith('_') and 'alias_of' not in v and v.get('files')]
    counts = Counter()
    for key in keys:
        dp = os.path.join(WORK, 'decisions', key + '.json')
        decision = json.load(open(dp, encoding='utf-8')) if os.path.exists(dp) else None
        plan = build_plan(key, m[key], inv, auto, decision)
        json.dump(plan, open(os.path.join(WORK, 'plans', key + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        counts[plan['status']] += 1
        print('%-32s %-14s rows %5d patches %2d total %10s %s' % (key[:32], plan['status'], sum(len(b['rows']) for b in plan['batches']), len(plan['patches']), plan['expected_total_balance'], ('· ' + plan['needs_decision'][0][:70]) if plan['needs_decision'] else ''))
    print(dict(counts))

if __name__ == '__main__':
    main(sys.argv[1:])
```

- [ ] **Step 4: Run** `cd tools/ledger-import && python3 -m unittest tests.test_make_plan -v 2>&1 | tail -4` → `OK` (8 tests). If `test_previous_sheet_left_a_balance…` fails on the settled adjustment's `src`, the expression `dict(pk[0] and {...})` is over-clever — replace it with `{'file_id': pk[0], 'sheet': pk[1], 'row': None}`.

- [ ] **Step 5: Whole suite** `python3 -m unittest discover -s tests 2>&1 | tail -3` → OK (previous total + 8).

- [ ] **Step 6: Real run** `python3 tools/ledger-import/make_plan.py > tools/ledger-import/work/make_plan.out; tail -1 tools/ledger-import/work/make_plan.out` → prints the status counts, e.g. `{'ready': N, 'needs_decision': M}`. Then `python3 tools/ledger-import/verify_plan.py | grep -c ^OK` and `… | grep ^REJECT | head`. Report both. A REJECT here means the builder and the gate disagree — do not patch either; report the lines.

- [ ] **Step 7: Commit**
```bash
git add tools/ledger-import/make_plan.py tools/ledger-import/tests/test_make_plan.py
git commit -q -m "ledger-import: make_plan — deterministic plan builder from inventory + map + auto rows + analyst decisions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10c: four deterministic fixes surfaced by the first plan run

**Why.** `make_plan.py` produced 53 ready / 31 needs_decision plans. Reading the 73 questions, four groups are not judgment calls:
1. **`date_end` a year off** (`date_end 2026-03-02 before entry_date`, 9 rows): the same year-only repair we do for `entry_date` applies — a `date_end` before the start is repaired when changing its year alone lands it within 0–60 days after `entry_date`.
2. **Node arithmetic off by ≤ 0.05** (`άθροισμα γραμμών 3.86 ≠ expected_final 3.84`, 7 sheets): the inventory only records a `rounding_residual` when |gap| > 0.05, so gaps of 1–5 cents never get their line. Record any residual > 0.005.
3. **Carry / opening of 0.00** (ΚΑΒΑΛΑΡΗΣ: `amount must be > 0 (≠ 0 for adjustment)`): a zero carry or opening means nothing was carried — skip it, do not emit an adjustment of 0.
4. **Payment lines whose expenses equal the amount** (`ΚΑΤΑΘΕΣΗ ΠΕΙΡΑΙΩΣ` with ΕΛΑΒΕ = ΕΞΟΔΑ, 3 rows): the company paid an expense through the driver — net effect on the driver's balance is exactly 0. Such a line is recorded nowhere in the ledger (there is nothing to record) but is counted, never silently: the node gets `zero_net_skipped`.

**Files:**
- Modify: `tools/ledger-import/rules.py` (`classify`: zero-net payment)
- Modify: `tools/ledger-import/inventory.py` (`date_end` repair; residual threshold; `zero_net_skipped` counter; summary)
- Modify: `tools/ledger-import/make_plan.py` (zero carry/opening → skip)
- Tests: `tests/test_rules.py`, `tests/test_inventory.py`, `tests/test_make_plan.py` (one test each)

- [ ] **Step 1: Tests**

`tests/test_rules.py`, inside `TestClassify`, REPLACE `test_payment_line_swallowed_by_expenses_is_unknown` with:
```python
    def test_payment_line_with_expenses_equal_to_amount_is_zero_net(self):
        # ΚΑΤΑΘΕΣΗ ΠΕΙΡΑΙΩΣ 120 / ΕΞΟΔΑ 120: the company paid an expense through the
        # driver; the driver's balance does not move, so there is nothing to record.
        self.assertEqual(classify({'date': D(2024, 4, 1), 'route': 'ΚΑΤΑΘΕΣΗ ΠΕΙΡΑΙΩΣ', 'advance': 120, 'expenses': 120}), 'ZERO_NET')
        with self.assertRaises(Unknown):
            classify({'date': D(2024, 4, 1), 'route': 'ΚΑΤΑΘΕΣΗ', 'advance': 5, 'expenses': 9})
```
`tests/test_inventory.py`, inside `TestParseSheet`, add:
```python
    def test_date_end_year_typo_repaired_and_small_residual_recorded(self):
        ws = book([('ΗΜΕΡ', 'ΛΗΞΗ', 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', None, 'ΑΞΙΑ', 'ΥΠΟΛΟΙΠΟ', 'ΠΡΟΟΔΕΥΤΙΚΟ'),
                   (dt.datetime(2025, 2, 25), dt.datetime(2026, 3, 2), 'ΓΕΡΜΑΝΙΑ', 300, 50, None, 500, 250, 250.02),
                   (dt.datetime(2025, 3, 10), dt.datetime(2025, 3, 15), 'ΚΑΤΑΘΕΣΗ ΠΕΙΡΑΙΩΣ', 120, 120, None, None, 0, 250.02),
                   (dt.datetime(2025, 3, 20), None, 'ΜΕΤΡΗΤΑ', 100, None, None, None, -100, 150.02)])
        n = parse_sheet(ws, today=dt.date(2026, 9, 5))
        self.assertEqual(n['n_rows'], 2)
        self.assertEqual(n['zero_net_skipped'], 1)
        self.assertEqual(n['rows'][0]['entry']['date_end'], '2025-03-02')
        self.assertIsNone(n['rows'][0]['date_problem'])
        self.assertIn('2026-03-02', n['rows'][0]['entry']['note'])
        self.assertEqual(n['rounding_residual'], '0.02')
        self.assertTrue(n['running_consistent'])
```
`tests/test_make_plan.py`, inside `TestBuildPlan`, add:
```python
    def test_zero_opening_and_zero_carry_are_skipped(self):
        a = node('F1', 'S1', [row(4, '2023-01-10', value=500, advance=500)], final='0.00')
        b = node('F1', 'S2', [row(4, '2024-01-10', 'carry', amount=0.0), row(5, '2024-01-12', value=100, advance=50)], opening_balance='0.00', final='50.00')
        p = build_plan('X', ENTRY, [a, b], [], None)
        self.assertEqual(p['status'], 'ready', p['needs_decision'])
        self.assertEqual([r['entry_type'] for b_ in p['batches'] for r in b_['rows']], ['trip', 'trip'])
```
- [ ] **Step 2: Run** the three test files → 3 failures/errors.

- [ ] **Step 3: Implement**

`rules.py`, in the payment-keyword block added by Task 2e, replace
```python
        net = float(d2(adv - (exp or 0)))
        if net <= 0: raise Unknown('payment line whose expenses cancel the amount: %r' % label)
```
with
```python
        net = float(d2(adv - (exp or 0)))
        if net == 0: return 'ZERO_NET'      # advance fully spent on company expenses: the driver's balance did not move
        if net < 0: raise Unknown('payment line whose expenses exceed the amount: %r' % label)
```
`inventory.py`, in the row loop, after `if e == 'TOTALS': totals_skipped += 1; continue` add `if e == 'ZERO_NET': zero_net += 1; continue` and initialise `zero_net = 0` next to `totals_skipped`. In the date pass, replace the two lines
```python
        end = r['entry'].get('date_end')
        if end and end < r['entry']['entry_date']:
            r['date_problem'] = ((r['date_problem'] or '') + ' date_end %s before entry_date' % end).strip()
```
with
```python
        end = r['entry'].get('date_end')
        if end and end < r['entry']['entry_date']:
            # A return date before the departure is almost always a year typo;
            # repair it only when the year alone brings it to 0–60 days after departure.
            start = dt.date.fromisoformat(r['entry']['entry_date']); e0 = dt.date.fromisoformat(end)
            cands = set()
            for y in {e0.year - 1, e0.year + 1, start.year, start.year + 1}:
                try: cand = e0.replace(year=y)
                except ValueError: continue
                if start <= cand <= start + dt.timedelta(days=60): cands.add(cand)
            if len(cands) == 1:
                fixed = cands.pop()
                r['entry']['date_end'] = fixed.isoformat(); add_note(r['entry'], 'λήξη Excel %s → %s (έτος)' % (end, fixed.isoformat()))
                r['date_fix'] = r['date_fix'] or {'from': end, 'to': fixed.isoformat(), 'note': 'λήξη: έτος'}
            else:
                r['date_problem'] = ((r['date_problem'] or '') + ' date_end %s before entry_date' % end).strip()
```
Residual threshold: replace `if abs(gap) <= Decimal('0.05'): consistent, residual = True, None` (or the equivalent lines from Task 2d) so that: `abs(gap) <= Decimal('0.005')` → consistent, no residual; `<= 1.00` → consistent with residual; else inconsistent. Add `'zero_net_skipped': zero_net` to the returned dict and ` · zero-net %d` to the summary with `sum(n['zero_net_skipped'] for n in nodes)`.

`make_plan.py`: in the opening block, wrap so that `if opening is not None and opening == 0: pn[k]['opening_carry_skipped'] = True` (skip, no line) before the action logic; in the carry branch, `if d2(e['amount']) == 0: pn[k]['opening_carry_skipped'] = True; continue` before computing `action`. Also make `carries_prev` true when `prev_final` is within TOL of 0 and the opening/carry is 0 (already covered by the equality test — verify with the test).

- [ ] **Step 4: Run** the whole suite → OK (74 tests).
- [ ] **Step 5: Real run** in order: `python3 tools/ledger-import/inventory.py` (record line), `python3 tools/ledger-import/make_plan.py | tail -1` (record status counts), `python3 tools/ledger-import/verify_plan.py | grep -c ^OK` and `| grep ^REJECT`. Expected: ready ≥ 60, 0 REJECT.
- [ ] **Step 6: Commit**
```bash
git add tools/ledger-import/rules.py tools/ledger-import/inventory.py tools/ledger-import/make_plan.py tools/ledger-import/tests/test_rules.py tools/ledger-import/tests/test_inventory.py tools/ledger-import/tests/test_make_plan.py
git commit -q -m "ledger-import: date_end year repair, residual from 0.005, zero carry/opening skipped, zero-net payment lines counted (first plan run)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9b: write-path safety fixes (review of Tasks 9 + 6b)

**Why.** The review of the write path found: (1) a crash between creating a driver and the first `save(state)` would create the driver twice on rerun; (2) a crash between a successful import and `save(state)` makes the rerun hit `409` with no batch id to reconcile; (3) `apply_patches` overwrites an existing `note`; (4) `state.json` is written non-atomically; (5) `clean_rows` does not strip `rt_id` (defense in depth); (6) the identity gate is asymmetric: a plan can attach an existing `driver_id` to a key the map says must be created.

**Files:**
- Modify: `tools/ledger-import/commit.py`, `tools/ledger-import/tests/test_commit.py`
- Modify: `tools/ledger-import/verify_plan.py`, `tools/ledger-import/tests/test_verify_plan.py`

- [ ] **Step 1: Tests**

`tests/test_commit.py` — change and add:
```python
    def test_ensure_driver_creates_then_resolves_numeric_id(self):
        api = api_with({'post': [{'id': 'recNEW', 'fields': {'Full Name': 'X Y'}}],
                        'get': [{'drivers': [{'id': 77, 'legacy_id': 'recNEW', 'full_name': 'X Y', 'active': True}]}]})
        state = {}; saved = []
        self.assertEqual(C.ensure_driver(api, dict(PLAN), state, save=lambda s: saved.append(dict(s))), 77)
        api.post.assert_called_once_with('/v0/appElT5CQV6JQvym8/tbl7UGmYhc2Y82pPs', {'fields': {'Full Name': 'X Y', 'Active': True}})
        self.assertEqual(state['X']['driver_id'], 77)
        self.assertEqual(len(saved), 1)                      # state persisted the moment the id is known

    def test_import_batch_strips_src_rt_id_and_checks_balance(self):
        api = api_with({'post': [{'batch': 'b1', 'rows': 1, 'balance': '100.00'}]})
        batch = copy.deepcopy(PLAN['batches'][0]); batch['rows'][0]['rt_id'] = 5
        out = C.import_batch(api, 8, batch, file_hash='abc')
        body = api.post.call_args[0][1]
        self.assertNotIn('src', body['rows'][0]); self.assertNotIn('rt_id', body['rows'][0])
        self.assertEqual(out['batch'], 'b1')

    def test_import_batch_409_becomes_mismatch_with_reconcile_hint(self):
        api = MagicMock(); api.post.side_effect = C.ApiError(409, 'this file was already imported')
        with self.assertRaises(C.Mismatch) as cm: C.import_batch(api, 8, PLAN['batches'][0], file_hash='abc')
        self.assertIn('dl_import_batches', str(cm.exception))

    def test_apply_patches_keeps_existing_note(self):
        api = api_with({'patch': [{'id': 900}]})
        auto = [{'dl_id': 900, 'driver_id': 8, 'trip_value': None, 'advance': None, 'expenses': None, 'note': 'παλιά σημείωση'}]
        C.apply_patches(api, 8, PLAN['patches'], auto, {'X': {}}, 'X')
        self.assertEqual(api.patch.call_args[0][1]['note'], 'παλιά σημείωση · Excel: B')

    def test_save_is_atomic(self):
        import tempfile, json, os
        d = tempfile.mkdtemp(); p = os.path.join(d, 'state.json')
        C.save({'a': 1}, path=p)
        self.assertEqual(json.load(open(p)), {'a': 1}); self.assertEqual(os.listdir(d), ['state.json'])
```
(keep the other tests; add `import copy` at the top; `test_import_batch_strips_src_and_checks_balance` is replaced by the new `…strips_src_rt_id…` test; `test_ensure_driver_is_idempotent_from_state` now calls `C.ensure_driver(api, dict(PLAN), {'X': {'driver_id': 77}}, save=lambda s: None)`.)

`tests/test_verify_plan.py` — add:
```python
    def test_plan_driver_id_when_map_says_create_is_rejected(self):
        m = {'driver_id': None, 'create': {'Full Name': 'X Y', 'Active': True}, 'files': ['F1'], 'crosscheck': []}
        self.assertTrue(any('map says create' in e for e in verify(plan(driver_id=42), [NODE], AUTO, m)))
    def test_create_driver_when_map_has_id_is_rejected(self):
        p = plan(driver_id=None, create_driver={'Full Name': 'X Y', 'Active': True})
        self.assertTrue(any('map has driver_id' in e for e in verify(p, [NODE], AUTO, MAP)))
```

- [ ] **Step 2: Run** both test files → failures on the new tests.

- [ ] **Step 3: Implement**

`commit.py`:
- `ensure_driver(api, plan, state, save)` — new fourth parameter; after `st['driver_id'] = match[0]['id']; st['created_legacy_id'] = legacy` call `save(state)` **before** returning. Comment why: a rerun must never POST the driver twice.
- `clean_rows`: `if k not in ('src', 'rt_id') and v is not None` — with a comment that `verify_plan` and the Worker both refuse `rt_id`, this is the third fence.
- `import_batch`: wrap the `api.post` in `try/except ApiError as e: if e.status == 409: raise Mismatch('file %s already imported (409) but not in state.json — reconcile by hand: select * from dl_import_batches where file_hash = %r' % (batch['file_name'], file_hash)); raise`.
- `apply_patches`: when building `body`, if `a.get('note')` is truthy and `'note' in body`: `body['note'] = a['note'] + ' · ' + body['note']`.
- `save(state, path=None)`: write to `path + '.tmp'` then `os.replace(tmp, path)`; default path stays `WORK/state.json`.
- `run()`: pass `save` into `ensure_driver(api, plan, state, save)`.

`verify_plan.py` — after the existing map-driver check add:
```python
    if not map_entry.get('driver_id') and plan.get('driver_id'):
        errs.append('plan has driver_id %s but the map says create — identity mismatch' % plan['driver_id'])
    if map_entry.get('driver_id') and plan.get('create_driver'):
        errs.append('plan creates a driver but the map has driver_id %s' % map_entry['driver_id'])
```

- [ ] **Step 4: Run** the whole suite → OK (previous count + 5).
- [ ] **Step 5: Commit**
```bash
git add tools/ledger-import/commit.py tools/ledger-import/tests/test_commit.py tools/ledger-import/verify_plan.py tools/ledger-import/tests/test_verify_plan.py
git commit -q -m "ledger-import: write-path safety — save after driver create, 409 reconcile hint, keep notes, atomic state, strip rt_id, symmetric identity gate (review 9/6b)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10d: five more deterministic rules from the analyst wave

**Why.** The analysts resolved what needed judgment; what remains in their questions is again arithmetic the code can settle without guessing — the Excel line rule `ΑΞΙΑ − ΕΛΑΒΕ + ΕΞΟΔΑ` is unambiguous, only the label was open:
1. **Return date that cannot be repaired** (day/month slips such as 2026-03-31 → 2026-03-02, 8 rows across 6 drivers): the balance is untouched by `date_end`; a whole driver must not stay blocked. Drop the return date, keep the departure, write the original into the note. Not silent: `date_fix` records `{"from": …, "to": null, "note": "λήξη Excel … μη έγκυρη, αφαιρέθηκε"}`.
2. **Leading rows without a date** (`row without a date and no previous row`, 12 rows in 4 drivers — opening lines typed before the first dated row): inherit the date of the **first dated row below**, with the same kind of note (`ημ/νία από επόμενη γραμμή`). Today the pass inherits only from above.
3. **Advance equal to expenses, no value, no counter, any description** (`ΓΙΑ ΠΡΟΣΤΥΜΟ ΒΟΥΛΓ 115/115`, `ΑΠΌ ΠΡΑΤ ΠΛΥΣΙΜΟ 30/30`): net 0 — the company paid an expense through the driver. Same treatment as the zero-net payment line (`ZERO_NET`, counted), regardless of the wording.
4. **Expenses only, with a description, no advance, no value, no counter** (`ΠΡΟΣΤΙΜΟ ΓΙΑΝΝΙΤΣΩΝ` ΕΞΟΔΑ 170, `ΦΠΑ ΑΠΟΔΕΙΞΕΩΝ` 66): the driver paid a company cost from his own pocket, the company owes it — Excel adds +ΕΞΟΔΑ to the balance. Emit `adjustment +ΕΞΟΔΑ` with note `έξοδα χωρίς δρομολόγιο: <description>`.
5. Two small carry-overs from earlier reviews: in `detect_header` run the **seq fallback before the route inference** (so an unlabeled Α/Α column can never win the "most text" contest); in `commit.py` call `save(state)` also on the reuse path of `ensure_driver` (consistency with the create path).

6. **Two ΥΠΟΛΟΙΠΟ columns.** Several layouts label both «κράτησε» (ΕΛΑΒΕ − ΕΞΟΔΑ, placed before ΑΞΙΑ) and the real line balance (after ΑΞΙΑ) as `ΥΠΟΛΟΙΠΟ`. First-match currently picks «κράτησε», so `balance_sum` is wrong wherever it is the fallback (no ΠΡΟΟΔΕΥΤΙΚΟ). Rule: for the `balance` field the **last** matching column wins.

**Files:**
- Modify: `tools/ledger-import/rules.py`, `tools/ledger-import/inventory.py`, `tools/ledger-import/commit.py`
- Tests: `tests/test_rules.py`, `tests/test_inventory.py`, `tests/test_commit.py`

- [ ] **Step 1: Tests**

`tests/test_rules.py`, inside `TestClassify`, add:
```python
    def test_advance_equal_expenses_without_value_is_zero_net(self):
        self.assertEqual(classify({'date': D(2021, 4, 28), 'cash': 'ΓΙΑ ΠΡΟΣΤΥΜΟ ΒΟΥΛΓ (ΠΡΑΤ)', 'advance': 115, 'expenses': 115, 'value': 0}), 'ZERO_NET')
        self.assertEqual(classify({'date': D(2021, 10, 4), 'advance': 30, 'expenses': 30}), 'ZERO_NET')

    def test_expenses_only_with_description_is_adjustment(self):
        e = classify({'date': D(2021, 3, 3), 'cash': 'ΠΡΟΣΤΙΜΟ ΓΙΑΝΝΙΤΣΩΝ', 'expenses': 170, 'advance': 0, 'value': 0})
        self.assertEqual(e['entry_type'], 'adjustment'); self.assertEqual(e['amount'], 170.0); self.assertIn('ΠΡΟΣΤΙΜΟ', e['note'])
        with self.assertRaises(Unknown):
            classify({'date': D(2021, 3, 3), 'expenses': 170})       # expenses only and no words at all: still a human's call
```
and inside `TestHeader`:
```python
    def test_unlabeled_seq_column_does_not_become_the_route(self):
        rows = [(None, None, None, 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', 'ΥΠΟΛΟΙΠΟ', 'ΑΞΙΑ ΔΡ', 'ΥΠΟΛΟΙΠΟ', 'ΠΡΟΟΔΕΥΤΙΚΟ'),
                ('1', dt.datetime(2023, 9, 14), 'ΘΕΣΣΑΛΟΝΙΚΗ', 0, 0, 0, 60, 60, 60),
                ('2', dt.datetime(2023, 9, 15), 'ΑΘΗΝΑ', 100, 20, 80, 230, 150, 210),
                ('3', dt.datetime(2023, 9, 20), 'ΜΕΤΡΗΤΑ', 200, 0, 200, 0, -200, 10)]
        h = detect_header(rows)
        self.assertEqual(h['cols']['date'], 2); self.assertEqual(h['cols']['seq'], 1); self.assertEqual(h['cols']['route'], 3)

    def test_second_ypoloipo_column_is_the_balance(self):
        rows = [(None, 'ΗΜΕΡΟΜΗΝΙΑ', 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', 'ΥΠΟΛΟΙΠΟ', 'ΑΞΙΑ', 'ΥΠΟΛΟΙΠΟ', 'ΠΡΟΟΔΕΥΤΙΚΟ')]
        self.assertEqual(detect_header(rows)['cols']['balance'], 8)
```
`tests/test_inventory.py`, inside `TestParseSheet`, add:
```python
    def test_leading_undated_rows_inherit_from_below_and_bad_date_end_is_dropped(self):
        ws = book([('ΗΜΕΡ', 'ΛΗΞΗ', 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', None, 'ΑΞΙΑ', 'ΥΠΟΛΟΙΠΟ', 'ΠΡΟΟΔΕΥΤΙΚΟ'),
                   (None, None, 'ΥΠΟΛΟΙΠΟ ΑΠΟ ΠΑΛΙΑ', 390, None, None, None, -390, -390),
                   (dt.datetime(2020, 11, 10), None, 'ΜΕΤΡΗΤΑ', 0, None, None, 390, 390, 0),
                   (dt.datetime(2026, 3, 31), dt.datetime(2026, 3, 2), 'ΒΕΡΟΙΑ-ΑΥΣΤΡΙΑ-ΒΕΡΟΙΑ', 300, 75, None, 600, 225, 225)])
        n = parse_sheet(ws, today=dt.date(2026, 9, 5))
        self.assertEqual(n['n_rows'], 3)
        self.assertEqual(n['unknown'], [])
        self.assertEqual(n['rows'][0]['entry']['entry_date'], '2020-11-10')
        self.assertTrue(n['rows'][0]['date_inherited']); self.assertIn('επόμενη γραμμή', n['rows'][0]['entry']['note'])
        self.assertIsNone(n['rows'][2]['entry']['date_end']); self.assertIsNone(n['rows'][2]['date_problem'])
        self.assertIn('2026-03-02', n['rows'][2]['entry']['note']); self.assertEqual(n['rows'][2]['date_fix']['to'], None)
```
(The second row here has `value 390` with route `ΜΕΤΡΗΤΑ` and `advance 0` — that is the Task 2e "payment keyword but the amount is in ΑΞΙΑ" case and would be `Unknown`. Change that row to `(dt.datetime(2020, 11, 10), None, 'ΕΠΙΣΤΡΟΦΗ', 0, 390, None, None, 390, 0)` — an expenses-only line with a description — so the sheet parses with 3 rows and the test also exercises rule 4.)

`tests/test_commit.py`: in `test_ensure_driver_is_idempotent_from_state` keep as is; add:
```python
    def test_ensure_driver_reuse_path_saves(self):
        api = api_with({}); saved = []
        plan = dict(PLAN); plan['driver_id'] = 8; plan['create_driver'] = None
        self.assertEqual(C.ensure_driver(api, plan, {}, save=lambda s: saved.append(1)), 8)
        self.assertEqual(saved, [1]); api.post.assert_not_called()
```

- [ ] **Step 2: Run** the three files → failures on the new tests.

- [ ] **Step 3: Implement**

`rules.py` — in `classify`, immediately before the `if (cash or bank) and val and not adv and not has_seq:` line, insert:
```python
    # Excel line rule ΑΞΙΑ − ΕΛΑΒΕ + ΕΞΟΔΑ, applied to two shapes that carry no
    # value and no counter: advance == expenses is a company cost paid through the
    # driver (net 0, nothing to record); expenses alone is a company cost the
    # driver paid himself (the company owes it).
    if not val and not has_seq and adv and exp and d2(adv) == d2(exp):
        return 'ZERO_NET'
    if not val and not has_seq and not adv and exp and exp > 0 and label:
        return {'entry_type': 'adjustment', 'entry_date': iso, 'amount': exp, 'note': 'έξοδα χωρίς δρομολόγιο: ' + label}
```
In `detect_header`'s header-cell loop, let a later `ΥΠΟΛΟΙΠ` cell overwrite an earlier one: change the condition `if field not in cols and any(k in n for k in keys)` so that for `field == 'balance'` a repeat match replaces `cols['balance']` (comment: «κράτησε» comes first, the line balance comes after ΑΞΙΑ). Then move the existing `seq` fallback (`if 'seq' not in cols and 'date' in cols and cols['date'] > 1 and cols['date'] - 1 not in used: cols['seq'] = cols['date'] - 1`) so that it runs right after the date inference block and before the route inference block, and add `used.add(cols['seq'])` after it.

`inventory.py` — in the row loop, when `e['entry_date'] is None` and `rows` is empty, do NOT push to `unknown`; instead append the row to a `pending` list (with its `cells`, `rn`, `e`) and continue. When the first row with a date is appended to `rows`, flush `pending` in order before it: each pending entry gets `entry_date = <that date>`, `add_note(e, 'ημ/νία από επόμενη γραμμή (κενή στο Excel)')`, `date_inherited = True`, and is appended to `rows` and `cells_used` ahead of the dated row. If the loop ends with `pending` still non-empty (a sheet with no dated row at all), push them to `unknown` with the old reason.
In the date pass, replace the branch that appends `' date_end %s before entry_date'` (the `else:` of the year-repair) with:
```python
            else:
                # Not a year typo (day/month slip or swapped cells). The balance does not
                # depend on the return date, so the driver is not blocked: drop it, keep
                # the original in the note and in date_fix.
                add_note(r['entry'], 'λήξη Excel %s μη έγκυρη (πριν την αναχώρηση), αφαιρέθηκε' % end)
                r['date_fix'] = r['date_fix'] or {'from': end, 'to': None, 'note': 'λήξη αφαιρέθηκε'}
                r['entry']['date_end'] = None
```
and apply the same drop (with note `λήξη Excel %s > 60 ημέρες μετά την αναχώρηση, αφαιρέθηκε`) for the `e0 > start + 60 days` case when the year repair finds no candidate.

`commit.py` — in `ensure_driver`, on the `if plan.get('driver_id'):` path call `save(state)` before returning.

- [ ] **Step 4: Run** the whole suite → OK (previous count + 6).
- [ ] **Step 5: Real run**: `python3 tools/ledger-import/inventory.py` (line), `python3 tools/ledger-import/make_plan.py | tail -1` (counts), `python3 tools/ledger-import/verify_plan.py | grep -c ^OK`, `… | grep ^REJECT`. The analysts' `work/decisions/*.json` are picked up automatically. Expected: date problems ≤ 3, ready ≥ 65, 0 REJECT.
- [ ] **Step 6: Commit**
```bash
git add tools/ledger-import/rules.py tools/ledger-import/inventory.py tools/ledger-import/commit.py tools/ledger-import/tests/test_rules.py tools/ledger-import/tests/test_inventory.py tools/ledger-import/tests/test_commit.py
git commit -q -m "ledger-import: drop unrepairable return dates (noted), leading undated rows inherit from below, adv==exp is zero-net, expenses-only is an adjustment, seq before route inference, save on reuse path

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
