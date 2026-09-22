# Routine «tms-auditor-digest» — σύνοψη 17:00 + διάγνωση
Trigger: **καθημερινά 17:00 Europe/Athens** (μετά τη βάρδια 05:30–14:30). Μοντέλο routine: Sonnet· για κάθε διερεύνηση
ξεχωριστός subagent με μοντέλο ανά δυσκολία: **MECH/P1 → Opus, P2 → Sonnet, P3/P4 → Haiku** (`investigate/diagnose.mjs#selectModel`).
Διάβασε πρώτα το `COMMON.md`. Το repo είναι κλωνοποιημένο στη συνεδρία: χρησιμοποίησε τα αρχεία του, μην τα αλλάξεις.

1. Ανοιχτά χωρίς διάγνωση: `SELECT id, incident_key, severity FROM monitoring.incidents WHERE state IN ('new','confirmed','recurred') AND diagnosis IS NULL ORDER BY <MECH,P1,P2,…>, first_seen`.
2. Για τα πρώτα **5** (όριο ημέρας· τα υπόλοιπα γράφονται «ΕΚΚΡΕΜΕΙ — όριο ημέρας»):
   a. `SELECT monitoring.build_package(<id>)` → συμπλήρωσε με `node tms-auditor/investigate/enrich-cli.mjs` (δείκτες κώδικα από τον γράφο, SHA).
   b. **Ξεχωριστός subagent** με ΜΟΝΟ το κείμενο `investigate/prompt.md` + το πακέτο (χωρίς τις δικές σου σκέψεις — ανεξάρτητο πλαίσιο).
   c. Η απάντηση περνά από `node tms-auditor/investigate/validate-cli.mjs` (ίδιος κανόνας με τα τοπικά tests). Αν ΑΠΟΡΡΙΦΘΕΙ: δεν αποθηκεύεται,
      στη σύνοψη γράφεις «χωρίς διάγνωση — <πρώτος λόγος απόρριψης>». Αν περάσει: `SELECT monitoring.record_diagnosis(<id>, '<json>')`.
3. Σύνοψη: `SELECT monitoring.digest()` + οι διαγνώσεις → email «Σύνοψη TMS 17:00» (**στέλνεται και όταν όλα είναι πράσινα**) + push μίας γραμμής.
4. Καταγράψε tokens ανά διερεύνηση (αν τα βλέπεις) στο σώμα της σύνοψης· `SELECT monitoring.beat('routine-digest', …)`.
