-- id: B-21
-- title: Έγγραφα DKV: σύνολα ≠ γραμμές
-- flows: F-34
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline: 
-- queue: no
-- entity: 
-- impact: 
-- next: 
-- exceptions: status='draft' αν θορυβεί. Το PDF είναι η αλήθεια.
-- tolerance: 
-- source: 02b Β-21 · 22/9 = 0+0
-- enabled: yes
SELECT (SELECT count(*) FROM ct_cost_docs d WHERE d.status<>'rejected' AND abs(coalesce(d.total_gross,0)-(SELECT coalesce(sum(net+coalesce(vat,0)),0) FROM ct_cost_lines l WHERE l.doc_id=d.id))>0.01)
     + (SELECT count(*) FROM ct_cost_docs d WHERE d.lines_total IS NOT NULL AND d.lines_total <> (SELECT count(*) FROM ct_cost_lines l WHERE l.doc_id=d.id)+coalesce(d.lines_deleted,0));
