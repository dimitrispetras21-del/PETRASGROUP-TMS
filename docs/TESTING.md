# Testing — Canonical Flows

Critical user journeys that should pass after any meaningful change.
The audit team can use these as a baseline to validate each module
independently, OR to write automated tests.

There is **no CI gate** at present (see [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md)
§M2 / §M8). These flows are run manually before each deploy.

---

## 🎯 The 5 canonical Veroia Switch (VS) scenarios

These are the most critical because they exercise the entire sync chain.
Run each after any change to: `orders_intl.js`, `core/order-sync.js`,
`core/api.js`, `modules/weekly_natl.js`, `modules/daily_ramp.js`.

### Scenario 1 — Export VS (single supplier, no groupage)

**Setup**: Create a new International order:
- Direction: Export
- Veroia Switch: ON
- National Groupage: OFF
- Loading: 1 stop in Greece (e.g. ASPROPYRGOS)
- Delivery: 1 stop abroad (e.g. Vienna)
- Loading date: 2026-05-12, delivery date: 2026-05-15

**Expected after submit**:
- ✅ ORDER record created with all fields
- ✅ ORDER_STOPS: 1 loading + 1 unloading record (linked via `Parent Order`)
- ✅ NAT_LOADS: **1 Direct ANODOS record** (Source Type='Direct', Direction='ΑΝΟΔΟΣ')
  - Loading: ASPROPYRGOS, date: 2026-05-12
  - Delivery: Veroia Cross-Dock, date: 2026-05-13 (= INTL Loading + 1 day)
- ✅ Daily Ramp Board (date 2026-05-13): inbound entry "ASPROPYRGOS → VERMION FRESH"
- ✅ Weekly National (W19): row appears in **ΑΝΟΔΟΣ column**

### Scenario 2 — Import VS

**Setup**: International order:
- Direction: Import
- Veroia Switch: ON
- Loading: 1 stop abroad (e.g. Hamburg)
- Delivery: 1 stop in Greece (e.g. PATRA)
- Loading date: 2026-05-10, delivery date: 2026-05-14

**Expected**:
- ✅ ORDER + ORDER_STOPS as above
- ✅ NAT_LOADS: **1 Direct KATHODOS record**
  - Loading: Veroia Cross-Dock, date: 2026-05-13 (= INTL Delivery - 1 day)
  - Delivery: PATRA, date: 2026-05-14
- ✅ Daily Ramp (2026-05-13): outbound entry "VERMION FRESH → PATRA"
- ✅ Weekly National: row in **ΚΑΘΟΔΟΣ column**

### Scenario 3 — VS turned OFF (cleanup)

**Setup**: Take the order from Scenario 1. Open Edit. Turn Veroia Switch OFF.

**Expected**:
- ✅ NAT_LOADS Direct record DELETED
- ✅ Daily Ramp record for that order DISAPPEARS
- ✅ Weekly National row DISAPPEARS
- ✅ ORDER itself stays (just no longer triggers VS sync)

### Scenario 4 — National Groupage (multi-supplier consolidation)

**Setup**: Create a National order:
- Type: Groupage
- 3 pickup locations (suppliers A, B, C)
- Loading date: 2026-05-12
- Delivery date: 2026-05-13

**Expected**:
- ✅ NAT_ORDER record created
- ✅ GROUPAGE_LINES: 3 records (one per supplier), Status='Unassigned'
- ✅ National Pick Ups page (Weekly Pickups): 3 line items in "ΕΚΚΡΕΜΕΙΣ ΓΡΑΜΜΕΣ" column
- ✅ Drag a line into "Νέο Φορτηγό" → CONS_LOAD created, GL Status='Assigned'
- ✅ Daily Ramp (2026-05-12): inbound for that supplier with Ramp Category='VS+G'

### Scenario 5 — Delete with full cascade

**Setup**: Take the order from Scenario 4. From the order detail panel,
click 🗑 (red trash icon).

**Expected**:
- ✅ Confirmation dialog mentions cascade
- ✅ On confirm: NAT_ORDER + linked GL + linked CL + linked NL + RAMP + PALLET_LEDGER + ORDER_STOPS + PARTNER_ASSIGN all deleted
- ✅ Toast "Order deleted"
- ✅ National Pick Ups page: lines GONE
- ✅ Run `cleanupOrphans()` in console: returns "no orphans"

---

## 🔁 Other critical flows (per module)

### International Orders

- [ ] Create order via "+ New Order" with all required fields
- [ ] Edit order: change Status, save, verify timeline updated
- [ ] Cancel order (Status → Cancelled, records preserved)
- [ ] Delete order (cascade fires — verify all linked records gone)
- [ ] Search by client name, by reference, by status
- [ ] Filter by direction, status, week
- [ ] Export to CSV
- [ ] Print PDF (new tab opens with table)

### Scan flow (intl)

- [ ] Click "Scan" on Orders Intl page → modal opens
- [ ] Upload OGL Carrier Order PDF (use one of the actual files in test data)
- [ ] AI extracts: client, supplier list, locations, pallets
- [ ] Preview shows: ✓ checkmarks for matched fields
- [ ] **If duplicate Reference exists**: warning banner with link to existing
- [ ] Click "Open Form →" — form pre-filled with all stops, dates, pallets
- [ ] Submit → ORDER + ORDER_STOPS created
- [ ] Re-scan same PDF: duplicate warning fires; on confirm, second order created

### Mobile (drawer + tap targets)

- [ ] Open on iPhone 14 Pro (393×852)
- [ ] Hamburger button visible top-left
- [ ] Tap → drawer slides in from left, ~280px wide
- [ ] Tap nav item → drawer auto-closes + page navigates
- [ ] Tap backdrop → drawer closes
- [ ] National Pick Ups: iframe fills viewport (not 150px collapsed)
- [ ] Daily Ramp tables: horizontal swipe works inside container, no body overflow
- [ ] All filter selects + buttons ≥44px tap target

### Νάκης (AI assistant)

- [ ] Bottom-right floating button → panel opens
- [ ] First-time user: triggers onboarding interview (7 questions)
- [ ] After interview: profile saved (verify localStorage `nakis_profile_*`)
- [ ] Type: "Show me overdue orders" → Νάκης uses tools, returns answer
- [ ] Action chip in response: click → navigates to right page
- [ ] Citations footer: "📎 Orders·12" or similar
- [ ] Paperclip → upload an image → Νάκης describes / extracts
- [ ] Long response: Stop button (red) appears → click cancels
- [ ] Type "ξανα-γνώρισέ με" → confirm dialog → on OK, profile wiped

### Daily Ops Plan

- [ ] Today / Tomorrow toggle works
- [ ] Filters: search text, direction, status — apply live
- [ ] Header subtitle shows: "X orders" + "Y overdue" inline
- [ ] Overdue banner expands on click
- [ ] Mark order as Done → ORDER status updates
- [ ] Postpone → record disappears from today, appears tomorrow

### Daily Ramp Board

- [ ] Auto-syncs from ORDER_STOPS on load
- [ ] Edit Time field → saves; auto-refresh doesn't wipe edit (10s cooldown)
- [ ] Mark Done → status updated, "Stock Status: In Stock" if inbound
- [ ] Postpone → moves to tomorrow with `Postponed To` marker
- [ ] CSV export downloads
- [ ] Print opens new tab with formatted view

### Notifications panel

- [ ] Bell icon shows red dot if any danger items
- [ ] Click bell → panel opens with prioritised list
- [ ] Multiple similar items grouped: "5× KTEO renewals" expandable
- [ ] Action chips on each: Open / Snooze
- [ ] First-time bell click → permission prompt for browser push
- [ ] After grant: future critical items trigger OS-level notification

### Cancel + Delete

- [ ] Intl: Cancel button (orange ✕) on order detail → confirm → Status='Cancelled'
- [ ] Intl: Delete button (red 🗑) → confirm with cascade list → all deletes succeed
- [ ] Natl: same buttons + same behavior
- [ ] Cancel button HIDDEN when status is Delivered / Cancelled / Invoiced

### Permissions

- [ ] Login as `eirini` (accountant): CEO Dashboard NOT in sidebar
- [ ] Open console → `navigate('ceo_dashboard')` → toast "Access denied"
- [ ] Open localStorage → change `tms_user.role` to `owner` → reload → forced logout

---

## 🔧 Edge cases worth checking

| Edge case | Where it bites |
|---|---|
| Greek characters in Notes / Goods | scan extraction, form save, CSV export |
| Empty Status field on a record | field validator (now requires N≥5 records) |
| Order with 0 ORDER_STOPS | cascade delete should not error |
| Pallet count = 0 | division logic in pallet ledger |
| Date in different formats (DD/MM vs YYYY-MM-DD) | scan extraction, day-comparison filters |
| Single-supplier "groupage" (1 pickup) | should NOT create groupage line (Direct path) |
| User's clock is 1 day off | Week Number formula uses server time; UI uses local — investigate |
| Empty Reference | duplicate detection should skip (no false positives) |
| Reference with special chars (e.g. `/`, `"`) | duplicate query escapes these |

---

## 🧪 Existing automated tests

### Unit (`tests/`)
- `test-business.js` — business rule unit tests
- `test-utils.js` — utility function tests
- `test-vs-sync.js` — VS sync chain tests
- Open `tests/test-runner.html` in a browser to run

### E2E (`tests/e2e/`)
- `smoke.spec.js` — page-by-page smoke (no [object Object], no STOP:rec leaks)
- `vs-scenarios.spec.js` — read-only VS chain verification
- Run: `npm install && npm run e2e:install && npm run e2e`
- Requires Node — not currently in CI

---

## 📝 How to report findings

Add to [`audit-findings/`](./audit-findings/) folder, one Markdown file per
issue, naming `YYYY-MM-DD-short-slug.md`. Or open a GitHub issue / PR
referencing this `TESTING.md`.

Template:
```md
# <Short title>

**Severity**: 🔴 critical / 🟠 high / 🟡 medium / 🟢 low
**Module**: <e.g. orders_intl, scan, ramp>
**Reproducible**: yes / no / sometimes

## Steps to reproduce
1. ...
2. ...
3. ...

## Expected
...

## Actual
...

## Console / network
- getErrorLog() output: ...
- relevant network requests: ...

## Suggested fix (optional)
...
```
