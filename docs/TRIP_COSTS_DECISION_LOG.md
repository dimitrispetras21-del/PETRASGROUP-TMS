# TRIP COSTS / COSTS — Decision Log (Claude working notes)

_Ζητήθηκε από τον owner 2026-07-11: «Κράτα ένα notes file. Κάθε φορά που πέφτεις
σε κάτι που οι οδηγίες μου δεν κάλυψαν, γράψε τι αποφάσισες. Μετά συνέχισε.»
Κάθε εγγραφή: τι δεν κάλυπταν οι οδηγίες → τι αποφασίστηκε → γιατί._

---

## 2026-07-11 — Pre-mortem session

1. **Δεν υπήρχε εγκατεστημένο skill "Pre Mortem".**
   → Εγκαταστάθηκε το `phuryn/pm-skills@pre-mortem` (1.7K installs, το πιο
   αξιόπιστο στο registry· ελέγχθηκε το περιεχόμενό του πριν τη χρήση — καθαρή
   μεθοδολογία Tigers/Paper Tigers/Elephants, τίποτα ύποπτο). Μένει global στο
   `~/.claude/skills/pre-mortem/` για επαναχρησιμοποίηση.

2. **Πού αποθηκεύεται το pre-mortem και σε ποια γλώσσα.**
   → `docs/PreMortem-COSTS-2026-07-11.md` (δίπλα στα TRIP_COSTS docs), στα
   **ελληνικά** — ο αναγνώστης είναι ο owner (για να γράψει καλύτερο prompt),
   όχι η construction team. Τα SPEC/NOTES μένουν αγγλικά (handoff material).

3. **Τι σημαίνει «όλο το feature με τα cost».**
   → Ερμηνεύτηκε ως: TRIP PnL (εθνικά + διεθνή) + Καταχώρηση Κόστους (και τα 4
   shapes) + πιθανό Partner PnL + IA κάτω από κατηγορία COSTS + όλα τα input
   pipelines. ΟΧΙ τα γενικά έξοδα εταιρείας (ΠΑΓΕΙΑ/ΣΥΝΤΗΡΗΣ πλην tires-per-km).

4. **Νέες δηλώσεις owner (2026-07-11) vs κλειδωμένα NOTES §8.**
   Ο owner ανέφερε πιθανή **ξεχωριστή σελίδα «PnL Partner Tracks»**· τα NOTES §8
   έλεγαν owned-vs-partner = **lens** (group-by) στο ίδιο dataset, όχι σελίδα.
   → ΔΕΝ τροποποιήθηκε το spec· καταγράφηκε ως ανοιχτό IA ζήτημα (pre-mortem
   E6 + ερώτηση #9 στη λίστα prompt). Θα κλειδώσει με το νέο direction doc.

5. **Το spec ΔΕΝ τροποποιήθηκε καθόλου.**
   → Ο owner είπε ότι θα στείλει «τη νέα κατεύθυνση που αποφασίστηκε με τη νέα
   construction team»· κάθε αλλαγή στο SPEC πριν από αυτό ρισκάρει να πάει
   ανάποδα στο νέο πλάνο. Το pre-mortem γράφτηκε ως standalone ανάλυση.

6. **Το brainstorming flow (trip_costs.js build) μπήκε σε παύση.**
   → Η αρχική επιλογή «TRIP PnL στο τωρινό TMS» αντικαταστάθηκε από την ίδια την
   απάντηση του owner (η μετάβαση σε βάση είναι ξεκάθαρη· ζητήθηκε pre-mortem,
   όχι build). Δεν γράφτηκε κώδικας. Τα brainstorming tasks επαναπροσδιορίστηκαν.

7. **Ένταση στο ίδιο το αίτημα (καταγραφή, όχι απόφαση):** η πρώτη απάντηση του
   owner στο AskUserQuestion διάλεξε «TRIP PnL στο τωρινό TMS», αλλά το κείμενό
   του ξεκαθάρισε το αντίθετο (μετάβαση σε DB δεδομένη, ανάλυση σε δεύτερη φάση).
   → Ακολουθήθηκε το **κείμενο** (πιο πρόσφατη/ρητή πρόθεση), όχι το κλικ.

---

## 2026-07-11 (β) — Direction doc ελήφθη + απαντήσεις owner στο pre-mortem

**Ελήφθη το Valuedriven proposal** (`Proposal_Petras_TMS_Valuedriven.pdf`,
26/05/2026): Node proxy + Supabase Postgres για operational tables· reference
tables (TRUCKS/PARTNERS/DRIVERS/CLIENTS/LOCATIONS) **μένουν Airtable**· Costs
module ρητά **Phase 2+** (εκτός v2)· GPS Phase 2+. 63–79h, 4–6 εβδομάδες.

**Απαντήσεις owner** → κλειδώθηκαν στο SPEC **§10.2** (νέα ενότητα):
Trip PnL auto-create όταν ολοκληρωθεί το round trip + auto-sync σε αλλαγές ·
κλείσιμο trip με MyGeotab geofence (έδρα-zone υπάρχει ήδη) · όλη η καταχώρηση
από Αλεξία (DKV upload+OCR / manual) · ΦΠΑ: ποσά net, αλλά τιμολόγια με ΦΠΑ
καταχωρούνται ολόκληρα ως έξοδο (worst case) · **X: import €650 / export €850**
(ΔΥΟ τιμές — supersedes το «single value» του §10.1) · εθνικό σκέλος σε agreed
price, ταυτοποίηση agreed vs invoice από **Ειρήνη** (νέο πρόσωπο στο process).

**Αποφάσεις μου όπου οι οδηγίες δεν κάλυπταν:**
1. Το «ΛΕΓ» στην απάντηση ερμηνεύτηκε ως «leg» (σκέλος δρομολογίου).
2. Το geofence-κλείσιμο σημειώθηκε ως κατεύθυνση + interim manual close μέχρι
   να έρθει το GPS (Phase 2+ κατά το proposal) — αλλιώς κανένα trip δεν κλείνει.
3. Οι απαντήσεις γράφτηκαν ως ΝΕΑ ενότητα §10.2 στο SPEC (όχι in-place edits
   στα §10/§10.1) ώστε να φαίνεται η χρονολογική εξέλιξη των αποφάσεων.
4. Σημειώθηκε build note: allocation engine → πινακίδες από Airtable reference
   DB μέσω API (συνέπεια του split operational/reference του proposal).

**Εκκρεμούν από τον owner (ζήτησε διευκρίνιση):** Q6 ιστορικό/backfill ·
Q9 δομή μενού COSTS. Επεξηγούνται ξανά στο chat.

---

## 2026-07-11 (γ) — Q6/Q9 κλειδώθηκαν

- **Q6 Ιστορικό: καθαρή αφετηρία** (χωρίς backfill) → SPEC §10.2 item 8.
- **Q9 Μενού COSTS v1: 4 σελίδες** — TRIP PnL · Καταχώρηση Κόστους ·
  Partner PnL · Κατανάλωση → SPEC §10.2 item 9.
- Owner ρώτησε για 5η σελίδα «Συντήρηση στόλου». **Πρόταση Claude (εκκρεμεί
  ack):** ΟΧΙ νέα σελίδα — υπάρχει ήδη το Maintenance module (2.000 γραμμές,
  service records με Cost/Odometer/Invoice ανά όχημα). Αυτό που λείπει είναι η
  **γέφυρα**: Σ(κόστη συντήρησης 12μήνου) ÷ Σ(km) → calibrated €/km rate για το
  Shape D (φθορά/λάστιχα) αντί για αυθαίρετη τιμή στα settings· αργότερα
  τροφοδοτεί και το Tier-2 fixed allocation (ασφάλειες/ΚΤΕΟ expiry υπάρχουν ήδη).

---

## 2026-07-11 (δ) — Item 10 κλειδώθηκε· pre-mortem ΚΛΕΙΣΤΟ

- Owner ενέκρινε τη maintenance-bridge πρόταση → SPEC §10.2 item 10
  (calibrated €/km από Maintenance records, όχι 5η σελίδα).
- **Όλα τα ζητήματα του pre-mortem λύθηκαν** — μένουν μόνο process items
  (ritual Αλεξίας, walkthrough mockup). Το spec ξανά 100% locked.
- Ζητήθηκε UX review όλων των costs/maintenance επιφανειών → chat 2026-07-11.

---

_Επόμενες εγγραφές: προσθέτονται από κάτω με ημερομηνία._
