-- ROUTE GRAMMAR: one formula per live order, national load and round trip (docs/order-route/ROUTE-GRAMMAR.md).
-- READ ONLY (SELECT). Run in the Supabase SQL editor; the result IS docs/order-route/route-grammar-formulas.csv
-- (kind, id, formula, rules, flags, link), no post-step. Measured 27/10/2026: 398 + 81 + 212 rows.
-- Ids only in the output, never names (the repo is public).
WITH o AS (SELECT * FROM orders WHERE deleted_at IS NULL),
-- Notes are the only record of third-party warehouses, customs, transshipments and extra loads (CASES.md findings).
nt AS (SELECT o.id, upper(translate(coalesce(o.notes,'')||' '||coalesce(o.ops_notes,'')||' '||coalesce((SELECT string_agg(s.notes,' ') FROM order_stops s WHERE s.order_id=o.id AND s.deleted_at IS NULL),''),'άέήίόύώϊΐϋΰ','αεηιουωιιυυ')) x FROM o),
-- One token per stop. 360 = the hub (locations.is_hub); 1044 = our own facility in Veroia, a normal place.
-- A place without a country is "?", never guessed as Greek.
st AS (SELECT s.order_id, s.datetime, s.stop_type, s.stop_number, s.id, s.location_id,
   CASE WHEN s.stop_type='Cross-dock' THEN 'H'
        WHEN s.location_id IN (360,1044) THEN CASE s.stop_type WHEN 'Loading' THEN 'Vl' ELSE 'Vd' END
        ELSE CASE s.stop_type WHEN 'Loading' THEN 'L' ELSE 'D' END
          || CASE WHEN l.country IS NULL OR btrim(l.country)='' THEN '?' WHEN l.country IN ('GR','Greece','GREECE') THEN 'g' ELSE '' END END tok
   FROM order_stops s JOIN o ON o.id=s.order_id LEFT JOIN locations l ON l.id=s.location_id WHERE s.deleted_at IS NULL),
-- stop_number restarts per stop type, so the chain is ordered by date, then load < cross-dock < delivery.
-- A stop without a date: a load goes first, a delivery last (flag E8), never after the opposite kind.
seq AS (SELECT order_id, tok, location_id, row_number() OVER (PARTITION BY order_id ORDER BY
          coalesce(datetime, CASE stop_type WHEN 'Loading' THEN '-infinity'::date ELSE 'infinity'::date END),
          CASE stop_type WHEN 'Loading' THEN 1 WHEN 'Cross-dock' THEN 2 ELSE 3 END, stop_number, id) rn FROM st),
runs AS (SELECT order_id, tok, rn, rn - row_number() OVER (PARTITION BY order_id, tok ORDER BY rn) g FROM seq),
chain AS (SELECT order_id, string_agg(tok || CASE WHEN c>1 THEN c::text ELSE '' END, '·' ORDER BY f) ch FROM (SELECT order_id, tok, g, min(rn) f, count(*) c FROM runs GROUP BY 1,2,3) q GROUP BY 1),
ends AS (SELECT order_id, (array_agg(location_id ORDER BY rn))[1] first_loc, (array_agg(location_id ORDER BY rn DESC))[1] last_loc FROM seq GROUP BY 1),
-- K1 for a split order, by PLACE: leg 1 starts where the order starts, each leg starts where the previous one
-- ended, and the last leg ends where the order ends
legj AS (SELECT pid, bool_and(ok) ok FROM (
   SELECT c.parent_order_id pid,
     coalesce(CASE WHEN lag(c.id) OVER w IS NULL THEN e.first_loc = pe.first_loc ELSE e.first_loc = lag(e.last_loc) OVER w END, false)
     AND (lead(c.id) OVER w IS NOT NULL OR coalesce(e.last_loc = pe.last_loc, false)) ok
   FROM o c LEFT JOIN ends e ON e.order_id=c.id LEFT JOIN ends pe ON pe.order_id=c.parent_order_id
   WHERE c.parent_order_id IS NOT NULL WINDOW w AS (PARTITION BY c.parent_order_id ORDER BY c.leg_no, c.id)) q GROUP BY 1),
nl AS (SELECT source_order_id oid, max(CASE WHEN truck_id IS NOT NULL THEN 'O' WHEN partner_id IS NOT NULL OR is_partner_trip THEN 'P' ELSE '∅' END) ex, count(*) n FROM national_loads WHERE deleted_at IS NULL AND source_order_id IS NOT NULL GROUP BY 1),
kids AS (SELECT parent_order_id pid, string_agg(CASE WHEN is_partner_trip THEN 'P' ELSE 'O' END, '→' ORDER BY leg_no, id) ex, count(*) n, max(leg_no) mx,
                bool_or(EXISTS (SELECT 1 FROM ct_rt_legs l JOIN ct_round_trips r ON r.id=l.rt_id AND r.status<>'cancelled' WHERE l.order_id=o.id)) kid_in_rt
         FROM o WHERE parent_order_id IS NOT NULL GROUP BY 1),
grp AS (SELECT split_part(group_id,'|',1) g, count(*) n FROM o WHERE group_id IS NOT NULL GROUP BY 1),
rtc AS (SELECT l.order_id, count(DISTINCT l.rt_id) n, string_agg(DISTINCT r.code, ' ') codes,
               bool_or(l.direction <> upper(o2.direction)) dir_off
        FROM ct_rt_legs l JOIN ct_round_trips r ON r.id=l.rt_id AND r.status<>'cancelled' JOIN orders o2 ON o2.id=l.order_id GROUP BY 1),
b AS (
SELECT o.id, o.parent_order_id par, o.leg_no, o.is_partner_trip p, c.ch, nl.ex nlex, nl.n nln, k.ex kex, k.n kn, k.mx kmx, k.kid_in_rt, lj.ok legs_join,
  o.stock_lot_id IS NOT NULL s_out, EXISTS (SELECT 1 FROM stock_lots sl WHERE sl.order_id=o.id AND sl.deleted_at IS NULL) s_in,
  coalesce(gp.n,0) >= 2 merged, nt.x ~ 'ΑΦΗΣ' w_leave, nt.x ~ '(ΑΠΟ|FROM) +(ΤΗΝ |ΤΟ |ΤΗ )?[A-ZΑ-Ω ]*(LOGISTICS|ΑΠΟΘΗΚ|WAREHOUSE|LAGER)' w_pick,
  nt.x ~ 'ΤΕΛΩΝ|CUSTOMS|ZOLL' cus, nt.x ~ 'ΜΕΤΑΦΟΡΤ' tr, nt.x ~ '\+ ?[0-9]+ ?(PAL|ΠΑΛ)' xl, nt.x ~ 'ΕΠΙΣΤΡΟΦ|RETOUR|RETURN' ret,
  coalesce(rtc.n,0) nrt, rtc.codes, coalesce(rtc.dir_off,false) dir_off,
  (SELECT min(s.datetime) FROM order_stops s WHERE s.order_id=o.id AND s.deleted_at IS NULL) d0,
  EXISTS (SELECT 1 FROM order_stops s WHERE s.order_id=o.id AND s.deleted_at IS NULL AND s.datetime IS NULL) nodate
FROM o JOIN nt ON nt.id=o.id LEFT JOIN chain c ON c.order_id=o.id LEFT JOIN nl ON nl.oid=o.id LEFT JOIN kids k ON k.pid=o.id
LEFT JOIN grp gp ON gp.g=split_part(o.group_id,'|',1) LEFT JOIN rtc ON rtc.order_id=o.id LEFT JOIN legj lj ON lj.pid=o.id),
fo AS (SELECT 'order' kind, id::text rid,
  (CASE WHEN par IS NOT NULL THEN 'leg'||coalesce(leg_no::text,'?')||':'||CASE WHEN p THEN 'P' ELSE 'O' END
        WHEN kex IS NOT NULL THEN kex WHEN tr THEN 'K→O' WHEN p THEN 'P' ELSE 'O' END)
  || '[' || CASE WHEN s_out THEN 'S↓·' ELSE '' END
  || CASE WHEN ch IS NULL THEN '∅'
          WHEN cus THEN regexp_replace(regexp_replace(ch,'^(L[g?]?[0-9]*)','\1+C·C'),'(D[g?]?[0-9]*)$','\1+C')
          WHEN tr THEN replace(ch,'Vl','X@V')
          WHEN w_leave AND ch LIKE '%H%' THEN replace(ch,'·H','·W↓·H')
          WHEN w_leave THEN regexp_replace(ch,'^(L[g?]?[0-9]*)','\1·W↓')
          WHEN w_pick THEN regexp_replace(ch,'^(L[g?]?[0-9]*)','\1·W↑')
          -- an extra load that exists only in the notes: its place in the chain is not recorded
          WHEN xl THEN ch || '·+L'
          ELSE ch END
  || CASE WHEN s_in THEN '·S↑' ELSE '' END || ']'
  || CASE WHEN nlex IS NOT NULL THEN ' H›'||nlex ELSE '' END
  || CASE WHEN merged THEN ' ⊕' ELSE '' END || CASE WHEN ret THEN ' ↩' ELSE '' END AS formula,
  concat_ws('+',
    CASE WHEN ch IS NULL THEN 'K0' END,
    CASE WHEN ch IS NOT NULL THEN 'K1' END,
    -- K2 = a node with two operations: cross-dock, transshipment / handover, third-party store, customs at a stop,
    -- stock in or out. Veroia as a plain load or delivery place (Vl / Vd) is ONE operation, so not K2.
    CASE WHEN ch ~ 'H' OR cus OR tr OR w_leave OR w_pick OR s_in OR s_out OR kex ~ '→' THEN 'K2' END,
    CASE WHEN w_leave OR coalesce(nln,0)>1 THEN 'K3' END,
    CASE WHEN merged THEN 'K4' END,
    CASE WHEN ret THEN 'K6' END,
    CASE WHEN nrt>0 THEN 'K7' END) rules,
  concat_ws(' ',
    CASE WHEN ch IS NULL THEN 'E0:no-nodes' END,
    CASE WHEN kmx IS NOT NULL AND kn<2 THEN 'E1:split-leg-missing' END,
    CASE WHEN kex IS NOT NULL AND NOT legs_join THEN 'E1b:split-legs-do-not-join' END,
    -- an international order whose every node is Greek (Veroia included) is mis-entered or really national
    CASE WHEN ch IS NOT NULL AND ch !~ '\?' AND ch !~ '(^|·)[LD][0-9]*(·|$)' THEN 'E11:international-without-foreign-node' END,
    CASE WHEN nlex='∅' THEN 'E2:national-leg-no-executor' END,
    -- an order (or a leg of a split one) gets its RT at assignment: none before its first stop is a state, after it a gap.
    -- The parent of a split rides through its legs, so it needs no RT of its own.
    CASE WHEN nrt=0 AND kex IS NULL AND ch IS NOT NULL THEN CASE WHEN d0 < current_date THEN 'E3:no-RT(past)' ELSE 'S:unassigned-yet' END END,
    CASE WHEN kex IS NOT NULL AND nrt>0 AND kid_in_rt THEN 'E7:parent-and-leg-both-in-RT' END,
    CASE WHEN nodate THEN 'E8:stop-without-date' END,
    CASE WHEN dir_off THEN 'E9:RT-leg-direction-differs' END,
    CASE WHEN ch ~ '\?' THEN 'N2:place-without-country' END,
    CASE WHEN w_leave OR w_pick OR cus OR xl OR tr THEN 'N:node-only-in-notes' END) flags,
  concat_ws(' ', CASE WHEN par IS NOT NULL THEN 'parent:#'||par END, codes) link
 FROM b),
nlx AS (SELECT n.id, n.source_type, n.direction,
  (SELECT count(*) FROM unnest(ARRAY[pickup_location_1_id,pickup_location_2_id,pickup_location_3_id,pickup_location_4_id,pickup_location_5_id,pickup_location_6_id,pickup_location_7_id,pickup_location_8_id,pickup_location_9_id,pickup_location_10_id]) u WHERE u IS NOT NULL AND u NOT IN (360,1044)) np,
  (SELECT count(*) FROM unnest(ARRAY[delivery_location_1_id,delivery_location_2_id,delivery_location_3_id,delivery_location_4_id,delivery_location_5_id,delivery_location_6_id,delivery_location_7_id,delivery_location_8_id,delivery_location_9_id,delivery_location_10_id]) u WHERE u IS NOT NULL AND u NOT IN (360,1044)) nd,
  -- hp/hd read the same 10 slots as np/nd, so a Veroia stop in any slot is counted once and never dropped
  coalesce((SELECT bool_or(u IN (360,1044)) FROM unnest(ARRAY[pickup_location_1_id,pickup_location_2_id,pickup_location_3_id,pickup_location_4_id,pickup_location_5_id,pickup_location_6_id,pickup_location_7_id,pickup_location_8_id,pickup_location_9_id,pickup_location_10_id]) u),false) hp,
  coalesce((SELECT bool_or(u IN (360,1044)) FROM unnest(ARRAY[delivery_location_1_id,delivery_location_2_id,delivery_location_3_id,delivery_location_4_id,delivery_location_5_id,delivery_location_6_id,delivery_location_7_id,delivery_location_8_id,delivery_location_9_id,delivery_location_10_id]) u),false) hd,
  CASE WHEN truck_id IS NOT NULL THEN 'O' WHEN partner_id IS NOT NULL OR is_partner_trip THEN 'P' ELSE '∅' END ex,
  n.source_order_id, n.source_national_order_id,
  EXISTS (SELECT 1 FROM ct_rt_legs l WHERE l.nat_load_id=n.id) in_rt,
  -- the source that made the load: its international order (Direct), its national order (National), or the
  -- national orders of its groupage lines (Groupage)
  CASE n.source_type
    WHEN 'Direct' THEN EXISTS (SELECT 1 FROM orders x WHERE x.id=n.source_order_id AND x.deleted_at IS NULL)
    WHEN 'National' THEN EXISTS (SELECT 1 FROM national_orders x WHERE x.id=n.source_national_order_id AND x.deleted_at IS NULL)
    ELSE EXISTS (SELECT 1 FROM groupage_lines g JOIN national_orders x ON x.id=g.national_order_id AND x.deleted_at IS NULL
                  WHERE g.cons_load_id=n.source_cons_load_id AND g.deleted_at IS NULL) END src_live,
  coalesce((SELECT max(s.datetime) FROM order_stops s WHERE s.national_load_id=n.id AND s.deleted_at IS NULL), n.delivery_datetime::date) dday
 FROM national_loads n WHERE n.deleted_at IS NULL),
fn AS (SELECT 'national_load' kind, id::text rid,
  ex||'['|| CASE WHEN np>0 THEN 'Lg'||CASE WHEN np>1 THEN np::text ELSE '' END ELSE '' END
   || CASE WHEN hp THEN CASE WHEN source_type='Direct' THEN 'H' ELSE 'Vl' END ELSE '' END
   || CASE WHEN (np>0 OR hp) AND (nd>0 OR hd) THEN '·' ELSE '' END
   || CASE WHEN hd THEN CASE WHEN source_type='Direct' THEN 'H' ELSE 'Vd' END ELSE '' END
   || CASE WHEN nd>0 THEN 'Dg'||CASE WHEN nd>1 THEN nd::text ELSE '' END ELSE '' END || ']'
   || CASE WHEN source_type='Groupage' THEN ' ⊕' ELSE '' END formula,
  concat_ws('+','K1', CASE WHEN (hp OR hd) AND source_type='Direct' THEN 'K2' END, CASE WHEN source_type='Groupage' THEN 'K4' END,
                 CASE WHEN in_rt THEN 'K7' END) rules,
  concat_ws(' ', CASE WHEN ex='∅' THEN 'E2:no-executor'||CASE WHEN dday < current_date THEN '(past)' ELSE '(future)' END END,
                 CASE WHEN ex='O' AND NOT in_rt THEN 'E4:own-truck-leg-in-no-RT' END,
                 CASE WHEN NOT src_live THEN 'E10:source-deleted' END,
                 -- owner 21/10 (docs/national-v5/flows-2026-10-21.md:7, spec 2.2): on day L the 6 national orders, their
                 -- loads and CL 5 are soft-deleted test data (the GL rows are never deleted; what happens to them is open)
                 CASE WHEN source_type IN ('National','Groupage') THEN 'T:test-row-deleted-on-L' END) flags,
  CASE WHEN source_type='Direct' THEN 'of:#'||source_order_id WHEN source_type='National' THEN 'natorder:'||source_national_order_id ELSE 'groupage' END link
 FROM nlx),
gs AS (SELECT split_part(group_id,'|',1) g, count(*) n FROM orders WHERE deleted_at IS NULL AND group_id IS NOT NULL GROUP BY 1),
lg AS (SELECT l.rt_id, l.seq, l.id lid, CASE WHEN o.deleted_at IS NOT NULL THEN 'x' WHEN l.direction='EXPORT' THEN 'E' ELSE 'I' END d,
   CASE WHEN gs.n>=2 AND o.deleted_at IS NULL THEN split_part(o.group_id,'|',1) END grp, (o.veroia_switch AND o.deleted_at IS NULL) vs, (o.parent_order_id IS NOT NULL) sp,
   (o.deleted_at IS NULL AND l.direction <> upper(o.direction)) dir_off
   FROM ct_rt_legs l JOIN orders o ON o.id=l.order_id LEFT JOIN gs ON gs.g=split_part(o.group_id,'|',1)),
-- A group (GRP / GI) is ONE merged leg (K4), whatever the number of its orders. "x" = a leg of a deleted order.
u AS (SELECT rt_id, d, coalesce(grp,'leg'||lid) k, min(seq*100000+lid) f, count(*) n, bool_or(vs) vs, bool_or(sp) sp FROM lg GROUP BY 1,2,3),
t AS (SELECT rt_id, d||CASE WHEN n>1 THEN '['||n||']' ELSE '' END||CASE WHEN vs THEN 'v' ELSE '' END||CASE WHEN sp THEN 's' ELSE '' END tok, f FROM u),
rr AS (SELECT id, code, truck_id, trailer_id, driver_id, status, trip_type, daterange(date_start, coalesce(date_end,date_start),'[]') dr FROM ct_round_trips),
-- K8: sharing ONE day is the normal same-day swap (unload in the morning, load in the afternoon); two or more is an error.
ov AS (SELECT a.id, bool_or(true) x FROM rr a JOIN rr b ON a.id<>b.id AND a.status<>'cancelled' AND b.status<>'cancelled' AND a.dr && b.dr AND (upper(a.dr*b.dr)-lower(a.dr*b.dr))>=2
       AND (a.truck_id=b.truck_id OR a.trailer_id=b.trailer_id OR a.driver_id=b.driver_id) GROUP BY 1),
fr AS (SELECT 'rt' kind, rr.code rid,
  CASE WHEN trip_type='OWNED' THEN 'O' ELSE 'P' END||'['||coalesce((SELECT string_agg(tok,'+' ORDER BY f) FROM t WHERE t.rt_id=rr.id),'∅')||']'||CASE WHEN status='cancelled' THEN ' cancelled' ELSE '' END formula,
  concat_ws('+', CASE WHEN EXISTS (SELECT 1 FROM t WHERE t.rt_id=rr.id AND tok ~ '\[') THEN 'K4' END, 'K7', CASE WHEN ov.x THEN 'K8' END) rules,
  concat_ws(' ', CASE WHEN ov.x THEN 'E5:overlap>=2days' END, CASE WHEN status<>'cancelled' AND trip_type='OWNED' AND (truck_id IS NULL OR driver_id IS NULL) THEN 'E6:owned-without-truck-or-driver' END,
                 CASE WHEN EXISTS (SELECT 1 FROM lg WHERE lg.rt_id=rr.id AND lg.dir_off) THEN 'E9:leg-direction-differs-from-order' END) flags,
  '' link
 FROM rr LEFT JOIN ov ON ov.id=rr.id),
al AS (SELECT * FROM fo UNION ALL SELECT * FROM fn UNION ALL SELECT * FROM fr)
SELECT kind, rid, formula, rules, flags, link FROM al ORDER BY kind, length(rid), rid;
