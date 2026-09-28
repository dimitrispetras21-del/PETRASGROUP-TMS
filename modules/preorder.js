// ═══════════════════════════════════════════════════════════════
// PRE-ORDER — a load the client announced before its details exist
// ═══════════════════════════════════════════════════════════════
// Owner 22/9 (revision «ξεχωριστό κουμπί»): a separate small form, NOT a mode
// of the order form. A pre-order is a normal ORDERS row with
// ops_status='Provisional' and Status 'Pending' (the status vocabulary is
// locked — no new Status). «2 φορτία» = 2 rows: each load becomes its own
// order with its own truck/RT/invoice. Converting = the NORMAL order form on
// the SAME id, which writes 'Ops Status' back to null (orders_intl.js).
// Owner 27/9: + «Χώρα προορισμού» (dest_country, DRAFT 052) and the
// «pressure» — a counter at the top of Weekly/Daily and a marking that turns
// red as loading approaches. No blocking of assignment, no emails.
// Spec: docs/data-audit/2026-09/2026-09-22-pantelis-preorder.md §ΑΝΑΘΕΩΡΗΣΗ.
//
// ONE predicate for every screen (αρχή 3): list, Weekly and Daily all ask
// isPreorder(), never their own copy of the rule.

/** A live pre-order. Cancelled keeps ops_status as a trace (22/9) but is no
 *  longer something anyone has to complete. Assigned/In Transit STAYS a
 *  pre-order: assignment is allowed (you hold a truck for tomorrow) and the
 *  missing points are still missing — dropping the mark on assignment would
 *  make the pressure vanish exactly when the load gets real. */
function isPreorder(f) {
  return !!f && f['Ops Status'] === 'Provisional' && f['Status'] !== 'Cancelled';
}

// Days from today to the loading day. The column is a `date` (no time), so the
// «72h / 24h» thresholds are counted in calendar days: tomorrow is already red
// — «λεπτομέρειες αύριο» is the phone call that started this feature.
function _preDays(f) {
  const d = toLocalDate(f && f['Loading DateTime'] || '');
  if (!d) return null;
  return Math.round((Date.parse(d + 'T00:00:00Z') - Date.parse(localToday() + 'T00:00:00Z')) / 86400000);
}

/** 'normal' (≥4 days) · 'amber' (2–3 days) · 'red' (tomorrow, today, past).
 *  No loading date = red: unknown is never shown as «plenty of time». */
function preorderLevel(f) {
  const n = _preDays(f);
  if (n === null || n <= 1) return 'red';
  return n <= 3 ? 'amber' : 'normal';
}
const _PRE_RANK = { normal: 0, amber: 1, red: 2 };
function _preWorst(list) {
  return list.reduce((w, f) => (_PRE_RANK[preorderLevel(f)] > _PRE_RANK[w] ? preorderLevel(f) : w), 'normal');
}

function _preWhen(f) {
  const n = _preDays(f);
  if (n === null) return 'χωρίς ημ. φόρτωσης';
  if (n < 0) return 'η φόρτωση πέρασε';
  if (n === 0) return 'φόρτωση σήμερα';
  if (n === 1) return 'φόρτωση αύριο';
  return `φόρτωση σε ${n} ημ.`;
}

/** Destination while the point is unknown: the country, or «—». */
function preorderDest(f) {
  const c = f && f['Destination Country'];
  return c ? (typeof countryName === 'function' ? countryName(c) : String(c)) : '';
}

/** The chip every screen shows: word + how close + colour by level. The full
 *  story (what is missing, country, notes) lives in the title. `short` (the
 *  Weekly's narrow cards): the word alone — the card already shows the date,
 *  the colour carries the urgency, and a clipped chip would be read as a
 *  different word (measured on the import card, 1440px). */
function preorderChipHtml(f, short) {
  _preEnsureStyles();
  return `<span class="pre-chip pre-${preorderLevel(f)}" title="${escapeHtml(preorderTip(f))}">PRE-ORDER${short ? '' : ' · ' + escapeHtml(_preWhen(f))}</span>`;
}
/** Plain-text story for a title attribute (caller escapes). */
function preorderTip(f) {
  const bits = ['Pre-order — λείπουν σημεία φόρτωσης/παράδοσης', _preWhen(f)];
  const dest = preorderDest(f);
  if (dest) bits.push((f['Direction'] === 'Import' ? 'χώρα φόρτωσης: ' : 'χώρα προορισμού: ') + dest);
  if (f['Notes']) bits.push('«' + String(f['Notes']) + '»');
  return bits.join(' · ');
}
/** The unknown FOREIGN end in words (plain text, caller escapes):
 *  export → «→ Ιταλία (IT)», import → «από Ολλανδία (NL)», '' without one. */
function preorderCountryText(f) {
  const cc = f && f['Destination Country'] ? String(f['Destination Country']) : '';
  if (!cc) return '';
  return (f['Direction'] === 'Import' ? 'από ' : '→ ') + (preorderDest(f) || cc) + ' (' + cc + ')';
}
/** Orders list status (Figma 709:1144): dashed «PRE», urgency colour. No «k/n»
 *  (owner 28/9): loads created together are independent orders — different
 *  trucks, different assignments — so nothing on screen pairs them. */
function preorderPillHtml(f) {
  _preEnsureStyles();
  return `<span class="pre-pill pre-${preorderLevel(f)}" title="${escapeHtml(preorderTip(f))}">PRE</span>`;
}

/** «N προσωρινές» — hidden at 0. `onclick` is the page's own jump/filter. */
function preorderCounterHtml(fieldsList, onclick, on) {
  const list = (fieldsList || []).filter(isPreorder);
  if (!list.length) return '';
  _preEnsureStyles();
  const n = list.length;
  return `<button type="button" class="pre-count pre-${_preWorst(list)}${on ? ' on' : ''}" data-q="pre" onclick="${onclick}" title="Pre-orders χωρίς σημεία — κλικ: εμφάνιση">${n} ${n === 1 ? 'προσωρινή' : 'προσωρινές'}</button>`;
}

/** The band on top of the NORMAL order form when it converts a pre-order. */
function preorderConvertBand(f) {
  _preEnsureStyles();
  const dest = preorderDest(f);
  const extra = [dest ? (f['Direction'] === 'Import' ? 'χώρα φόρτωσης: <b>' : 'χώρα προορισμού: <b>') + escapeHtml(dest) + '</b>' : '', f['Notes'] ? '«' + escapeHtml(String(f['Notes'])) + '»' : ''].filter(Boolean).join(' · ');
  return `<div class="pre-band pre-${preorderLevel(f)}"><b>PRE-ORDER → παραγγελία.</b> Συμπλήρωσε σημεία και ημερομηνίες· με την αποθήκευση γίνεται κανονική παραγγελία (ίδια εγγραφή).${extra ? '<br>' + extra : ''}</div>`;
}

// ── Small form (create n / edit one) — Figma 709:1045 ─────────────
// Direction = segmented Export|Import, count = stepper 1–9, primary = navy
// «Δημιουργία N pre-orders» (N live). The country row is NOT in the Figma: it
// is the owner's 27/9 addition, drawn in the same style, full width.
async function openPreorder(recId) {
  let f = {};
  if (recId) {
    try { f = (await atGetOne(TABLES.ORDERS, recId)).fields || {}; }
    catch (e) { return; } // atGetOne already toasted + logged
  }
  _preEnsureStyles();
  const cid = Array.isArray(f['Client']) ? f['Client'][0] : '';
  const clabel = cid && typeof fhResolveClientName === 'function' ? (await fhResolveClientName(cid)) || '' : '';
  const dir = f['Direction'] || '';
  const seg = (v) => `<button type="button" class="pre-seg-b${dir === v ? ' on' : ''}" data-dir="${v}" onclick="_preDir('${v}')">${v}</button>`;
  const body = `
    <input type="hidden" id="pre_dir" value="${escapeHtml(dir)}">
    <div class="pre-f"><label class="pre-lbl">ΠΕΛΑΤΗΣ</label>${fhClientSelect('pre_client', cid, clabel)}</div>
    <div class="pre-row">
      <div class="pre-f"><label class="pre-lbl">ΚΑΤΕΥΘΥΝΣΗ</label><div class="pre-seg">${seg('Export')}${seg('Import')}</div></div>
      <div class="pre-f"><label class="pre-lbl">ΗΜΕΡΟΜΗΝΙΑ ΦΟΡΤΩΣΗΣ</label><input class="form-input" type="date" id="pre_date" value="${escapeHtml(toLocalDate(f['Loading DateTime'] || ''))}"></div>
    </div>
    <div class="pre-f"><label class="pre-lbl" id="pre_country_lbl">${_preCountryLabel(dir)}</label><select class="form-select" id="pre_country">${countryOptionsHtml(f['Destination Country'] || '')}</select><div class="pre-hint">προαιρετικό — όταν δεν ξέρουμε ακόμη το σημείο</div></div>
    ${recId ? '' : `<div class="pre-f"><label class="pre-lbl">ΠΟΣΑ ΦΟΡΤΙΑ</label><div class="pre-step-row"><div class="pre-step"><button type="button" onclick="_preStep(-1)" aria-label="Λιγότερα">−</button><input id="pre_n" value="1" readonly aria-label="Πόσα φορτία"><button type="button" onclick="_preStep(1)" aria-label="Περισσότερα">+</button></div><span class="pre-hint">1–9 · κάθε φορτίο = δική του γραμμή στη Weekly</span></div></div>`}
    <div class="pre-f"><label class="pre-lbl">ΣΗΜΕΙΩΣΕΙΣ</label><textarea class="form-textarea" id="pre_notes" rows="2" style="width:100%;resize:vertical">${escapeHtml(f['Notes'] || '')}</textarea></div>`;
  const footer = `<button class="btn pre-outline" onclick="_preClose()">Άκυρο</button>
    <button class="btn pre-primary" id="preSubmit" onclick="submitPreorder('${recId || ''}')">${recId ? 'Αποθήκευση pre-order' : 'Δημιουργία 1 pre-order'}</button>`;
  document.getElementById('modal').style.maxWidth = '480px';
  openModal('Pre-order', body, footer);
}
// One column (dest_country), two meanings by direction (coordinator proposal
// 27/9, pending owner): the foreign point we do not know yet — where an
// export GOES, where an import LOADS. The Greek end is never the unknown one.
function _preCountryLabel(dir) { return dir === 'Import' ? 'ΧΩΡΑ ΦΟΡΤΩΣΗΣ' : 'ΧΩΡΑ ΠΡΟΟΡΙΣΜΟΥ'; }
function _preDir(v) {
  const h = document.getElementById('pre_dir'); if (h) h.value = v;
  document.querySelectorAll('#modal .pre-seg-b').forEach(b => b.classList.toggle('on', b.dataset.dir === v));
  const l = document.getElementById('pre_country_lbl'); if (l) l.textContent = _preCountryLabel(v);
}
function _preStep(d) {
  const i = document.getElementById('pre_n'); if (!i) return;
  i.value = String(Math.min(9, Math.max(1, (parseInt(i.value, 10) || 1) + d)));
  _preBtnLabel();
}
function _preBtnLabel() {
  const n = parseInt(document.getElementById('pre_n')?.value, 10) || 1;
  const b = document.getElementById('preSubmit');
  if (b) b.textContent = `Δημιουργία ${n} ${n === 1 ? 'pre-order' : 'pre-orders'}`;
}
function _preClose() { document.getElementById('modal').style.maxWidth = ''; closeModal(); }

async function submitPreorder(recId) {
  const btn = document.getElementById('preSubmit');
  const clientId = document.getElementById('lv_pre_client')?.value || '';
  const dir = document.getElementById('pre_dir')?.value || '';
  const date = document.getElementById('pre_date')?.value || '';
  const country = document.getElementById('pre_country')?.value || '';
  const notes = (document.getElementById('pre_notes')?.value || '').trim();
  const n = recId ? 1 : Math.min(9, Math.max(1, parseInt(document.getElementById('pre_n')?.value, 10) || 1));
  const miss = [];
  if (!clientId) miss.push('Πελάτης (επίλεξε από τη λίστα)');
  if (!dir) miss.push('Κατεύθυνση');
  if (!date) miss.push('Ημ. φόρτωσης');
  if (miss.length) { showErrorToast('Λείπουν: ' + miss.join(', '), 'warn', 6000); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Δημιουργία…'; }
  // Loading date for BOTH directions (not «delivery for imports», as the 22/9
  // sketch had it): the Weekly fetches imports by Loading DateTime — an import
  // pre-order holding only a delivery date would never appear on the board —
  // and the 27/9 pressure is «as LOADING approaches».
  const fields = { Client: [clientId], Direction: dir, 'Loading DateTime': date };
  const made = [];
  try {
    if (recId) {
      // Edit owns these fields, so an emptied box clears the column.
      Object.assign(fields, { Notes: notes || null, 'Destination Country': country || null });
      const res = await atSafePatch(TABLES.ORDERS, recId, fields);
      if (res?.conflict) {
        toast('Η εγγραφή άλλαξε από άλλον χρήστη — κάνε Ανανέωση και ξαναδοκίμασε', 'warn');
        if (btn) { btn.disabled = false; btn.textContent = 'Αποθήκευση pre-order'; }
        return;
      }
      made.push(res);
    } else {
      // Brand/Type as the order form writes them on create. VS/Groupage OFF on
      // purpose: the sync chain would build national loads / groupage lines
      // without a single point.
      Object.assign(fields, { Brand: 'Petras Group', Type: 'International', Status: 'Pending', 'Ops Status': 'Provisional',
        'Veroia Switch': false, 'National Groupage': false });
      if (notes) fields['Notes'] = notes;
      if (country) fields['Destination Country'] = country;
      // Sequential, never a retried batch: a POST is not idempotent (14/9,
      // order 335). A failure at k leaves k-1 rows — said out loud below.
      // Each row is a fully independent order (owner 28/9): no group id, no
      // matched id, no batch marker — different loads, different assignments.
      for (let i = 0; i < n; i++) made.push(await atCreate(TABLES.ORDERS, fields));
    }
  } catch (e) {
    // atCreate/atPatch already toasted «Save failed» and logged the cause.
    if (made.length) showErrorToast(`Καταχωρήθηκαν ${made.length} από ${n} pre-orders — τα υπόλοιπα ΟΧΙ. Έλεγξε το Εβδομαδιαίο πριν ξαναδοκιμάσεις.`, 'error', 10000);
    if (btn) { btn.disabled = false; _preBtnLabel(); if (recId) btn.textContent = 'Αποθήκευση pre-order'; }
    if (!made.length) return;
  }
  // Αρχή 2: the proof is the row the Worker sent back, not the toast. An
  // unknown label is dropped with 200 OK (facade trap 1); here it is heard.
  const live = made.filter(r => r && !r._offline);
  const unmarked = recId ? [] : live.filter(r => r.fields?.['Ops Status'] !== 'Provisional');
  if (unmarked.length) {
    showErrorToast(`Προσοχή: ${unmarked.length} εγγραφή(ές) γράφτηκαν ΧΩΡΙΣ σήμανση pre-order και φαίνονται ως κανονικές παραγγελίες. Ενημέρωσε τον διαχειριστή.`, 'error', 12000);
    if (typeof logError === 'function') logError(new Error('Ops Status not written'), 'submitPreorder ' + unmarked.map(r => r.id).join(','));
  }
  if (country && live.some(r => r.fields?.['Destination Country'] !== country)) {
    showErrorToast('Η χώρα προορισμού ΔΕΝ αποθηκεύτηκε — ο διακομιστής δεν έχει ακόμη το πεδίο. Γράψ’ την στις Σημειώσεις μέχρι τότε.', 'warn', 10000);
    if (typeof logError === 'function') logError(new Error('Destination Country not written'), 'submitPreorder');
  }
  _preClose();
  invalidateCache(TABLES.ORDERS);
  if (!unmarked.length && made.length === n) {
    const day = date.split('-').reverse().slice(0, 2).join('/');
    toast(recId ? 'Pre-order ενημερώθηκε ✓' : `${n} ${n === 1 ? 'pre-order καταχωρήθηκε' : 'pre-orders καταχωρήθηκαν'} · φόρτωση ${day}`);
  }
  await _preRepaint();
}

function editPreorder(recId) { return openPreorder(recId); }

// Owner 28/9: orders have no «Ακύρωση», only «Διαγραφή». A cancelled
// pre-order (order 394) stayed on Weekly/Daily as an ordinary order with its
// truck, and the team deletes anyway (24 deleted vs 1 cancelled). Delete = the
// order list's own delete (deleteIntlOrder: its confirm, cascade and 403
// message), not a second implementation — only the repaint follows the page.
function deletePreorder(recId) {
  return deleteIntlOrder(recId, { rerender: _preRepaint });
}

// Conversion from screens that hold only SOME fields (Daily Ops asks for a
// list): the form must open on the whole record, or the save would write the
// unknown checkboxes as false over whatever the row holds.
async function convertPreorder(recId) {
  let rec;
  try { rec = await atGetOne(TABLES.ORDERS, recId); } catch (e) { return; }
  openIntlEditWith(recId, rec.fields || {});
}

function _preRepaint() {
  const p = typeof currentPage !== 'undefined' ? currentPage : '';
  if (p === 'weekly_intl' && typeof renderWeeklyIntl === 'function') return renderWeeklyIntl();
  if (p === 'daily_ops' && typeof renderDailyOps === 'function') return renderDailyOps();
  if (p === 'orders_intl' && typeof renderOrdersIntl === 'function') return renderOrdersIntl();
}

// Tokens only (DESIGN.md #1). Levels: grey dashed → amber → solid red, the
// same three steps on the chip, the counter and the row edge.
function _preEnsureStyles() {
  if (document.getElementById('preStyles')) return;
  const s = document.createElement('style');
  s.id = 'preStyles';
  s.textContent = `
.pre-chip{display:inline-flex;align-items:center;height:18px;padding:0 6px;border-radius:var(--radius-full);font:700 10px 'DM Sans',sans-serif;letter-spacing:.04em;white-space:nowrap;border:1px dashed var(--border-dark);color:var(--text-mid);background:var(--surface-card);margin-right:4px}
.pre-chip.pre-amber{border:1px solid var(--warn);color:var(--warn);background:var(--warn-bg)}
.pre-chip.pre-red{border:1px solid var(--danger);color:var(--surface-card);background:var(--danger)}
.pre-count{font:700 12px 'DM Sans',sans-serif;border-radius:var(--radius);padding:6px 12px;cursor:pointer;white-space:nowrap;border:1px dashed var(--border-dark);color:var(--text-mid);background:var(--surface-card)}
.pre-count.pre-amber{border:1px solid var(--warn);color:var(--warn);background:var(--warn-bg)}
.pre-count.pre-red{border:1px solid var(--danger);color:var(--surface-card);background:var(--danger)}
.pre-count.on{outline:2px solid var(--surface-dark);outline-offset:2px}
.do-t tr.do-pre td{color:var(--text-dim)}
.do-t tr.do-pre td:first-child{box-shadow:inset 3px 0 0 var(--border-dark)}
.do-t tr.do-pre.pre-amber td:first-child{box-shadow:inset 3px 0 0 var(--warn)}
.do-t tr.do-pre.pre-red td:first-child{box-shadow:inset 4px 0 0 var(--danger)}
.do-zrow.do-pre{color:var(--text-dim)}
.pre-flash td,.wk3-row.pre-flash,.do-zrow.pre-flash,.wi2-card.pre-flash{outline:2px solid var(--accent);outline-offset:-2px}
.pre-f{margin-bottom:12px;flex:1;min-width:0}
.pre-lbl{display:block;font:700 10px 'DM Sans',sans-serif;letter-spacing:.06em;color:var(--text-mid);margin-bottom:6px}
.pre-row{display:flex;gap:12px}
.pre-seg{display:flex;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;height:38px}
.pre-seg-b{flex:1;border:0;background:var(--surface-card);color:var(--text-mid);font:500 13px 'DM Sans',sans-serif;cursor:pointer}
.pre-seg-b.on{background:var(--navy);color:var(--surface-card);font-weight:600}
.pre-step-row{display:flex;align-items:center;gap:12px}
.pre-step{display:flex;align-items:center;border:1px solid var(--border);border-radius:var(--radius);height:38px}
.pre-step button{width:36px;height:36px;border:0;background:none;font:500 16px 'DM Sans',sans-serif;color:var(--text-mid);cursor:pointer}
.pre-step input{width:40px;border:0;text-align:center;font:700 15px 'DM Sans',sans-serif;color:var(--text);background:none}
.pre-hint{font-size:11px;color:var(--text-dim);margin-top:4px}
.btn.pre-primary{background:var(--navy);border:1px solid var(--navy);color:var(--surface-card);font-weight:600}
.btn.pre-primary:hover{background:var(--accent-hover);border-color:var(--accent-hover)}
.btn.pre-outline{background:var(--surface-card);border:1px solid var(--border);color:var(--text)}
.pre-btn{background:var(--surface-card)!important;border:1px solid var(--accent)!important;color:var(--accent-text)!important}
.pre-card{border:1px dashed var(--border-dark)!important;background:var(--surface-card)!important}
.pre-card.pre-amber{border-color:var(--warn)!important}
.pre-card.pre-red{border-color:var(--danger)!important}
/* Inside a Weekly card the chip is a tile of the 9.5px family (variant A,
   owner 28/9), not the 18px list pill — same line box as the date chip. */
.wi2-card .pre-chip{height:12px;line-height:12px;padding:0 4px;font-size:9.5px;margin-right:4px;vertical-align:1px}
.wi-ctx-h{padding:8px 12px 4px;font:700 10px 'DM Sans',sans-serif;letter-spacing:.06em;color:var(--text-mid)}
.wi-ctx-i.pre-go{color:var(--accent-text)}
.pre-pill{display:inline-flex;align-items:center;height:20px;padding:0 8px;border:1px dashed var(--border-dark);border-radius:var(--radius-full);font:700 10px 'DM Sans',sans-serif;color:var(--text-mid);background:var(--surface-card);white-space:nowrap}
.pre-pill.pre-amber{border-color:var(--warn);color:var(--warn)}
.pre-pill.pre-red{border-color:var(--danger);color:var(--danger)}
.pre-acts{display:flex;gap:6px;align-items:center}
.pre-act{height:26px;padding:0 10px;border-radius:var(--radius);background:var(--surface-card);font:600 12px 'DM Sans',sans-serif;cursor:pointer;white-space:nowrap;border:1px solid var(--accent);color:var(--accent-text)}
.pre-act.del{border-color:var(--danger);color:var(--danger)}
tr.oi-pre td{color:var(--text-dim)}
.pre-band{padding:8px 12px;margin-bottom:12px;border-radius:var(--radius);font-size:12px;line-height:1.5;border:1px dashed var(--border-dark);background:var(--surface-sunken);color:var(--text)}
.pre-band.pre-amber{border:1px solid var(--warn);background:var(--warn-bg)}
.pre-band.pre-red{border:1px solid var(--danger);background:var(--danger-bg)}`;
  document.head.appendChild(s);
}

/** Scroll to the first element and flash it — the counters' «πού είναι;». */
function preorderJump(selector) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('pre-flash');
  setTimeout(() => el.classList.remove('pre-flash'), 1800);
}

if (typeof window !== 'undefined') {
  Object.assign(window, { isPreorder, preorderLevel, preorderDest, preorderChipHtml, preorderCounterHtml, preorderConvertBand,
    preorderJump, openPreorder, editPreorder, submitPreorder, deletePreorder, convertPreorder, _preBtnLabel, _preClose, _preDir, _preStep, preorderTip, preorderPillHtml, preorderCountryText });
  // The page buttons («Pre-order», blue outline) render before any chip does.
  if (document.head) _preEnsureStyles();
}
