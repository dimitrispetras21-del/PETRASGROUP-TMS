# Pre-Mortem v2 — Weekly National

_2026-08-03 · `modules/weekly_natl.js` (1.207 γρ.) · Προηγούμενο: [11/7](../PreMortem-weekly_natl.md)_

## Ρόλος στο σύστημα
ΚΑΘΟΔΟΣ/ΑΝΟΔΟΣ ανά ημέρα, matching N→S↔S→N, ανάθεση, split groupage.
**Single source of truth για τα εθνικά** — και ο τόπος όπου θα υλοποιηθεί το
VS split (X: import €650 / export €850, SPEC §10.2 #6).

## Τι άλλαξε από 11/7
Καμία ουσιαστική αλλαγή στη λογική. Είναι το module με την **καλύτερη
ελληνική κάλυψη** (39 ελληνικά vs 11 αγγλικά) — απόδειξη ότι γίνεται.

## Σενάριο αποτυχίας
Ένα unmatch που δεν γράφτηκε ποτέ (κανείς δεν το είδε), ένα match που
γράφτηκε μόνο στη μία πλευρά, τρία loads με λάθος Direction εκτός φίλτρων.
Όταν το PnL αρχίζει να γεννά εθνικά round trips από αυτά, τα margins βγαίνουν
αλλόκοτα και η εμπιστοσύνη δεν χτίζεται ποτέ.

## 🐯 Tigers
- **T1 (🔴 ενεργό):** `_wnUnmatch` (γρ. 740-741) — δύο `atSafePatch` **χωρίς
  κανέναν έλεγχο** conflict ή error. Ίδιο και στο unassign του matched S→N.
- **T2 (🔴):** το match γράφει `Matched Load` σε **δύο** εγγραφές σειριακά·
  αποτυχία στη δεύτερη = **μονόπλευρο match** που κανένα UI δεν δείχνει.
- **T3 (🟠):** τρία διαφορετικά value-sets για το Direction (M1).
- **T4 (🔴 μελλοντικό):** εδώ θα ζήσει το VS split — λάθος εδώ = λάθος
  revenue σε **δύο** trips ταυτόχρονα (διεθνές price−X + εθνικό X).
- ✅ Το split groupage έχει **υποδειγματικό** pattern (awaited + allSettled +
  σωστό reporting, γρ. 1108-1120) — να αντιγραφεί αλλού.

## 🔗 Διασυνδέσεις
**Μέσα:** NAT_LOADS, NAT_ORDERS. **Έξω:** NAT_LOADS (ανάθεση), NAT_ORDERS
(status), sync με skips. **Συν-συγγραφείς του NAT_LOADS:** orders_natl,
orders_intl (VS chain) — και το iframe σε νεκρή βάση.

## Ευρήματα 11/7
T1 **ΑΝΟΙΧΤΟ** · T2 ΑΝΟΙΧΤΟ · T3 ΑΝΟΙΧΤΟ · T4/T5 ΑΝΟΙΧΤΑ.

## Verdict: 🔴
Ίδια οικογένεια bugs με το intl, συν τη μοναδική ευθύνη του εθνικού PnL.
