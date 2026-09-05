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

## 2026-07-11 (ε) — Maintenance UX fixes + AI invoice scan (build στο τωρινό TMS)

Υλοποιήθηκαν τα 3 εγκεκριμένα fixes + OCR (commit dd347eb TMS, 1a28de5 assign):
ελληνικά labels φόρμας · Cost+km υποχρεωτικά σε Completed · deprecation banner
στο legacy trip_costs.html · «Σκανάρισμα τιμολογίου (AI)» στη φόρμα service.

**Αποφάσεις όπου οι οδηγίες δεν κάλυπταν:**
1. Τα Airtable select values (Type/Status) έμειναν αγγλικά μέσω value attrs —
   μόνο τα display labels ελληνικά (αλλιώς σπάνε τα υπάρχοντα records/επιλογές).
2. Validation: blocking (όχι απλή προειδοποίηση) μόνο όταν Status=Completed·
   Scheduled/In Progress σώζονται χωρίς κόστος (δεν υπάρχει ακόμα τιμολόγιο).
3. OCR: Sonnet tier (απλό έγγραφο, ~$0.024/scan)· prefill ΜΟΝΟ κενών πεδίων
   (δεν πατάει ό,τι έγραψε ο χρήστης)· πινακίδα → normalize match στο select·
   συνεργείο → fuzzy contains στο όνομα· verify-before-commit: η φόρμα είναι
   το preview, τίποτα δεν σώζεται χωρίς «Αποθήκευση». Κόστος OCR = συνολικό
   ποσό ΜΕ ΦΠΑ (κανόνας §10.2 item 5, worst case).
4. Impeccable hook findings (side-tab borders, layout animation, em-dashes):
   προϋπάρχοντα, μέρος του καθιερωμένου TMS design — δεν αγγίχτηκαν.
5. Verification: node --check OK + pattern parity με pallet_upload· πλήρες
   in-browser test με πραγματικό τιμολόγιο εκκρεμεί (χρειάζεται live Airtable
   session) — να γίνει από Δημήτρη/Θοδωρή με ένα αληθινό παραστατικό.

---

_Επόμενες εγγραφές: προσθέτονται από κάτω με ημερομηνία._

## 2026-07-11 (στ) — UI/UX audit ολόκληρου του app

- Deliverables: PRODUCT.md (impeccable context) · docs/design/UI_UX_AUDIT_2026-07-11.md
  (score 9/20, P1: contrast 2.5:1 / ARIA / token bypass 102 hex) · docs/design/ui_v3_example.html
  (ΠΡΙΝ/ΜΕΤΑ toggle, Παραγγελίες). ΚΑΜΙΑ αλλαγή στο app (freeze μέχρι Valuedriven v2).
- Απόφαση: το v3 προτείνεται είτε ως post-v2 φάση είτε ως requirements προς Valuedriven.

## 2026-07-11 (ζ) — Ρόλοι: τελικά αποτελέσματα owner-only

- Owner: «θέλω να έχω πρόσβαση στα τελικά αποτελέσματα μόνο εγώ» → SPEC §10.2
  item 11 (supersedes §8 Roles: το «Read = Owner + Management» καταργήθηκε).
- Ερμηνεία μου: «τελικά αποτελέσματα» = computed PnL (margins, net profit,
  analytics σελίδες)· η Αλεξία κρατά την ΚΑΤΑΧΩΡΗΣΗ (inputs) και η Ειρήνη την
  ταυτοποίηση agreed↔invoice χωρίς margins. Enforcement σε RLS επίπεδο (T8).

## 2026-07-11 (η) — Pre-mortem ανά σελίδα (28 σελίδες router)

- docs/PreMortem-PAGES-2026-07-11.md: 7 σελίδες 🔴 (Weekly Intl/Natl, Orders
  Intl/Natl, Invoicing, CEO Dashboard, TRUCKS) · βάση: KNOWN_ISSUES S1-S3/A1-A7.
- Απόφαση: καθολικοί κίνδυνοι σε ενιαία ενότητα (όχι επανάληψη ανά σελίδα)·
  entity/maintenance sub-pages ομαδοποιήθηκαν ανά module.

## 2026-07-11 (θ) — Deep pre-mortems ανά σελίδα (23 αρχεία, docs/premortems/)

- Ένα βαθύ PM ανά σελίδα, με ανάγνωση κώδικα + line refs. Index: docs/premortems/README.md.
- Αποφάσεις ομαδοποίησης: entity σελίδες σε ένα αρχείο με per-page ενότητες
  (πλην TRUCKS — δικό του λόγω PnL βαρύτητας)· maintenance histories μαζί·
  admin (settings/trash/error_log) μαζί. Payroll = προληπτικό PM (placeholder).
- Νέα ενεργά ευρήματα πέρα από τα γνωστά: unmatch/clear χωρίς conflict check
  (weekly intl+natl), client-side αρίθμηση τιμολογίων, δημόσιο assign URL (200
  χωρίς auth, επιβεβαιωμένο), performance page δείχνει margins σε μη-owner,
  ελληνικά ομόγλυφα στις πινακίδες ως κίνδυνος allocation.

- 2026-07-11: Προστέθηκε docs/premortems/ALL_ISSUES.md — master register 78 issues από όλα τα pre-mortems, ανά χρόνο δράσης (Άμεσα/Ξεπάγωμα/Stage1/Stage2/Phase2/v3) + τα 11 κλειδωμένα.

## 2026-08-10 — Design review v1 → v2 (owner feedback στο costs_proto.html)

Ο owner είδε το πρωτότυπο (docs/design/COSTS_DESIGN_2026-08/costs_proto.html)
και έδωσε 4 κατευθύνσεις. Οι 2 & 3 είναι αποφάσεις ΜΟΝΤΕΛΟΥ, όχι μόνο UI:

1. **TRIP PnL — φίλτρο ανά όχημα:** το συνολικό overview μένει· προστίθεται
   μπάρα επιλογής οχήματος (chips: στόλος / ανά πινακίδα / Partners) που
   φιλτράρει KPIs + λίστα· + ομαδοποίηση «Ανά Οδηγό».
2. **Round Trip = κέντρο κόστους — χρειάζεται μηχανισμός δημιουργίας:** στην
   Καταχώρηση Κόστους η Αλεξία επιλέγει συγκεκριμένο round trip ως κέντρο
   κόστους· άρα εκτός από το auto-create των planners (SPEC §10.2 item 2)
   απαιτείται και ΧΕΙΡΟΚΙΝΗΤΗ δημιουργία/διόρθωση round trip (modal: scope,
   φορτηγό/partner, οδηγός, date window, σύνδεση export/import orders).
   Το date window παραμένει το κλειδί του allocation engine.
3. **Partner PnL = καθαρό PnL, ΟΧΙ έλεγχος τιμολόγησης (supersedes §10.2
   item 7):** «με ενδιαφέρει περισσότερο το pnl παρά ο έλεγχος αν τιμολόγησε
   το συμφωνηθέν — αυτό εξάλλου δεν μπορεί να γίνει μέσω TMS καθώς δεν είναι
   ERP». Το reconciliation view της Ειρήνης ΒΓΑΙΝΕΙ από το v1 UI· το PnL
   υπολογίζεται πάντα στη συμφωνηθείσα τιμή. ΝΕΟ: **ζημιά παλετών** — αν το
   φορτίο είχε ανταλλαγή παλετών και ο partner δεν επέστρεψε, η αξία τους
   (setting €/παλέτα, demo €12) αφαιρείται από το καθαρό της ανάθεσης·
   δεδομένα από Pallet Ledger (PALLET_LEDGER_PARTNERS).
4. **Κατανάλωση — tabs:** κεντρικό tab «Σύνολο στόλου» + ξεχωριστό tab ανά
   όχημα (KPIs οχήματος + λίστα πληρώσεων DADI/DKV με warnings).

Ερμηνεία μου: «συνολικό overview ανά προσφτο» (σημείο 1) = το υπάρχον
συνολικό overview διατηρείται· κάλυψα και την πιθανή ανάγνωση «ανά πρόσωπο»
ενεργοποιώντας την ομαδοποίηση «Ανά Οδηγό».

**Ίδια μέρα, αργότερα:** demo v3 (φθορά auto, DADI OCR flow, κλείσιμο trip,
Ρυθμίσεις, CSV) + συντάχθηκε το **αρχιτεκτονικό σχέδιο**
→ `docs/COSTS_ARCHITECTURE.md` (schema ct_*, lifecycle, allocation engine,
ρόλοι, φάσεις Φ1–Φ5).

**Κλείσιμο round trip — ΚΛΕΙΔΩΣΕ (owner, 10/8, refines §10.2 item 3):**
«γίνεται με την παράδοση του φορτίου εισαγωγής. αν είναι direct τότε, αν
είναι vs με την άφιξη στο VS.» ⇒ Το κλείσιμο είναι ΓΕΓΟΝΟΣ ΤΩΝ ΔΕΔΟΜΕΝΩΝ,
όχι χειροκίνητη ενέργεια:
- Import **direct** → κλείνει με την παράδοση στον πελάτη
  (orders.actual_delivery_date / delivery_datetime).
- Import **VS** → κλείνει με την άφιξη στη Βέροια
  (orders.cross_dock_date / vs_cd_date) — από εκεί αναλαμβάνει ο εθνικός
  feeder (δικό του RT, δικό του κλείσιμο στην παράδοσή του).
- Solo export (χωρίς import) → με την παράδοση του export.
- Εθνικά RTs → με τη δική τους παράδοση (ΑΝΟΔΟΣ: άφιξη Βέροια).
Ο dispatcher ΔΕΝ πατά κουμπί στη ροή — το manual close μένει μόνο ως
fallback διόρθωσης· το MyGeotab geofence (Phase 2) απλώς αυτοματοποιεί την
καταγραφή του ίδιου γεγονότος. date_end + closed_at προκύπτουν από αυτά.

**Backend home — ΚΛΕΙΔΩΣΕ (owner, 10/8 βράδυ):** «ο satsilem ετοίμασε ένα
project, διόρθωσε αρχιτεκτονικά ζητήματα και τελείωσε... το θέμα ήταν να
χτίσει την αρχιτεκτονική, άρα πρέπει να πατήσουμε πάνω σε αυτά που έχτισε».
⇒ Η συνεργασία με satsilem/Valuedriven ολοκληρώθηκε. Τα Costs χτίζονται ΩΣ
ΕΠΕΚΤΑΣΗ ΤΟΥ WORKER 2 (ίδιο auth/PERMISSIONS/facade/audit), με **μεταφορά
κυριότητας σε εμάς**: Φ0 = υιοθεσία (deployed script → repo source →
wrangler deploys από εμάς· τέλος τα dashboard edits). Καταργείται η ιδέα
ξεχωριστού petras-costs-backend Worker και το «μήνυμα στον satsilem» για το
ct_ πρόθεμα.

## 2026-08-09 — Kickoff: ξεκινά το build των COSTS

- Owner: «ΦΠΑ αναγράφεται χώρια. χτίζω εγώ.» + διευκρίνιση: **και τα δύο ορατά**.
- → SPEC **§10.3** (νέα ενότητα): (1) build **in-house** στο live v2 stack, όχι
  Valuedriven Phase 2· κανάλι = Claude γράφει SQL → owner το τρέχει στη Supabase
  (pattern scan_examples)· ⚠️ όχι εξάρτηση από χειροκίνητα patches στο Worker 2
  (σβήνονται στο επόμενο wrangler deploy — docs/worker/README.md).
  (2) Κάθε γραμμή κόστους: **καθαρό + ΦΠΑ σε χωριστά πεδία**· το TRIP PnL δείχνει
  ΔΥΟ margins — με ΦΠΑ (worst-case, primary) και χωρίς ΦΠΑ.
- Ερμηνείες μου όπου οι οδηγίες δεν κάλυπταν:
  1. «Χτίζω εγώ» = in-house build (owner + Claude), όχι νέο Valuedriven scope.
  2. Το worst-case principle της 11/7 ΔΕΝ καταργείται — το margin ΜΕ ΦΠΑ μένει
     το κύριο νούμερο· το ex-VAT μπαίνει ως δεύτερη γραμμή (απάντηση owner σε
     AskUserQuestion με τις 3 επιλογές).
- Εκκρεμεί πριν τον κώδικα: αρχιτεκτονικό σχέδιο (πού ζει το backend των Costs,
  γέννηση round_trips από τα planners, allocation engine server-side, RLS
  owner-only). Το spec παραμένει locked — η αρχιτεκτονική δεν ξανανοίγει
  αποφάσεις μοντέλου.
- **ΑΝΟΙΧΤΟ (owner 9/8: «δεν έχω αποφασίσει»):** πού ζει το backend των Costs.
  Οι 3 επιλογές που τέθηκαν: (α) δικός μας Worker «petras-costs-backend»
  (σύσταση Claude — μηδενική εμπλοκή με deploys satsilem), (β) επέκταση
  Worker 2 μέσω construction team, (γ) frontend → Supabase απευθείας με RLS
  (απαιτεί Supabase Auth). Η απόφαση ΔΕΝ μπλοκάρει το υπόλοιπο αρχιτεκτονικό
  σχέδιο: schema/SQL, lifecycle round_trips, allocation algorithm και RLS
  policies σχεδιάζονται ίδια και στις 3 — μόνο το transport layer αλλάζει.

- 2026-08-03: Full audit μετά το C2 cutover → docs/AUDIT-2026-08-03.md (4 παράλληλοι auditors). Σκορ 9/28. P0: petras-assign PAT δημόσιο+ανενεργή ανάκληση / iframe split-brain από 28/7 / κανένα Supabase backup / Sentry DSN κενό. Worker 2 source μη διαθέσιμο για επαλήθευση RBAC.

- 2026-08-03: UI/UX design audit #2 → docs/design/UI_UX_AUDIT_2026-08-03.md. Live περιήγηση ως owner + μετρήσεις. 11/20 (από 9/20): IA/command palette μεγάλη βελτίωση, αλλά side-stripes 5→30, z-index 8→19, a11y αμετάβλητο, 7 Coming Soon, ανάμεικτη γλώσσα (weekly_intl 7 ελλ./37 αγγλ.). Οι 3 sub-auditors κόπηκαν από όριο δαπάνης — μετρήσεις έγιναν απευθείας.

## 2026-08-03 (β) — Design/UX batch 1 (branch design/ux-batch-1)

- Υλοποιήθηκαν τα 4 πρώτα items του UI_UX_AUDIT_2026-08-03: contrast token AA,
  απόκρυψη 3 unbuilt nav items, scroll-anchoring + aria στο sidebar, ελληνικό
  Weekly International (7→41 ελληνικά strings).
- Αποφάσεις όπου οι οδηγίες δεν κάλυπταν:
  1. Δουλειά σε branch + PR (όχι απευθείας main) γιατί η Valuedriven κάνει merge
     παράλληλα — αποφυγή σύγκρουσης.
  2. --text-dim άλλαξε ΜΟΝΟ για light surfaces· προστέθηκαν --text-dim-on-dark
     και --text-disabled ώστε να μη χαλάσουν σκούρα πάνελ/disabled states.
  3. Τα unbuilt items κρύβονται με flag (NAV_SHOW_UNBUILT) αντί για διαγραφή —
     τα routes δουλεύουν ακόμα για bookmarks, το ξεκλείδωμα είναι μία λέξη.
  4. Ελληνικά ΜΟΝΟ σε display text· οι τιμές Airtable (Assigned κ.λπ.) άθικτες
     (ίδιος κανόνας με το maintenance form του Ιουλίου).
  5. Επαλήθευση: node --check + harness που εκτελεί renderNav() με stubs.
     ΔΕΝ έγινε live έλεγχος — δεν υπάρχει demo κωδικός για τοπικό login.

## 2026-08-03 (γ) — Pre-mortem #3: λογική & διασυνδέσεις

- docs/premortems/INTEGRATION-2026-08-03.md: άξονας = integration (τι σπάει τι),
  όχι ξανά per-page περιγραφή. 7 αλυσίδες + πίνακας 18 σελίδων (λογική/σύνδεση)
  + 7 cross-cutting λειτουργίες + 7 unknown unknowns.
- Κύριο νέο εύρημα: ο sync engine έχει 5 skip flags, 14 call sites, το καθένα
  διαλέγει skips με το χέρι· ο engine επιστρέφει failed[] που ΚΑΝΕΙΣ δεν διαβάζει.
- Απόφαση: δεν ξαναγράφτηκαν τα 24 per-page PM της 11/7 (ισχύουν)· αυτός ο γύρος
  προσθέτει τη ΣΥΝΔΕΣΗ μεταξύ των ήδη γνωστών ευρημάτων.

## 2026-08-03 (δ) — Pre-mortems v2: ένα αρχείο ανά σελίδα

- docs/premortems/2026-08-03/ : 29 αρχεία + index. Νέος φάκελος αντί για
  overwrite των 11/7 ώστε να μένει η ιστορική σύγκριση.
- Δομή ανά αρχείο: ρόλος · τι άλλαξε από 11/7 · σενάριο αποτυχίας · Tigers με
  file:line · διασυνδέσεις μέσα/έξω · κατάσταση ευρημάτων 11/7 · verdict.
- Σπάστηκαν οι ομαδοποιήσεις της 11/7: entities → 6 ξεχωριστά (trucks,
  trailers, workshops, clients, partners, drivers), maintenance → 5, admin → 2.
- 12 κόκκινες (από 7). Νέο: audit_trail.md (η σελίδα δεν υπήρχε στις 11/7).

---

## 2026-08-24 — Απαντήσεις owner που ξεκλειδώνουν την υλοποίηση

**Μονάδα P&L — επιβεβαίωση του μοντέλου (owner):** «κάθε γραμμή του weekly
international ή national πρακτικά είναι ένα PnL». Ταυτίζεται με το
`ct_round_trips` όπως ήδη σχεδιάστηκε — μια γραμμή Weekly Intl είναι export με τα
imports του, με Truck/Trailer/Driver ή Partner + `Is Partner Trip`, δηλαδή
πεδίο-προς-πεδίο ο round trip. Το `source:'planner'` υπήρχε ακριβώς γι' αυτό.

**Έσοδα εθνικού σκέλους (owner):** «αν ένα leg έρχεται από VS, κρατάει την τιμή
που είπαμε· αν όχι κρατάει τιμή από το national order.» Το πρώτο μισό είναι
υλοποιημένο (x_export 850 / x_import 650 στις όψεις). Το δεύτερο μπλοκάρεται από
σπασμένο κρίκο — βλ. παρακάτω.

**Χιλιόμετρα (owner):** «δεν είναι τόσο σημαντικά για αρχή». ⇒ Φθορά και
κατανάλωση εκτός v1· το P&L είναι έσοδα − άμεσα κόστη. Επηρεάζει και το ανοιχτό
ερώτημα του σχήματος A (§5 NOTES): αν ο επιμερισμός γίνει «ανά χλμ», δεν υπάρχουν
χλμ — άρα ημέρες δρομολογίου ή δατοποιημένες γραμμές τιμολογίου.

**Q6 — ιστορικό/backfill: ΚΛΕΙΔΩΣΕ.** Ξεκινάμε **από σήμερα**. Καμία
αναδρομική φόρτωση παλαιών δρομολογίων.

**Συντήρηση στόλου: ΚΛΕΙΔΩΣΕ.** ΔΕΝ επιμερίζεται ανά δρομολόγιο προς το παρόν
(«ίσως αργότερα»). Αντ' αυτού: τα νούμερα συντήρησης και τα στατιστικά του
οχήματος **εμφανίζονται στην καρτέλα οχήματος μέσα στο PnL** — όχι ως κόστος
δρομολογίου, ως πληροφορία στόλου.

**Καύσιμα από τρίτα πρατήρια (νέο, owner):** υπάρχουν και αγορές εκτός
DADI/DKV που θέλουν **χειροκίνητη καταχώρηση — είτε με σάρωση είτε εντελώς
χειροκίνητα**. Καλύπτεται από το υπάρχον **σχήμα B** (μεμονωμένο τιμολόγιο →
κολλάει σε συγκεκριμένο δρομολόγιο). Ισχύει ο ίδιος κανόνας ασφαλείας:
σάρωση → προεπισκόπηση → επιβεβαίωση → καταχώρηση.

**Backend των Costs — de facto λύθηκε** (ήταν ΑΝΟΙΧΤΟ από 9/8, «δεν έχω
αποφασίσει»): ζει στον **Worker**, με τις διαδρομές `/costs/*` γραμμένες και
παρκαρισμένες στο branch `parked/worker-costs-pallets`. Ίδιο μοτίβο με τα
pallets που αποκαταστάθηκαν 24/8.

### Παραμένει ανοιχτό
- **Σχήμα A — ο αλγόριθμος επιμερισμού** (❓ §5 NOTES): το τιμολόγιο DADI/DKV
  φέρει **δατοποιημένες γραμμές** ανεφοδιασμού (οπότε κάθε γραμμή ταιριάζει στο
  δρομολόγιο που περιέχει την ημερομηνία), ή μόνο **σύνολο ανά φορτηγό** για την
  περίοδο (οπότε χρειάζεται μοίρασμα); Χωρίς χλμ, το μοίρασμα γίνεται με ημέρες.
- **Ο τρίτος γονιός στο `national_loads`** — ζωντανό σφάλμα, όχι θέμα COSTS:
  ανεξάρτητη εθνική παραγγελία γράφει `Source Record` που ο Worker μεταφράζει
  προς τον πίνακα διεθνών ⇒ 400 «Unknown linked record», η NAT_LOAD δεν
  δημιουργείται. Τρεις παραγγελίες της 24/8 (09:19, 09:23, 09:38) είναι αόρατες
  στο Weekly National. Ξεμπλοκάρει ταυτόχρονα το Weekly **και** τα εθνικά έσοδα.

## 2026-09-05 — §10.1 #5 αναθεωρείται ως προς τον πίνακα

Driver pay παραμένει per-trip, manual v1. Η πηγή δεν είναι πλέον γραμμή
`driver_pay` στο `ct_cost_lines` αλλά η γραμμή trip της καρτέλας οδηγού
(`dl_entries`, migration 011). Τα Έξοδα Μ (`cash_m`) το ίδιο. Το PnL τα
διαβάζει μέσω `ct_v_rt_costs.dl_trip_value/dl_expenses` και δείχνει
«εκκρεμεί»/«χωρίς γραμμή καρτέλας» αντί για 0. Πλήρες: docs/DECISION_LOG.md.
