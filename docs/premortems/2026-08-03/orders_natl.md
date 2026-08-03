# Pre-Mortem v2 — National Orders

_2026-08-03 · `modules/orders_natl.js` (1.613 γρ.) · Προηγούμενο: [11/7](../PreMortem-orders_natl.md)_

## Ρόλος στο σύστημα
CRUD εθνικών παραγγελιών με **δύο δρόμους γέννησης**: χειροκίνητα εδώ, ή
αυτόματα από ORDERS με Veroia Switch=ON. Γράφει σε 7 πίνακες.

## Τι άλλαξε από 11/7
Ο κανόνας «GL never-delete» **τηρείται** σε όλα τα σημεία (επαληθεύτηκε 3/8:
`Status:'Unassigned'` με atSafePatch, γρ. 1023). Το «hard-delete bug» που
ζητά το Valuedriven proposal είναι **εν μέρει ήδη διορθωμένο**.

## Σενάριο αποτυχίας
Ο dispatcher επεξεργάζεται VS-created παραγγελία· η επόμενη VS sync από τη
διεθνή πλευρά την ξαναγράφει. Κανείς δεν ξέρει ποια πλευρά είναι η αλήθεια,
και στο PnL δεν είναι σαφές ποιο εθνικό σκέλος παίρνει revenue = X (650/850)
και ποιο agreed price.

## 🐯 Tigers
- **T1 (🔴 συντονισμός):** πες στη Valuedriven **τι έχει ήδη διορθωθεί** πριν
  ξεκινήσει το Stage 1 — αλλιώς διπλή ή αντίθετη δουλειά.
- **T2 (🔴 PnL):** διπλή προέλευση χωρίς σκληρό πεδίο `source`
  (VS/Independent/Direct) και χωρίς κανόνες edit.
- **T3 (🟠):** ίδιο ασύμμετρο delete/restore με το intl — αλλά **καλύτερο**:
  οι αποτυχίες γράφονται στο error log (γρ. 1085). Να αντιγραφεί στο intl.
- **T4 (🟡):** cancel χωρίς conflict check· NL upsert με σκέτο atPatch.

## 🔗 Διασυνδέσεις
**Μέσα:** NAT_ORDERS (+ VS από ORDERS). **Έξω:** NAT_LOADS, GL, CL, RAMP,
STOPS, PA + sync. **Συν-συγγραφείς:** orders_intl (VS), weekly_natl, iframe.

## Ευρήματα 11/7
T1 **ΜΕΡΙΚΩΣ ΔΙΟΡΘΩΜΕΝΟ** · T2/T3/T5 ΑΝΟΙΧΤΑ · T4 (source) ΑΝΟΙΧΤΟ.

## Verdict: 🟠 (βελτίωση από 🔴)
Καλύτερο από τη φήμη του. Το κρίσιμο είναι το `source` field, γιατί καθορίζει
ποιο εθνικό trip παίρνει ποιο revenue.
