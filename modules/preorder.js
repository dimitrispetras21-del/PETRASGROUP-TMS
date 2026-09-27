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
  const lvl = preorderLevel(f);
  const bits = [`Pre-order — λείπουν σημεία φόρτωσης/παράδοσης`, _preWhen(f)];
  const dest = preorderDest(f);
  if (dest) bits.push('χώρα προορισμού: ' + dest);
  if (f['Notes']) bits.push('«' + String(f['Notes']) + '»');
  return `<span class="pre-chip pre-${lvl}" title="${escapeHtml(bits.join(' · '))}">PRE-ORDER${short ? '' : ' · ' + escapeHtml(_preWhen(f))}</span>`;
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
  const extra = [dest ? 'χώρα προορισμού: <b>' + escapeHtml(dest) + '</b>' : '', f['Notes'] ? '«' + escapeHtml(String(f['Notes'])) + '»' : ''].filter(Boolean).join(' · ');
  return `<div class="pre-band pre-${preorderLevel(f)}"><b>PRE-ORDER → παραγγελία.</b> Συμπλήρωσε σημεία και ημερομηνίες· με την αποθήκευση γίνεται κανονική παραγγελία (ίδια εγγραφή).${extra ? '<br>' + extra : ''}</div>`;
}

// ── Small form (create n / edit one) ──────────────────────────────
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
  const radio = (v, l) => `<label class="pre-radio"><input type="radio" name="pre_dir" value="${v}"${dir === v ? ' checked' : ''}> ${l}</label>`;
  const nOpts = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<option value="${n}">${n}</option>`).join('');
  const body = `
    <div class="pre-intro">Φορτίο που ανακοίνωσε ο πελάτης — σημεία και ώρες συμπληρώνονται στη μετατροπή σε παραγγελία.</div>
    <div class="form-grid">
      <div class="form-field span-2"><label class="form-label">Πελάτης *</label>${fhClientSelect('pre_client', cid, clabel)}</div>
      <div class="form-field"><label class="form-label">Κατεύθυνση *</label><div class="pre-radios">${radio('Export', 'Εξαγωγή')}${radio('Import', 'Εισαγωγή')}</div></div>
      <div class="form-field"><label class="form-label">Ημ. φόρτωσης *</label><input class="form-input" type="date" id="pre_date" value="${escapeHtml(toLocalDate(f['Loading DateTime'] || ''))}"></div>
      <div class="form-field"><label class="form-label">Χώρα προορισμού</label><select class="form-select" id="pre_country">${countryOptionsHtml(f['Destination Country'] || '')}</select><div class="pre-hint">όταν δεν ξέρουμε ακόμη το σημείο</div></div>
      ${recId ? '<div class="form-field"></div>' : `<div class="form-field"><label class="form-label">Πόσα φορτία;</label><select class="form-select" id="pre_n" onchange="_preBtnLabel()">${nOpts}</select></div>`}
      <div class="form-field span-2"><label class="form-label">Σημειώσεις</label><textarea class="form-textarea" id="pre_notes" rows="2" style="width:100%;resize:vertical" placeholder="π.χ. 2 φορτία Ιταλία, ώρες αύριο">${escapeHtml(f['Notes'] || '')}</textarea></div>
    </div>`;
  const footer = `<button class="btn btn-ghost" onclick="_preClose()">Άκυρο</button>
    <button class="btn btn-success" id="preSubmit" onclick="submitPreorder('${recId || ''}')">${recId ? 'Αποθήκευση pre-order' : 'Καταχώρηση pre-order'}</button>`;
  document.getElementById('modal').style.maxWidth = '560px';
  openModal(recId ? 'Επεξεργασία pre-order' : 'Pre-order', body, footer);
}
function _preBtnLabel() {
  const n = parseInt(document.getElementById('pre_n')?.value, 10) || 1;
  const b = document.getElementById('preSubmit');
  if (b) b.textContent = n > 1 ? `Καταχώρηση pre-order (${n})` : 'Καταχώρηση pre-order';
}
function _preClose() { document.getElementById('modal').style.maxWidth = ''; closeModal(); }

async function submitPreorder(recId) {
  const btn = document.getElementById('preSubmit');
  const clientId = document.getElementById('lv_pre_client')?.value || '';
  const dir = document.querySelector('input[name="pre_dir"]:checked')?.value || '';
  const date = document.getElementById('pre_date')?.value || '';
  const country = document.getElementById('pre_country')?.value || '';
  const notes = (document.getElementById('pre_notes')?.value || '').trim();
  const n = recId ? 1 : Math.min(9, Math.max(1, parseInt(document.getElementById('pre_n')?.value, 10) || 1));
  const miss = [];
  if (!clientId) miss.push('Πελάτης (επίλεξε από τη λίστα)');
  if (!dir) miss.push('Κατεύθυνση');
  if (!date) miss.push('Ημ. φόρτωσης');
  if (miss.length) { showErrorToast('Λείπουν: ' + miss.join(', '), 'warn', 6000); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Καταχώρηση…'; }
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
      if (res?.conflict) { toast('Η εγγραφή άλλαξε από άλλον χρήστη — κάνε Ανανέωση και ξαναδοκίμασε', 'warn'); return; }
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

// Cancel = the order list's own cancel (Status 'Cancelled' + downstream sync),
// not a second implementation. ops_status stays as the trace (22/9).
function cancelPreorder(recId) {
  return OrdersList.cancelOrder({
    recId, table: TABLES.ORDERS, source: 'intl', detailId: 'intlDetail', rerender: _preRepaint,
    confirmText: 'Ακύρωση του pre-order;\n\nΗ εγγραφή μένει ως Ακυρωμένη — δεν σβήνεται.',
    errorText: 'Η ακύρωση απέτυχε — δοκίμασε ξανά', logTag: 'cancelPreorder',
  });
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
.wk3.wi2 #wi-rows .wk3-row.wi2-pre{border-style:dashed;border-color:var(--border-dark);border-left-width:3px}
.wk3.wi2 #wi-rows .wk3-row.wi2-pre.pre-amber{border-color:var(--warn)}
.wk3.wi2 #wi-rows .wk3-row.wi2-pre.pre-red{border-color:var(--danger);border-left:4px solid var(--danger);background:var(--danger-bg)}
.do-t tr.do-pre td{color:var(--text-dim)}
.do-t tr.do-pre td:first-child{box-shadow:inset 3px 0 0 var(--border-dark)}
.do-t tr.do-pre.pre-amber td:first-child{box-shadow:inset 3px 0 0 var(--warn)}
.do-t tr.do-pre.pre-red td:first-child{box-shadow:inset 4px 0 0 var(--danger)}
.do-zrow.do-pre{color:var(--text-dim)}
.pre-flash td,.wk3-row.pre-flash,.do-zrow.pre-flash{outline:2px solid var(--accent);outline-offset:-2px}
.pre-intro{font-size:12px;color:var(--text-mid);margin-bottom:12px}
.pre-radios{display:flex;gap:16px;align-items:center;height:38px}
.pre-radio{display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer}
.pre-hint{font-size:11px;color:var(--text-dim);margin-top:4px}
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
    preorderJump, openPreorder, editPreorder, submitPreorder, cancelPreorder, convertPreorder, _preBtnLabel, _preClose });
}
