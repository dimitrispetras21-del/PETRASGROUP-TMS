# 2026-10-28 · dimitris · Το όριο 300 του `GET /costs/pnl`

- Μέτρηση (SELECT): 198 RT στο P&L (όλα τα μη ακυρωμένα του `ct_round_trips`), 78 νέα σε 28 ημέρες, 19 σε 7, και από σήμερα οι εθνικοί κύκλοι v5 (πρώτος: RT-1285, 12:18 UTC). Το `limit 300` θα έκοβε σιωπηλά σε ~5 εβδομάδες, από τη λίστα και από τα σύνολα. Το διαβάζει μόνο το TRIP PnL (`modules/costs.js`, owner), χωρίς φίλτρο. Το CEO dashboard και το `orders_week_view` δεν το καλούν.
- Worker: μία ανάγνωση 999 (`id.desc`) και ακριβής αριθμός από τον `ct_round_trips` με το WHERE της όψης, απάντηση `records/truncated/cap/total`, κοινό `dbExactCount` με το `/pallets/movements`. Δεν μπήκαν σελίδες όπως στο #134, γιατί η όψη ξαναϋπολογίζει τα πάντα σε κάθε ανάγνωση. Front end: ⚠ πάνω από το banner με τα σύνολα και στο 90%· άδεια λίστα με αριθμό > 0 = κάρτα σφάλματος.
- Περιστατικό: τα ερωτήματα μέτρησης πάνω στην όψη (`count=exact`, `select=*`) έληξαν σε timeout και ακολούθησαν δύο επανεκκινήσεις της Supabase (12:11:39 και 12:16:49 UTC, ώρες γραφείου). Από εκεί και πέρα μόνο φθηνά ερωτήματα σε πίνακες. Ο συντονιστής ενημερώθηκε αμέσως.
- Αλυσίδα: ζωντανός ο `1e79907d`, και `worker/src` του main = `cd3a4568` = πηγή του. Φρουρός σε ζωντανό bundle και στην πηγή: `GUARD OK (28 markers, plan=2, handover=1, f3=1, f5=1)`. Tests: `worker/test` 407/0, `tests/` 1043/2 (τα 2 wn5 είναι κόκκινα ήδη στο `origin/main`: το harness περιμένει `PLAN_WRITES_OPEN = false`).
- Μένει: go deploy του owner· μετά, `total` = `records.length` = `count(*)` και σημάδι φρουρού `const PNL_CAP = 999;`· να φύγει ο κλάδος «300 χωρίς truncated» του front end· **η επίδοση της `ct_v_rt_pnl`/`ct_v_rt_revenue` (το πραγματικό όριο, θέλει owner)**· κοινό helper front end με το `_plvCut`.

## Περιστατικό 28/10: επανεκκινήσεις της Supabase στις 12:11:39 και 12:16:49 UTC

Ερωτήματα αυτού του session πάνω στις όψεις, με τις ώρες του edge log (UTC):

| ώρα | ερώτημα | αποτέλεσμα |
|---|---|---|
| 12:10:28 | REST `ct_v_rt_pnl?select=id`, `Prefer: count=exact`, `Range: 0-0` | 500, 57014 statement timeout |
| 12:10:37 | το ίδιο με `&scope=eq.INTL` | 500, 57014 |
| 12:10:48 | το ίδιο με `&scope=eq.NATL` | 500, 57014 |
| 12:10:59 | REST `ct_v_rt_pnl?limit=1` (όλες οι στήλες, χωρίς order) | **521** |
| 12:11:39 | **η βάση ξεκινά ξανά** («database system is starting up», χωρίς πριν «shutting down») | |
| 12:11:42 | REST `ct_v_rt_pnl?select=id&limit=1` ×3 | 521 (βάση κάτω) |
| ~12:13–12:14 | REST `ct_v_rt_pnl?select=id&limit=1` ×2 · `?select=*&order=margin_worst_pct.asc.nullsfirst&limit=300` ×2 · `ct_v_rt_revenue` / `ct_v_rt_costs` / `dl_v_rt_route` / `ct_v_rt_pallet_gate` `?select=*&limit=1` | όψη P&L 500 στα ~12 δευτ.· revenue 500 στα 11 δευτ.· costs 200 στα 5,2 δευτ.· οι άλλες δύο 200 σε <1 δευτ. |
| 12:15:56 | SQL `SELECT count(*) FROM ct_v_rt_pnl` (timeout 60 δευτ.) | 197 σε 0,27 δευτ. |
| ~12:16 | REST `ct_v_rt_pnl?select=*&order=…&limit=300` ×2 · `ct_v_rt_revenue?select=*&limit=1` ×2 | 200 σε 1,8 και 5,4 δευτ.· revenue 200 σε 6,1 δευτ., μετά **521 στα 31 δευτ.** |
| 12:16:49 | **η βάση ξεκινά ξανά** | |
| μετά | SQL `… NOT IN (SELECT id FROM ct_v_rt_pnl)` και `count(*)` όψης (timeout 5 δευτ.) · ένα `EXPLAIN` χωρίς ANALYZE | και τα δύο ακυρώθηκαν στα 5 δευτ. (12:19–12:36) |

- Στο `postgres_logs` δεν φάνηκε OOM ή «terminated by signal». Η εκκίνηση έρχεται χωρίς τερματισμό πριν, άρα πιθανότατα σκληρό κλείσιμο από την πλατφόρμα. Η σύνδεση με τα ερωτήματα είναι **χρονική** (δύο φορές, αμέσως μετά από 521 σε ανάγνωση όψης), όχι αποδεδειγμένη.
- Τα timeouts 12:18:58–12:19:01 (5 σε 3 δευτ.) δεν ξέρω αν ήταν δικά μου. Μπορεί να ήταν η εφαρμογή, άρα και το `/costs/pnl` του owner κινδυνεύει ήδη.
- Εύρημα: αν ακόμη και `limit=1` στην όψη παίρνει 8–31 δευτ., η **απόδοση της όψης** είναι το πραγματικό πρόβλημα, πιο σοβαρό από το όριο των 300. Από 12:20 UTC (οδηγία συντονιστή): καμία ανάγνωση βαριών όψεων χωρίς ρητή έγκριση owner· μόνο πίνακες βάσης και `EXPLAIN` χωρίς ANALYZE.
- Το PR #145 έγινε **draft**: σήμερα δεν αλλάζει τίποτα στον Worker (197–198 γραμμές, δεν κόβει). Ο κλάδος `deploy/worker-costs-pnl` **δεν** ανεβαίνει.

## Γιατί η όψη είναι αργή (βήμα α, go συντονιστή· μόνο catalog και πίνακες βάσης, timeout 3 δευτ.)

- Οι διεθνείς LEFT JOIN της `ct_v_rt_revenue` δεν φουσκώνουν: όλες πάνε σε primary key, 1:1. Οι ~9,5·10^8 εκτιμώμενες γραμμές του EXPLAIN βγαίνουν από τον κλάδο v5 (`ct_v_v5_revenue`, recursive `anc` πάνω στη `v_piece_state`): `locations_one_hub` 674×674 → 454.276 → αναδρομή 45,6 εκ. → Merge Join 9,5·10^8.
- Αιτία: οι 5 πίνακες v5 (`shipment_pieces`, `shipments`, `piece_legs`, `rt_stops`, `rt_vehicle_segments`) δεν έχουν αναλυθεί ποτέ (`reltuples = -1`, 0 γραμμές στο `pg_statistic`), και ο planner βάζει δικές του εκτιμήσεις. Στην πραγματικότητα το `shipment_pieces` έχει 9 γραμμές, η πρώτη στις 11:39 UTC της ημέρας L. Το autoanalyze δεν τρέχει πριν από ~50 αλλαγές ανά πίνακα.
- Τα timeouts 12:18:58–12:19:01 ήταν η εφαρμογή: 3× `rpc/plan_board` και 2× `rpc/plan_nat_state` → 500, δηλαδή το board εθνικών v5 και οι Παραγγελίες. Το `plan_board` ξαναπέτυχε στις 12:19:34.
- Πρόταση για έγκριση owner (εντολή στη βάση): `ANALYZE` στους 5 πίνακες v5, και μετά `EXPLAIN` χωρίς ANALYZE για να φανεί αν έπεσαν οι εκτιμήσεις. Πέρασε στον συντονιστή.
- Έλεγχος μετά το «Έτρεξα το ANALYZE στους πέντε πίνακες v5» του owner (catalog, timeout 3 δευτ.): στο project «Petrasgroup TMS» και οι 5 πίνακες έχουν ακόμη `reltuples = -1`, 0 στατιστικά και `last_analyze` null, και στο log δεν υπάρχει ANALYZE μετά τις 12:40 UTC. Μάλλον έτρεξε σε άλλο project/branch ή σε συναλλαγή που έκανε rollback. Το EXPLAIN θα ξανατρέξει μόλις φανεί `reltuples ≠ -1`. Κανένα 500 σε `rpc/plan_board` / `rpc/plan_nat_state` μετά τις 12:40 UTC (τελευταία 12:18:49–53).
- Μετά το δεύτερο ANALYZE του owner (12:57:32 UTC, project «Petrasgroup TMS»): `reltuples` piece_legs 2, rt_stops 4, rt_vehicle_segments 2, shipment_pieces 10, shipments 10, με στατιστικά σε κάθε στήλη. Το ίδιο `EXPLAIN` (χωρίς ANALYZE) έπεσε από κόστος 1,0·10^8 και μέγιστη εκτίμηση 9,5·10^8 γραμμών σε **3,1·10^6 και 1,4·10^7** (×32 και ×67). Μένει ψηλά γιατί η `locations.is_hub` (στήλη της 071) δεν έχει στατιστικά: ο planner υποθέτει 674 hubs (50% των 1.369) αντί για 1, και η `v_piece_state` τη χρησιμοποιεί 6 φορές (674×674). Επόμενο βήμα για έγκριση owner: `ANALYZE public.locations;`.
- Logs από 12:57 UTC: καμία κλήση `ct_v_rt_pnl` / `rpc/plan_board` / `rpc/plan_nat_state` (γραφείο κλειστό), άρα οι χρόνοι μετρούν από αύριο το πρωί. Ένα statement timeout στις 12:58:22 με άγνωστο αίτημα (όχι αυτού του session).
- Πώς να μην ξανασυμβεί (πρόταση, αρχή 6): (α) κάθε migration που δημιουργεί πίνακα ή προσθέτει στήλη που μπαίνει σε φίλτρο ή JOIN τελειώνει με `ANALYZE <πίνακας>` (και ο έλεγχος των drafts στο CI το απαιτεί)· (β) έλεγχος του ελεγκτή: πίνακας `public` με `reltuples = -1` ή στήλη χωρίς γραμμή στο `pg_stats` ενώ ο πίνακας έχει γραμμές → κόκκινο την ίδια μέρα. Το (β) πιάνει και ό,τι ξεφύγει από το (α).
