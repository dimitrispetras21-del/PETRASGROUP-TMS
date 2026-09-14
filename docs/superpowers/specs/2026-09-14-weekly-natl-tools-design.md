# Weekly Εθνικών — εργαλεία του Weekly Διεθνών (spec υλοποίησης, 14/9/2026)

Brief: `docs/design/2026-09-14-weekly-natl-parity-brief.md` · Απογραφή: `docs/data-audit/2026-09/2026-09-14-weekly-natl-parity-inventory.md`
· Figma: `w5-weekly-natl-tools` 618:1011 + σημειώσεις 621:1058 (αρχείο KO7l2AfucR3HJEDIg1Yptr, σελίδα Screens).

## Αποφάσεις owner (14/9, σε αυτό το session)
1. Σήμα πηγής **μόνο** σε VS και GRP γραμμές (η γνήσια εθνική είναι η προεπιλογή, χωρίς σήμα).
2. Κλικ σε γνήσια εθνική **και** σε groupage ανοίγει τη φόρμα εθνικής παραγγελίας.
3. Κλικ σε VS = **μόνο ανάγνωση** (Πρόταση Α): καρτέλα της διεθνούς παραγγελίας μέσα στο Weekly Εθνικών, χωρίς ενέργειες.
4. Κουμπί «+ Groupage»: **ΕΚΚΡΕΜΟΤΗΤΑ** — δεν υλοποιείται (owner: «δεν αποφάσισα ακόμα»).
5. Δεξί κλικ: + «Επεξεργασία» (όχι σε VS), + «Εκτύπωση», − «Διαχωρισμός» (νεκρός). Εγκρίθηκε «και τα τρία».
6. Διορθώσεις ελαττωμάτων στην ίδια παράδοση (χωρίς ερώτηση): Δ2 φίλτρο Groupage, Δ3 Καθαρισμός/status, φρουρός εκτέλεσης.
Εκτός: σπάσιμο σκέλους, αυτόματο ταίριασμα, μεταφορά εβδομάδας/date picker από τον πίνακα, drag-to-group.

## Πηγή φορτίου (γεγονότα)
`national_loads.source_type` ∈ {`Direct` (VS, με `Source Order` → διεθνής), `National` (γνήσια, με `Source National Order`),
`Groupage` (με `Source Consolidated Load` → CL· ΟΥΤΕ Source Order ΟΥΤΕ Source National Order)}. Βάση 14/9: 35 / 7 / 1.
Τα labels του Worker (NAT_LOADS): `Source Type`, `Source Order`, `Source National Order`, `Source Consolidated Load`.
GL_LINES: `Linked Consolidated Load`, `Linked National Order`. Το Weekly ζητά τα fields στο `_wnLoadAll` (weekly_natl.js:168) —
**πρόσθεσε** `'Source Consolidated Load'`.

## Αλλαγές

### A. `modules/weekly_natl.js`
A1. `_wnBuildRow` (≈L250-295): νέα πεδία γραμμής
```js
src: f['Source Type']==='Groupage' ? 'grp' : (f['Source Type']==='Direct' || getLinkedId(f['Source Order'])) ? 'vs' : 'nat',
noId: getLinkedId(f['Source National Order']) || '',
intlId: getLinkedId(f['Source Order']) || '',
clId: getLinkedId(f['Source Consolidated Load']) || '',
```
και **Δ2**: `isGrp: f['Source Type'] === 'Groupage'` (όχι `|| delN>1` — ένα VS με 2 παραδόσεις δεν είναι groupage).

A2. Σήμα πηγής στη στήλη αρίθμησης (L1579, `.wk3-num`): μετά τον αριθμό/×N:
`${row.src==='vs'?'<span class="wn4-src vs" title="Φορτίο Veroia Switch — τα στοιχεία αλλάζουν από το Weekly Διεθνών">VS</span>':row.src==='grp'?'<span class="wn4-src grp" title="Groupage">GRP</span>':''}`
Ίδιο στη γραμμή ανόδου (L1861 `.wk3-num.imp`). CSS στο `_wnCss`:
`.wn4 .wn4-src{display:block;margin-top:2px;width:30px;padding:1px 0;border-radius:3px;font-size:8px;font-weight:700;text-align:center;line-height:12px}`
`.wn4 .wn4-src.vs{background:#E2E8F0;color:#475569}` `.wn4 .wn4-src.grp{background:#FEF3C7;color:#B45309}`

A3. Κλικ = άνοιγμα. Στο `.wk3-leg` της καθόδου (L1580) `onclick="_wnOpenRow(${row.id})"` και `style="cursor:pointer"`
(μόνο όταν η γραμμή έχει φορτίο). Στο σκέλος ανόδου το αντίστοιχο (`_wnOpenRow(rowId)` για sn rows — `_wnOrd(row)` δίνει το φορτίο).
Τα κουμπιά μέσα στο leg (⎙, «▸ N σημεία» `_wnToggleStops` L1551, drag handles) πρέπει να έχουν `event.stopPropagation()`.
Το τμήμα πολυστάσιου (L1397) **αντί** `openNatlEdit('${loadId}')` → `_wnOpenRow(${row.id}, '${s._no||''}')` (Δ1: σήμερα περνά id ΦΟΡΤΙΟΥ).
```js
// Click = open. What opens depends on the load's source (owner 14/9): a
// genuine national or groupage order opens its NATIONAL ORDER form; a VS
// load opens the INTERNATIONAL order read-only — only the Weekly Διεθνών may
// edit it. Never pass the load id to openNatlEdit (that was Δ1: silent no-op).
async function _wnOpenRow(rowId, noIdHint) {
  const row = WNATL.rows.find(r => r.id===rowId); if (!row) return;
  const rec = _wnOrd(row); if (!rec) return;
  if (row.src === 'vs') {
    if (!row.intlId) { toast('Φορτίο VS χωρίς σύνδεσμο διεθνούς παραγγελίας', 'danger'); return; }
    if (typeof openIntlReadOnlyCard !== 'function') { toast('Η καρτέλα διεθνών δεν είναι φορτωμένη', 'danger'); return; }
    return openIntlReadOnlyCard(row.intlId);
  }
  if (_wnBlockReadOnly()) return;                      // management: no edit form
  let noId = noIdHint || row.noId;
  if (!noId && row.src === 'grp') noId = await _wnGrpFirstOrder(row.clId);
  if (!noId) { toast('Το φορτίο δεν συνδέεται με εθνική παραγγελία', 'danger'); return; }
  if (typeof openNatlEdit !== 'function') { toast('Η φόρμα εθνικών δεν είναι φορτωμένη', 'danger'); return; }
  openNatlEdit(noId);
}
// Groupage: the order behind a load is reached through GROUPAGE LINES (same
// path as _wnToggleStops); first line = first order. Filtered in JS — formula
// filters on linked records are unreliable (orders_intl.js:1178).
async function _wnGrpFirstOrder(clId) {
  if (!clId) return '';
  try {
    const gls = await atGetAll(TABLES.GL_LINES, { fields: ['Linked Consolidated Load','Linked National Order'] }, false);
    const g = (gls||[]).find(g => getLinkedId(g.fields?.['Linked Consolidated Load']) === clId && getLinkedId(g.fields?.['Linked National Order']));
    return g ? getLinkedId(g.fields['Linked National Order']) : '';
  } catch(e) { if (typeof logError==='function') logError(e, '_wnGrpFirstOrder'); return ''; }
}
```
Εξαγωγή: `window._wnOpenRow = _wnOpenRow;` (τα onclick του template το χρειάζονται).
Το `_wnToggleStops` groupage branch (L1634) χρησιμοποιεί `src = _srcNoId || _srcOrdId` — για πραγματικό Groupage είναι κενά·
**διόρθωσε** σε `const _srcClId = getLinkedId(ff['Source Consolidated Load'])` και μπες στον κλάδο groupage όταν
`ff['Source Type']==='Groupage' && _srcClId` (φίλτρο GL με `_srcClId`). Μικρή, στοχευμένη αλλαγή.

A4. Δεξί κλικ `_wnCtx` (L2414): ΠΡΩΤΟ item `Επεξεργασία` **μόνο αν** `row.src!=='vs'` → `_wnCtxClose();_wnOpenRow(${rowId})`.
Μετά την «Ανάθεση»: `Εκτύπωση` → `_wnCtxClose();_wnPrint(${rowId},'northsouth')`. **Αφαίρεσε** το item «Διαχωρισμός» (L2424-2425),
τη συνάρτηση `_wnSplit` (L2638-2678) και το `window._wnSplit` (L2748) — Δ4, αρχή 8. `_wnCtxSn` (L2508): ίδια δύο προσθήκες
(`Επεξεργασία` μόνο αν η γραμμή δεν είναι VS· `Εκτύπωση` → `_wnPrint(${rowId},'southnorth')`).

A5. **Δ3** `_wnClear` (L2389): πριν την εγγραφή `const done = await _wnDoneLive(loadId); if (done) { showErrorToast(`Το φορτίο είναι ${done} — η ανάθεση δεν αλλάζει από το Weekly`); return; }`
και μετά τον καθαρισμό `await _wnRevertNoStatus(loadId)` για κάθε `row.orderIds` (όπως `_wnUnassign` L2600-2622).

A6. Φρουρός εκτέλεσης («η εκτέλεση νικά τον σχεδιασμό», κανόνας 14/9 του Διεθνών): στην αρχή των `_wnSaveFromPopover`
(L2278, κάθε `row.orderIds`), `_wnSaveMatch` (L2066, και τα δύο φορτία), `_wnUnmatch` (L2090, και τα δύο): αν `await _wnDoneLive(id)`
επιστρέψει status → `showErrorToast('Το φορτίο είναι <status> — δεν αλλάζει από το Weekly')` και return **χωρίς** εγγραφή.
Σχόλιο στο ΓΙΑΤΙ (ο πίνακας δεν κοίταζε ποτέ το Status· 030 trigger).

### B. `modules/orders_natl.js`
B1. **Δ1** `openNatlEdit(recId)` (L1202): αν δεν βρεθεί στο `NATL_ORDERS.data`, φόρτωσέ το:
```js
async function openNatlEdit(recId) {
  let rec = NATL_ORDERS.data.find(r => r.id === recId);
  if (!rec) {
    // Opened from the Weekly: the orders list may never have loaded (Δ1 —
    // the click used to be a silent no-op). atGetOne already toasts + logs.
    try { rec = await atGetOne(TABLES.NAT_ORDERS, recId); } catch (e) { return; }
  }
  if (rec && rec.fields) _openNatlModal(recId, rec.fields);
}
```
B2. Επιβεβαίωσε ότι μετά την αποθήκευση από το Weekly ξαναζωγραφίζεται ο πίνακας (`currentPage==='weekly_natl' → renderWeeklyNatl()`,
υπάρχει στο L2158-2159 — δες ΣΕ ΠΟΙΑ συνάρτηση είναι και ότι καλείται από το `submitNatlOrder`· αν όχι, πρόσθεσέ το στο τέλος του
`submitNatlOrder` με το ίδιο μοτίβο).

### C. `modules/orders_intl.js` — καρτέλα μόνο-ανάγνωσης
C1. `_oiCardHtml(rec, opts)` (L834): `const canEdit = !(opts && opts.readOnly) && can('orders') === 'full';`. Σε readOnly, κάτω
από τον τίτλο: `<div class="oi-ro-note">Veroia Switch · μόνο ανάγνωση — επεξεργασία από το Weekly Διεθνών</div>`.
Κράτα τα links πλοήγησης (`navigate('weekly_intl')` = ο δρόμος προς την επεξεργασία). Βεβαιώσου (grep) ότι σε readOnly **κανένα**
`onclick` δεν καλεί atPatch/atCreate/atDelete: επιτρεπτά μόνο `_oiCloseCard`, `navigate(...)`.
C2. Νέα `openIntlReadOnlyCard(recId)` + `window.openIntlReadOnlyCard`:
```js
// Weekly Εθνικών → VS load: show the international order WITHOUT actions.
// Only the Weekly Διεθνών edits a VS order (owner 14/9). The Weekly page has
// no #intlDetail, so the card floats (fixed, right) — same markup, same CSS.
async function openIntlReadOnlyCard(recId) {
  let rec = INTL_ORDERS.data.find(r => r.id === recId);
  if (!rec) { try { rec = await atGetOne(TABLES.ORDERS, recId); } catch (e) { return; } } // atGetOne toasts + logs (403/404 heard)
  let panel = document.getElementById('intlDetail');
  if (!panel) { panel = document.createElement('div'); panel.id = 'intlDetail'; panel.className = 'entity-detail-panel oi-ro-float hidden'; document.body.appendChild(panel); }
  panel.innerHTML = _oiCardHtml(rec, { readOnly: true });
  panel.classList.remove('hidden'); panel.scrollTop = 0;
}
```
CSS (assets/style.css, δίπλα στο `.entity-detail-panel`): `.entity-detail-panel.oi-ro-float{position:fixed;top:0;right:0;height:100vh;width:480px;z-index:1200;background:var(--bg-card);border-left:1px solid var(--border);overflow:auto;box-shadow:-8px 0 24px rgba(11,25,41,.12)}` `.oi-ro-note{font-size:11px;color:var(--text-dim);margin:2px 0 8px}`.
Esc: αν υπάρχει ήδη keydown handler για `_oiCloseCard`, αρκεί· αλλιώς ένα `once` listener στο άνοιγμα.

### D. Rig `wn-multistop` (scratchpad) — νέο test «κλικ ανά πηγή»
Seed: 3 φορτία ΚΑΘΟΔΟΥ: `recNLvs` (`'Source Type':'Direct','Source Order':['recINTL1']`), `recNLnat` (`'Source Type':'National','Source National Order':['recNO1']`),
`recNLgrp` (`'Source Type':'Groupage','Source Consolidated Load':['recCL1']`). Fake facade: GET `/${TABLES.NAT_ORDERS}/recNO1` → record με
`Client`, `Loading DateTime`, `Pickup Location 1`, `Delivery Location 1`· GET `/${TABLES.ORDERS}/recINTL1` → record με `Reference`, `Client`, `Type:'International'`;
GET `/${TABLES.GL_LINES}?` → 1 γραμμή `{Linked Consolidated Load:['recCL1'], Linked National Order:['recNO2']}` + GET `/${TABLES.NAT_ORDERS}/recNO2`.
Έλεγχοι (dispatcher): (1) σήματα: `.wn4-src.vs` στη γραμμή VS, `.wn4-src.grp` στη GRP, κανένα στη γνήσια· (2) κλικ στο `.wk3-leg` της γνήσιας →
ανοίγει modal (`#natlBtnSubmit` με `onclick="submitNatlOrder('recNO1')"`), 0 εγγραφές· (3) κλικ στη GRP → modal για `recNO2`, 0 εγγραφές·
(4) κλικ στη VS → `#intlDetail` ορατό, περιέχει «μόνο ανάγνωση», κάθε `[onclick]` μέσα του είναι `_oiCloseCard` ή `navigate(`, 0 εγγραφές·
(5) δεξί κλικ γνήσια → `#wn-ctx` έχει «Επεξεργασία» και «Εκτύπωση», όχι «Διαχωρισμός»· δεξί κλικ VS → όχι «Επεξεργασία»·
(6) φίλτρο: γραμμή VS με 2 παραδόσεις ΔΕΝ έχει `isGrp` (μέσω `WNATL.rows`)· (7) management: κλικ στη γνήσια → κανένα modal, κλικ στη VS → καρτέλα ανοίγει.
Τα 2 υπάρχοντα tests πρέπει να μένουν πράσινα.

## Απόδειξη πριν το push (συντονιστής)
node --check ×3 · rig 4/4 · ζωντανό dry-run ως owner στο Chrome: κλικ σε ΕΘΝ (φόρμα, Ακύρωση), κλικ σε VS (καρτέλα, `querySelectorAll('[onclick]')`),
δεξί κλικ ×2 — **0 εγγραφές** (SELECT audit_log μετά) · bump `?v=` σε app.html για weekly_natl.js, orders_natl.js, orders_intl.js + `SW_VERSION`.
