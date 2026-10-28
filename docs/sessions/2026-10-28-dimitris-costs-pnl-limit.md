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
