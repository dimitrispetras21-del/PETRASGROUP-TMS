-- id: B-97
-- title: VS χωρίς ημέρα κόμβου (μετά την ημέρα L)
-- flows: F-10
-- severity: P1
-- schedule: daily
-- red: > 0
-- baseline:
-- queue: no
-- entity: orders
-- impact: Χωρίς ημέρα κόμβου η VS δεν μπαίνει στο v5 (η τομή είναι η ημέρα κόμβου, spec 2.3) και δεν έχει πια εθνικό φορτίο του παλιού μοντέλου: κανείς δεν προγραμματίζει το εθνικό σκέλος.
-- next: Διεθνών: συμπλήρωση της ημερομηνίας cross-dock στην παραγγελία· η γέφυρα γεννιέται μόνη της.
-- exceptions: Μόνο VS που γεννήθηκαν μετά το plan_config.opened_at (οι παλιές έχουν NL). Cancelled εκτός.
-- tolerance:
-- source: DRAFT 074b (plan F5 Task C, spec 2.3) · PGlite 28/10: 0 on the production copy, red in the scenario of plan-074.test.mjs
-- enabled: yes
SELECT count(*) FROM orders o WHERE o.deleted_at IS NULL AND o.veroia_switch AND o.status IS DISTINCT FROM 'Cancelled' AND o.cross_dock_date IS NULL AND o.created_at >= (SELECT c.opened_at FROM plan_config c);
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT coalesce(o.legacy_id, o.id::text) AS x FROM orders o WHERE o.deleted_at IS NULL AND o.veroia_switch AND o.status IS DISTINCT FROM 'Cancelled' AND o.cross_dock_date IS NULL AND o.created_at >= (SELECT c.opened_at FROM plan_config c) ORDER BY 1 LIMIT 50) s;
