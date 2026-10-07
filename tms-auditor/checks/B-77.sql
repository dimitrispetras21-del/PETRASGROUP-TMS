-- id: B-77
-- title: Σχετικές παραγγελίες (ομάδα/ζεύγος/ρότα) σε >1 ζωντανά δρομολόγια
-- flows: F-21,F-16,F-18,F-14
-- severity: P2
-- schedule: hourly
-- red: > 0
-- baseline:
-- queue: no
-- entity: orders
-- impact: Ένα φυσικό δρομολόγιο (ομάδα, ζεύγος εξαγωγής/εισαγωγής ή ρότα) κάθεται σε δύο RT: ο Worker αρνείται κάθε συγχρονισμό της ομάδας (409), η ρότα δεν μπαίνει, και μισθοδοσία/έξοδα του οδηγού μοιράζονται σε δύο δρομολόγια. Περιστατικό 7/10: GI-MUV7FNKE, #451 στο RT-1217 και #449 μόνη στο RT-1220.
-- next: Εβδομαδιαίο Διεθνών → οι παραγγελίες των ids: ποιο RT είναι το σωστό; Μεταφορά σκέλους με τις εντολές του Worker (DELETE leg + POST attach), όπως η επισκευή της 7/10 — μόνο με «ναι» του owner.
-- exceptions: Ζεύγη παραγγελιών (κάθε ζεύγος μία φορά) με ΑΜΕΣΗ σχέση, όπως τη βλέπουν οι trigger 033/037 μετά το 066: ίδιο βασικό Group ID (ό,τι είναι πριν το «|» — το front γράφει τη σειρά παράδοσης «|recA,recB» ένα μέλος τη φορά), matched_import_id = legacy_id ή rotation_id = legacy_id (και ανάποδα). Και οι δύο μη διαγραμμένες, με σκέλος σε ζωντανό RT (status ≠ cancelled), σε ΔΙΑΦΟΡΕΤΙΚΑ RT. Μετρά και ζεύγη σε άλλο όχημα: το 033 ανοίγει τότε χωριστό RT επίτηδες, αλλά ομάδα/ζεύγος/ρότα σε δύο οχήματα αντιφάσκει με τη σχέση — διόρθωσε όχημα ή σχέση. Παραγγελία που ο 033 άφησε ΧΩΡΙΣ RT επειδή οι συγγενείς της ήταν ήδη σε δύο RT τη δείχνει το B-01. Group ID που περιέχει «#» δεν συγκρίνεται (διαχωριστικό του ελέγχου: η λίστα συναρτήσεων του ελεγκτή δεν έχει split_part· το front γράφει μόνο γράμματα, ψηφία, «-», «|» και «,»). ids = legacy_id και των δύο παραγγελιών κάθε ζεύγους.
-- tolerance:
-- source: περιστατικό 7/10 (ρότα Παντελή, DECISION_LOG 7/10) · DRAFT 066 · PGlite 7/10 = 0 · παραγωγή: SELECT συντονιστή πριν το 066
-- enabled: yes
SELECT count(*) FROM orders a JOIN ct_rt_legs la ON la.order_id=a.id JOIN ct_round_trips ra ON ra.id=la.rt_id AND ra.status<>'cancelled'
 JOIN orders b ON b.id>a.id AND b.deleted_at IS NULL JOIN ct_rt_legs lb ON lb.order_id=b.id JOIN ct_round_trips rb ON rb.id=lb.rt_id AND rb.status<>'cancelled'
 WHERE a.deleted_at IS NULL AND rb.id<>ra.id
 AND ((a.group_id||'#'||b.group_id) ~ '^([^|#]*)(\|[^#]*)?#\1(\|[^#]*)?$'
  OR a.matched_import_id=b.legacy_id OR b.matched_import_id=a.legacy_id OR a.rotation_id=b.legacy_id OR b.rotation_id=a.legacy_id);
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT DISTINCT coalesce(o.legacy_id, o.id::text) AS x FROM orders o JOIN (SELECT a.id AS a_id, b.id AS b_id FROM orders a
 JOIN ct_rt_legs la ON la.order_id=a.id JOIN ct_round_trips ra ON ra.id=la.rt_id AND ra.status<>'cancelled'
 JOIN orders b ON b.id>a.id AND b.deleted_at IS NULL JOIN ct_rt_legs lb ON lb.order_id=b.id JOIN ct_round_trips rb ON rb.id=lb.rt_id AND rb.status<>'cancelled'
 WHERE a.deleted_at IS NULL AND rb.id<>ra.id
 AND ((a.group_id||'#'||b.group_id) ~ '^([^|#]*)(\|[^#]*)?#\1(\|[^#]*)?$'
  OR a.matched_import_id=b.legacy_id OR b.matched_import_id=a.legacy_id OR a.rotation_id=b.legacy_id OR b.rotation_id=a.legacy_id)) p
 ON o.id IN (p.a_id, p.b_id) ORDER BY 1 LIMIT 50) s;
