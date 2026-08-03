# Pre-Mortem v2 — National Pick Ups (iframe)

_2026-08-03 · `core/router.js:269` → petras-assign/national_consolidation.html · Προηγούμενο: [11/7](../PreMortem-weekly_pickups.md)_

## Ρόλος στο σύστημα
Ο planner ομαδοποίησης εθνικών (drag & drop suppliers → φορτηγά), ενσωματωμένος
σε iframe από **άλλο repo**. Γράφει GROUPAGE LINES + CONSOLIDATED LOADS.

## Τι άλλαξε από 11/7 — 🚨 ΤΟ ΧΕΙΡΟΤΕΡΟ
Στις 28/7 το TMS πέρασε σε Supabase και **το Airtable πάγωσε ως αντίγραφο
αναφοράς**. Το iframe **δεν ενημερώθηκε**: συνεχίζει να γράφει κατευθείαν στο
παγωμένο Airtable με hardcoded PAT (`national_consolidation.html:422`).

## Σενάριο αποτυχίας — ήδη συμβαίνει
Ο dispatcher σύρει προμηθευτές σε φορτηγό, πατά αποθήκευση, βλέπει επιτυχία.
**Τίποτα δεν φτάνει στο TMS.** Το Weekly National δεν δείχνει το φορτίο, το
consolidation «χάθηκε», και κανείς δεν παίρνει μήνυμα λάθους.

## 🐯 Tigers
- **T1 (🔴 P0):** δημόσιο URL, HTTP 200 **χωρίς login**, με ζωντανό PAT
  πλήρων δικαιωμάτων — επιβεβαιωμένο 3/8.
- **T2 (🔴 P0):** **split-brain** — γράφει σε βάση που κανείς δεν διαβάζει.
- **T3 (🟠):** δύο repos υλοποιούν τους ίδιους κανόνες (GL never-delete) με
  copy-paste· κάθε αλλαγή schema πρέπει να γίνει δύο φορές.
- **T4 (🟡):** hardcoded URL σε hosting που ήδη άλλαξε μία φορά.

## 🔗 Διασυνδέσεις
**Υποτίθεται:** GL/CL → NAT_LOADS → Weekly National.
**Στην πράξη σήμερα:** η αλυσίδα είναι **κομμένη στο πρώτο βήμα**.

## Ευρήματα 11/7
T1 (auth) **ΑΝΟΙΧΤΟ — χειροτέρεψε** · T2 (migration blocker) **ΕΓΙΝΕ
ΠΡΑΓΜΑΤΙΚΟΤΗΤΑ** · T3/T4 ΑΝΟΙΧΤΑ.

## Verdict: 🔴 ΕΝΕΡΓΟ ΠΕΡΙΣΤΑΤΙΚΟ
Δεν είναι ρίσκο· είναι βλάβη σε εξέλιξη από τις 28/7. Μπλόκαρε το route και
ανάκλησε το PAT σήμερα.
