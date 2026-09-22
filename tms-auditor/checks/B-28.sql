-- id: B-28
-- title: Συνέπεια VS (ορφανό φορτίο / cross-dock κενό)
-- flows: F-10,F-08
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline: 
-- queue: no
-- entity: 
-- impact: Εθνικό φορτίο ζει για διαγραμμένη παραγγελία ή VS χωρίς ημερομηνία cross-dock — λάθος προγραμματισμός στο Εθνικών.
-- next: 
-- exceptions: 
-- tolerance: 
-- source: 02b Β-28 · 22/9 = 0+0
-- enabled: yes
SELECT (SELECT count(*) FROM national_loads nl JOIN orders o ON o.id=nl.source_order_id WHERE nl.deleted_at IS NULL AND o.deleted_at IS NOT NULL)
     + (SELECT count(*) FROM orders WHERE deleted_at IS NULL AND veroia_switch AND cross_dock_date IS NULL AND status<>'Cancelled');
