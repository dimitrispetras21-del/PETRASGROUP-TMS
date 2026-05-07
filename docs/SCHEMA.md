# Airtable Schema Reference

Base ID: `appElT5CQV6JQvym8`. Source of truth for table IDs is [`config.js`](../config.js)
lines 18–53. This doc explains **what each table holds** and **how they
link**, plus the field-naming traps that have bitten us.

---

## Tables

| Table | ID | Purpose |
|---|---|---|
| **ORDERS** | tblgHlNmLBH3JTdIM | International orders (the primary entity) |
| **NAT_ORDERS** | tblGHCCsTMqAy4KR2 | National orders (Greek-only routes) |
| **NAT_LOADS** | tblVW42cZnfC47gTb | National loads — what actually goes on a truck (Direct + Groupage) |
| **GROUPAGE_LINES (GL)** | tblxUAaIsUMEDl3qQ | Multiple suppliers consolidated into a single delivery |
| **CONS_LOADS (CL)** | tbl5XSLQjOnG6yLCW | Consolidated loads — the dispatcher-assigned trucks for groupages |
| **ORDER_STOPS** | tblaeY5QOHAS1gyE8 | Per-stop detail (loading + unloading per order) |
| **RAMP** | tblT8W5WcuToBQNiY | Veroia warehouse ramp board (Vermion Fresh cross-dock) |
| **PALLET_LEDGER_SUPPLIERS** | tblAAH3N1bIcBRPXi | EUR-pallet exchanges with suppliers |
| **PALLET_LEDGER_PARTNERS** | tblAUixdjwpgnJ1hK | EUR-pallet exchanges with partner carriers |
| **TRUCKS** | tblEAPExIAjiA3asD | Owned + partner trucks |
| **TRAILERS** | tblDcrqRJXzPrtYLm | Trailers (linked to trucks) |
| **DRIVERS** | tbl7UGmYhc2Y82pPs | Driver master data |
| **CLIENTS** | tblFWKAQVUzAM8mCE | Client master data |
| **PARTNERS** | tblLHl5m8bqONfhWv | Partner-carrier master data (subcontractors) |
| **LOCATIONS** | tblxu8DRfTQOFRCzS | Loading + delivery locations |
| **WORKSHOPS** | tblMiFxbm9ky8PCQi | Maintenance workshops |
| **MAINT_HISTORY** | tbllPbPPd6N3zEZF1 | Service records |
| **MAINT_REQ** | tbl3vhUmzKDWhJynR | Open work orders |
| **TRIP_COSTS** | tblWUus6uSpqE1LMW | Trip P&L (mostly stub — Trip Costs module pending) |
| **FUEL** | tblxRFsMeVhlLrBjF | Fuel receipts (DADI + DKV) |
| **DRIVER_LEDGER** | tblZVr4BCr9sGFf8n | Driver payroll ledger |
| **PARTNER_ASSIGN** | tblUhgqnmiam5MGNK | Partner assignments to orders/loads (rate, payment terms) |
| **METRICS_SNAPSHOTS** | tblakFiR37kf4uQXy | Historical KPI snapshots |
| **RAMP_EVENTS** | tbllHu40WSq4yWg5S | Ramp lifecycle events (arrived, loaded, departed) |

Special location: `recJucKOhC1zh4IP3` is **Veroia Cross-Dock** (Vermion Fresh).

---

## Sync chain (read this once)

This is the most important model in the app.

```
ORDERS (Veroia Switch=ON, Direction=Export)
        │
        ├──→ NAT_LOADS (Direct, ΑΝΟΔΟΣ — supplier→Veroia)
        │       Source Type='Direct', Source Record=order.id
        │
        └──→ NAT_LOADS (Direct, ΚΑΘΟΔΟΣ — Veroia→client)
                Source Type='Direct', Source Record=order.id

NAT_ORDERS (National Groupage=ON)
        │
        └──→ GROUPAGE_LINES (one per pickup location)
                  Status: Unassigned → Assigned (when matched)
                  │
                  └──→ (drag-drop in Pick Ups iframe)
                          │
                          └──→ CONS_LOADS (one per truck)
                                    │
                                    └──→ NAT_LOADS (Source Record=cl.id)

NAT_LOADS = single planning surface for Weekly National
                Both ΑΝΟΔΟΣ + ΚΑΘΟΔΟΣ are NAT_LOADS records.

ORDER_STOPS (one per stop, both intl + natl)
        Linked to ORDERS or NAT_ORDERS via 'Parent Order' / 'Parent Nat Order'

RAMP (Veroia warehouse)
        Auto-synced from ORDER_STOPS that pass through Veroia.
        One RAMP record per stop per direction.

PALLET_LEDGER_SUPPLIERS / _PARTNERS
        Linked to ORDER_STOPS — every stop with Pallet Exchange=true creates entries.

PARTNER_ASSIGN (subcontractor assignments)
        Links Partner → Order or Partner → Nat Load.
        Stores rate, payment terms, status (Assigned/Cancelled/Done).
```

### Critical rules that the cascade respects (or should)

1. **GL is never deleted** through normal workflow. On Groupage OFF or order
   "restore", GL records get `Status='Unassigned'` (not deleted). Hard
   delete only via cascade through `deleteIntlOrder`/`deleteNatlOrder`.
2. **NAT_LOADS Direct** (Source Type='Direct') is owned by ORDERS or
   NAT_ORDERS directly. If parent dies → cascade kills.
3. **NAT_LOADS Groupage** (Source Record points to a CL.id) is owned by
   the CONS_LOADS record. Killing the GL → kills CL → kills NL chain.
4. **PARTNER_ASSIGN cleanup** was missing pre-commit `3f7b8b5`. Use
   `cleanupOrphans()` to clean legacy ones.
5. **RAMP records** are auto-synced; manual ones (`Source='Manual'`) must
   not be auto-deleted.

### VS date logic

When `Veroia Switch=ON` on an ORDER:

```
Export VS (Direction=Export, loading in Greece):
  NAT Loading  = INTL Loading
  NAT Delivery = INTL Loading + 1 day  (ANODOS leg arrives at Veroia next day)

Import VS (Direction=Import, delivery in Greece):
  NAT Loading  = INTL Delivery - 1 day (KATHODOS leg leaves Veroia day before)
  NAT Delivery = INTL Delivery
```

Direction in NAT_LOADS:
- `ΑΝΟΔΟΣ` (export VS, supplier→Veroia)
- `ΚΑΘΟΔΟΣ` (import VS, Veroia→client)

This was wrong in the original code — fixed in earlier commits. Do **not**
change without re-running the 5 VS scenarios.

---

## Field naming traps

The Airtable schema has accumulated naming inconsistencies. The **wrong**
spelling will cause `422 Unknown field name` errors.

### Typos that are part of the schema (don't "fix")

| Table | Field | Note |
|---|---|---|
| PARTNERS | `Adress` | Single 'd' — same in CLIENTS |
| CLIENTS | `Adress` | Same typo |
| WORKSHOPS | `Address` | Correct here |

### Whitespace traps

| Table | Field | Note |
|---|---|---|
| ORDERS | `Veroia Switch` | NO trailing space (was a previous bug) |
| ORDERS | `Week Number` | NO leading space, FORMULA field — never include in PATCH |

### Direction field has THREE shapes

| Table | Values |
|---|---|
| ORDERS | `Export` / `Import` |
| NAT_ORDERS | `North→South` / `South→North` (with arrow chars `→`) |
| CONS_LOADS | `ΑΝΟΔΟΣ` / `ΚΑΘΟΔΟΣ` (Greek capitals) |
| NAT_LOADS | `ΑΝΟΔΟΣ` / `ΚΑΘΟΔΟΣ` |

### Linked records — value format

```js
fields['Driver'] = ['recABC123']                 // ✅ correct
fields['Driver'] = [{ id: 'recABC123' }]         // ❌ INVALID_RECORD_ID 422
fields['Driver'] = 'recABC123'                   // ❌ wrong shape (must be array)
```

### filterByFormula for linked records

```js
// ✅ reliable
filterByFormula = `FIND("recXXX", ARRAYJOIN({Linked Order}, ","))>0`

// ❌ unreliable — may not work for multiple-record links
filterByFormula = `SEARCH("recXXX", {Linked Order}!="")`
```

### Checkbox / boolean filtering

```js
// ✅
filterByFormula = `{National Groupage}=1`

// ❌ Airtable formulas don't have TRUE() in checkbox context
filterByFormula = `{National Groupage}=TRUE()`
```

### Empty-field detection (Airtable omits empty fields from response)

When a checkbox is `false`, a single-select is empty, or a linked record
field is empty → **Airtable does not include the key in `record.fields`**.

This caused multiple bugs:
- The field validator (`_validateFields` in api.js) used to flag fields as
  "missing" when scanning a single record with that field empty.
  **Fix**: requires N≥5 records before flagging (commit d6e0765).
- Scan extraction sometimes assumed a field would always exist.

When you read a record, **always default-coalesce**: `f['Status'] || 'Pending'`.

---

## F constants (canonical field names)

[`config.js`](../config.js) lines 55–250 export an `F` object with all
non-trivial field names as constants. Use them for grep-ability and to
catch renames at deploy time.

```js
F.STOP_PARENT_ORDER     // 'Parent Order'
F.STOP_PARENT_NAT       // 'Parent Nat Order'
F.STOP_LOCATION         // 'Location'
F.STOP_NUMBER           // 'Stop Number'
F.STOP_PALLETS          // 'Pallets'
F.STOP_TYPE             // 'Stop Type' ('Loading' | 'Unloading')
F.PA_PARTNER            // 'Partner'
F.PA_ORDER              // 'Order'
F.PA_NAT_LOAD           // 'Nat Load'
F.VEROIA_SWITCH         // 'Veroia Switch'
// ... etc
```

Many older modules still use string literals. Migrating to F.* is an open
refactor. New code should always use F.*.

---

## Data integrity checks the app performs

| Where | What |
|---|---|
| `_validateFields` (api.js) | After atGetAll on tables with declared expectations, scans all records for declared fields. Skips if N<5. |
| `_authRoleTampered` (auth.js) | localStorage role must match USERS array entry |
| `atSafePatch` (api.js) | Optimistic concurrency: server-side timestamp vs cached |
| `_atSuppressUndo` flag | Cascade ops don't pollute undo buffer |
| `cleanupOrphans()` (orders_intl.js) | Manual full-base orphan sweep |

---

## What `cleanupOrphans()` checks

Run from console as `cleanupOrphans()`. Scans:

| Source | Considered orphan if |
|---|---|
| GROUPAGE_LINES | Both `Linked International Order` AND `Linked National Order` are empty OR point to deleted records |
| PARTNER_ASSIGN | Both `Order` AND `Nat Load` link fields point to nothing valid |
| RAMP | `Order` or `National Order` link points to deleted record (manual entries with no link are NOT orphans) |
| NAT_LOADS (Direct VS) | `Source Record` set but points to deleted ORDER |

For each orphan GL, it cascades through CL → NL before deleting.

The function is idempotent — safe to re-run.

---

## Things NOT in the schema (but maybe should be)

- **Audit log table** — currently localStorage per-user. Auditors complain
  there's no centralised "who changed what". We agree.
- **`_SCAN_TRAINING` table** — referenced in `core/scan-helpers.js` for
  active learning of scan corrections. Not yet created in Airtable;
  feature falls back to localStorage-only.
- **`is_test` flag** — would help separate test data from real. Not present.
- **Trip Costs P&L** — table exists (`TRIP_COSTS`), schema unclear, module
  not built.

---

## How to inspect schema live

The Airtable API has a Meta endpoint:
```
GET https://api.airtable.com/v0/meta/bases/appElT5CQV6JQvym8/tables
Authorization: Bearer <PAT>
```
Returns full schema with fields, types, options. The audit team should run
this once and diff against this doc — if anything is out of date, please
flag in [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md).
