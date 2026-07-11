# Deep Pre-Mortem — National Pick Ups (iframe)

_2026-07-11 · router.js:254-266 → iframe στο
`petras-assign/national_consolidation.html` (ξεχωριστό repo) · Σενάριο:
6 μήνες μετά, η σελίδα «έσπασε μόνη της» ή έγινε η πίσω πόρτα του TMS._

## Τι κάνει η σελίδα
Ενσωματώνει (iframe) τον National Consolidation Planner: drag & drop
suppliers → φορτηγά, δημιουργία/διαγραφή CONSOLIDATED LOADS, save/restore/
split, GL Status flips. Γράφει στους ΙΔΙΟΥΣ πίνακες με το Weekly National
(GROUPAGE LINES, CONSOLIDATED LOADS, NAT_LOADS) αλλά από **άλλο codebase,
άλλο deploy**.

## Το αφήγημα της αποτυχίας
Η Valuedriven αλλάζει το write pattern στο TMS (Stage 1) — το iframe δεν
ενημερώνεται ποτέ γιατί ζει σε άλλο repo. Τα δύο συστήματα γράφουν με
διαφορετικούς κανόνες στους ίδιους πίνακες· τα GL/CL αρχίζουν να χαλάνε
«ανεξήγητα». Παράλληλα, κάποιος βρίσκει το δημόσιο URL και έχει πλήρη
πρόσβαση στη βάση χωρίς login.

## 🐯 Tigers

### T1 — Δημόσιο URL χωρίς auth, με ενσωματωμένο token _(Critical — επιβεβαιωμένο)_
`https://…github.io/petras-assign/national_consolidation.html` απαντά
**HTTP 200 χωρίς κανένα login** (επιβεβαιώθηκε 2026-07-11). Η σελίδα
κουβαλά δικό της αντίγραφο του Airtable PAT (S1×2). Όποιος έχει/μαντέψει
το URL διαβάζει & γράφει την παραγωγική βάση. Το sandbox του iframe (C3
fix) προστατεύει το TMS από το iframe — ΟΧΙ τη βάση από τον κόσμο.
_Fix: το Valuedriven proxy πρέπει να καλύψει ΚΑΙ τα petras-assign apps
(ρητό requirement — δεν το λέει το proposal!)._

### T2 — Δύο repos, ένας κανόνας, μηδέν συγχρονισμός _(Major)_
Ο κανόνας «GL records NEVER deleted» και η αλυσίδα GL→CL→NAT_LOADS
υλοποιούνται ΚΑΙ στο TMS ΚΑΙ εδώ, με copy-paste λογική. Κάθε schema αλλαγή
(πεδία, value sets, VS split X) πρέπει να γίνει δύο φορές — μία θα ξεχαστεί.
_Fix κατεύθυνση: στο v2 το consolidation γίνεται σελίδα του TMS (κοινό API
layer) ή τα δύο repos μοιράζονται ένα contract test._

### T3 — Hardcoded iframe URL σε μεταβαλλόμενο hosting _(ενεργός κίνδυνος)_
Το TMS github.io URL ήδη 404άρει (Pages άλλαξε setup)· το iframe δείχνει
hardcoded στο assign github.io. Αν/όταν μετακινηθεί κι εκείνο (custom
domain, ιδιωτικοποίηση repo), η σελίδα πεθαίνει σιωπηλά — λευκό iframe
χωρίς μήνυμα. _Fix: config-driven URL + onerror fallback μήνυμα._

### T4 — Καμία έκδοση/handshake μεταξύ TMS και iframe _(Major)_
Το TMS δεν ξέρει ποια έκδοση του planner φορτώθηκε (δικό του cache-bust
μόνο). Ασυμβατότητα εκδόσεων → σιωπηλά λάθη δεδομένων, όχι crash.

## 🐅 Paper Tigers
- «Το sandbox σπάει τη λειτουργικότητα» — allow-scripts/forms/popups/
  modals αρκούν· δουλεύει σωστά σήμερα.
- «Το iframe είναι αργό» — φορτώνει μία φορά, αποδεκτό.

## 🐘 Elephants
1. **Στο v2 αυτή η σελίδα πρέπει να πάψει να είναι iframe.** Η μετάβαση
   NAT_LOADS/GL/CL στο Postgres χωρίς να αγγιχτεί το assign repo = το
   iframe γράφει στο ΠΑΛΙΟ Airtable ενώ το TMS διαβάζει το νέο DB. Αυτό
   είναι migration-blocker αν δεν μπει ρητά στο Stage-2 πλάνο.
2. Ποιος συντηρεί το petras-assign μετά το v2; (Νέο home ή απόσυρση.)

## Ταξινόμηση & δράσεις
| # | Σοβαρότητα | Δράση | Πότε |
|---|---|---|---|
| T1 | 🔴 Critical | proxy/auth να καλύψει και τα assign apps — ρητό αίτημα στη Valuedriven | Stage 1 |
| T2/E1 | 🔴 Migration-blocker | απόφαση: consolidation μέσα στο TMS στο v2 ή κοινό API | Stage 2 πλάνο |
| T3 | 🟡 | config URL + fallback μήνυμα | ξεπάγωμα |
| T4 | 🟡 | version ping ή κοινό deploy τελετουργικό | Stage 2 |

**Verdict: 🔴 — όχι για το UX του (δουλεύει)· για το ότι είναι δημόσια,
δεύτερη, ασυγχρόνιστη γραφίδα πάνω στους πιο ευαίσθητους πίνακες.**
