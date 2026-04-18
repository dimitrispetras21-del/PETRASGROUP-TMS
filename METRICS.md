# Petras Group TMS — Metrics Catalog

**Last updated:** 2026-04-18
**Source of truth:** `core/metrics.js` (canonical functions)
**Historical storage:** `METRICS_SNAPSHOTS` Airtable table (Phase 3 — pending)

This document is THE single reference for every metric in the app. If you need to compute, display, or interpret a number, it's here.

---

## Naming convention

| Prefix | Meaning |
|--------|---------|
| `op.`  | Operational (real-time state) |
| `perf.` | Performance/SLA |
| `fin.` | Financial |
| `fleet.` | Fleet utilization/compliance |
| `hr.`  | HR/partner |
| `inv.` | Inventory (pallets, stock) |
| `biz.` | Business health / trends |

---

## 🎯 OPERATIONAL

### `op.unassigned_export`
- **What:** Count of export orders without truck or partner assignment
- **Formula:** `COUNT(ORDERS WHERE Direction='Export' AND Truck empty AND Partner empty)`
- **Source:** ORDERS
- **Period:** configurable (default: last 30 days)
- **Canonical fn:** `metrics.unassignedOrders(orders, { direction: 'Export' })`
- **Used in:** dashboard, weekly_intl Command Center

### `op.unassigned_import`
- Same as above but `Direction='Import'`

### `op.pending_today`
- **What:** Today's orders not yet loaded/delivered
- **Formula:** `COUNT(ORDERS WHERE loading_date=today AND Status NOT IN ('In Transit','Delivered','Invoiced'))`
- **Source:** ORDERS
- **Period:** today
- **Canonical fn:** `metrics.pendingToday(orders)`
- **Used in:** daily_ops Command Center

### `op.loadings_today_done`
- **What:** Loadings completed today (status advanced)
- **Formula:** `COUNT(ORDERS WHERE loading_date=today AND Status IN ('In Transit','Delivered','Invoiced'))`
- **Canonical fn:** `metrics.loadingsDone(orders, date)`

### `op.deliveries_today_done`
- **What:** Deliveries completed today
- **Formula:** `COUNT(ORDERS WHERE delivery_date=today AND Status IN ('Delivered','Invoiced'))`
- **Canonical fn:** `metrics.deliveriesDone(orders, date)`

### `op.checklist_pct`
- **What:** % of Daily Ops checklist items completed
- **Formula:** `done_checks / total_checks * 100` across 5 fields: Docs Ready, Temp OK, CMR Photo Received, Client Notified, Driver Notified
- **Canonical fn:** `metrics.checklistProgress(orders)`

### `op.overdue_deliveries`
- **What:** Orders with delivery date past AND not yet delivered
- **Formula:** `COUNT(ORDERS WHERE delivery_date<today AND Status NOT IN ('Delivered','Invoiced'))`
- **Canonical fn:** `metrics.overdueDeliveries(orders)`

### `op.high_risk_deliveries`
- **What:** Unassigned orders with delivery ≤48h away
- **Formula:** `COUNT(unassigned AND delivery ≤ now+48h)`
- **Canonical fn:** `metrics.highRiskDeliveries(orders)`

### `op.pallet_flow_in / _out / _net`
- **What:** Today's pallet inbound/outbound at ramp
- **Formula:** `SUM(Pallets) WHERE Type='Παραλαβή'/'Φόρτωση' AND Plan Date=today`
- **Source:** RAMP
- **Canonical fn:** `metrics.rampPalletFlow(rampRecords, date)`

### `op.stock_pallets`
- **What:** Pallets currently in warehouse
- **Formula:** `SUM(Pallets) WHERE Type='Παραλαβή' AND Status='Done' AND Stock Status='In Stock'`
- **Source:** RAMP
- **Canonical fn:** `metrics.stockInWarehouse(rampRecords)`

---

## 📊 PERFORMANCE

### `perf.on_time_pct`
- **What:** % of delivered orders marked 'On Time'
- **Formula:** `COUNT(Delivery Performance='On Time') / COUNT(Delivery Performance IN ('On Time','Delayed')) * 100`
- **Source:** ORDERS (NAT_LOADS doesn't have this field)
- **Period:** configurable
- **Canonical fn:** `metrics.onTimePct(orders, { period })`
- **⚠️ Was duplicated in 3 modules** — all should now use this fn

### `perf.delayed_pct`
- **What:** `100 - on_time_pct` (of those with Performance set)
- **Canonical fn:** `metrics.delayedPct(orders, { period })`

### `perf.dead_km_avg / _max / _score`
- **What:** Average/max empty kilometers between assignments (Haversine)
- **Formula:** For each truck, match last unload location of trip N to loading location of trip N+1 → distance
- **Source:** ORDER_STOPS + LOCATIONS
- **Score:** `≤50km → 100%`, `50-150km → linear 100-50%`, `>150km → linear 50-0%`
- **Canonical fn:** `metrics.deadKmForPeriod(stops, locations, { period })` → `{avg, max, score, list}`
- **⚠️ Was duplicated in 3 modules**

### `perf.cmr_same_day_pct`
- **What:** % of deliveries where CMR collected within 24h
- **Formula:** `COUNT(CMR Photo Received within 24h of delivery) / delivered * 100`
- **Canonical fn:** `metrics.cmrSameDayPct(orders, { period })`

### `perf.client_update_pct`
- **What:** % of delivered orders where Client Notified=true
- **Formula:** `COUNT(Client Notified=true) / delivered * 100`
- **Canonical fn:** `metrics.clientUpdatePct(orders, { period })`

### `perf.empty_legs_count`
- **What:** Exports without matching import (or vice versa)
- **Formula:** Country-code match heuristic between unload location and next load location
- **Canonical fn:** `metrics.emptyLegs(exports, imports)` → `{soloExp, soloImp, total}`

### `perf.on_time_trend`
- **What:** On-time % per week for last N weeks
- **Canonical fn:** `metrics.onTimeTrend(orders, { weeks })` → `[{week, pct}, ...]`

### `perf.on_time_streak`
- **What:** Consecutive weeks with ≥90% on-time
- **Canonical fn:** `metrics.onTimeStreak(orders, { currentWeek, threshold=90 })` → `number`

---

## 💰 FINANCIAL

### `fin.outstanding_balance_eur`
- **What:** Delivered but not yet invoiced
- **Formula:** `SUM(Price) WHERE Status='Delivered' AND Invoiced=false`
- **Source:** ORDERS + NAT_ORDERS combined
- **Canonical fn:** `metrics.outstandingBalance(orders, natOrders)`

### `fin.revenue_invoiced`
- **What:** Already invoiced revenue (filterable by period)
- **Formula:** `SUM(Price) WHERE Status='Invoiced'`
- **Canonical fn:** `metrics.revenueInvoiced(orders, natOrders, { period })`

### `fin.revenue_ready_to_invoice`
- **What:** Delivered orders eligible for invoicing (pallet sheets OK if Pallet Exchange=true)
- **Canonical fn:** `metrics.revenueReadyToInvoice(orders)`

### `fin.overdue_invoices_30d`
- **What:** Delivered >30 days ago, still not invoiced
- **Canonical fn:** `metrics.overdueInvoices(orders, { daysCutoff=30 })`

### `fin.pallet_balance_suppliers`
- **What:** Net pallets owed by suppliers
- **Formula:** `SUM(Pallets WHERE Direction='OUT') - SUM(Pallets WHERE Direction='IN')` in PALLET_LEDGER_SUPPLIERS
- **Canonical fn:** `metrics.palletBalance(ledgerRecs, { counterpartyField: 'Loading Supplier' })`

### `fin.pallet_balance_partners`
- Same as above but PALLET_LEDGER_PARTNERS
- **Canonical fn:** `metrics.palletBalance(ledgerRecs, { counterpartyField: 'Partner' })`

### `fin.top_debtors`
- **What:** Top N counterparties with positive pallet balance
- **Canonical fn:** `metrics.topDebtors(ledgerRecs, { counterpartyField, topN=5 })`

---

## 🚛 FLEET

### `fleet.utilization_pct`
- **What:** % of active trucks with any assignment this week
- **Formula:** `trucks_with_assignment / active_trucks * 100`
- **Canonical fn:** `metrics.fleetUtilization(trucks, orders, { week })`

### `fleet.usage_rate_avg`
- **What:** Average per-truck usage across fleet
- **Formula:** `MIN(working_days * 4.5 * 4.5%, 100%)` per truck, then average
- **Canonical fn:** `metrics.fleetUsageRate(trucks, orders, { week })`

### `fleet.idle_trucks`
- **What:** Count of active trucks with 0 assignments this week
- **Canonical fn:** `metrics.idleTrucks(trucks, orders, { week })`

### `fleet.expiry_alert_trucks`
- **What:** Trucks with KTEO/KEK/Insurance expiring ≤30 days OR expired
- **Canonical fn:** `metrics.expiryAlerts(trucks, { daysAhead=30 })` → `{kteo, kek, insurance, total}`

### `fleet.expiry_alert_trailers`
- Same for trailers (ATP + Insurance)
- **Canonical fn:** `metrics.expiryAlertsTrailers(trailers, { daysAhead=30 })`

### `fleet.compliance_pct`
- **What:** % of active trucks with ALL docs valid
- **Formula:** `trucks_valid_all / active_trucks * 100`
- **Canonical fn:** `metrics.compliancePct(trucks)`

### `fleet.downtime_hours`
- **What:** Estimated hours of fleet downtime (pending maint × 24h)
- **Canonical fn:** `metrics.fleetDowntime(maintRecs)`

---

## 👥 HR & PARTNER

### `hr.assignment_rate_pct`
- **What:** % of orders assigned (truck or partner) for period
- **Canonical fn:** `metrics.assignmentRate(orders, { week })`

### `hr.partner_trip_pct`
- **What:** % of assigned trips done by partners
- **Canonical fn:** `metrics.partnerTripPct(orders, { week })`

### `hr.assignment_speed_hrs`
- **⚠️ PLACEHOLDER — not yet computed from real data**
- **Intended formula:** Avg hours from order creation to truck assignment (last mod on Truck field - Created time)
- **Canonical fn:** `metrics.assignmentSpeed(orders)` — **TODO**

### `hr.work_orders_resolved_pct`
- **Canonical fn:** `metrics.workOrdersResolvedPct(maintRecs, { period })`

### `hr.crisis_events_resolved`
- **Canonical fn:** `metrics.crisisEventsResolved(maintRecs)` → count of critical/high priority done

---

## 📦 INVENTORY

### `inv.pallet_sheets_complete_pct`
- **What:** % of orders with Pallet Exchange that have both sheets uploaded
- **Canonical fn:** `metrics.palletSheetsComplete(orders)` → `{complete, missing, pct}`

### `inv.stock_age_buckets`
- **What:** Warehouse pallets grouped by age (fresh/aging/old)
- **Canonical fn:** `metrics.stockAgeBuckets(rampRecs)` → `{fresh_le_1d, aging_2_3d, old_gt_3d}`

---

## 🏢 BUSINESS HEALTH

### `biz.weekly_score`
- **What:** Composite weekly health score 0-100
- **Formula:** `0.30 * assignment_rate + 0.30 * on_time_pct + 0.25 * compliance_pct + 0.15 * dead_km_score`
- **Color:** Green ≥85, Amber 70-84, Red <70
- **Canonical fn:** `metrics.weeklyScore({ assignment_rate, on_time, compliance, dead_km_score })` → `{ score, color }`

### `biz.orders_delta_wk`
- **What:** Orders count this week vs last week
- **Canonical fn:** `metrics.ordersDelta(ordersThisWk, ordersLastWk)` → `{current, prev, delta, deltaPct}`

### `biz.assignment_delta_wk`
- Same for assignment rate

### `biz.imbalance`
- **What:** `ABS(exports - imports)` for current week
- **Canonical fn:** `metrics.directionImbalance(exports, imports)`

---

## 📋 Known issues / TODO

| Metric | Issue |
|--------|-------|
| `hr.assignment_speed_hrs` | Placeholder 3.2h, not computed |
| `perf.on_time_pct` for NAT_LOADS | Field doesn't exist in NAT_LOADS — returns 0 |
| `biz.national_profitability` | Placeholder 0%, no logic |
| Dead KM | Heavy compute, should be cached |

---

## Version history

- **2026-04-18**: Initial catalog. 62 metrics documented across 7 categories.
