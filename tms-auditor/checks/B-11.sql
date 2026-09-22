-- id: B-11
-- title: Τιμολογημένη χωρίς αριθμό ΤΠΥ
-- flows: F-30
-- severity: P1
-- schedule: hourly
-- red: > 0
-- baseline: 2
-- queue: no
-- entity: orders
-- impact: Ο trigger 043 το απαγορεύει: > 2 σημαίνει ότι ο φραγμός έπεσε ή γράφτηκε με SQL.
-- next: 
-- exceptions: Ακριβώς 2 = ΙΣΤΟΡΙΚΟ 21/8 (owner: ανέγγιχτες). Καλύτερα: ids αντί για baseline (E-13).
-- tolerance: 
-- source: 02b Β-11 · 22/9 = 2 (ιστορικό)
-- enabled: yes
SELECT (SELECT count(*) FROM orders WHERE deleted_at IS NULL AND invoiced AND coalesce(btrim(invoice_number),'')='')
     + (SELECT count(*) FROM national_orders WHERE deleted_at IS NULL AND invoiced AND coalesce(btrim(invoice_number),'')='');
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT legacy_id AS x FROM orders WHERE deleted_at IS NULL AND invoiced AND coalesce(btrim(invoice_number),'')='' LIMIT 50) s;
