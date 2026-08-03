# Pre-Mortem v2 — Daily Ramp Board

_2026-08-03 · `modules/daily_ramp.js` (891 γρ.) · Προηγούμενο: [11/7](../PreMortem-daily_ramp.md)_

## Ρόλος στο σύστημα
Η ράμπα της Βέροιας ανά ημέρα: inbound/outbound, ώρες, status flips προς
ORDERS/NAT_ORDERS, αναβολές. Η μόνη σελίδα με **χρήση σε tablet από
αποθηκάριο**.

## Τι άλλαξε από 11/7
Ανασχεδιάστηκε: KPI band (Inbound/Outbound/Net/Stock/Progress), φίλτρα
Type/Status/Category, timeline όλων των κινήσεων, stock in warehouse.
Επιβεβαιώθηκε live 3/8 — καθαρό layout, **αλλά** σκούρες κάρτες + σκούρες
κεφαλίδες με πλαϊνές ρίγες πάνω σε ανοιχτό φόντο.

## Σενάριο αποτυχίας
Ο χειριστής με γάντια δεν πετυχαίνει τα μικρά inline πεδία στο tablet και
γυρίζει στο τυπωμένο χαρτί. Παράλληλα, μια παραγγελία που άλλαξε πλάνο
αφήνει τη χθεσινή γραμμή στη ράμπα — και κανείς δεν το ελέγχει.

## 🐯 Tigers
- **T1 (🟠):** 9 σημεία εγγραφής, **0 conflict handling** — και εδώ δουλεύουν
  ταυτόχρονα αποθήκη + dispatcher, το πυκνότερο concurrent σενάριο του app.
- **T2 (🟠 integration):** οι RAMP γραμμές είναι παράγωγα χωρίς **καμία
  επανασυμφωνία** με το πλάνο· τα cascades τις σβήνουν σκληρά.
- **T3 (🟠 UX):** touch targets κάτω από 44px, δύο οπτικές γλώσσες στην ίδια
  οθόνη, αγγλικά empty states («No inbound», «Warehouse empty»).
- **T4 (🟡):** μερικές αποτυχίες στο batch create φτάνουν μόνο στην κονσόλα.

## 🔗 Διασυνδέσεις
**Μέσα:** RAMP + πλάνα (ORDERS/NAT_LOADS). **Έξω:** RAMP, ORDERS/NAT_ORDERS
(status 'In Transit'), sync με skips.
**Συν-συγγραφείς του RAMP:** orders_intl, orders_natl (cascades).

## Ευρήματα 11/7
T1-T4 **όλα ΑΝΟΙΧΤΑ**.

## Verdict: 🟠
Λειτουργικά ώριμη· κινδυνεύει από το tablet UX (εγκατάλειψη) και από την
έλλειψη επανασυμφωνίας με το πλάνο (αναξιοπιστία).
