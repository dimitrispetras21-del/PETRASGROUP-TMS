# TMS UI/UX Audit + Πρόταση Αναβάθμισης (Design System v3)

_2026-07-11 · Μέθοδος: impeccable audit (5 διαστάσεις, 0–4) · Στατική ανάλυση
ολόκληρου του codebase (app.html, assets/style.css 5.707 γραμμές, 15 modules,
core/). ΚΑΜΙΑ αλλαγή στο app — παγωμένο μέχρι το Valuedriven v2._

---

## Audit Health Score

| # | Διάσταση | Σκορ | Κύριο εύρημα |
|---|----------|:---:|--------------|
| 1 | Accessibility | **1/4** | `--text-dim: #9CA3AF` σε λευκό ≈ **2.5:1** — κάτω από το 4.5:1 (AA)· μόλις 23 aria-attributes σε όλο το app |
| 2 | Performance | **2/4** | Και τα 15 modules φορτώνουν upfront στο app.html· animations σε layout properties (2 σημεία) |
| 3 | Theming | **2/4** | Υπάρχουν 127 tokens (καλή βάση!) αλλά **102 διαφορετικά hex** στο app — τα modules τα παρακάμπτουν (το #0284c7 hardcoded 29×) |
| 4 | Responsive | **2/4** | 25 media queries συνολικά· desktop-first (αποδεκτό για dispatchers, οριακό για tablet αποθήκης) |
| 5 | Anti-Patterns | **2/4** | Side-stripe accent borders ×5 (maintenance)· z-index χάος (950→99999)· 47 διαφορετικά font-sizes παρά το modular scale |
| | **Σύνολο** | **9/20** | **Poor→Acceptable** — χρειάζεται συστηματική δουλειά, όχι μπαλώματα |

**Anti-patterns verdict:** ΔΕΝ μοιάζει AI-generated — έχει πραγματική
ταυτότητα (navy/Cold-Chain-Blue, Syne/DM Sans, συνεπή pills). Το πρόβλημα
είναι **αποκλίσεις από το ίδιο του το σύστημα**, όχι έλλειψη συστήματος.

---

## Ευρήματα ανά σοβαρότητα

### P1 — πριν από κάθε επόμενο release
1. **Contrast αποτυχία στο βοηθητικό κείμενο.** `--text-dim #9CA3AF` σε λευκό
   = 2.5:1 (όριο ΑΑ: 4.5:1). Χρησιμοποιείται σε labels, dim κελιά, KPI
   υπότιτλους — δηλ. εκεί που διαβάζει η Αλεξία ποσά. Διόρθωση: `#64748B`
   (4.8:1) ως ελάχιστο dim· το #9CA3AF μόνο για disabled.
2. **Πληκτρολόγιο/ARIA.** 23 aria-attributes και 31 :focus rules σε 15
   modules· τα περισσότερα interactive στοιχεία είναι `div onclick` χωρίς
   role/tabindex. Στο v3: όλα τα clickable = `<button>`, ορατό focus ring
   `outline: 2px solid var(--accent)`.
3. **Token bypass (συστημικό).** 102 hex στο app ενώ υπάρχουν 127 μεταβλητές.
   Top παραβάτες: `#0284c7` 29× (υπάρχει `--accent`), γκρίζα `#94a3b8/#64748b`
   44×, ad-hoc σημασιολογικά `#f59e0b/#10b981/#34d399/#f87171` 84× (υπάρχουν
   `--warning/--success/--danger`). Κάθε νέο module κληρονομεί το πρόβλημα.

### P2 — επόμενο πέρασμα
4. **z-index χωρίς κλίμακα:** 950, 9000, 9100, 9998, 9999, 10000, 99999.
   Στο v3: σημασιολογική κλίμακα (dropdown 100 → sticky 200 → backdrop 300 →
   modal 400 → toast 500 → tooltip 600).
5. **Side-stripe accent borders** (×5, maintenance) — απαγορευμένο pattern·
   αντικατάσταση με full border ή background tint.
6. **47 διαφορετικά font-sizes** παρά το 1.25 modular scale στο :root — τα
   modules γράφουν px απευθείας. Στο v3: μόνο τα steps της κλίμακας.
7. **Layout-property animations** (2 σημεία) — μετατροπή σε transform/opacity.
8. **CSS κατακερματισμός:** 5.707 γραμμές global + inline `<style>` blocks
   μέσα στα modules → το ίδιο table/pill/kpi CSS ξαναγράφεται ανά σελίδα με
   μικροδιαφορές. Στο v3: ένα `components.css` (πίνακας, pill, KPI, modal,
   φόρμα) — τα modules ΔΕΝ ορίζουν δικό τους CSS για κοινά components.

### P3 — όταν υπάρχει χρόνος
9. Loading = spinners· στο v3 skeleton states στους πίνακες.
10. Empty states κενά («no data»)· στο v3 διδακτικά (τι να κάνεις μετά).
11. prefers-reduced-motion μόνο 5 σημεία — καθολικό media block στο v3.

### Τι δουλεύει καλά (να διατηρηθεί)
- Το :root token σύστημα είναι σωστά δομημένο (sidebar/content/semantic/typo).
- Συνεπής ταυτότητα: navy sidebar, μπλε accent, Syne/DM Sans — αναγνωρίσιμο.
- Τα assignment pills (navy=δικά μας, πράσινο=partner, κόκκινο=unassigned)
  είναι εξαιρετικό semantic color — να γίνει ο κανόνας παντού.
- localStorage cache + preload = γρήγορη αίσθηση σε καθημερινή χρήση.

---

## Πρόταση Αναβάθμισης — «Design System v3»

**Πότε:** ΜΕΤΑ την παράδοση Valuedriven v2 (το app παγωμένο)· ή να δοθεί ως
requirements πακέτο στη Valuedriven για το frontend κομμάτι της. **Τίποτα εδώ
δεν αλλάζει λειτουργικότητα** — μόνο συνέπεια, αναγνωσιμότητα, προσβασιμότητα.

**Φάση Α — Θεμέλιο (1-2 μέρες).** Διορθωμένα tokens: `--text-dim→#64748B`,
σημασιολογική z-index κλίμακα, κλείδωμα font-scale. Νέο `components.css` με
τα 8 κοινά components (table, pill, badge, KPI card, modal, form field,
button, toast) — μία υλοποίηση, όλα τα states (hover/focus/active/disabled/
loading/error).

**Φάση Β — Εναρμόνιση modules (3-5 μέρες).** Module-προς-module: αντικατάσταση
hardcoded hex με tokens, αφαίρεση τοπικού CSS που διπλασιάζει κοινά
components, side-stripes → tints, buttons αντί για div onclick, focus rings.
Σειρά: weekly planners (καθημερινή χρήση) → orders → maintenance → λοιπά.

**Φάση Γ — Ποιότητα ζωής (2-3 μέρες).** Skeleton loading, διδακτικά empty
states, καθολικό reduced-motion, tablet πέρασμα για Ramp Board (αποθήκη).

**Μετρήσιμος στόχος:** Audit score 9/20 → ≥16/20 (Good)· distinct hex 102 →
<30· z-index values 8 → 6 σημασιολογικά· font-sizes 47 → ≤12.

---

## Παράδειγμα

`docs/design/ui_v3_example.html` — η σελίδα Παραγγελιών ξαναχτισμένη με το
v3 σύστημα, με διακόπτη **ΠΡΙΝ/ΜΕΤΑ** που εναλλάσσει το τωρινό και το
προτεινόμενο σύστημα πάνω στο ίδιο περιεχόμενο. Standalone αρχείο, ανοίγει
με διπλό κλικ, ΔΕΝ αγγίζει το app.
