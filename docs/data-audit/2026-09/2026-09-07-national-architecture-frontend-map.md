# Χάρτης εθνικού κυκλώματος (front end) — read-only archaeology

Πίνακες: `national_orders` (NAT_ORDERS), `national_loads` (NAT_LOADS), `groupage_lines`
(GL_LINES), `consolidated_loads` (CONS_LOADS), `ramp`, `local_moves`,
`partner_assignments` (PARTNER_ASSIGN). TABLES ids: config.js:58,63,64,68,72,78,62.

## 1. Χάρτης οθονών → πίνακες

**modules/orders_natl.js** (CRUD εθνικών παραγγελιών)
- READ: `atGet(NAT_ORDERS, dateFormula)` modules/orders_natl.js:44 — λίστα.
- WRITE δημιουργία: `atCreate(NAT_ORDERS, fields)` modules/orders_natl.js:776,1423
  (Status:'Pending' default, γρ. 770,815,851,1774).
- WRITE ενημέρωση: `atSafePatch(NAT_ORDERS, recId, fields)` modules/orders_natl.js:1362.
- Παράγωγα στο ίδιο save: GL_LINES create/patch γρ. 792,1698,1703· CONS_LOADS create
  γρ. 830· NAT_LOADS create/patch γρ. 856,1791,1796 μέσω `_syncGroupageLinesFromNO`
  (γρ. 1471-1512) και `_syncNationalLoad` (γρ. 1515-1525,1717-1800).
- DELETE (ακύρωση/soft-delete) γρ. 1868-1984: cascade σε GL (Unassign, ΠΟΤΕ delete —
  βλ. §3), CONS_LOADS (hard delete), NAT_LOADS (hard delete), RAMP (hard delete),
  PARTNER_ASSIGN (hard delete)· `atSoftDelete(NAT_ORDERS, recId)` γρ. 1978.

**modules/weekly_natl.js** (εβδομαδιαίος πίνακας ΚΑΘΟΔΟΣ/ΑΝΟΔΟΣ)
- READ κύριο: `atGetAll(NAT_LOADS, {filterByFormula})` γρ. 150 (εβδομάδα)· γρ. 1875
  (Partner lane)· γρ. 171 `atGetAll(LOCAL_MOVES,...)` (τοπικές κινήσεις)· γρ. 728
  `atGetAll(GL_LINES,{Status="Unassigned"})` (badge εκκρεμών).
- WRITE ανάθεση φορτηγού/συνεργάτη: `atSafePatch(NAT_LOADS, id, fields)` γρ. 1969,
  1976 (Truck/Trailer/Driver/Partner/Status:'Assigned') — βλ. §2.
- WRITE ταίριασμα ΚΑΘΟΔΟΣ↔ΑΝΟΔΟΣ ('Matched Load'): γρ. 1730-1753.
- WRITE LOCAL_MOVES create/patch/delete: γρ. 1048,1087,1104.
- WRITE groupage unassign από NAT_ORDERS ('Groupage ID':''): γρ. 2256.

**modules/daily_ramp.js** (πίνακας ράμπας)
- Auto-sync READ: `atGetAll(ORDER_STOPS,...)` γρ. 136 (μόνο parents ORDERS/NAT_LOADS —
  ΟΧΙ NAT_ORDERS απευθείας, γρ. 135) → `atCreate(RAMP, fields)` γρ. 300.
- READ πίνακα ημέρας: `atGetAll(RAMP, combinedFilter)` γρ. 89.
- WRITE inline edit πεδίου: `atSafePatch(RAMP,id,{[fld]:v})` γρ. 627,643.
- WRITE "Done": `atSafePatch(RAMP,id,fields)` γρ. 664 → μετά προσπαθεί να προάγει
  ORDERS/NAT_ORDERS Status σε 'In Transit' γρ. 680-706 (βλ. εύρημα Α, §4).
- WRITE χειροκίνητη προσθήκη: `atCreate(RAMP, fields)` γρ. 798 (χωρίς Order/National
  Order link — γρ. 785-802).

**modules/invoicing.js**
- READ εθνικά: `atGet(NAT_ORDERS, formula)` γρ. 313 — formula δέχεται ΕΠΙΠΛΕΟΝ
  "past delivery date & not cancelled" επειδή "κανείς δεν γράφει Status='Delivered'
  στα NAT_ORDERS" (σχόλιο κώδικα, γρ. 307-311 — αυτο-τεκμηριωμένο).
- WRITE batch τιμολόγησης: `atPatch(tbl, id, fields)` γρ. 927,935 όπου
  `tbl = TABLES.NAT_ORDERS` για natl (γρ. 829,927) — γράφει **Status:'Invoiced'** ΚΑΙ
  Invoiced:true μαζί (γρ. 929-934). Βλ. εύρημα Β, §4.

**modules/orders_intl.js** (τμήματα Veroia Switch → NAT_LOADS)
- WRITE δημιουργία/ενημέρωση NAT_LOADS από VS: `_syncVeroiaSwitch` → NAT_LOADS create/
  patch γρ. 1486,1491 με `'Source Record': orderId` (ORDERS id!) γρ. 1457.
- WRITE VS+Groupage: GL_LINES γρ. 1746,1750,1758· CONS_LOADS γρ. εντός
  `_syncGroupageLines` (κοινή συνάρτηση με orders_natl.js — noId===null διακρίνει
  intl-side, modules/orders_intl.js:1638).
- DELETE cascade όταν σβήνεται/αλλάζει VS/GRP σε intl παραγγελία: γρ. 1304-1398,
  1589-1618,1956-1995,3019-3100,3128-3188,3214-3310 — πολλαπλά σημεία, ίδιο μοτίβο
  (NL delete, CL delete, GL→Unassigned, RAMP delete, PARTNER_ASSIGN delete).

**core/order-sync.js** — κεντρικό sync (βλ. §2 για skip flags).
**core/pa-helpers.js** — `paUpsert/paDelete/paSyncStatus` πάνω σε PARTNER_ASSIGN,
πηγαία-άγνωστο (δουλεύει και για 'order' και 'nat_load' parentType) γρ. 16-91.
**core/stops-helpers.js:21-22** — ORDER_STOPS parent resolver: STOP_PARENT_NL→
NAT_LOADS, αλλιώς→NAT_ORDERS.
**core/rt-feed.js** — ΔΕΝ καλείται ΠΟΤΕ για εθνικά (βλ. εύρημα Ε, §3/§4).
**modules/daily_ops.js** — μόνο ORDERS (διεθνές)· καμία αναφορά σε NAT_* (γρ. 3,
"International ORDERS only"). Δεν αγγίζει το εθνικό κύκλωμα.

## 2. Κουμπιά και ενέργειες που γράφουν

| Ενέργεια | Αρχείο:γραμμή | Πεδία/πίνακας | syncOrderDownstream |
|---|---|---|---|
| Καταχώρηση/ενημέρωση εθνικής παραγγελίας | orders_natl.js:1362,1423 | NAT_ORDERS πλήρη fields | γρ. 1530: `{source:'natl', skipVS:true, skipGRP:true}` — GRP γίνεται inline πριν (γρ. 1471-1525), όχι διπλά |
| Toggle «Invoiced» (μονή εγγραφή) | orders_natl.js:1552 | NAT_ORDERS.Invoiced μόνο | γρ. 1559: skipVS,skipGRP,skipRamp,skipPA — ελαφρύ |
| Ακύρωση παραγγελίας | orders_natl.js:1874,1878 | NAT_ORDERS.Status='Cancelled' | γρ. 1878: πλήρες sync (Status) |
| Ανάθεση φορτηγού/συνεργάτη (Weekly) | weekly_natl.js:1954-1979 | NAT_LOADS: Truck/Trailer/Driver/Partner/Status='Assigned' | — δεν καλεί syncOrderDownstream άμεσα εδώ |
| …source NAT_ORDER→Assigned μετά την ανάθεση | weekly_natl.js:1990-1996 | NAT_ORDERS.Status='Assigned' μέσω `srcId=nlRec.fields['Source Record']` | γρ. 1994: skipVS,skipGRP,skipRamp,skipPL — βλ. εύρημα Γ, §4 (srcId μπορεί να είναι ORDERS id) |
| Ταίριασμα ΚΑΘΟΔΟΣ↔ΑΝΟΔΟΣ | weekly_natl.js:1730,1732,1752,1753 | NAT_LOADS.'Matched Load' | καμία κλήση syncOrderDownstream |
| Αποσύνδεση από Groupage | weekly_natl.js:2256,2258 | NAT_ORDERS.'Groupage ID'='' | γρ. 2259: changedFields:['Groupage ID'], skipPA,skipRamp |
| Τοπική κίνηση (νέα/edit/delete) | weekly_natl.js:1048,1087,1104 | LOCAL_MOVES | καμία — δεν αγγίζει source order |
| RAMP «Done» → προαγωγή Status | daily_ramp.js:664,697,701 | NAT_ORDERS.Status='In Transit' | γρ. 701: skipVS,skipGRP,skipRamp,skipPL |
| RAMP inline edit πεδίου/ώρας | daily_ramp.js:627,643,664 | RAMP.[πεδίο] | καμία |
| Batch τιμολόγηση | invoicing.js:927-935 | NAT_ORDERS.Status='Invoiced'+Invoiced=true+Invoice Number/Date | καμία (απευθείας atPatch) |

## 3. Διαδρομές (γράφος)

- **ORDERS(VS=ON) → NAT_LOADS**: δημιουργείται από `_syncVeroiaSwitch`
  (orders_intl.js:1486,1491), `Source Type:'Direct'`, `Source Record`=ORDERS id
  (γρ. 1457). Ενημερώνεται σε κάθε save intl παραγγελίας. Διαγράφεται σε
  orders_intl.js:1304-1398 όταν σβήνεται/OFF το VS. **Δεν περνά ποτέ από
  NAT_ORDERS** (όπως τεκμηριώνεται στο CLAUDE.md — επιβεβαιώθηκε στον κώδικα).
- **NAT_ORDERS(χωρίς Groupage) → NAT_LOADS**: `_syncNationalLoad`
  (orders_natl.js:1717-1800), `Source Type:'Direct'`, `Source Record`=NAT_ORDERS id
  (γρ. 1765). Ίδιο 'Source Type' με το VS-path παραπάνω, διαφορετικό table για
  'Source Record' — καμία τρίτη στήλη δεν το ξεχωρίζει (βλ. εύρημα Γ).
- **ORDERS/NAT_ORDERS(Groupage=ON) → GL_LINES → CONS_LOADS → NAT_LOADS**:
  κοινή `_syncGroupageLines` (orders_intl.js:1624, καλείται και από
  orders_natl.js:1473 `_syncGroupageLinesFromNO`), 1 GL/στάση, CL ανά φορτηγό
  (χειροκίνητο drag στο Weekly), NL φτιάχνεται όταν CL γεμίσει
  (orders_natl.js:830,856). **Ενημέρωση προς τα πάνω όταν αλλάζει η πηγαία
  παραγγελία**: `syncGLtoCLtoNL` core/order-sync.js:112-174 (Pallets/Temp/Goods
  μόνο — ΟΧΙ Status/Direction). **Διαγραφή**: GL ΠΟΤΕ hard-delete (κανόνας
  never-delete, εφαρμοσμένος σε 6+ σημεία: orders_natl.js:1505,1691,1939·
  orders_intl.js:1611,1667,1758,1991) — CL και NL ΝΑΙ hard-delete.
- **NAT_LOADS → RAMP**: μόνο μέσω ORDER_STOPS parent (daily_ramp.js:135,166,271-272)
  — αν το National Groupage/VS δεν παράγει ORDER_STOPS με τοποθεσία Veroia, ΔΕΝ
  εμφανίζεται ποτέ στη ράμπα. Μονής κατεύθυνσης δημιουργία· καμία ενημέρωση όταν
  αλλάζει το NAT_LOADS μετά (μόνο νέο create αν λείπει key).
- **NAT_LOADS → LOCAL_MOVES**: create μόνο (weekly_natl.js:1048,
  `Parent Nat Load` link). **Καμία διαγραφή/cascade όταν το NAT_LOADS/NAT_ORDERS
  διαγράφεται** — LOCAL_MOVES απουσιάζει από ΟΛΑ τα cascade-delete σημεία που
  βρέθηκαν (orders_natl.js:1868-1984, orders_intl.js:1304-1398,3019-3100,
  3214-3310). Ορφανή γραμμή "χρειάζεται τοπικό" μπορεί να μείνει ζωντανή για
  παραγγελία που έχει ήδη ακυρωθεί/σβηστεί.
- **NAT_LOADS/NAT_ORDERS → RT/μισθοδοσία (core/rt-feed.js)**: **ΔΕΝ υπάρχει
  διαδρομή**. `rtOnOrderSaved`/`rtOnOrderDeleted` καλούνται μόνο με
  `source==='intl'` (core/order-sync.js:90) και απευθείας μόνο από
  modules/orders_intl.js και modules/weekly_intl.js (grep επιβεβαιώνει καμία
  αναφορά σε modules/orders_natl.js, weekly_natl.js, daily_ramp.js). Νεκρή
  διαδρομή για το εθνικό κύκλωμα σήμερα.
- **NAT_LOADS/NAT_ORDERS → invoicing**: μόνο NAT_ORDERS διαβάζεται
  (invoicing.js:313)· NAT_LOADS/GL/CL δεν εμφανίζονται ποτέ στην τιμολόγηση.
- **NAT_ORDERS → PARTNER_ASSIGN**: μέσω `syncOrderDownstream` βήμα 1
  (core/order-sync.js:43-54, `paSyncStatus`) — δουλεύει και για natl (δεν είναι
  gated σε source). Απευθείας upsert/delete και από weekly_natl.js:2008,2012
  (parentType:'nat_load').

## 4. Ασυνέπειες

**Α. RAMP.'National Order' κρατά πάντα id από NAT_LOADS, όχι NAT_ORDERS.**
Ο auto-sync γράφει `rec['National Order'] = [nlPid]` (daily_ramp.js:272) όπου
`nlPid` προέρχεται αποκλειστικά από `F.STOP_PARENT_NL` (parent=NAT_LOADS,
βεβαιωμένο core/stops-helpers.js:21-22). Το «Done» handler όμως κάνει
`atGetOne(TABLES.NAT_ORDERS, natOrderId)` με αυτό το id (daily_ramp.js:674,694).
Καμία διαδρομή δεν γεμίζει ποτέ 'National Order' με πραγματικό NAT_ORDERS id
(το χειροκίνητο add στη γρ. 785-802 δεν το θέτει καθόλου). Άρα η προαγωγή
Status→'In Transit' για εθνικές παραγγελίες μέσω ράμπας αποτυγχάνει σιωπηλά σε
κάθε περίπτωση (μόνο `console.warn`, γρ. 705) — αντίθετο στην Αρχή 1
("ό,τι δεν γίνεται πρέπει να ακούγεται").

**Β. Η τιμολόγηση γράφει Status='Invoiced' — αντίθετα με την κλειδωμένη απόφαση owner.**
CLAUDE.md (23/8): "Το «Invoiced» **δεν είναι status** — μόνο checkbox." Ο κώδικας
invoicing.js:930 γράφει `'Status': 'Invoiced'` μαζί με `'Invoiced': true`
(γρ. 929-934). Το μονό toggle σε orders_natl.js:1552 σέβεται τη σωστή σύμβαση
(γράφει μόνο Invoiced) — δύο σημεία εγγραφής με διαφορετική συμπεριφορά για την
ίδια έννοια.

**Γ. NAT_LOADS.'Source Record' είναι πολυμορφικό χωρίς διάκριση πίνακα.**
'Source Type':'Direct' γράφεται και για VS-από-ORDERS (orders_intl.js:1456-1457,
`Source Record`=ORDERS id) και για απλή εθνική χωρίς groupage
(orders_natl.js:1764-1765, `Source Record`=NAT_ORDERS id) — ίδια τιμή
'Source Type', διαφορετικός πίνακας στόχος, καμία τρίτη στήλη το ξεχωρίζει.
weekly_natl.js:1990-1992 υποθέτει πάντα NAT_ORDERS: `atSafePatch(TABLES.NAT_ORDERS,
srcId, {'Status':'Assigned'})`. Για VS-προερχόμενα NAT_LOADS αυτό επιχειρεί
patch σε λάθος πίνακα με λάθος id — αποτυγχάνει, πιάνεται μόνο από το εξωτερικό
`try/catch` (γρ. 1987,1999) με `console.warn('NO status sync:', e)`, όχι toast.

**Δ. Status «Confirmed» στο φίλτρο του orders_natl.js δεν γράφεται ποτέ.**
Το dropdown φίλτρου έχει `Pending/Confirmed/In Transit/Delivered`
(orders_natl.js:286-289), αλλά όλα τα σημεία εγγραφής Status σε NAT_ORDERS
γράφουν μόνο `'Pending'` (δημιουργία), `'Assigned'` (weekly_natl.js:1992,
daily_ramp δεν), `'In Transit'` (daily_ramp.js:697), `'Cancelled'`
(orders_natl.js:1874), `'Invoiced'` (invoicing.js:930) — ποτέ `'Confirmed'`,
ποτέ `'Delivered'`. Το φίλτρο 'Confirmed' είναι νεκρό· το φίλτρο 'Delivered'
δεν βρίσκει ποτέ αποτελέσματα μέσω αυτής της οθόνης.

**Ε. Το RT/μισθοδοσία δεν βλέπει ποτέ εθνικά φορτία (core/rt-feed.js).**
core/order-sync.js:90 καλεί `rtOnOrderSaved` μόνο όταν `source==='intl'`.
Καμία κλήση σε modules/orders_natl.js, weekly_natl.js ή daily_ramp.js.
Ταιριάζει με τη σημείωση μνήμης "Γ block για RT στη μισθοδοσία/καρτέλα" ως
εκκρεμότητα — εδώ επιβεβαιώνεται στον κώδικα ότι είναι πλήρης απουσία, όχι
μερική.

**ΣΤ. Δύο εβδομαδιαίες οθόνες υπολογίζουν διαφορετική "εβδομάδα" για την ίδια
ημερομηνία.** weekly_intl.js:96-113 μετατοπίζει σκόπιμα το όριο μία μέρα
νωρίτερα ώστε η εβδομάδα να ξεκινά Σάββατο (απόφαση owner 10/8, σχόλιο γρ.
96-100). weekly_natl.js:97-101 κρατά το αυθεντικό Κυριακή-start WEEKNUM χωρίς
τη μετατόπιση (σχόλιο γρ. 97: "matching Airtable WEEKNUM (Sunday-start)"). Ένα
Σάββατο εμφανίζεται σε διαφορετική εβδομάδα στις δύο οθόνες.

**Ζ. GL_LINES «ποτέ delete» παραβιάζεται με FIXME εν γνώσει.**
orders_natl.js:1501-1503 και 1687: `// FIXME(audit): GL_LINES must never be
hard-deleted` πάνω από κώδικα που ΔΕΝ κάνει hard-delete (μόνο Unassign) — το
FIXME αναφέρεται σε ΑΛΛΟ, ιστορικό σημείο (`.reference/ANALYSIS_WEAK_SPOTS...`)
που δεν βρέθηκε στο σημερινό αρχείο· ο ίδιος κώδικας σήμερα ήδη σέβεται τον
κανόνα. Σχόλιο-ψέμα (πιθανώς ξεχασμένο μετά από διόρθωση) — παραβιάζει την
οδηγία "COMMENTS: ένα ξεχασμένο σχόλιο είναι χειρότερο από κανένα".

## 5. Ερωτήσεις προς owner

1. Το RAMP.'National Order' κρατά NAT_LOADS id (§4Α). Θέλεις να διορθωθεί το
   Done-handler να διαβάζει NAT_LOADS αντί για NAT_ORDERS, ή να προστεθεί
   πραγματικό NAT_ORDERS link;
2. Η τιμολόγηση γράφει Status='Invoiced' αντίθετα με την κλειδωμένη απόφαση
   "Invoiced δεν είναι status" (§4Β) — ισχύει ακόμη η απόφαση, να αφαιρεθεί η
   εγγραφή Status από το invoicing.js;
3. NAT_LOADS.'Source Record' δείχνει άλλοτε ORDERS άλλοτε NAT_ORDERS χωρίς
   διάκριση (§4Γ) — θέλεις νέα στήλη 'Source Table' ή διόρθωση του
   weekly_natl.js:1990 να ελέγχει πρώτα το 'Source Type'/table;
4. Το φίλτρο Status='Confirmed' στο orders_natl.js δεν γράφεται ποτέ (§4Δ) —
   να αφαιρεθεί από το dropdown, ή λείπει write path που έπρεπε να το γράφει;
5. Το RT/μισθοδοσία δεν βλέπει καθόλου εθνικά φορτία (§4Ε) — προγραμματισμένο
   ή αναμενόμενο τώρα;
6. Weekly International ξεκινά εβδομάδα Σάββατο, Weekly National Κυριακή
   (§4ΣΤ) — σκόπιμη διαφορά ή έπρεπε να ενοποιηθούν;
