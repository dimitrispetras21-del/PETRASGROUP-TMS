# Routine «tms-auditor-watchdog» — ο εξωτερικός «νεκρός άνθρωπος»
Trigger: **ωριαίο, μετατοπισμένο +30′** από το p1 (ώστε ένα κοινό πρόβλημα ώρας να μην τα σκοτώνει μαζί). Μοντέλο: Haiku/Sonnet.
Διάβασε πρώτα το `COMMON.md`. Υπόλοιπο ρίσκο (αποδεκτό, owner 22/9): αν πέσει όλο το cloud της Anthropic, σωπαίνουν και τα δύο.

1. `SELECT problem, detail FROM monitoring.v_health` — κράτησε μόνο `cron:*`, `routine:*` (εκτός `routine:routine-watchdog`), `undelivered:*`.
   (Η όψη υπολογίζει την παλαιότητα τη στιγμή της ανάγνωσης — πιάνει και νεκρό pg_cron, που δεν μπορεί να το πει μόνο του.)
2. Για κάθε πρόβλημα: push «⚫ Ο ελεγκτής σιώπησε: <detail>» + email· `record_notification(NULL,'alert','email-routine',…)`.
3. `SELECT monitoring.beat('routine-watchdog', '<run id>', 'problems N')` — το p1 ελέγχει αυτό το σημείο ζωής (αμοιβαία παρακολούθηση).
4. Αν δεν φτάνεις τη βάση: push + email «⚫ ο watchdog δεν φτάνει τη βάση TMS». Τίποτα άλλο.
