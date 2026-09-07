# Backend circuit — Worker & βάση, εγκάρσια (read-only, 7/9/2026)

Πηγές: `worker/src/index.js` (3.779 γραμμές, τελευταίο commit 89d9d6e 7/9 15:02) + Supabase (SELECT μόνο). 36 πίνακες στο `public` schema (όχι 37 — βλ. §4). Καμία εγγραφή/deploy έγινε.

## 1. Χάρτης οθόνες → Worker → βάση (δες backend.json για το διάγραμμα)

8 κυκλώματα οθονών περνούν από 6 οικογένειες routes του Worker προς 9 ομάδες πινάκων:
- **Facade /v0** (`worker/src/index.js:730-1729`, `handleFacadeGet/Create/Update/Delete` 2079-2653): μεταφράζει labels→στήλες για 20 facade IDs (ORDERS, NATIONAL ORDERS/LOADS, GROUPAGE LINES, CONSOLIDATED LOADS, ORDER STOPS, RAMP, LOCAL MOVES, PARTNER ASSIGNMENTS, στόλος/συντήρηση, βασικά αρχεία, PALLET_LEDGER_*, FUEL).
- **/costs/*** (`:2738 handleCosts`): RT (round trips), lines, ledger (μισθοδοσία `dl_entries`), PnL. 401 χωρίς token — ζωντανό.
- **/pallets/*** (`:3241 handlePallets`): αγγίζει ΜΟΝΟ `pl_movements` (movements/confirm/reverse/lookups/balances). ΔΕΝ αγγίζει `pallet_ledger_suppliers/partners`.
- **/auth+PERMISSIONS** (`:99 handleLogin`, `:371 PERMISSIONS`, `:528 can()`): bcrypt login, JWT 8ω, RBAC ανά (ρόλος,πίνακας,μέθοδος).
- **/audit+/app-errors** (`:189/:307/:338`): audit_log (ποιος έγραψε τι), app_errors (σφάλματα front end).
- **/print+/ai** (`:3633 handlePrintPdf`, `:669 handleAiMessages`): PDF μέσω Browser Rendering (διαβάζει orders μέσω can(orders,GET)), proxy προς Anthropic (καμία επαφή με τη βάση).

Λεπτομερές sub-κύκλωμα εθνικών ήδη καλυμμένο σε `docs/data-audit/2026-09/2026-09-07-national-architecture-backend-map.md` — δεν επαναλαμβάνεται εδώ παρά μόνο ό,τι αφορά το backend γενικά.

## 2. PERMISSIONS matrix — ρόλος × πίνακας (`worker/src/index.js:371-527`)

`can(role,table,method)`: `roleMap[table] || roleMap["*"]` — το wildcard ΑΝΤΙΚΑΘΙΣΤΑ, δεν συγχωνεύεται (:528-534).

| Ρόλος | `*` wildcard | Ρητές γραμμές (πίνακας: μέθοδοι) |
|---|---|---|
| **owner** | GET,POST,PATCH,DELETE | καμία ανάγκη — το `*` καλύπτει τα πάντα |
| **management** | GET | orders,invoices:[G,P,Pa]· clients,partners,locations,drivers,trucks,trailers,workshops,maint_history,maint_req:[GPPD]· ramp:[G]· pallet_ledger_suppliers/partners:[GPPD]· partner_assignments:[GPPD]· fuel:[G]· scan_examples:[G,P] |
| **accountant** | GET | fuel:[G]· invoices:[G,P,Pa]· clients,partners,locations,drivers,trucks,trailers:[GPPD]· orders:[G,Pa] (owner 3/9)· pallet_ledger_suppliers:[G,P,Pa]· scan_examples:[G,P] |
| **dispatcher** | ΚΑΝΕΝΑ (κάθε πίνακας ρητός — R-04, όχι P&L) | orders,national_orders:[G,P,Pa]· groupage_lines:[G,P,Pa] (ΧΩΡΙΣ D)· consolidated_loads,national_loads,order_stops,local_moves,ramp,pallet_ledger_*,partner_assignments,clients,partners,locations:[GPPD]· drivers,trucks,trailers,workshops,maint_history,maint_req:[G]· scan_examples:[G,P] |
| **warehouse** | ΚΑΝΕΝΑ | orders,national_orders,consolidated_loads,national_loads,groupage_lines,order_stops,locations:[G] — όλα τα άλλα 403 |

**Πίνακες που πέφτουν στο `*` wildcard** (καμία ρητή γραμμή, σιωπηλά GET-only για management/accountant): `national_orders, national_loads, groupage_lines, consolidated_loads, order_stops, local_moves`. Αν αύριο μπει νέος πίνακας χωρίς ρητή γραμμή, ανοίγει αυτόματα GET σε management/accountant (Αρχή 5).

`invoices` **δεν υπάρχει ως πίνακας Postgres** (information_schema.tables, 36 σύνολο) — οι γραμμές `invoices:[...]` σε management/accountant (γρ.384,432) δεν αγγίζουν ποτέ τίποτα.

**COSTS_PERMS** (`:2721-2729`, ξεχωριστό dictionary — `ctCan()`, όχι `can()`):
| Ρόλος | resources |
|---|---|
| owner | settings,rt,lines,pnl,pallet-gate,lookups,ledger — όλα |
| accountant | settings:[G]· rt,lines:[G,P]· lookups:[G]· ledger:[GPPa] |
| dispatcher | rt:[GPPaD]· lookups:[G] |
| management | lookups:[G]· ledger:[GPPa] — **καμία γραμμή `pnl`** → 403 στο CEO Dashboard P&L |
| warehouse | `{}` — τίποτα |

## 3. Triggers & functions (pg_trigger/pg_proc, SELECT 7/9)

| Trigger | Πίνακας | Function | Σκοπός |
|---|---|---|---|
| order_leg_depth | orders | order_leg_depth | Εμποδίζει self-parent, γονέα-που-είναι-σκέλος, σκέλος-που-έχει-σκέλη (μόνο 1 επίπεδο ιεραρχίας) |
| order_leg_inherit | orders | order_leg_inherit | Το σκέλος κληρονομεί client_id/direction από τον γονέα αν λείπουν |
| order_leg_status_sync | orders | order_leg_status_sync→order_parent_status | Το status του γονέα παράγεται από τα σκέλη (Pending/Assigned/In Transit/Delivered/Cancelled) |
| order_legs_to_parent | orders | order_legs_to_parent | Σκέλος 1→γονέας: φόρτωση· τελευταίο σκέλος→γονέας: παράδοση· hand-over σημείο/ώρα ανάμεσα σε διαδοχικά σκέλη |
| order_parent_to_legs | orders | order_parent_to_legs | Γονέας→σκέλη: πελάτης/αναφορά/εμπόρευμα/θερμοκρασία/παλέτες/φόρτωση σκέλους 1/παράδοση τελευταίου |
| rt_sync_from_order | orders | rt_sync_from_order | Συγχρονίζει driver/truck/trailer/partner ΠΡΟΣ `ct_round_trips` όταν αλλάζει το order (μόνο μέσω order_id — βλ. εθνικό εύρημα Ε6) |
| rt_sync_to_orders | ct_round_trips | rt_sync_to_orders | Αντίστροφη κατεύθυνση: RT→orders |
| dl_sync_from_rt | ct_round_trips | dl_sync_from_rt | Δημιουργεί/ακυρώνει γραμμή `dl_entries` (μισθοδοσία) όταν κλείνει/ακυρώνεται ένα round trip |
| rt_sync_legs | ct_rt_legs | rt_sync_legs | Συγχρονίζει τα σκέλη του γύρου |

Βοηθητικές functions χωρίς trigger: `delete_order_cascade` (RPC, σχολιασμένη — soft-delete order+παιδιά, GL→Unassigned, ορφανά CL διαγράφονται, service_role only), `verify_login`/`upsert_user` (auth, bcrypt), `ct_setting` (διαβάζει `ct_settings`), `log_unknown_field` (γράφει `facade_unknown_fields`, upsert με μετρητή), `order_last_unloading`, `order_legs_audit`/`rt_sync_audit` (γράφουν `audit_log` από triggers), `order_parent_status`, `rt_recompute`, `dl_cancel_batch`. **Κανένα trigger** σε national_orders, national_loads, groupage_lines, consolidated_loads, order_stops, ramp, local_moves, partner_assignments, dl_entries, clients, partners, locations, drivers, trucks, trailers, workshops, maint_* — ο,τιδήποτε cascade εκεί γίνεται μόνο από τον Worker (γι' αυτό οι 14 ορφανές order_stops του εθνικού ευρήματος Ε3).

## 4. Views και ποιος τις διαβάζει

| View | Βάση σε | Διαβάζεται από |
|---|---|---|
| `orders_with_derived` (+3 παλιές _old/_old2/_old3, αλυσίδα ιστορικών migrations) | orders | γενική ανάγνωση ORDERS μέσω facade (readView) |
| `partner_assignments_computed` | partner_assignments+orders | PARTNER ASSIGNMENTS readView (Gross Profit/Margin, R-04 tension) |
| `ct_v_rt_revenue`, `ct_v_rt_costs`, `ct_v_rt_pnl`, `ct_v_rt_pallet_gate`, `ct_v_wear_rate`, `ct_v_consumption` | ct_round_trips/ct_rt_legs/ct_cost_lines/orders/national_loads/partner_assignments | `/costs/pnl`, `/costs/pallet-gate`, CEO Dashboard, Trip Costs |
| `dl_v_entries`, `dl_v_balance`, `dl_v_rt_route`, `dl_v_rt_gap` | dl_entries+ct_round_trips | `/costs/ledger`, καρτέλα οδηγού (payroll.js) |
| `pl_v_order_gate`, `pl_v_balance_clients`, `pl_v_balance_partners`, `pl_v_client_locations` | pl_movements+orders/clients/partners | `/pallets/balances`, pallet_ledger.js |
| `maint_plan_status` | maint_plan+trucks | maintenance.js (πλάνο συντήρησης — 0 γραμμές σήμερα) |
| `v_client_delivery`, `v_driver_delivery`, `v_partner_delivery` | orders | performance.js (on-time %) |

Καμία view πάνω σε: national_orders, groupage_lines, consolidated_loads, ramp, local_moves, pallet_ledger_suppliers/partners, fuel, workshops, users.

## 5. Πίνακες με 0 ζωντανές γραμμές σήμερα (12/36) — γράφει κάποιος;

| Πίνακας | Live/Total | Γράφει κώδικας; |
|---|---|---|
| consolidated_loads | 0/0 | Ναι, weekly_natl.js (drag&drop) — ποτέ δεν χρησιμοποιήθηκε (εθνικό κύκλωμα αχρησιμοποίητο) |
| groupage_lines | 0/0 | Ναι, `_syncGroupageLines` (orders_intl/natl) — 0 παραγγελίες με National Groupage=true |
| local_moves | 0/0 | Ναι, weekly_natl.js:1048 — ποτέ δεν πυροδοτήθηκε |
| cons_load_source_orders | 0/0 | Έμμεσα (junction CL↔orders) — φυσικά άδειο όσο CL=0 |
| maint_req | 0/1 | Ναι — 1 γραμμή δημιουργήθηκε ποτέ (21/7), τώρα soft-deleted |
| maint_plan | 0/0 | Δεν προκύπτει ενεργό UI γραφής σήμερα (μόνο η view `maint_plan_status` το διαβάζει) |
| **pallet_ledger_suppliers** | 0/0 | **Ναι, ενεργά** — `modules/pallet_upload.js:556` (`atCreate(TABLES.PALLET_LEDGER,…)`), κουμπί «Δελτίο παλετών» ζωντανό στο orders_intl.js:934. 0 εγγραφές ΠΟΤΕ παρά την ενεργή κλήση — δεν προκύπτει από τα δεδομένα αν αποτυγχάνει πριν το atCreate ή απλά δεν πατιέται. Το ίδιο το `invoicing.js:1232` λέει «deprecated and empty since the Supabase pallets migration» |
| pallet_ledger_partners | 0/0 | Δεν βρέθηκε ενεργό write path στο front end (μόνο audit_trail.js label) |
| fuel | 0/0 | Όχι από αυτή την εφαρμογή — γράφεται μόνο από εξωτερικό `fuel_import.html` (σχόλιο PERMISSIONS:417) |
| scan_examples | 0/2 | Ναι — 2 γραμμές δημιουργήθηκαν ποτέ (scan-helpers.js), και οι δύο τώρα soft-deleted |
| ct_cost_docs | 0/0 | Δεν προκύπτει handler POST ενεργός σήμερα (σχεδιασμένο για receipt upload, `/costs/*`) |
| ct_plate_aliases | 0/0 | Δεν προκύπτει UI γραφής — πίνακας mapping πινακίδων για cost imports |

## 6. facade_unknown_fields — top 20, τελευταίες 14 ημέρες (σιωπηλός χάρτης απόρριψης)

| Πίνακας | Label | kind | count | last_seen |
|---|---|---|---|---|
| orders | Loading Summary | read | 277 | 6/9 16:12 |
| national_loads | Source Record | read | 49 | **σήμερα 10:46** |
| trailers | Weight kg | read | 33 | 4/9 |
| trucks | Gross Vehicle Weight kg | read | 33 | 4/9 |
| trucks | Tachograph Expiry | read | 28 | **σήμερα 07:17** |
| national_loads | Delivery Appointment | read | 24 | 3/9 |
| national_loads | Loading Appointment | read | 24 | 3/9 |
| trailers | ATP Expiry | read | 17 | 5/9 |
| trailers | Next Maintenance Date | read | 14 | 7/9 |
| trailers | Pallet Capacity | read | 13 | 5/9 |
| trucks | ADR Expiry | read | 13 | 5/9 |
| trucks | Next Maintenance Date | read | 13 | 5/9 |
| ramp | Driver / Order / National Order / Truck | read | 10 έκαστο | 6/9 07:47 (σταμάτησαν εκεί, βλ. εθνικό Ε5) |
| groupage_lines | Groupage ID | read | 8 | 5/9 |
| orders | CMR Received | read | 5 | 5/9 |
| maint_req | Workshop | read | 3 | 3/9 |
| ramp | Unsupported filter FIND(...ARRAYJOIN({Order}…)) | filter | 3 | 3/9 |

`trucks.Tachograph Expiry` ζητείται ΣΗΜΕΡΑ (07:17) ως unknown ενώ ο χάρτης το έχει (γρ. ~810 `"Tachograph Expiry": "tachograph_expiry"`, migration 017) — πιθανό cache παλιού module στον browser (?v= δεν ανανεώθηκε στον client), όχι απόδειξη ελλιπούς χάρτη.

## 7. app_errors — top 15, τελευταίες 14 ημέρες, ομαδοποιημένα κατά signature

| Signature | n | last_seen |
|---|---|---|
| _atRetry: Unsupported query for this table | 73 | 6/9 16:10 |
| field_validation: Missing fields in ORDERS: Status | 56 | 5/9 14:33 |
| _atFetch: Table not available on this backend | 33 | 5/9 07:10 |
| safeFetch: weekly natl: local moves: Table not available | 26 | 3/9 09:03 |
| window.onerror …: renderTrucksHistory is not defined | 15 | 25/8 12:06 |
| safeFetch: dashboard alerts: national loads: Unauthorized | 11 | 6/9 16:33 |
| safeFetch: dashboard alerts: maintenance requests: Unauthorized | 9 | 6/9 00:11 |
| window.onerror …: renderTrailersHistory is not defined | 7 | 25/8 11:48 |
| safeFetch: CEO dashboard: trip costs: Table not available | 5 | 5/9 07:10 |
| window.onerror app.html: closeNatlDetail is not defined | 3 | 6/9 13:35 |
| atGetOne(ORDERS, recX): Record not found | 2 | 7/9 11:50 |
| unhandledrejection: Failed to fetch | 2 | 6/9 08:11 |
| deleteIntlOrder: Cascade delete: N sub-deletes failed | 2 | 6/9 16:10 |
| _atRetry: Unknown linked record in request · NAT_LOADS | 2 | **σήμερα 09:23** (= Ε1 εθνικό) |
| share-menu pdf: Rate limit exceeded (Browser Rendering) | 2 | 26/8 |

«Unauthorized» σε national_loads/maint_req μέσα στο dashboard alerts (11+9 φορές, ζωντανό έως 6/9) δείχνει ρόλο χωρίς δικαίωμα GET σε αυτούς τους πίνακες που ανοίγει το dashboard σε background fetch — πιθανό warehouse ή dispatcher χωρίς `maint_req`.

## 8. RLS ανά πίνακα

**Και οι 36 πίνακες**: `rowsecurity = true`, **policy_count = 0** — καμία εξαίρεση. Το CLAUDE.md το λέει σωστά: «RLS ενεργό αλλά χωρίς πολιτικές· μη βασίζεσαι σε αυτό ως προστασία». Η μοναδική πύλη είναι ο Worker (service_role) + το PERMISSIONS του §2.

## 9. Ο φρουρός των τριών + τι πρόσθεσε το deploy 7/9

| Στοιχείο | Παρόν σήμερα; | Γραμμή |
|---|---|---|
| `order_stops: DELETE` για dispatcher | ✅ | `worker/src/index.js:474` |
| `"VS CD Date": "vs_cd_date"` στα ORDERS | ✅ | `:1216` |
| WORKSHOPS Country/Aliases/"VAT Number"→tax_id/"Legal Name"→legal_name | ✅ | `:866-869` |

Deploy commits 7/9 (89d9d6e, 6f09d96, 3887737) πρόσθεσαν πάνω στον φρουρό: **SCOPED_DELETE** (`:2610` — dispatcher σβήνει `orders` μόνο αν `parent_order_id != null`, δηλ. μόνο σκέλος)· triggers 019/020 parent↔σκέλος (§3)· costs 021 (partner_rate εμφανίζεται ως planned στο `ct_v_rt_costs`, όχι γραμμή που γράφει η οθόνη — DECISION_LOG 2026-09-07). Δεν επιβεβαιώθηκε live μέσω CF API (μόνο ανάγνωση repo/βάσης, όπως ζητήθηκε) — η επαλήθευση deploy παραμένει στον owner κατά τη διαδικασία deploy του CLAUDE.md.

## 10. Ερωτήσεις προς owner

1. `PERMISSIONS.management/accountant.invoices` αναφέρεται σε πίνακα που δεν υπάρχει — να αφαιρεθεί ο νεκρός κανόνας ή προοριζόταν για μελλοντικό πίνακα τιμολόγησης;
2. Το κουμπί «Δελτίο παλετών» (orders_intl.js) γράφει ακόμη στο deprecated `pallet_ledger_suppliers` — να αποσυρθεί το κουμπί ή να συνδεθεί με το `/pallets/*`;
3. `COSTS_PERMS.management` δεν έχει `pnl` — σκόπιμο (P&L μόνο owner) ή παράλειψη που μπλοκάρει το CEO Dashboard;
4. 18 λογαριασμοί users, 7 ενεργοί — να απενεργοποιηθούν/διαγραφούν οριστικά οι 11 demo/stg/zz, ή μένουν για tests;
5. `national_loads "Source Record"` ζητείται ακόμη σε READ σήμερα (49η φορά 10:46) — ποια οθόνη το διαβάζει (ήδη ανοιχτή ερώτηση στο εθνικό backend map, επιβεβαιώνεται ζωντανή εδώ επίσης).
