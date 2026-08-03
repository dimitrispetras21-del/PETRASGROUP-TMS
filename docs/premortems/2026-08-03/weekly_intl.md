# Pre-Mortem v2 — Weekly International

_2026-08-03 · `modules/weekly_intl.js` (1.814 γρ.) · Προηγούμενο: [11/7](../PreMortem-weekly_intl.md)_

## Ρόλος στο σύστημα
Ο εβδομαδιαίος προγραμματισμός διεθνών και **η μελλοντική γεννήτρια των
round trips** του PnL. Γράφει μόνο ORDERS + PARTNER_ASSIGN, αλλά πυροδοτεί
την αλυσίδα κατάντη.

## Τι άλλαξε από 11/7
Προστέθηκε **Command Center** (KPI band, week-strip W24→W38, auto-refresh).
Στις 3/8 ελληνοποιήθηκε (7→41 ελληνικά strings, branch `design/ux-batch-1`).
**Τα δύο conflict bugs ΔΕΝ διορθώθηκαν.**

## Σενάριο αποτυχίας
Δύο dispatchers στην ίδια εβδομάδα. Ο ένας καθαρίζει ανάθεση την ώρα που ο
άλλος την αποθηκεύει· το UI λέει «καθαρίστηκε», η βάση κρατά την παλιά τιμή.
Σε groupage 5 παραγγελιών το save σταματά στην 3η — μισο-ανατεθειμένο γκρουπ.
Έξι μήνες μετά, τα round trips του PnL γεννιούνται από αυτά τα δεδομένα.

## 🐯 Tigers
- **T1 (🔴 ενεργό):** `_wiRemoveImport` (γρ. ~1129) και `_wiClear` (~1618)
  ελέγχουν `res?.error` αλλά **όχι `res?.conflict`** — τα αδελφά σημεία
  (1098, 1442, 1449, 1585) το κάνουν σωστά. Fix ~4 γραμμές.
- **T2 (🟠):** ομαδικά saves σε βρόχο χωρίς ατομικότητα.
- **T3 (🟠):** optimistic UI πριν την αποθήκευση.
- **T4 (🔴 νέο, integration):** καλεί τον sync engine με **4 skips**
  (`skipPA, skipVS, skipGRP, skipPL`) — τρέχει μόνο RAMP. Κανείς δεν έχει
  επικυρώσει ότι αυτό είναι σωστό για re-match που μετακινεί ημερομηνίες.
- **T5 (🟠):** το `Matched Import ID` (κείμενο) είναι η μόνη πηγή των
  ιστορικών ζευγών για το μελλοντικό round_trips — χωρίς validation.
- **T6 (🟠):** Partner Rate προαιρετικό → partner trip με κόστος 0 στο PnL.

## 🔗 Διασυνδέσεις
**Μέσα:** ORDERS, TRUCKS/TRAILERS/DRIVERS/PARTNERS.
**Έξω:** ORDERS → `syncOrderDownstream(skip×4)` → RAMP · PARTNER_ASSIGN
(paUpsert/paDelete, σφάλματα μόνο σε console).
**Καταναλωτές:** Daily Ops, Ramp, CEO Dashboard, αύριο το TRIP PnL.

## Ευρήματα 11/7
T1 **ΑΝΟΙΧΤΟ** · T2/T3 ΑΝΟΙΧΤΑ · T4 (fire-and-forget) ΑΝΟΙΧΤΟ ·
T5/T6 ΑΝΟΙΧΤΑ · γλώσσα **ΔΙΟΡΘΩΘΗΚΕ** (PR design/ux-batch-1).

## Verdict: 🔴
Η πιο κρίσιμη σελίδα του app με ενεργό bug συνθηκών αγώνα, τρεις εβδομάδες
μετά τον εντοπισμό του.
