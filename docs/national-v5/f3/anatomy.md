# Φ3 · Ανατομία (SELECT μόνο) · 23/10/2026

> Γράφτηκε νύχτα 22→23/10 (μετρήσεις 00:55–01:06 ώρα Αθήνας) με **μόνο SELECT** στο `gatejgbpyodlepkvqkgf`. Καμία εγγραφή, κανένα deploy, κανένα commit. Πηγές: spec `docs/superpowers/specs/2026-10-21-national-v5-design.md` (§5 Ε6–Ε11, Ε21, §8), master plan Task Φ3, `docs/national-v5/tech-draft-2026-10-21.md` §Φ3, F2 πλάνο (πίνακας «Αφετηρία»).
>
> **Πώς επαληθεύτηκε το «κατά γράμμα»:** κάθε ορισμός παρακάτω αντιγράφηκε από την απάντηση του `pg_get_viewdef(oid, true)` / `pg_get_functiondef(oid)`, ξαναγράφτηκε σε αρχείο και το md5 του αρχείου (UTF-8, ακριβώς το κείμενο της βάσης) **ταυτίζεται** με το md5 που υπολόγισε η βάση. Μόνη διαφορά στην εμφάνιση: το `pg_get_functiondef` τελειώνει σε ένα newline που μέσα στο code block δεν φαίνεται (για md5 από αυτό το αρχείο: κείμενο του block + `\n` στις συναρτήσεις, σκέτο στις όψεις). Δεν υπάρχει γραμμή εδώ που να μην πέρασε αυτόν τον έλεγχο.
>
> **Δύο md5 για κάθε όψη**, γιατί το repo χρησιμοποιεί και τα δύο: `pretty` = `md5(pg_get_viewdef(oid, true))` (σύμβαση 057, `drafts/057_stock_lots_verify.sql:71`) · `plain` = `md5(pg_get_viewdef(oid))` (σύμβαση 034, `034_rt_create_national.sql:124-126`). Για συναρτήσεις: `prosrc` = `md5(prosrc)` (σύμβαση φρουρού 071/072) · `def` = `md5(pg_get_functiondef(oid))`.

---

## 0. Τα σημαντικά πρώτα (για όποιον γράψει το πλάνο Φ3)

1. **Σήμερα κανένα RT δεν έχει εθνικό σκέλος.** 202 RT, όλα `scope='INTL'`, 367 σκέλη, **0** με `nat_load_id`. Άρα `revenue_natl = 0` σε 202/202 και ο κλάδος «Direct NL + VS» του `ct_v_rt_revenue` δεν πυροδοτείται ποτέ. Το 034 είναι ζωντανό (`rt_sync_national_load`, `rt_auto_close` μετρούν NL) αλλά αδρανές: 21 ζωντανά NL με παράδοση ≥ 5/10, **0** με όχημα (B-59 πράσινο = 0).
2. **Το X του VS αφαιρείται από το διεθνές έσοδο και δεν πιστώνεται πουθενά.** 71 σκέλη με VS (17 Export × 850, 54 Import × 650): **49.550 €** αφαιρέθηκαν (48.900 € σε μη ακυρωμένα RT). Επειδή δεν υπάρχει σκέλος NL σε RT, το ποσό λείπει από το συνολικό έσοδο του P&L (σύνολο `ct_v_rt_pnl.revenue` = 889.335,15 €). Δεν το διορθώνει η Φ3 (snapshot πριν = μετά)· πάει στον owner (§10, επιλογή 1).
3. **`total_km` είναι NULL σε 202/202 RT.** Η φθορά (`wear`) είναι 0 παντού και το `ct_v_wear_rate` δίνει το fallback 0,082 €/km και στα 46 φορτηγά. Το Ε8 δεν αλλάζει κανένα ποσό σήμερα.
4. **Το DKV ταιριάζει RT κατά φορτηγό + ημέρα (±1), όχι κατά ώρα.** Η ώρα διαβάζεται από τον parser (μόνο σε γραμμές καυσίμου, best effort) αλλά **δεν αποθηκεύεται** (`ct_cost_lines.line_date` = `date`, το `toCostLineRow` την πετά). Το ταίριασμα γίνεται στο preview, άρα η ώρα είναι διαθέσιμη εκεί και μόνο εκεί.
5. **Το «κλειστό» του `/costs/rt` δεν υπολογίζεται στον Worker.** Ο Worker επιστρέφει το `ct_round_trips.status` όπως είναι· το γράφει η βάση (`rt_auto_close`, 046) και το διαβάζει το front end (`expenses.js:750 exIsDone`, `costs.js:197`). Για `model=2` το `rt_auto_close` επιστρέφει νωρίς (071), άρα ένας κύκλος v5 θα έμενε «Σε εξέλιξη» για πάντα χωρίς το Ε21.
6. **Η πύλη παλετών συνεργάτη είναι 0/103 πράσινη** (`ct_v_rt_pallet_gate.sheets_ok`), όχι «πάντα πράσινη».
7. **Οι όψεις χρημάτων δεν έχουν GRANT στον ελεγκτή.** `ct_v_rt_revenue/costs/pnl`, `dl_v_rt_route`, `ct_v_rt_pallet_gate`, `ct_v_wear_rate`: μόνο `service_role`. Νέος έλεγχος §8 πάνω τους χρειάζεται GRANT στο `tms_check_runner` (όχι στο `tms_reader`: προηγούμενο 057 «tms_reader: no money»).
8. **Το περιεχόμενο εξαρτάται από την ώρα** (`CURRENT_DATE` στο `ct_v_wear_rate`, `now()` στο `v_rt_cycle.ended`, `current_date` στο `stock_natl_delivered`). Το «πριν = μετά» αποδεικνύεται μόνο μέσα στο ίδιο block/συναλλαγή (όπως το 071), όχι με δύο εκτελέσεις σε διαφορετικές μέρες.

---

## 1. Μετρήσεις γραμμών (23/10, 00:58–01:06 Αθήνα)

| Αντικείμενο | Γραμμές | Λεπτομέρεια |
|---|---|---|
| `ct_round_trips` | 202 | 185 μη ακυρωμένα· `model=2` = 0· `scope`: INTL 202· OWNED 170 (closed 133, planned 21, cancelled 16), PARTNER 32 (closed 27, planned 4, cancelled 1)· `source='planner'` 202· `total_km` NULL 202· `start_at` 0· `partner_rate` 0 |
| `ct_rt_legs` | 367 | `order_id` 367, `nat_load_id` **0**· VS σκέλη 71 (Export 17, Import 54)· `price IS NULL` 10 (3 από γονέα, `leg_no=1`)· θυγατρικά 8· με ποσό αποθέματος 2 |
| `ct_cost_lines` | 1.247 | με `rt_id` 1.083· DKV 634 (allocated 470, unallocated 164)· REVOLUT 319, CREDIT 201, CASH 93 (όλα allocated)· `details` array σε 162 DKV |
| `ct_cost_docs` | 5 | όλα `source='DKV'`, 3 confirmed |
| `ct_import_rules` | 0 | κανένα `rt_pref` |
| `ct_plate_aliases` | 1 | |
| `ct_settings` | 6 | `x_export=850`, `x_import=650`, `pallet_eur=12`, `vat_default=0.24`, `wear_fallback_eur_km=0.082`, `full_truck_pallets=33` |
| `dl_entries` | 11.264 | ζωντανές 11.227· ζωντανές με `rt_id` 152 |
| `pl_movements` | 253 | DELIVERY confirmed 104 / reversed 14 · LOADING confirmed 68 / pending 62 / reversed 2 · PARTNER_PICKUP pending 1 · RETURN_OUT confirmed 2· `piece_leg_id` 0· διπλές DELIVERY ανά `order_stop_id` (μη reversed): **0** |
| `pallet_ledger_suppliers` / `_partners` | 0 / 0 | νεκροί πίνακες (legacy Airtable)· κανένας reader στο front end (βλ. §7) |
| `stock_lots` | 4 | ζωντανές 2, κλειστές 0 |
| `national_loads` | 97 | ζωντανά: Direct 71, National 6, Groupage 1· Direct με φορτηγό 10· `is_partner_trip` 0· ≥ 5/10: 21, με όχημα 0 |
| `national_orders` | 12 | ζωντανές 6 |
| `rt_stops` / `piece_legs` / `shipment_pieces` | 0 / 0 / 0 | σχήμα 071, χωρίς γραμμή |
| **όψη** `ct_v_rt_revenue` | 202 | `revenue≠0` 177· `revenue_natl≠0` **0** |
| **όψη** `ct_v_rt_costs` | 202 | |
| **όψη** `ct_v_rt_pnl` | 185 | `revenue<0`: 2· Σ `revenue` 889.335,15 |
| **όψη** `dl_v_rt_route` | 186 | (RT με τουλάχιστον ένα σκέλος) |
| **όψη** `dl_v_rt_gap` | 0 | (B-04 = 0) |
| **όψη** `ct_v_rt_pallet_gate` | 103 | `sheets_ok` **0** |
| **όψη** `ct_v_wear_rate` | 46 | όλα = fallback |
| **όψη** `dl_v_entries` / `dl_v_balance` | 11.264 / 82 | εξαρτώνται από `dl_v_rt_route` |
| **όψη** `stock_v_pieces` / `stock_v_rt_amounts` | 1 / 3 | 0 εθνικά κομμάτια |
| **όψη** `v_rt_cycle` | 0 | |

---

## 2. Οι όψεις P&L, κατά γράμμα

Ιδιοκτήτης όλων `postgres`. Γράφος εξάρτησης (`pg_depend`):

```
ct_v_rt_pnl ──► ct_v_rt_revenue ──► stock_v_rt_amounts ──► stock_v_lot_money ──► stock_v_lots ──► stock_v_pieces
            │                   │                       └► stock_v_lot_alloc ──► stock_v_pieces, stock_v_lot_money
            │                   └► stock_v_pieces
            │                   (+ ct_round_trips, ct_rt_legs, orders, national_loads, national_orders, groupage_lines)
            └► ct_v_rt_costs ──► ct_v_wear_rate (maint_history, ct_round_trips, trucks)
                             (+ ct_cost_lines, ct_rt_legs, orders, national_loads, partner_assignments, dl_entries)
dl_v_entries, dl_v_balance ──► dl_v_rt_route (ct_rt_legs, orders, national_loads, locations)
```

**Συνέπεια για την 073:** `CREATE OR REPLACE VIEW` επιτρέπεται μόνο αν οι υπάρχουσες στήλες μείνουν ίδιες (όνομα, τύπος, σειρά)· νέες στήλες μόνο στο τέλος. `DROP` αποκλείεται χωρίς `DROP ... CASCADE` των εξαρτώμενων (`ct_v_rt_pnl`, `dl_v_entries`, `dl_v_balance`). Επιπλέον: τρεις όψεις χρημάτων είναι **χωρίς** `security_invoker` (τρέχουν ως `postgres`), ενώ `dl_v_rt_route`, `dl_v_rt_gap`, `ct_v_rt_pallet_gate`, `ct_v_wear_rate` έχουν `security_invoker=true`. Αμφιβολία προς επαλήθευση σε PGlite πριν από την 073: αν το `CREATE OR REPLACE VIEW` χωρίς `WITH (...)` κρατά ή μηδενίζει το `reloptions` (αν το μηδενίζει, το κείμενο της 073 πρέπει να το ξαναγράφει ρητά).

| Όψη | pretty md5 | plain md5 | μήκος | reloptions | GRANT (εκτός postgres) |
|---|---|---|---|---|---|
| `ct_v_rt_revenue` | `7bd4c2b3206af115a5cfff5478dfdfc9` | `6711d3bfd16a146d2aa7cf9ea7e59f28` | 4.210 | — | service_role |
| `ct_v_rt_costs` | `3349bcf0e25e567075243f94755de4ff` | `6f4b498c25106fe06af48ba1afcd73d5` | 3.160 | — | service_role |
| `ct_v_rt_pnl` | `abc2a49270d8ac7bda9852782ab21f78` | `c2d8154fc9a1bf0df9656b9c9f0ab145` | 1.163 | — | service_role |
| `dl_v_rt_route` | `cfb5f85b913657fba8d8d365d38df323` | `3ba6cc85c3b884e37edf2115c114e47c` | 2.971 | security_invoker | service_role |
| `dl_v_rt_gap` | `0089b90b559db0a080d04dab2e2900ce` | `7a159615a52396312cce4eef0c95919d` | 294 | security_invoker | service_role, tms_check_runner, tms_reader |
| `ct_v_rt_pallet_gate` | `3672742c7ac8e537502058c8de6c8e8e` | `d6b874e117b2c3083ae74958bc1f795d` | 770 | security_invoker | service_role |
| `ct_v_wear_rate` | `1d2285a601dc9c1e74dc92cb2e76d880` | `c842ed8e663e008eed4200df7c9d12d0` | 1.027 | security_invoker | service_role |
| `stock_v_rt_amounts` | `4f655d64c230831cf17b66ea2230f486` | `5dbaaa276975d69ecdc004e7e39bda34` | 444 | — | (μετρήθηκε μόνο md5) |
| `stock_v_pieces` | `9a17994f3476293c585e3ace7a07e2be` | `a319d3abd319c60838b2e1e5529c086c` | 1.412 | — | service_role, tms_check_runner, tms_reader |
| `stock_v_lot_money` | `10ff86f5984ff763ad7c25f68bf80af5` | `6f9f1a5cbd6ae1500580b14e6c50b42c` | 3.092 | — | service_role, tms_check_runner |
| `stock_v_lot_alloc` | `f99f847975942d650302349d48c02ee8` | `0974ae95be775a02045b81c59ca0aeb0` | 938 | — | |
| `stock_v_lots` | `6024cacf012ec3a015e2a371074e6462` | `0be210aea5be5d2c4e11b68fe3b169db` | 5.085 | — | (κείμενο όχι εδώ: δεν αλλάζει στη Φ3) |
| `v_rt_cycle` | `47ca7d81be348ec9f7f7bddd8c6563d9` | `f05d4fd44b64aa7eb3a3b54ffd3a7a59` | 619 | security_invoker | service_role, tms_check_runner, tms_reader |
| `v_piece_state` | `598fd9472beaef97adaf49b1ff431504` | `656c901752b36d35b3b6b815168c505a` | 1.841 | security_invoker | (071) |
| `v_rt_stop_state` | `f758827112c0a1a34f3feebb8cd36c44` | `66696a0ce222448356e8504cb50244a1` | 1.406 | security_invoker | (071) |
| `v_piece_pos` | `a80cb3ff2d27ddb906e9a0e7e91a5fa1` | `8ed33c9c43014eb69c56bf2aef2278ed` | 1.772 | security_invoker | (071) |
| `dl_v_entries` | `2bc6a8a96b41c54629e0efbd4394f860` | `22769cfba24f5e4f47d650def4078c48` | 2.948 | security_invoker | |
| `dl_v_balance` | `73d54fc77d374df920f4186860984f3b` | `9d73c5c4be9720f4c5b5b972b7ff8659` | 3.021 | security_invoker | |
| `pl_v_order_gate` | `78768a30782ca516601e9a7a46213e53` | `7e36646e77dcf6ac7ae73c0ad45d2707` | 802 | security_invoker | |
| `pl_v_balance_clients` | `0bb3548a6cb0a205beabbd7bada0ad83` | `a681acd0732c15467e3ff47e2c138266` | 335 | security_invoker | |
| `pl_v_balance_partners` | `b3724166ca620c3e3d46fbc64a161e20` | `801682a225c58add400d97d8ab814b59` | 339 | security_invoker | |
| `pl_v_client_locations` | `5fdf62a3e28e9c8e920888b79c6409a5` | `b6537ac50d87ace2146640cd38b78b16` | 397 | security_invoker | |
| `ct_v_fuel` | `35324b7029da0bd43cb1c834f0783e96` | `d5fc23334a49e0d2057d72ec781ea1b9` | 549 | — | |
| `ct_v_consumption` | `e2817b395749746e14a0e5afd3d2c3ac` | `d091e1e22a7c84da7a2950babb467b9f` | 585 | security_invoker | |

Το live `ct_v_rt_revenue` είναι το κείμενο **057 R2** (το pretty md5 ισούται με το `revenue_known_to_r2` του `drafts/057_stock_lots_verify.sql:71`). Το `drafts/057_stock_lots_rollback_r2_revenue.sql` κρατά το προηγούμενο (034) κείμενο.

### 2.1 `ct_v_rt_revenue` (pretty md5 `7bd4c2b3206af115a5cfff5478dfdfc9`)
```sql
 WITH natord_home AS (
         SELECT nord.id AS national_order_id,
            nord.price,
            COALESCE(( SELECT min(h1.id) AS min
                   FROM national_loads h1
                  WHERE h1.source_national_order_id = nord.id AND h1.deleted_at IS NULL), ( SELECT min(h2.id) AS min
                   FROM national_loads h2
                  WHERE h2.deleted_at IS NULL AND h2.source_cons_load_id = (( SELECT gl.cons_load_id
                           FROM groupage_lines gl
                          WHERE gl.national_order_id = nord.id AND gl.deleted_at IS NULL AND gl.cons_load_id IS NOT NULL
                          ORDER BY gl.id
                         LIMIT 1)))) AS home_nat_load_id
           FROM national_orders nord
          WHERE nord.deleted_at IS NULL AND nord.price IS NOT NULL AND nord.source_order_id IS NULL
        ), legs AS (
         SELECT rt.id AS rt_id,
                CASE
                    WHEN l.order_id IS NOT NULL THEN COALESCE(sa.rt_amount, o.price,
                    CASE
                        WHEN o.leg_no = 1 THEN p.price
                        ELSE NULL::numeric
                    END, 0::numeric) -
                    CASE
                        WHEN
                        CASE
                            WHEN o.parent_order_id IS NOT NULL THEN p.veroia_switch
                            ELSE o.veroia_switch
                        END THEN stock_vs_charge(
                        CASE
                            WHEN
                            CASE
                                WHEN o.parent_order_id IS NOT NULL THEN p.direction
                                ELSE o.direction
                            END = 'Export'::text THEN ct_setting('x_export'::text)
                            ELSE ct_setting('x_import'::text)
                        END, vp.pallets)
                        ELSE 0::numeric
                    END
                    ELSE 0::numeric
                END AS rev_intl,
                CASE
                    WHEN l.nat_load_id IS NOT NULL THEN
                    CASE
                        WHEN nl.source_type = 'Direct'::text AND nl.source_order_id IS NOT NULL AND nl.id = (( SELECT min(d.id) AS min
                           FROM national_loads d
                          WHERE d.source_order_id = nl.source_order_id AND d.source_type = 'Direct'::text AND d.deleted_at IS NULL)) AND
                        CASE
                            WHEN so.parent_order_id IS NOT NULL THEN sp.veroia_switch
                            ELSE so.veroia_switch
                        END THEN stock_vs_charge(
                        CASE
                            WHEN
                            CASE
                                WHEN so.parent_order_id IS NOT NULL THEN sp.direction
                                ELSE so.direction
                            END = 'Export'::text THEN ct_setting('x_export'::text)
                            ELSE ct_setting('x_import'::text)
                        END, svp.pallets)
                        ELSE 0::numeric
                    END + COALESCE(( SELECT sum(h.price) AS sum
                       FROM natord_home h
                      WHERE h.home_nat_load_id = nl.id), 0::numeric)
                    ELSE 0::numeric
                END AS rev_natl
           FROM ct_round_trips rt
             LEFT JOIN ct_rt_legs l ON l.rt_id = rt.id
             LEFT JOIN orders o ON o.id = l.order_id
             LEFT JOIN orders p ON p.id = o.parent_order_id
             LEFT JOIN stock_v_rt_amounts sa ON sa.order_id = o.id
             LEFT JOIN stock_v_pieces vp ON vp.piece_kind = 'intl'::text AND vp.piece_id = o.id
             LEFT JOIN national_loads nl ON nl.id = l.nat_load_id
             LEFT JOIN orders so ON so.id = nl.source_order_id
             LEFT JOIN orders sp ON sp.id = so.parent_order_id
             LEFT JOIN stock_v_pieces svp ON svp.piece_kind = 'intl'::text AND svp.piece_id = so.id
        )
 SELECT rt_id,
    COALESCE(sum(rev_intl + rev_natl), 0::numeric) AS revenue,
    COALESCE(sum(rev_intl), 0::numeric) AS revenue_intl,
    COALESCE(sum(rev_natl), 0::numeric) AS revenue_natl
   FROM legs
  GROUP BY rt_id;
```

### 2.2 `ct_v_rt_costs` (pretty md5 `3349bcf0e25e567075243f94755de4ff`)
```sql
 WITH lines AS (
         SELECT ct_cost_lines.rt_id,
            sum(ct_cost_lines.net) FILTER (WHERE ct_cost_lines.category <> 'partner_rate'::text) AS net_other,
            sum(ct_cost_lines.vat) AS vat,
            sum(ct_cost_lines.net) FILTER (WHERE ct_cost_lines.category = 'partner_rate'::text) AS partner_invoiced
           FROM ct_cost_lines
          WHERE ct_cost_lines.rt_id IS NOT NULL
          GROUP BY ct_cost_lines.rt_id
        ), carried AS (
         SELECT l.rt_id,
            o.id AS order_id
           FROM ct_rt_legs l
             JOIN orders o ON o.id = l.order_id
        UNION
         SELECT l.rt_id,
            s.id
           FROM ct_rt_legs l
             JOIN orders o ON o.id = l.order_id AND o.parent_order_id IS NOT NULL
             JOIN orders s ON s.parent_order_id = o.parent_order_id AND s.id <> o.id AND s.deleted_at IS NULL AND s.partner_id IS NOT NULL
          WHERE NOT (EXISTS ( SELECT 1
                   FROM ct_rt_legs l2
                     JOIN ct_round_trips r2 ON r2.id = l2.rt_id
                  WHERE l2.order_id = s.id AND r2.status <> 'cancelled'::text))
        ), planned AS (
         SELECT x.rt_id,
            sum(x.partner_rate) AS partner_planned
           FROM ( SELECT c.rt_id,
                    pa.partner_rate
                   FROM carried c
                     JOIN LATERAL ( SELECT pa_1.partner_rate
                           FROM partner_assignments pa_1
                          WHERE pa_1.order_id = c.order_id AND pa_1.deleted_at IS NULL AND pa_1.status <> 'Cancelled'::text
                          ORDER BY pa_1.id DESC
                         LIMIT 1) pa ON true
                UNION ALL
                 SELECT l.rt_id,
                    nl.partner_rate
                   FROM ct_rt_legs l
                     JOIN national_loads nl ON nl.id = l.nat_load_id
                  WHERE nl.deleted_at IS NULL AND COALESCE(nl.is_partner_trip, false) AND nl.partner_rate IS NOT NULL) x
          GROUP BY x.rt_id
        )
 SELECT rt.id AS rt_id,
    COALESCE(li.net_other, 0::numeric) + COALESCE(NULLIF(li.partner_invoiced, 0::numeric), pl.partner_planned, 0::numeric) + COALESCE(dl.trip_value, 0::numeric) + COALESCE(dl.expenses, 0::numeric) AS lines_net,
    COALESCE(li.vat, 0::numeric) AS vat,
        CASE
            WHEN rt.trip_type = 'OWNED'::text AND rt.total_km IS NOT NULL THEN round(COALESCE(w.eur_per_km, ct_setting('wear_fallback_eur_km'::text)) * rt.total_km::numeric, 2)
            ELSE 0::numeric
        END AS wear,
    dl.trip_value AS dl_trip_value,
    dl.expenses AS dl_expenses,
    dl.id IS NOT NULL AND dl.trip_value IS NULL AS driver_pay_pending,
    rt.trip_type = 'OWNED'::text AND rt.driver_id IS NOT NULL AND dl.id IS NULL AS driver_pay_missing,
    COALESCE(pl.partner_planned, 0::numeric) AS partner_planned,
    COALESCE(li.partner_invoiced, 0::numeric) AS partner_invoiced
   FROM ct_round_trips rt
     LEFT JOIN lines li ON li.rt_id = rt.id
     LEFT JOIN planned pl ON pl.rt_id = rt.id
     LEFT JOIN dl_entries dl ON dl.rt_id = rt.id AND dl.deleted_at IS NULL
     LEFT JOIN ct_v_wear_rate w ON w.truck_id = rt.truck_id;
```

### 2.3 `ct_v_rt_pnl` (pretty md5 `abc2a49270d8ac7bda9852782ab21f78`)
```sql
 SELECT rt.id,
    rt.code,
    rt.scope,
    rt.trip_type,
    rt.truck_id,
    rt.driver_id,
    rt.partner_id,
    rt.date_start,
    rt.date_end,
    rt.status,
    rt.total_km,
    r.revenue,
    c.lines_net + c.wear AS cost_net,
    c.vat AS cost_vat,
    c.lines_net + c.wear + c.vat AS cost_gross,
    r.revenue - (c.lines_net + c.wear + c.vat) AS profit_worst,
    r.revenue - (c.lines_net + c.wear) AS profit_ex_vat,
        CASE
            WHEN r.revenue > 0::numeric THEN round((r.revenue - (c.lines_net + c.wear + c.vat)) / r.revenue * 100::numeric, 1)
            ELSE NULL::numeric
        END AS margin_worst_pct,
        CASE
            WHEN r.revenue > 0::numeric THEN round((r.revenue - (c.lines_net + c.wear)) / r.revenue * 100::numeric, 1)
            ELSE NULL::numeric
        END AS margin_ex_vat_pct,
    c.dl_trip_value,
    c.dl_expenses,
    c.driver_pay_pending,
    c.driver_pay_missing,
    c.partner_planned,
    c.partner_invoiced,
    r.revenue_intl,
    r.revenue_natl
   FROM ct_round_trips rt
     JOIN ct_v_rt_revenue r ON r.rt_id = rt.id
     JOIN ct_v_rt_costs c ON c.rt_id = rt.id
  WHERE rt.status <> 'cancelled'::text;
```

### 2.4 `ct_v_wear_rate` (pretty md5 `1d2285a601dc9c1e74dc92cb2e76d880`) — Ε8
```sql
 WITH m AS (
         SELECT maint_history.truck_id,
            sum(maint_history.cost) AS maint_cost
           FROM maint_history
          WHERE maint_history.truck_id IS NOT NULL AND maint_history.deleted_at IS NULL AND maint_history.service_date >= (CURRENT_DATE - '1 year'::interval)
          GROUP BY maint_history.truck_id
        ), k AS (
         SELECT ct_round_trips.truck_id,
            sum(ct_round_trips.total_km) AS km
           FROM ct_round_trips
          WHERE ct_round_trips.truck_id IS NOT NULL AND ct_round_trips.status <> 'cancelled'::text AND ct_round_trips.date_start >= (CURRENT_DATE - '1 year'::interval)
          GROUP BY ct_round_trips.truck_id
        )
 SELECT t.id AS truck_id,
        CASE
            WHEN COALESCE(k.km, 0::bigint) > 0 AND m.maint_cost IS NOT NULL THEN round(m.maint_cost / k.km::numeric, 4)
            ELSE ct_setting('wear_fallback_eur_km'::text)
        END AS eur_per_km
   FROM trucks t
     LEFT JOIN m ON m.truck_id = t.id
     LEFT JOIN k ON k.truck_id = t.id;
```
Ε8 σήμερα: το `sum(total_km)` ήδη αγνοεί τα NULL, και το `ct_v_rt_costs.wear` είναι 0 όταν `total_km IS NULL`. Το πρόβλημα του Ε8 είναι άλλο: κύκλοι `model=2` χωρίς km μπαίνουν στο έτος του φορτηγού χωρίς να προσθέτουν km, άρα το €/km φουσκώνει μόλις υπάρξουν km σε άλλους κύκλους. Σήμερα 0 RT έχουν km, οπότε καμία επίπτωση.

---

## 3. Πώς υπολογίζεται σήμερα το έσοδο ανά RT

Ανά σκέλος (`ct_rt_legs`), από το `ct_v_rt_revenue`:

- **Σκέλος παραγγελίας (`order_id`)**: `coalesce(stock_v_rt_amounts.rt_amount, orders.price, (leg_no=1 ? γονέας.price), 0)` **μείον** `stock_vs_charge(X, pallets κομματιού)` όταν η παραγγελία (ή ο γονέας της, για θυγατρικό σκέλος) έχει `veroia_switch`. X = `ct_setting('x_export')` = 850 αν `direction='Export'`, αλλιώς `x_import` = 650. Για μη απόθεμα (`vp.pallets` NULL) το `stock_vs_charge` επιστρέφει ολόκληρο το X· για κομμάτι αποθέματος `round(X × min(p, 33) / 33, 2)`.
- **Σκέλος εθνικού (`nat_load_id`)**: (α) αν το NL είναι `source_type='Direct'`, είναι το **πρώτο** ζωντανό Direct της ίδιας `source_order_id` και η πηγή έχει VS → `+stock_vs_charge(X, …)` (η «μεταφορά» του X από το διεθνές)· (β) `+ Σ national_orders.price` των εθνικών παραγγελιών (χωρίς `source_order_id`) που έχουν «σπίτι» αυτό το NL (`natord_home`: NL με `source_national_order_id`, αλλιώς το πρώτο NL του CL του πρώτου GL).
- **Απόθεμα (057)**: η παρτίδα κερδίζει `partner_cost` (0 αν δικό μας φορτηγό), κάθε κομμάτι το μερίδιο παλετών του καθαρού (`stock_v_lot_alloc`, στρογγύλευση με τρέχον άθροισμα), μόνο όταν `allocation_status='ok'`.
- `revenue = Σ(rev_intl + rev_natl)`, και οι δύο στήλες χωριστά. `ct_v_rt_pnl` κρατά μόνο `status<>'cancelled'`.

Μετρημένα: 71 σκέλη VS → 49.550 € X αφαιρέθηκαν (48.900 € σε ζωντανά RT) και **0 €** προστέθηκαν σε εθνικό σκέλος (δεν υπάρχει κανένα). 2 RT με αρνητικό έσοδο (VS χωρίς τιμή → −X). Το front end έχει **δεύτερο αντίγραφο** του κανόνα για τα σκέλη αποθέματος (`modules/costs.js:464-520` `ctStockLeg`, «mirroring ct_v_rt_revenue») και για τον τύπο INTL/NATL/MIX (`costs.js:155-184`): αλλαγή του κανόνα στην 073 ⇒ αλλαγή και εκεί (αρχή 3).

Βοηθητικές συναρτήσεις (κατά γράμμα):

`ct_setting(text)` · prosrc `0c24249eb581a5004a3fb7db044eba2a` · def `bc10ef756645c251d9114ebd3ca8ed0b`
```sql
CREATE OR REPLACE FUNCTION public.ct_setting(p_key text)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$ select value from ct_settings where key = p_key $function$
```
`stock_vs_charge(numeric,numeric)` · prosrc `d034c65b8610f668b29c5943d7976739` · def `aef07d817daab4872c85315bd0c6c98d`
```sql
CREATE OR REPLACE FUNCTION public.stock_vs_charge(p_x numeric, p_piece_pallets numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
  declare
    v_f numeric;
  begin
    if p_piece_pallets is null then
      return p_x;
    end if;
    v_f := public.ct_setting('full_truck_pallets');
    if v_f is null then
      raise exception 'ct_settings.full_truck_pallets is missing — the Veroia Switch charge of a stock piece cannot be prorated (057, OWNER-Q3)';
    end if;
    return round(p_x * least(p_piece_pallets, v_f) / v_f, 2);
  end
  $function$
```
`stock_natl_delivered(text,date)` · prosrc `3ffc433986175c63f7cd3da2453f94b2` · def `78495e74987a3696d20e7f3c18675351` — Ε6
```sql
CREATE OR REPLACE FUNCTION public.stock_natl_delivered(p_status text, p_delivery date)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    select coalesce(p_status = 'Delivered' or (p_status is distinct from 'Cancelled' and p_delivery <= current_date), false)
  $function$
```

### 3.1 `stock_v_rt_amounts` (pretty md5 `4f655d64c230831cf17b66ea2230f486`)
```sql
 SELECT m.source_id AS order_id,
    COALESCE(m.partner_cost, 0::numeric) AS rt_amount
   FROM stock_v_lot_money m
  WHERE m.source_kind = 'intl'::text AND m.allocation_status = 'ok'::text
UNION ALL
 SELECT a.piece_id AS order_id,
    a.amount AS rt_amount
   FROM stock_v_lot_alloc a
     JOIN stock_v_lot_money m ON m.lot_id = a.lot_id
  WHERE a.piece_kind = 'intl'::text AND m.source_kind = 'intl'::text AND m.allocation_status = 'ok'::text;
```
### 3.2 `stock_v_pieces` (pretty md5 `9a17994f3476293c585e3ace7a07e2be`) — Ε6
```sql
 SELECT o.stock_lot_id AS lot_id,
    'intl'::text AS piece_kind,
    o.id AS piece_id,
    o.legacy_id AS piece_rec,
    o.client_id,
    o.loading_location_1_id AS pickup_location_id,
    order_pallets(o.*) AS pallets,
    o.status,
    o.loading_datetime AS loading_date,
    COALESCE(o.status = 'Delivered'::text, false) AS delivered,
        CASE
            WHEN o.status = 'Delivered'::text THEN COALESCE(o.actual_delivery_date, o.delivery_datetime)
            ELSE NULL::date
        END AS delivered_on,
    o.truck_id IS NOT NULL OR o.partner_id IS NOT NULL AS on_truck,
    o.created_at
   FROM orders o
  WHERE o.deleted_at IS NULL AND o.stock_lot_id IS NOT NULL
UNION ALL
 SELECT n.stock_lot_id AS lot_id,
    'natl'::text AS piece_kind,
    n.id AS piece_id,
    n.legacy_id AS piece_rec,
    n.client_id,
    n.pickup_location_1_id AS pickup_location_id,
    COALESCE(n.pallets, 0::numeric) AS pallets,
    n.status,
    n.loading_datetime AS loading_date,
    stock_natl_delivered(n.status, n.delivery_datetime) AS delivered,
        CASE
            WHEN stock_natl_delivered(n.status, n.delivery_datetime) THEN COALESCE(n.actual_delivery_date, n.delivery_datetime)
            ELSE NULL::date
        END AS delivered_on,
    n.truck_id IS NOT NULL OR n.partner_id IS NOT NULL AS on_truck,
    n.created_at
   FROM national_orders n
  WHERE n.deleted_at IS NULL AND n.stock_lot_id IS NOT NULL;
```
### 3.3 `stock_v_lot_alloc` (pretty md5 `f99f847975942d650302349d48c02ee8`)
```sql
 SELECT lot_id,
    lot_rec,
    piece_kind,
    piece_id,
    piece_rec,
    seq,
    pallets,
    cum_pallets,
        CASE
            WHEN allocation_status = 'ok'::text THEN round(net * cum_pallets / total_pallets, 2) - round(net * (cum_pallets - pallets) / total_pallets, 2)
            ELSE NULL::numeric
        END AS amount
   FROM ( SELECT p.lot_id,
            m.lot_rec,
            p.piece_kind,
            p.piece_id,
            p.piece_rec,
            p.pallets,
            row_number() OVER (PARTITION BY p.lot_id ORDER BY p.created_at, p.piece_kind, p.piece_id) AS seq,
            sum(p.pallets) OVER (PARTITION BY p.lot_id ORDER BY p.created_at, p.piece_kind, p.piece_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cum_pallets,
            m.allocation_status,
            m.net,
            m.total_pallets
           FROM stock_v_pieces p
             JOIN stock_v_lot_money m ON m.lot_id = p.lot_id) w;
```
### 3.4 `stock_v_lot_money` (pretty md5 `10ff86f5984ff763ad7c25f68bf80af5`)
```sql
 SELECT l.id AS lot_id,
    l.legacy_id AS lot_rec,
    l.source_kind,
    l.lot_no AS source_id,
    x.source_rec,
    x.price,
    x.partner_cost,
    x.has_assignment,
    s.warehouse_charge,
    c.charge_total,
        CASE
            WHEN k.st = 'ok'::text THEN k.net
            ELSE NULL::numeric
        END AS net,
    l.stock_pallets AS total_pallets,
        CASE
            WHEN k.st = 'ok'::text THEN round(k.net / NULLIF(l.stock_pallets, 0::numeric), 4)
            ELSE NULL::numeric
        END AS per_pallet,
    l.drawn_pallets,
        CASE
            WHEN k.st = 'ok'::text THEN k.alloc
            ELSE NULL::numeric
        END AS allocated_amount,
    l.remaining_pallets,
        CASE
            WHEN k.st = 'ok'::text THEN
            CASE
                WHEN l.closed_at IS NULL THEN k.net - k.alloc
                ELSE 0.00
            END
            ELSE NULL::numeric
        END AS in_stock_amount,
    l.written_off_pallets,
        CASE
            WHEN k.st = 'ok'::text THEN
            CASE
                WHEN l.closed_at IS NOT NULL THEN k.net - k.alloc
                ELSE 0.00
            END
            ELSE NULL::numeric
        END AS written_off_amount,
    l.closed_at,
    k.st AS allocation_status
   FROM stock_v_lots l
     JOIN stock_lots s ON s.id = l.id
     CROSS JOIN LATERAL ( SELECT o.legacy_id AS source_rec,
            o.price,
            pa.partner_rate AS partner_cost,
            pa.id IS NOT NULL AS has_assignment
           FROM orders o
             LEFT JOIN LATERAL ( SELECT pa_1.id,
                    pa_1.partner_rate
                   FROM partner_assignments pa_1
                  WHERE pa_1.order_id = o.id AND pa_1.deleted_at IS NULL AND pa_1.status <> 'Cancelled'::text
                  ORDER BY pa_1.id DESC
                 LIMIT 1) pa ON true
          WHERE o.id = l.order_id
        UNION ALL
         SELECT n.legacy_id,
            n.price,
            NULL::numeric AS "numeric",
            false
           FROM national_orders n
          WHERE n.id = l.nat_order_id) x
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN x.has_assignment AND x.partner_cost IS NULL THEN NULL::numeric
                    WHEN x.partner_cost IS NULL AND s.warehouse_charge IS NULL THEN NULL::numeric
                    ELSE COALESCE(x.partner_cost, 0::numeric) + COALESCE(s.warehouse_charge, 0::numeric)
                END AS charge_total) c
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN COALESCE(x.price, 0::numeric) <= 0::numeric THEN 'no_price'::text
                    WHEN x.has_assignment AND x.partner_cost IS NULL THEN 'no_partner_rate'::text
                    WHEN c.charge_total IS NULL THEN 'no_charge'::text
                    WHEN l.stock_pallets <= 0::numeric THEN 'no_pallets'::text
                    ELSE 'ok'::text
                END AS st,
            round(x.price - c.charge_total, 2) AS net,
            round(round(x.price - c.charge_total, 2) * l.drawn_pallets / NULLIF(l.stock_pallets, 0::numeric), 2) AS alloc) k;
```

---

## 4. Διαδρομή και μισθοδοσία (Ε9)

### 4.1 `dl_v_rt_route` (pretty md5 `cfb5f85b913657fba8d8d365d38df323`)
```sql
 WITH leg AS (
         SELECT l.rt_id,
            l.id AS leg_id,
            l.direction,
            l.seq,
            COALESCE(o.loading_datetime::timestamp with time zone, nl.loading_datetime)::date AS load_d,
            COALESCE(o.actual_delivery_date, nl.actual_delivery_date, o.delivery_datetime, nl.delivery_datetime::date) AS deliv_d,
            COALESCE(o.loading_location_1_id, nl.pickup_location_1_id) AS from_id,
            COALESCE(o.unloading_location_10_id, o.unloading_location_9_id, o.unloading_location_8_id, o.unloading_location_7_id, o.unloading_location_6_id, o.unloading_location_5_id, o.unloading_location_4_id, o.unloading_location_3_id, o.unloading_location_2_id, o.unloading_location_1_id, nl.delivery_location_10_id, nl.delivery_location_9_id, nl.delivery_location_8_id, nl.delivery_location_7_id, nl.delivery_location_6_id, nl.delivery_location_5_id, nl.delivery_location_4_id, nl.delivery_location_3_id, nl.delivery_location_2_id, nl.delivery_location_1_id) AS to_id,
            ( SELECT count(*) AS count
                   FROM ( VALUES (o.loading_location_2_id), (o.loading_location_3_id), (o.loading_location_4_id), (o.loading_location_5_id), (o.loading_location_6_id), (o.loading_location_7_id), (o.loading_location_8_id), (o.loading_location_9_id), (o.loading_location_10_id), (o.unloading_location_2_id), (o.unloading_location_3_id), (o.unloading_location_4_id), (o.unloading_location_5_id), (o.unloading_location_6_id), (o.unloading_location_7_id), (o.unloading_location_8_id), (o.unloading_location_9_id), (o.unloading_location_10_id), (nl.pickup_location_2_id), (nl.pickup_location_3_id), (nl.pickup_location_4_id), (nl.pickup_location_5_id), (nl.pickup_location_6_id), (nl.pickup_location_7_id), (nl.pickup_location_8_id), (nl.pickup_location_9_id), (nl.pickup_location_10_id), (nl.delivery_location_2_id), (nl.delivery_location_3_id), (nl.delivery_location_4_id), (nl.delivery_location_5_id), (nl.delivery_location_6_id), (nl.delivery_location_7_id), (nl.delivery_location_8_id), (nl.delivery_location_9_id), (nl.delivery_location_10_id)) v(x)
                  WHERE v.x IS NOT NULL) AS extra_stops
           FROM ct_rt_legs l
             LEFT JOIN orders o ON o.id = l.order_id
             LEFT JOIN national_loads nl ON nl.id = l.nat_load_id
        )
 SELECT leg.rt_id,
    string_agg((COALESCE(lf.city, lf.name) || ' → '::text) || COALESCE(lt.city, lt.name), ' · '::text ORDER BY leg.seq, leg.load_d, leg.leg_id) AS route_text,
    jsonb_agg(jsonb_build_object('dir', leg.direction, 'load', leg.load_d, 'deliv', leg.deliv_d, 'from', jsonb_build_object('name', lf.name, 'city', lf.city, 'country', lf.country), 'to', jsonb_build_object('name', lt.name, 'city', lt.city, 'country', lt.country), 'extra_stops', leg.extra_stops) ORDER BY leg.seq, leg.load_d, leg.leg_id) AS route_legs
   FROM leg
     LEFT JOIN locations lf ON lf.id = leg.from_id
     LEFT JOIN locations lt ON lt.id = leg.to_id
  GROUP BY leg.rt_id;
```
Διαβάζει **μόνο** `ct_rt_legs` (+ `orders`/`national_loads`/`locations`). Ένας κύκλος `model=2` δεν έχει `ct_rt_legs` (το `ct_rt_legs_v2_guard` το αρνείται, `v1_link_on_v2`), άρα χωρίς κλάδο από `rt_stops` δεν έχει γραμμή εδώ, και τα `dl_v_entries`/`dl_v_balance`/`GET /costs/rt` δείχνουν `route_text = null`.

### 4.2 `dl_v_rt_gap` (pretty md5 `0089b90b559db0a080d04dab2e2900ce`)
```sql
 SELECT id AS rt_id,
    code,
    driver_id,
    date_start
   FROM ct_round_trips rt
  WHERE trip_type = 'OWNED'::text AND driver_id IS NOT NULL AND status <> 'cancelled'::text AND NOT (EXISTS ( SELECT 1
           FROM dl_entries e
          WHERE e.rt_id = rt.id AND e.deleted_at IS NULL));
```
Δεν κοιτά `model`· ένας κύκλος v5 OWNED με οδηγό χωρίς γραμμή μισθοδοσίας θα εμφανιστεί εδώ (και στο B-04) όπως και σήμερα. Η γραμμή τη γεννά το `dl_sync_from_rt()` (011, prosrc `331cea3a8987b74a9b0add698df9b158`, στη λίστα φρουρού της 072).

### 4.3 `v_rt_cycle` (pretty md5 `47ca7d81be348ec9f7f7bddd8c6563d9`) — πηγή του Ε21
```sql
 SELECT id AS rt_id,
    code,
    status,
    trip_type,
    truck_id,
    trailer_id,
    driver_id,
    partner_id,
    start_at,
    end_at,
    date_start,
    date_end,
    ( SELECT count(*) AS count
           FROM rt_stops s
          WHERE s.rt_id = r.id AND s.deleted_at IS NULL) AS n_stops,
    ( SELECT count(*) AS count
           FROM piece_legs l
          WHERE l.rt_id = r.id AND l.deleted_at IS NULL) AS n_legs,
    status <> 'cancelled'::text AND (end_at AT TIME ZONE 'Europe/Athens'::text)::date < (now() AT TIME ZONE 'Europe/Athens'::text)::date AS ended
   FROM ct_round_trips r
  WHERE model = 2;
```

---

## 5. Το «κλειστό» του `/costs/rt` (Ε21)

- **Worker** (`worker/src/index.js` @ `97798ba8`, md5 `a3117aac2170a34015f9a3a08be0e953`, 5.836 γραμμές): `GET /costs/rt` (`:3734-3831`) διαβάζει `ct_round_trips` με `select=*,ct_rt_legs(...)`, προσθέτει `route_text/route_legs` από `dl_v_rt_route` (`:3782-3797`) και `ledger_entry` από `dl_entries` (`:3798-3829`). **Δεν υπολογίζει «κλειστό»**· επιστρέφει το `status`. `PATCH /costs/rt/:id` (`:3832-3857`) γράφει `status='closed'` + `closed_at` (κουμπί «Κλείσιμο» του `costs.js:1110`) και μεταφράζει το P0001 του `rt_status_guard` σε 409.
- **Βάση:** το `status` το αλλάζει το `rt_auto_close(bigint)` (046), που το καλούν οι triggers `rt_auto_close_legs()` (στο `ct_rt_legs`, `rt_z_auto_close_legs`), `rt_auto_close_order()` και `rt_sync_national_load()`. Κλείνει όταν όλα τα σκέλη είναι Delivered/Cancelled, ξανανοίγει με νέο ανοιχτό σκέλος (και `needs_review` στη μισθοδοσία). Για `model=2` **επιστρέφει αμέσως** (γραμμή του 071).
- **Front end:** `modules/expenses.js:750` `exIsDone = status ∈ {closed, complete}` → «RT κλειστό», «λείπουν: καύσιμα/διόδια» (`:753-821, :1483`)· `modules/costs.js:197` badge «Ολοκληρώθηκε»· `core/rt-feed.js:94` `_rtClosed` (ιστορικό, δεν αγγίζεται).
- **Συμπέρασμα:** το Ε21 δεν είναι «αλλαγή υπολογισμού» στον Worker αλλά **νέο πεδίο**: για `model=2`, `GET /costs/rt` θα πρέπει να επιστρέφει `ended` από `v_rt_cycle` (ή `status` παραγόμενο) και το `exIsDone` να το διαβάζει. Επιλογή owner §10.3.

`rt_auto_close(bigint)` · prosrc `eba2146ca4c521da6365edd28c4507af` · def `3ffa8a11868cf5c1cb42a8932caef551` · SECURITY DEFINER
```sql
CREATE OR REPLACE FUNCTION public.rt_auto_close(p_rt bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r        ct_round_trips%rowtype;
  n_live   int;
  n_open   int;
  live_dl  dl_entries%rowtype;
begin
  if p_rt is null then return; end if;
  select * into r from ct_round_trips where id = p_rt;
  if r.id is null or r.status = 'cancelled' then return; end if;
  if r.model = 2 then return; end if; -- 071: a v5 cycle never closes by status; its end is read from its stops (v_rt_cycle)

  -- 034 (4/10): national legs count with the same definition of «open» as order legs.
  select count(*) filter (where x.deleted_at is null),
         count(*) filter (where x.deleted_at is null
                          and x.status is distinct from 'Delivered'
                          and x.status is distinct from 'Cancelled')
    into n_live, n_open
  from (select o.deleted_at, o.status from ct_rt_legs l join orders o on o.id = l.order_id where l.rt_id = p_rt
        union all
        select nl.deleted_at, nl.status from ct_rt_legs l join national_loads nl on nl.id = l.nat_load_id where l.rt_id = p_rt) x;

  if n_live = 0 then return; end if;

  if n_open > 0 and r.status in ('closed', 'complete') then
    update ct_round_trips
       set status = 'planned', closed_at = null, updated_at = now()
     where id = p_rt;
    perform rt_sync_audit('update', 'ct_round_trips', p_rt::text,
      jsonb_build_object('status', r.status, 'closed_at', r.closed_at),
      jsonb_build_object('status', 'planned', 'closed_at', null, 'open_legs', n_open,
                         'reason', 'reopened: ' || n_open || ' leg(s) not delivered/cancelled (046)'));

    select * into live_dl from dl_entries where rt_id = p_rt and deleted_at is null limit 1;
    if live_dl.id is not null
       and (live_dl.trip_value is not null or live_dl.advance is not null or live_dl.expenses is not null) then
      update dl_entries
         set needs_review = true,
             review_note = concat_ws(' · ', review_note,
               'ο γύρος ' || r.code || ' ξανάνοιξε ' || to_char(now(), 'DD/MM/YYYY') ||
               ' μετά την καταχώρηση ποσών — νέο σκέλος, έλεγξε την αξία (046)'),
             updated_at = now()
       where id = live_dl.id;
    end if;
    return;
  end if;

  if n_open = 0 and r.status in ('planned', 'in_progress') then
    if r.trip_type = 'OWNED' and r.truck_id is null then
      if not exists (
        select 1 from audit_log
         where actor = 'trigger:rt_sync' and table_name = 'ct_round_trips' and record_id = p_rt::text
           and after_data->>'blocked' = 'true'
           and created_at > now() - interval '7 days') then
        perform rt_sync_audit('update', 'ct_round_trips', p_rt::text,
          jsonb_build_object('status', r.status),
          jsonb_build_object('status', r.status, 'blocked', true,
                             'reason', 'not auto-closed: OWNED round trip without a truck (owned_needs_truck) — assign a truck (046)'));
      end if;
      return;
    end if;

    update ct_round_trips
       set status = 'closed', closed_at = now(), updated_at = now()
     where id = p_rt;
    perform rt_sync_audit('update', 'ct_round_trips', p_rt::text,
      jsonb_build_object('status', r.status, 'closed_at', r.closed_at),
      jsonb_build_object('status', 'closed', 'closed_at', now(), 'legs', n_live,
                         'reason', 'auto-closed: all legs delivered/cancelled (046)'));
  end if;
end $function$
```

---

## 6. DKV: πίνακες και ταίριασμα με RT (Ε10)

**Πίνακες** (δεν υπάρχει πίνακας/όψη με όνομα `dkv*`· το DKV ζει στους γενικούς πίνακες κόστους):
- `ct_cost_docs` (id, source, entity, invoice_no, period_from/to `date`, total_gross, status, zip_sha256, lines_total/sure/corrected/unallocated/deleted, parser_version, vat_refund): 5 έγγραφα, όλα DKV.
- `ct_cost_lines` (rt_id → `ct_round_trips` FK χωρίς ON DELETE, category CHECK 13 τιμών, net/vat, **`line_date date`**, plate_raw, truck_id, km_reading, liters, station, `alloc_status` ∈ {allocated, unallocated, review}, import_key UNIQUE (partial), pay_source ∈ {DKV, CASH, REVOLUT, CREDIT}, fuel_source, `details jsonb`). Trigger `dl_cash_sync_line`. Doc FK `ON DELETE CASCADE`.
- `ct_import_rules` (0 γραμμές), `ct_plate_aliases` (1).
- Όψεις: `ct_v_fuel`, `ct_v_consumption` (διαβάζουν `ct_cost_lines`, δεν αλλάζουν στη Φ3).

**Ταίριασμα** (`worker/src/import-rules.mjs`, md5 `edf9fd1ad41c54b06de1f0c7bb304d41`, 875 γραμμές):
- `POST /costs/import/parse` (`index.js:4388-4500`): parse (`core/dkv-parser.js`) → `splitByPassages` → `applyRules` (πινακίδα → `truck_id`) → φέρνει `ct_round_trips` με `select=id,truck_id,status,date_start,date_end`, `truck_id=in.(...)`, `status=neq.cancelled` (`:4453-4457`) → `matchRoundTrip` ανά γραμμή → `allocateFees` για τα τέλη DKV.
- `matchRoundTrip` (`import-rules.mjs:384-428`): `category='dkv'` → `general_fee`· χωρίς πινακίδα → `no_plate`· άγνωστη → `unknown_plate`· υποψήφια = ίδιο φορτηγό, μη ακυρωμένο, και `dateOverlaps` = `service_date ∈ [date_start−1, coalesce(date_end,date_start)+1]` (ή τομή περιόδου για γραμμές μισού μήνα). 0 → `no_rt_on_date`· 1 → `sure`· >1 → `rt_pref` κανόνας, αλλιώς **περισσότερες κοινές ημέρες** (`overlapDays`), `match:'suggest'` με `alternatives`.
- **Ώρα:** ο parser γράφει `time` (best effort, `dkv-parser.js:395-400, 468`, μόνο γραμμές συναλλαγής καυσίμου· στα διόδια υπάρχει ώρα μόνο μέσα στα passages)· το `toCostLineRow` (`import-rules.mjs:35-66`) **δεν** την αποθηκεύει, ούτε το `memberOf` των `details`. Μετρημένα: 0 γραμμές DKV με `time` στη βάση.
- **Συμπέρασμα για Ε10:** ταίριασμα κατά ώρα είναι εφικτό μόνο στο preview (ίδιο request), με `tstzrange(start_at, end_at)` για υποψήφια `model=2`, και `review` όταν λείπει ώρα και πέφτουν δύο κύκλοι στην ίδια μέρα (tech-draft §Φ3). Μετά το commit η ώρα χάνεται: επιλογή §10.2.
- Έλεγχοι που αγγίζουν το DKV: B-20, B-21, B-22 (164 «χωρίς δρομολόγιο > 14 ημ.» = ουρά), B-24, B-25 (±5 ημέρες από `date_start/date_end`· κόκκινο 3 στις 22/10).

---

## 7. Παλέτες (Ε11)

**Πίνακες:**
- `pl_movements` (253): CHECK `one_counterparty`, `adjustment_needs_reason`, `event_type` ∈ {LOADING, DELIVERY, PARTNER_PICKUP, PARTNER_DROPOFF, RETURN_OUT, RETURN_IN, ADJUSTMENT}, `status` ∈ {pending, confirmed, reversed}, `taken/given ≥ 0`, `sheet_source` CHECK· FK `order_id`/`order_stop_id`/`cons_load_id` ON DELETE SET NULL, `reversal_of` → `pl_movements`, `piece_leg_id` → `piece_legs` **ON DELETE RESTRICT** (071). Ευρετήρια: `pl_mov_stop` (**απλό**, όχι unique), `pl_mov_order`, `pl_mov_client`, `pl_mov_partner`, `pl_mov_cons`, και `pl_mov_leg_once` **UNIQUE (piece_leg_id, event_type) WHERE piece_leg_id IS NOT NULL AND status<>'reversed'** (071). Κανένας trigger.
- `pallet_ledger_suppliers` / `pallet_ledger_partners`: 0 γραμμές, legacy (Airtable `tblAAH3N1bIcBRPXi`/`tblAUixdjwpgnJ1hK`)· η οθόνη `pallet_ledger.js` διαβάζει `/pallets/movements`.
- Όψεις: `pl_v_order_gate`, `pl_v_balance_clients/partners`, `pl_v_client_locations` (md5 στον πίνακα §2), και `ct_v_rt_pallet_gate`:

### 7.1 `ct_v_rt_pallet_gate` (pretty md5 `3672742c7ac8e537502058c8de6c8e8e`)
```sql
 WITH rt_orders AS (
         SELECT l.rt_id,
            l.order_id
           FROM ct_rt_legs l
             JOIN orders o ON o.id = l.order_id AND o.deleted_at IS NULL
          WHERE l.order_id IS NOT NULL AND o.pallet_exchange = true
        ), sheets AS (
         SELECT DISTINCT pl_movements.order_id
           FROM pl_movements
          WHERE pl_movements.status = 'confirmed'::text AND (pl_movements.event_type = ANY (ARRAY['PARTNER_PICKUP'::text, 'PARTNER_DROPOFF'::text])) AND pl_movements.order_id IS NOT NULL
        )
 SELECT ro.rt_id,
    count(*) AS legs_needing_sheet,
    count(s.order_id) AS legs_with_sheet,
    count(*) = count(s.order_id) AS sheets_ok
   FROM rt_orders ro
     LEFT JOIN sheets s ON s.order_id = ro.order_id
  GROUP BY ro.rt_id;
```
Μετρημένα: 103 RT με σκέλος `pallet_exchange`, **0** με `sheets_ok`. Το διαβάζει μόνο το `GET /costs/pallet-gate` (`index.js:4289-4295`) → `modules/costs.js:24, 329-337`.

**Feeder (browser, `core/pallet-feed.js`, md5 `211c026fecc86b3d954f3a0da3dfa96b`, 337 γραμμές)** — μέσω Worker `/pallets/movements` (`index.js:5295+`, `PL_REF_MAP` `:5275-5282`: `client_rec, partner_rec, location_rec, order_stop_rec, cons_load_rec, order_rec`· **κανένα** `piece_leg`/`national_order`):
- `plOnOrderSaved` (`:59`) — pending LOADING ανά στάση φόρτωσης· καλείται από `orders_intl.js:2743`, `orders_natl.js:1220`, `core/order-sync.js:99`.
- `plOnDelivered` (`:107`) — confirmed DELIVERY `taken=given=pallets` ανά στάση εκφόρτωσης, **GET-then-POST** χωρίς unique (`pl_mov_stop` απλό)· καλείται από `daily_ops.js:1465` (ημέρα) και `:1651` (καθυστερημένες), δύο διαφορετικές διαδρομές, όχι διπλό κλικ. Σήμερα 0 διπλές.
- `_plLotIntake` / `plOnLotIntakeUndone` (`:169-258`, απόθεμα 057, με in-flight guard), `plOnIntlPartnerAssigned` (`:261`, PARTNER_PICKUP/DROPOFF· καλείται από `weekly_intl.js:3922, 3933, 4216`), `plOnExchangeOff` (`:317`), `plOnOrderDeleted` (`:327`).
- **Διαγράφει pending γραμμές** (`:100, :246, :288, :321`), ενώ ο B-18b (P1) περιμένει «το πλήθος δεν μειώνεται ποτέ». Μέχρι τώρα πράσινο (245 → 253). Αμφιβολία: §10.8.

**Η «διπλή DELIVERY» του Ε11** αφορά το v5: αν η `plan_*` γράφει DELIVERY με `piece_leg_id` και ο browser καλέσει και `plOnDelivered` για την ίδια στάση, το `pl_mov_leg_once` **δεν** πιάνει τη γραμμή του browser (εκείνη δεν έχει `piece_leg_id`). Φρουρός χρειάζεται στη διαδρομή του browser (π.χ. `plOnDelivered` να μη γράφει για παραγγελία με κομμάτια v5), ή στη βάση.

**057 φρουροί αποθέματος (μετά το 071a):**

| Συνάρτηση | trigger | prosrc md5 (live = «μετά» του 071a) | def md5 | μήκος def |
|---|---|---|---|---|
| `stock_guard_lots()` | `stock_lots.stock_guard_lots` | `231b539e429f5d404d0eaa46618d79c5` | `88156ab9838061765e41c82fe5e854b0` | 10.950 |
| `stock_guard_orders()` | `orders.stock_guard_orders` | `63aa751d93cc8b34afa5587912de7045` | `be532a7f80f8d43d3c19503f16898730` | 18.325 |
| `stock_guard_natl()` | `national_orders.stock_guard_natl` | `e941edbca9ff1bbeba0c89d49eb71cb3` | `0a56eb194f3620a6d0f9d17ab14d0b95` | 10.175 |
| `stock_raise(text,text)` | — | `f6c9be46a8549413fc00978c5062b01d` | `bc0e0c53c37e2cf3a0639b8e7672c7f6` | 280 |

Τα κείμενα **δεν** αντιγράφονται εδώ (39 KB). Είναι ακριβώς το 057 μετά τον μετασχηματισμό του `worker/migrations/drafts/tools/build-071a.mjs`· τα «μετά» md5 του `want` στο `drafts/071a_invoice_from_registration.sql:51` ισούνται με τα live. Το `stock_guard_orders` (στη λίστα φρουρού της 072) πυροδοτείται σε **κάθε** UPDATE `orders`. Παρατήρηση: το 071a εκτελέστηκε 22/10 αλλά τα αρχεία του είναι ακόμη στο `drafts/` (κανόνας 5).

---

## 8. Ελεγκτής: `monitoring.checks` και `tms-auditor/checks/*.sql`

**Μοτίβο build-seed:** τα `tms-auditor/checks/<ID>.sql` (91 αρχεία, κεφαλίδα `-- key: value`, σώμα SELECT, προαιρετικό `-- @ids`) είναι η **μόνη πηγή**. `node tms-auditor/checks/build-seed.mjs` ξαναγράφει το `worker/migrations/drafts/047b_monitoring_seed.sql` (`INSERT ... ON CONFLICT (id) DO UPDATE`)· το `tms-auditor/test/catalog.test.mjs:38-40` αποτυγχάνει αν το seed αποκλίνει, και `:55-60` αν ένα enabled check διαβάζει πίνακα/όψη χωρίς GRANT (050 ή η δική του migration, όπως η 057). Lint (`checks/load.mjs`): ένα SELECT, λίστα επιτρεπτών συναρτήσεων (`count, sum, max, min, abs, coalesce, left, btrim, round, extract, array_agg, now, exists, in, any, date, greatest, least, lower, upper, length`), καμία συνάρτηση TMS. Τοπικός εκτελεστής: `node tms-auditor/run-checks.mjs` (PGlite, χωρίς δίκτυο).

**Αρχεία ↔ βάση (μετρημένο):** 89 γραμμές στη βάση (85 enabled). Για **όλες τις 89** το `md5(sql_text)` = md5 του σώματος του αρχείου. B-55, B-56: μόνο στα αρχεία (disabled). B-37, B-49, P-09, S-03: disabled και στα δύο.

**Σχετικοί έλεγχοι** (κανένας δεν διαβάζει `ct_v_rt_revenue`/`ct_v_rt_pnl`/`dl_v_rt_route`):

| ID | Τίτλος | Διαβάζει | Τελευταίο αποτέλεσμα |
|---|---|---|---|
| B-04 | OWNED γύρος με οδηγό χωρίς μισθοδοσία (P2) | `dl_v_rt_gap` | green 0 (22/10 02:10) |
| B-07 | Μετρητά ≠ μισθοδοσία (P1) | `ct_cost_lines`, `dl_entries` | green 0 |
| B-13 / B-15 | Παραδομένες χωρίς τιμή / ατιμολόγητες | `orders.price` | queue 18 / 12 |
| B-14 | Αρνητικά ποσά | `ct_cost_lines`, `pl_movements`, price | green 0 |
| B-16 | Πύλη παλετών: μπλοκαρισμένες (P3) | `pl_v_order_gate` | queue 16 |
| B-17 | Εκκρεμείς κινήσεις > 7 ημ. | `pl_movements` | queue 47 |
| B-18 / B-18b | Ακεραιότητα / πλήθος δεν μειώνεται (P1) | `pl_movements` | green 0 / 245 |
| B-20, B-21, B-23, B-24 | Τρόπος πληρωμής, σύνολα DKV, μετρητά χωρίς RT, διπλές DKV | `ct_cost_lines`, `ct_cost_docs` | green 0 |
| B-22 | Κόστος χωρίς RT > 14 ημ. (P3) | `ct_cost_lines` | queue 164 |
| B-25 | Καύσιμα/διόδια εκτός παραθύρου ±5 (P3) | `ct_cost_lines`, `ct_round_trips` | **red 3** |
| B-49 | Παλέτες μισή επιβεβαίωση | `pl_movements` | disabled (λάθος ορισμός) |
| B-59 | NL με όχημα χωρίς RT από 5/10 (P2) | `national_loads`, `ct_rt_legs` | green 0 |
| B-64 | Τοπικός οδηγός ↔ μισθοδοσία | `dl_entries` | green 0 |
| P-08 | Παλέτες: ενημέρωση χωρίς επιβεβαίωση | audit | green 0 |
| S-01…S-14 | Απόθεμα (S-03 disabled από 071a) | `stock_v_lots`, `stock_v_lot_money` | S-01 green 0 |

sql md5 (= αρχείο): B-04 `dbc6efa7818e2736080e32bc0090e45b` · B-16 `4d2fa749643bd05bd69702afa9aca92a` · B-17 `615f2388312f92228411da625f816bc3` · B-18 `693f5e4a8834fb1b2134a5397619e4cd` · B-18b `2fcb8ceebf4117fd399fefc8a164af82` · B-21 `30bbc94555f91fdc371cfe70b842d2c0` · B-22 `7b7709b830847da93b567cd91c8b430c` · B-24 `2a7a9fa31d1252f4a7cc3ec828460115` · B-25 `0ad1658df9d67e83057e6648388ca02f` · B-59 `95ff00d9e57a2497ad2d879e69440cb2` · S-11 `5ccba2f3363e485eb7cb11dccdb7650e`.

**Οι νέοι έλεγχοι του spec §8 που ανήκουν στη Φ3** (X ανά παραγγελία VS ∉ {0, 650, 850}· Σ εσόδων κύκλων + μη ανατεθειμένα/απόθεμα ≠ Σ τιμών εβδομάδας· κόμιστρο που λείπει· DKV χωρίς δρομολόγιο· κύκλοι χωρίς km για το Ε8) διαβάζουν όψεις χρημάτων ⇒ η 073 πρέπει να κάνει `GRANT SELECT ... TO tms_check_runner` (όχι `tms_reader`) και το `catalog.test.mjs` να μάθει τα grants της 073 όπως μαθαίνει της 057 (`granted057`, `READER_NO_MONEY`). Ο έλεγχος «X ανά παραγγελία» δεν μπορεί να καλέσει `stock_vs_charge` (εκτός λίστας lint)· πρέπει να διαβάσει στήλη όψης.

---

## 9. Ποιο front end διαβάζει τι

| Όψη / πηγή | Worker endpoint | Front end |
|---|---|---|
| `ct_v_rt_pnl` (→ revenue, costs, wear) | `GET /costs/pnl` (`index.js:4274-4286`, μόνο owner) | `modules/costs.js:336` (Trip P&L· τύπος INTL/NATL/MIX `:155-184`, σύνολα `:546-598`, κάρτα `:813-872`) |
| `ct_v_rt_pallet_gate` | `GET /costs/pallet-gate` (`:4289-4295`) | `modules/costs.js:24, 337` |
| `dl_v_rt_route` | `GET /costs/rt` (`:3782-3797`) και `dl_v_entries` → `/costs/ledger*` (`:4067-4140`) | `modules/expenses.js:600, 668, 805-925, 1319-1320, 1483`· `modules/expenses_import.js:462, 742`· `core/entity.js:2346` (καρτέλα οδηγού/φορτηγού)· `modules/payroll.js:151, 492-534` και `payroll_print.js:71`· `modules/orders_week_view.js:545`· `modules/weekly_intl.js:5322`· `core/rt-feed.js:90, 115` |
| `dl_v_rt_gap` | `/costs/ledger` (`:4117, :4139`) | `modules/payroll.js:254, 403, 810, 1194` |
| `dl_v_entries`, `dl_v_balance` | `/costs/ledger*` | `modules/payroll.js`, `payroll_print.js` |
| `stock_v_lot_money`, `stock_v_lot_alloc` | `GET /costs/stock-lots` | `modules/costs.js:454`, `orders_intl.js:1194, 1257`, `orders_invoicing_view.js:664` |
| `stock_v_lots` | facade `readView` (`index.js:2031`) | `weekly_intl.js:7229` (chip) |
| `ct_round_trips.status` («κλειστό») | `GET /costs/rt` | `expenses.js:750`, `costs.js:197, 838, 1065`, `core/rt-feed.js:94` |
| `pl_v_order_gate` | `/pallets/*` | `orders_intl.js:2859`, `costs.js:980`, `weekly_intl.js:5301` |

Στο Ε7 αναφέρονται `costs.js:193-199, 1054, 1067-1072`: στο αρχείο του `97798ba8` (md5 `08c1c7a300eef9b58d7af56b4b99997f`) το badge είναι στις `:191-200` και το κείμενο «έχει ολοκληρωθεί» στη `:1065`· οι αριθμοί του spec έχουν μετακινηθεί λίγο.

---

## 10. Επιλογές για τον owner (πρώτα η προτεινόμενη)

1. **X του VS που χάνεται (49.550 € ιστορικά):** (α) προτείνεται: η Φ3 δεν το αγγίζει για `model=1` (το απαιτεί το «πριν = μετά»)· καταγράφεται ως γνωστό και, αν χρειαστεί, διορθώνεται χωριστά με δική του απόφαση / (β) το έσοδο του VS εμφανίζεται κάπου (π.χ. στο RT του εθνικού) από τώρα.
2. **Ώρα DKV:** (α) προτείνεται: ταίριασμα κατά ώρα μόνο στο preview, χωρίς νέα στήλη· `review` όταν λείπει ώρα με δύο κύκλους την ίδια μέρα / (β) νέα στήλη `ct_cost_lines.line_at timestamptz` για να ξαναταιριάζει αργότερα (αλλαγή σχήματος, κι άλλα αρχεία).
3. **Ε21:** (α) προτείνεται: ο Worker προσθέτει πεδίο `ended` (από `v_rt_cycle`) στις γραμμές `model=2` του `GET /costs/rt` και το `exIsDone` το διαβάζει / (β) ο Worker γράφει παραγόμενο `status` για `model=2` (δύο έννοιες σε ένα πεδίο).
4. **Ε8:** (α) προτείνεται: όψη και έλεγχος «κύκλοι χωρίς km», χωρίς αλλαγή ποσών (σήμερα 0 km παντού) / (β) αναβολή μέχρι να υπάρξουν km.
5. **Πύλη παλετών συνεργάτη (0/103 πράσινη):** (α) προτείνεται: μένει όπως είναι για `model=1`, ο κλάδος v5 από τα κομμάτια / (β) ερώτηση στον owner αν η πύλη P&L ισχύει ακόμη μετά το Β0 (κατάργηση πύλης δελτίου για την τιμολόγηση).
6. **`security_invoker` / reloptions** στο `CREATE OR REPLACE VIEW`: επαλήθευση σε PGlite στο Task 1 του πλάνου· το κείμενο της 073 ξαναγράφει ρητά το `WITH (security_invoker = true)` όπου υπάρχει.
7. **Grants:** οι όψεις χρημάτων στο `tms_check_runner` μόνο (προηγούμενο 057).
8. **B-18b vs διαγραφή pending από τον feeder:** (α) προτείνεται: ερώτηση στον συντονιστή αν ο B-18b θα έπρεπε να μετρά μόνο confirmed / (β) αφήνεται.
9. **071a στο `drafts/`:** μεταφορά εκτός `drafts/` (κανόνας 5) από όποιον κρατά το Β0.

---

## 11. Τι πρέπει να καλύπτει το «πριν = μετά» της 073

Αφού δεν υπάρχει καμία γραμμή v5 (`model=2` = 0, `rt_stops`/`piece_legs`/`shipment_pieces` = 0), **κάθε** όψη που αλλάζει πρέπει να δίνει ακριβώς τις ίδιες γραμμές. Μέσα στο DO block της 073 (ίδια συναλλαγή, άρα ίδιο `now()`/`CURRENT_DATE`), πριν και μετά:

- **Όλο το fingerprint του 071** (`worker/migrations/071_plan_schema_fingerprint.sql`): `rt_md5` (RT + revenue + costs + pnl) και `dl_md5`.
- **Επιπλέον** (δεν τα έχει το 071):
  - `dl_v_rt_route` (γραμμές + md5 `to_jsonb` ανά `rt_id`) — αποδοχή master plan
  - `ct_v_rt_pnl` count — αποδοχή master plan
  - `dl_v_rt_gap`, `ct_v_rt_pallet_gate`, `ct_v_wear_rate` (αν αλλάξει για Ε8)
  - `dl_v_entries`, `dl_v_balance` (εξαρτώνται από τη διαδρομή)
  - `stock_v_pieces`, `stock_v_lot_money`, `stock_v_rt_amounts` (αν αγγίξει το Ε6)
  - `pl_movements` (αν η 073 βάλει trigger/φρουρό παλετών) και `ct_cost_lines` (αν βάλει στήλη ώρας)
  - md5 ορισμών όψεων που **δεν** πρέπει να αλλάξουν (π.χ. `ct_v_fuel`, `pl_v_order_gate`) και των 23 συναρτήσεων του φρουρού της 072 (+ `rt_auto_close`, `stock_vs_charge`, `stock_natl_delivered`, `ct_setting` αν τα χρησιμοποιεί η 073)
- Το fingerprint του owner (δύο εκτελέσεις εκτός block) δίνει ίδιες τιμές **μόνο** την ίδια μέρα και χωρίς εγγραφές στο μεταξύ.

**Τιμές μετρημένες 23/10/2026 01:05:52 Αθήνα** (αναφορά, όχι φρουρός· αλλάζουν με κάθε εγγραφή):

| Μέτρηση | Τιμή |
|---|---|
| round_trips | 202 |
| rt_md5 (ερώτημα 071) | `1bed6e3fa6f1577dfa90f9a188413b89` |
| dl_rows / dl_md5 | 11.264 / `2a1b7c4eb1352019eef2f43bc3d570c3` |
| dl_v_rt_route md5 (`to_jsonb` ανά rt_id) | `c32785f241a09f74ff90919293c1083a` (186 γραμμές) |
| ct_v_rt_revenue md5 | `2487570e5610c5cac3fa34df2d8eb51c` |
| ct_v_rt_costs md5 | `e38c12d56ac930af9327acef185a7b9f` |
| ct_v_rt_pnl md5 | `d534adec219687134aef113ae9813b24` (185) |
| dl_v_rt_gap md5 | `d41d8cd98f00b204e9800998ecf8427e` (0 γραμμές) |
| ct_v_rt_pallet_gate md5 | `a6591109a0fac2b294e084f7b6418d4e` (103) |
| ct_v_wear_rate md5 | `c4dbbfbd49cf2307a1398674f4d870fa` (46) |
| dl_v_entries md5 | `c243ebda77de86eb6690ffa39cf362c4` (11.264) |
| dl_v_balance md5 | `adef83da676c6e9e3fc35b5bb37a041f` (82) |
| stock_v_pieces md5 | `65c5eb61ce3550bf12d7097e88780071` (1) |
| stock_v_lot_money md5 | `427cdbbb114cea7e64c4b61d43d11ee2` |
| pl_movements md5 | `31be6372198b79f63b27f5634102e927` (253) |
| ct_cost_lines md5 | `6d84e550b7d37cef1f69dd8c107eae0c` (1.247) |

Το ερώτημα που τα έβγαλε = το 071 fingerprint + `md5(coalesce(string_agg(to_jsonb(r)::text, '|' ORDER BY <κλειδί>), ''))` ανά όψη (κλειδιά: `rt_id`, `truck_id`, `id`, `driver_id`, `(piece_kind, piece_id)`, `lot_id`).

---

## 12. Αρχεία repo που μετρήθηκαν (@ `9f98208d`)

| Αρχείο | md5 | Γραμμές |
|---|---|---|
| `worker/src/index.js` | `a3117aac2170a34015f9a3a08be0e953` | 5.836 |
| `worker/src/import-rules.mjs` | `edf9fd1ad41c54b06de1f0c7bb304d41` | 875 |
| `core/pallet-feed.js` | `211c026fecc86b3d954f3a0da3dfa96b` | 337 |
| `modules/costs.js` | `08c1c7a300eef9b58d7af56b4b99997f` | |
| `modules/expenses.js` | `eacccf85e0c204d806d48adbf3c3bc26` | |
| `modules/payroll.js` | `1d1b1a89745600138fdb58ba0a3280f5` | |
| `core/entity.js` | `2fd86bcc4c20f46ce04a15a347bff381` | |
| `core/rt-feed.js` | `8f1aceacbfb53ee586c678081f682d79` | |
