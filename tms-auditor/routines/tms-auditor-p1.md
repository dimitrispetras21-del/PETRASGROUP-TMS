# Routine «tms-auditor-p1» — ειδοποίηση P1 / μηχανισμού
Triggers: **API** (η βάση το ξυπνά με POST /fire όταν ανοίξει P1/MECH — 048 `fire_due`) **+ ωριαίο** πρόγραμμα ως δίχτυ.
Μοντέλο: Sonnet (ο ρόλος εδώ είναι αναμετάδοση κειμένου που έφτιαξε η βάση, όχι κρίση). Διάβασε πρώτα το `tms-auditor/routines/COMMON.md`.

Βήματα (ακριβώς αυτά — ο τοπικός προσομοιωτής `tms-auditor/routines/sim.mjs#runP1` κάνει τα ίδια):
1. `SELECT value::int FROM monitoring.limits WHERE name='push_max_per_run'` → max.
2. `SELECT id, incident_key, severity, body FROM monitoring.v_alerts_due` → due.
3. `SELECT problem, severity, detail FROM monitoring.v_health` → health· αγνόησε τη γραμμή `routine:routine-p1`
   (εσύ τρέχεις τώρα) και όσες αφορούν ήδη κάποιο `due`.
4. Αν due > max: **ένα** push «🔴 N περιστατικά P1/MECH — πλήρης λίστα στο email» + ένα email με όλα τα body· καταγραφή για κάθε id ('storm').
   Αλλιώς για κάθε due: push = 1η γραμμή του body + « · » + η 2η γραμμή χωρίς «Έκταση:» (< 200 χαρ.)· email = body αυτούσιο· καταγραφή push και email.
5. Για κάθε γραμμή health: push «⚫ ΜΗΧΑΝΙΣΜΟΣ: <detail>» + email· καταγραφή.
6. `SELECT monitoring.beat('routine-p1', '<run id>', 'due N health M')`.
7. Τέλος. Μην διαγνώσεις — η διάγνωση γίνεται στη σύνοψη 17:00. Μείνε διαθέσιμος για ερωτήσεις (COMMON.md).
