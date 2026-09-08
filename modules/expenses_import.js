// ═══════════════════════════════════════════════════════════════
// MODULE — ΕΙΣΑΓΩΓΗ DKV (Φ3 — η οθόνη)
// Spec: docs/superpowers/specs/2026-09-08-dkv-import-design.md
// Ανοίγει από modules/expenses.js («Εισαγωγή DKV» στην κεφαλίδα, accountant/
// owner) και επιστρέφει εκεί (καμία νέα διαδρομή στο core/router.js — απλώς
// αντικαθιστά το #content, όπως το ίδιο renderExpenses()). Prefix ei* ώστε
// τα globals να μη συγκρούονται με το ex* του modules/expenses.js.
//
// Ροή: ZIP → JSZip (lazy CDN) → pdf.js (core/scan-helpers.js _scanLoadPdfJs,
// ήδη global — ίδιο pattern με modules/pallet_upload.js) → ανά σελίδα
// DkvParser.pdfTextItemsToLines → POST /costs/import/parse → προεπισκόπηση →
// διορθώσεις → POST /costs/import/commit. Ο Worker (Φ2) δεν είναι ακόμη
// deployed σε αυτό το branch — το σχήμα αιτήματος/απάντησης ακολουθεί
// αυστηρά το spec §5/§3 ώστε να ταιριάζει όποτε γίνει deploy.
// ═══════════════════════════════════════════════════════════════
'use strict';

const _ei = {
  step: 'upload',            // 'upload' | 'reading' | 'uploading' | 'preview'
  zipName: null,
  progress: { done: 0, total: 0 },
  error: null,
  doc: null,                 // { id, zip_name, period_from, period_to, n_files, files_count }
  extractedFileCount: null,  // fallback for doc.files_count when the browser already knows (spec round 2 point 3)
  reconcile: null,           // { ok, per_doc:[{doc_no,country,diff,ok}], summary_total, lines_total }
  metrics: null,
  lines: [],                 // working copy: parser line + { id, selected, corrected, match }
  rules: [],                 // corrections marked «να ισχύει στο εξής»
  filter: 'all',             // category chip
  reviewMode: 'all',         // 'all' | 'decide' (round 2 point 2 — suggest+none only)
  groupOpen: {},             // plate (or '__NOVEHICLE__') → explicit open/collapsed override
  rtEditingId: null,         // line id whose round-trip cell is open for editing
  plateEditingId: null,      // line id whose «Σύνδεση με φορτηγό…» select is open (round 2 point 1)
  committing: false,
};

// Κατηγορίες του chip row (Figma 522:1011) — 'all' πρώτα, μετά οι πέντε πιο
// συχνές στα DKV παραστατικά (spec §1). 'other'/'spedition' κ.λπ. παραμένουν
// προσβάσιμες μέσω «Όλα», δεν χρειάζονται δικό τους chip.
const EI_CHIPS = [
  { key: 'all', label: 'Όλα' },
  { key: 'tolls', label: 'Διόδια' },
  { key: 'fuel', label: 'Καύσιμα' },
  { key: 'adblue', label: 'AdBlue' },
  { key: 'ferry_train', label: 'Γέφυρες/Φέρι' },
  { key: 'dkv', label: 'Τέλη DKV' },
];

function eiCatDotClass(cat) {
  if (cat === 'fuel' || cat === 'adblue' || cat === 'reefer_fuel') return 'ei-dot-amber';
  if (cat === 'tolls' || cat === 'ferry_train') return 'ei-dot-blue';
  if (cat === 'partner_rate') return 'ei-dot-green';
  return 'ei-dot-gray';
}

// Label override local to THIS screen only (round 2 point 3: «ferry_train →
// Γέφυρα/Φέρι»). CT_CATEGORY_LABELS (modules/costs.js) is shared with the
// TRIP PnL and the ενσωματωμένη Έξοδα Δρομολογίων screen — changing the
// shared map would rename the category everywhere those already-live
// screens show it, which nobody asked for (αρχή 3 cuts both ways: sharing
// the ONE map is right for the common case, but this one label is a
// DKV-import-screen-only wording choice, so it stays a thin wrapper here).
function eiCategoryLabel(cat) {
  if (cat === 'ferry_train') return 'Γέφυρα/Φέρι';
  return (typeof CT_CATEGORY_LABELS !== 'undefined' && CT_CATEGORY_LABELS[cat]) || cat;
}

// ═══════════════════ CSS ═══════════════════
// Πινακίδα: ΙΔΙΟ monospace stack με το modules/expenses.js .ex-plate
// (ui-monospace/SFMono/Menlo/Consolas), όχι νέα Google Font — προσθήκη
// εξωτερικής γραμματοσειράς είναι infra αλλαγή έξω από το αίτημα (CLAUDE.md
// PRIME DIRECTIVE), και το app έχει ήδη ΕΝΑ σχήμα «πινακίδα» (αρχή 3).
function eiStyles() {
  return `<style>
  .ei-page{font-family:'DM Sans',sans-serif;font-size:14px;color:var(--text);background:var(--surface-card);min-height:100%;padding-bottom:24px}
  .ei-head{display:flex;align-items:center;gap:12px;padding:0 24px;height:58px;border-bottom:1px solid var(--border)}
  .ei-back{background:none;border:0;color:var(--accent);font:inherit;font-size:13px;cursor:pointer;padding:0}
  .ei-title{font-family:'Syne',sans-serif;font-size:20px;font-weight:700}
  .ei-upload-zone{margin:24px;padding:48px 24px;border:2px dashed var(--border);border-radius:8px;text-align:center;cursor:pointer;color:var(--text-mid)}
  .ei-upload-zone.busy{cursor:default}
  .ei-upload-text{font-size:14px;font-weight:600;color:var(--text)}
  .ei-upload-hint{font-size:12px;color:var(--text-dim);margin-top:6px}
  .ei-progress-bar{width:240px;height:6px;border-radius:3px;background:var(--surface-sunken);margin:12px auto 0;overflow:hidden}
  .ei-progress-fill{height:100%;background:var(--accent);transition:width .15s}

  .ei-headrow{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 24px;border-bottom:1px solid var(--border)}
  .ei-headtitle{font-family:'Syne',sans-serif;font-size:18px;font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ei-headbtns{display:flex;gap:8px;flex:none}
  .ei-btn{height:36px;padding:0 16px;border-radius:6px;border:1px solid var(--border);background:var(--surface-card);font:inherit;font-size:13px;font-weight:600;cursor:pointer;color:var(--text)}
  .ei-btn-primary{background:var(--accent);border-color:var(--accent);color:#fff}
  .ei-btn-primary:disabled{background:var(--surface-sunken);border-color:var(--border);color:var(--text-dim);cursor:not-allowed}

  .ei-band{display:flex;align-items:stretch;padding:16px 24px;border-bottom:1px solid var(--border);gap:24px;flex-wrap:wrap}
  .ei-band-total{display:flex;flex-direction:column;gap:4px;padding-right:24px;border-right:1px solid var(--border)}
  .ei-band-total .v{font-family:'Syne',sans-serif;font-size:26px;font-weight:700;font-variant-numeric:tabular-nums}
  .ei-band-status{display:flex;align-items:center;font-size:12px;font-weight:600}
  .ei-band-status.ok{color:var(--ok)} .ei-band-status.bad{color:var(--danger)}
  .ei-metrics{display:flex;align-items:stretch;gap:0}
  .ei-metric{display:flex;flex-direction:column;gap:2px;justify-content:center;padding:0 16px;border-right:1px solid var(--border)}
  .ei-metric:last-child{border-right:0}
  .ei-metric .v{font-size:18px;font-weight:700;font-variant-numeric:tabular-nums}
  .ei-metric .k{font-size:11px;color:var(--text-mid)}
  .ei-metric.ei-m-ok .v{color:var(--ok)}
  .ei-metric.ei-m-suggest .v{color:var(--accent-text)}
  .ei-metric.ei-m-warn .v{color:var(--warn)}

  .ei-none-summary{padding:0 24px 12px;font-size:11px;color:var(--warn)}
  .ei-reviewrow{display:flex;gap:8px;padding:0 24px 12px}

  .ei-chiprow{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 24px;flex-wrap:wrap}
  .ei-chips{display:flex;gap:8px;flex-wrap:wrap}
  .ei-chip{height:28px;padding:0 12px;border-radius:9999px;border:1px solid var(--border);background:var(--surface-card);font:inherit;font-size:12px;cursor:pointer;color:var(--text-mid)}
  .ei-chip.sel{background:var(--accent-light);border-color:var(--accent);color:var(--accent-text);font-weight:600}
  .ei-chip-n{color:var(--text-dim)}
  .ei-chip.sel .ei-chip-n{color:var(--accent-text)}
  .ei-legend{display:flex;gap:14px;font-size:11px;color:var(--text-mid)}
  .ei-legend span{display:flex;align-items:center;gap:4px}

  .ei-dot{display:inline-block;width:8px;height:8px;border-radius:50%;flex:none;margin-right:6px;vertical-align:middle}
  .ei-dot-ok{background:var(--ok)} .ei-dot-suggest{background:var(--accent)} .ei-dot-warn{background:var(--warn)}
  .ei-dot-amber{background:var(--warn)} .ei-dot-blue{background:var(--accent)} .ei-dot-green{background:var(--ok)} .ei-dot-gray{background:var(--text-dim)}

  .ei-card{margin:0 24px;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--surface-card)}
  .ei-grouphead{display:flex;align-items:center;gap:10px;padding:10px 16px;background:var(--surface-sunken);border-bottom:1px solid var(--border);font-size:12px;color:var(--text-mid);flex-wrap:wrap}
  .ei-grouphead-none{color:var(--warn)}
  .ei-plate{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:700;letter-spacing:.02em;background:var(--navy);color:var(--text-on-dark);border-radius:4px;padding:2px 8px;font-size:13px}
  .ei-gname{font-weight:700;color:var(--text)}
  .ei-gnote{background:var(--warn-bg);color:var(--warn);border-radius:4px;padding:1px 8px;font-size:11px;font-weight:600}
  .ei-gcount{margin-left:auto;font-weight:600;color:var(--text)}
  .ei-gdates.dim{color:var(--text-dim)}

  /* Σειρά γραμμής: checkbox · ημ/νία · κατηγορία · χώρα · περιγραφή · λίτρα ·
     καθαρό · ΦΠΑ · δρομολόγιο · σύνδεσμος. minmax() στην περιγραφή κρατά την
     κάρτα μέσα στο πλάτος στα 1280px (ίδια λογική με modules/expenses.js
     .ex-line-grid — καμία οριζόντια κύλιση). */
  .ei-row{display:grid;grid-template-columns:24px 52px 130px 44px minmax(140px,1.4fr) 56px 76px 68px minmax(150px,1fr) 64px;gap:8px;align-items:center;padding:8px 16px;border-bottom:1px solid var(--border);font-size:12px}
  .ei-row:last-child{border-bottom:0}
  /* Subtle indent for a per-day split line under its parent passage-list
     transaction (spec round 2 point 3) — padding, not margin, so the grid's
     own column widths stay put and nothing shifts out of the card. */
  .ei-row.split{padding-left:28px}
  .ei-group-caret{margin-left:6px}
  .ei-row.unselected{opacity:.45}
  .ei-row.corrected{box-shadow:inset 3px 0 var(--accent)}
  .ei-row>div{min-width:0}
  .ei-cat{display:flex;align-items:center}
  /* padding-right: breathing room for the native <select> chevron, which
     otherwise sits right against the next grid column (verified visually —
     no stray character, just the browser's own dropdown arrow crowding the
     130px-wide category cell for short labels like «Διόδια»). */
  .ei-catselect{border:1px solid transparent;background:none;font:inherit;font-size:12px;color:var(--text);cursor:pointer;padding:0 10px 0 0;max-width:100%}
  .ei-catselect:hover{border-color:var(--border)}
  .ei-desc{overflow-wrap:break-word;word-break:break-word;color:var(--text-mid)}
  .ei-rtcell{display:flex;align-items:center;flex-wrap:wrap}
  .ei-caret{color:var(--text-dim);margin-left:4px}
  .ei-rowlink{text-align:right}
  .ei-link{background:none;border:0;color:var(--accent);font:inherit;font-size:11px;cursor:pointer;padding:0}
  .ei-rtedit{grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap;padding:6px 0 2px;border-top:1px dashed var(--border);margin-top:4px}
  .ei-rtedit select,.ei-rtedit input{height:28px;border:1px solid var(--border);border-radius:6px;padding:0 8px;font:inherit;font-size:12px}

  .ei-footer{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 24px;margin-top:12px;color:var(--text-mid);font-size:11px}
  .ei-footnote{max-width:70%}
  .ei-footsum{font-weight:700;color:var(--text);font-size:13px;white-space:nowrap}
  .n{font-variant-numeric:tabular-nums} .r{text-align:right} .s{font-size:12px} .dim{color:var(--text-dim)}
  </style>`;
}

// ═══════════════════ ΑΝΟΙΓΜΑ / ΑΚΥΡΟ ═══════════════════

function eiOpenImport() {
  if (!_ex.canWrite) return; // το κουμπί δεν εμφανίζεται καν χωρίς δικαίωμα — δεύτερος έλεγχος εδώ (αρχή 5)
  _ei.step = 'upload'; _ei.error = null; _ei.zipName = null;
  _ei.progress = { done: 0, total: 0 }; _ei.doc = null; _ei.reconcile = null;
  _ei.metrics = null; _ei.lines = []; _ei.rules = []; _ei.filter = 'all';
  _ei.reviewMode = 'all'; _ei.groupOpen = {}; _ei.extractedFileCount = null;
  _ei.rtEditingId = null; _ei.plateEditingId = null; _ei.committing = false;
  eiRenderShell();
}

function eiCancel() {
  if (_ei.step === 'preview' && !window.confirm('Άκυρο; Οι διορθώσεις δεν θα αποθηκευτούν.')) return;
  renderExpenses();
}

function eiRenderShell() {
  const c = document.getElementById('content');
  if (!c) return;
  c.style.padding = '0';
  c.innerHTML = eiStyles() + (_ei.step === 'preview' ? eiPreviewHtml() : eiUploadHtml());
}

// ═══════════════════ ΑΝΕΒΑΣΜΑ + ΕΞΑΓΩΓΗ ΚΕΙΜΕΝΟΥ ═══════════════════

function eiUploadHtml() {
  const busy = _ei.step === 'reading' || _ei.step === 'uploading';
  const label = _ei.step === 'reading'
    ? ('Διαβάζω ' + _ei.progress.done + '/' + (_ei.progress.total || '?') + '…')
    : (_ei.step === 'uploading' ? 'Αποστολή…' : null);
  const pct = _ei.progress.total ? Math.round(_ei.progress.done / _ei.progress.total * 100) : 0;
  return `<div class="ei-page">
    <div class="ei-head"><button class="ei-back" onclick="eiCancel()">← Έξοδα Δρομολογίων</button><span class="ei-title">Εισαγωγή DKV</span></div>
    ${_ei.error ? showError(_ei.error) : ''}
    <div class="ei-upload-zone${busy ? ' busy' : ''}" ${busy ? '' : 'onclick="document.getElementById(\'eiFileInput\').click()"'}>
      <input type="file" id="eiFileInput" accept=".zip" style="display:none" onchange="eiHandleZipFile(this.files[0])"${busy ? ' disabled' : ''}>
      <div class="ei-upload-text">${label ? escapeHtml(label) : 'Σύρε το ZIP της DKV εδώ, ή κάνε κλικ για επιλογή'}</div>
      ${label ? `<div class="ei-progress-bar"><div class="ei-progress-fill" style="width:${pct}%"></div></div>` : '<div class="ei-upload-hint">.ZIP από την DKV — μηνιαία παραστατικά</div>'}
    </div>
  </div>`;
}

async function eiHandleZipFile(file) {
  if (!file) return;
  _ei.zipName = file.name; _ei.error = null;
  _ei.step = 'reading'; _ei.progress = { done: 0, total: 0 };
  eiRenderShell();
  try {
    const files = await eiExtractZipFiles(file, (done, total) => { _ei.progress = { done, total }; eiRenderProgress(); });
    await eiSendParse(file, files);
  } catch (e) {
    _ei.step = 'upload';
    _ei.error = 'Η ανάγνωση του ZIP απέτυχε: ' + ((e && e.message) || String(e));
    eiRenderShell();
  }
}

function eiRenderProgress() {
  const bar = document.querySelector('.ei-progress-fill');
  const txt = document.querySelector('.ei-upload-text');
  if (bar && txt) {
    txt.textContent = 'Διαβάζω ' + _ei.progress.done + '/' + (_ei.progress.total || '?') + '…';
    bar.style.width = (_ei.progress.total ? Math.round(_ei.progress.done / _ei.progress.total * 100) : 0) + '%';
  } else {
    eiRenderShell();
  }
}

let _eiJsZipLoaded = null;
function eiLoadJSZip() {
  if (_eiJsZipLoaded) return _eiJsZipLoaded;
  _eiJsZipLoaded = new Promise((res, rej) => {
    if (window.JSZip) { res(window.JSZip); return; }
    const s = document.createElement('script');
    // Same CDN host as pdf.js (core/scan-helpers.js:175) — the only two
    // allowed for external <script> in this app (CLAUDE.md build rules).
    s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
    s.onload = () => res(window.JSZip);
    s.onerror = () => rej(new Error('JSZip failed to load'));
    document.head.appendChild(s);
  });
  return _eiJsZipLoaded;
}

/**
 * ZIP → [{name, text}], κείμενο ΜΟΝΟ από pdf.js (spec §2) — ίδιο ακριβώς
 * μονοπάτι με tests/dkv/extract.js (Node), ώστε ο parser να βλέπει τις ΙΔΙΕΣ
 * γραμμές στην οθόνη και στα τεστ.
 *
 * Test hook: window.__eiInjectFiles παρακάμπτει JSZip/pdf.js — το Playwright
 * δεν μπορεί να φτιάξει πραγματικά DKV PDF, βλ. tests/critics/
 * expenses-import-proof.js. ΜΟΝΟ για τεστ· δεν υπάρχει σε production χρήση.
 */
async function eiExtractZipFiles(file, onProgress) {
  if (window.__eiInjectFiles) return window.__eiInjectFiles;
  const JSZipLib = await eiLoadJSZip();
  const buf = await file.arrayBuffer();
  const zip = await JSZipLib.loadAsync(buf);
  const entries = Object.keys(zip.files)
    .map((k) => zip.files[k])
    .filter((f) => !f.dir && /\.pdf$/i.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const pdfjs = await _scanLoadPdfJs();
  const out = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const ab = await entry.async('arraybuffer');
    const doc = await pdfjs.getDocument({ data: ab }).promise;
    const pageLines = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();
      pageLines.push(DkvParser.pdfTextItemsToLines(textContent, viewport));
    }
    out.push({ name: entry.name, text: pageLines.flat().join('\n') });
    if (onProgress) onProgress(i + 1, entries.length);
  }
  return out;
}

function eiArrayBufferToBase64(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const EI_MAX_INLINE_ZIP = 8 * 1024 * 1024;

async function eiSendParse(file, files) {
  _ei.step = 'uploading';
  // Fallback for the title's file count when doc.files_count is absent
  // (spec round 2 point 3) — the browser already knows how many files it
  // extracted from the ZIP, independent of whatever the server echoes back.
  _ei.extractedFileCount = files.length;
  eiRenderShell();
  const body = { source: 'DKV', zip_name: _ei.zipName, files };
  try {
    const buf = await file.arrayBuffer();
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    body.zip_sha256 = Array.prototype.map.call(new Uint8Array(hashBuf), (b) => b.toString(16).padStart(2, '0')).join('');
    if (buf.byteLength <= EI_MAX_INLINE_ZIP) {
      body.zip_base64 = eiArrayBufferToBase64(buf);
    } else {
      // Spec §5: πάνω από 8 MB στέλνεται χωρίς zip_base64 — ο Worker κρατά μόνο
      // το κείμενο/hash, το ίδιο το ZIP δεν αποθηκεύεται σε αυτή την περίπτωση.
      _ei.error = null;
    }
  } catch (e) {
    // Το hashing/base64 απέτυχε (π.χ. παλιό browser χωρίς SubtleCrypto στο
    // http) — προχωράμε χωρίς sha256/zip_base64 αντί να μπλοκάρουμε ολόκληρη
    // την εισαγωγή· ο Worker θα δει zip_sha256:undefined και θα το χειριστεί
    // ως «χωρίς έλεγχο διπλοεγγραφής» (spec §5 409 μόνο όταν υπάρχει sha256).
  }
  let res;
  try {
    res = await ctFetch('/costs/import/parse', { method: 'POST', body });
  } catch (e) {
    _ei.step = 'upload';
    _ei.error = (e && e.message) || String(e);
    eiRenderShell();
    return;
  }
  eiLoadParseResult(res);
}

function eiLoadParseResult(res) {
  _ei.doc = (res && res.doc) || null;
  _ei.reconcile = (res && res.reconcile) || { ok: false, summary_total: null, lines_total: 0, per_doc: [] };
  _ei.metrics = (res && res.metrics) || {};
  // Ids είναι ΠΑΝΤΑ ακέραιοι δείκτες (idx), όχι ό,τι στείλει ο server: κάθε
  // onclick="...(${l.id})" παρακάτω γράφει τον αριθμό σκέτο μέσα στο HTML
  // (π.χ. onclick="eiToggleLine(3)") — ένα string id θα γινόταν αδήλωτο
  // identifier (eiToggleLine(c1)) και θα έσκαγε σιωπηλά στο κλικ. Το spec §3
  // δεν ορίζει καν πεδίο "id" στη γραμμή· αν ο server στείλει ένα, αγνοείται
  // εδώ επίτηδες υπέρ ενός εγγυημένα ασφαλούς ακέραιου.
  _ei.lines = ((res && res.lines) || []).map((l, idx) => Object.assign({}, l, {
    id: idx,
    selected: true,
    corrected: false,
    match: eiNormalizeMatch(l),
  }));
  _ei.rules = [];
  _ei.filter = 'all';
  _ei.reviewMode = 'all';
  // Collapse default is decided ONCE, here, and stored explicitly per group —
  // NOT recomputed on every render from current line state. Recomputing it
  // meant correcting a suggest line to sure could flip its group to «all
  // sure» mid-click and collapse the very row the user just corrected, right
  // out from under them. Freezing it at load time keeps a group's open/closed
  // state stable through corrections; only the ⌄ caret changes it after this.
  _ei.groupOpen = eiInitialGroupOpen(_ei.lines);
  _ei.rtEditingId = null;
  _ei.plateEditingId = null;
  _ei.step = 'preview';
  eiRenderShell();
}

// ═══════════════════ ΠΡΟΕΠΙΣΚΟΠΗΣΗ ═══════════════════

function eiSelectedCount() { return _ei.lines.filter((l) => l.selected).length; }
function eiLineGross(l) { return Number(l.gross_eur != null ? l.gross_eur : (l.gross || 0)); }

function eiPreviewHtml() {
  const doc = _ei.doc || {};
  const rec = _ei.reconcile || {};
  // doc.files_count (new field, spec round 2 point 3) wins; doc.n_files kept
  // for whatever shape the Worker sends before it ships; last resort is the
  // count the browser itself extracted from the ZIP — always known.
  const nFiles = doc.files_count != null ? doc.files_count
    : (doc.n_files != null ? doc.n_files
      : (_ei.extractedFileCount != null ? _ei.extractedFileCount : '—'));
  const period = doc.period_from && doc.period_to ? (exDate(doc.period_from) + '–' + exDate(doc.period_to)) : '';
  const titleLine = 'Εισαγωγή DKV · ' + (_ei.zipName || doc.zip_name || '—') + ' · ' + nFiles + ' αρχεία' + (period ? ' · περίοδος ' + period : '');
  const selCount = eiSelectedCount();
  const commitDisabled = !rec.ok || selCount === 0 || _ei.committing;
  return `<div class="ei-page">
    <div class="ei-headrow">
      <div class="ei-headtitle" title="${escapeHtml(titleLine)}">${escapeHtml(titleLine)}</div>
      <div class="ei-headbtns">
        <button class="ei-btn" onclick="eiCancel()">Άκυρο</button>
        <button class="ei-btn ei-btn-primary" id="eiCommitBtn" ${commitDisabled ? 'disabled' : ''} onclick="eiCommit()">Καταχώρηση ${selCount} γραμμών</button>
      </div>
    </div>
    ${eiReconcileBandHtml()}
    ${eiNoneReasonSummaryHtml()}
    ${eiReviewToggleHtml()}
    ${eiChipsRowHtml()}
    <div class="ei-card">${eiGroupsHtml()}</div>
    ${eiFooterHtml()}
  </div>`;
}

function eiReconcileBandHtml() {
  const rec = _ei.reconcile || {};
  const perDoc = rec.per_doc || [];
  const total = _ei.lines.filter((l) => l.selected).reduce((a, l) => a + eiLineGross(l), 0);
  const ok = !!rec.ok;
  const okCount = perDoc.filter((d) => d.ok).length;
  const statusText = ok
    ? ('ταυτίζεται με το E-SUMMARY της DKV — ' + okCount + '/' + perDoc.length + ' έγγραφα')
    : ('Δεν συμφωνεί: ' + (perDoc.filter((d) => !d.ok).map((d) => (d.doc_no || '—') + ' ' + exEur(d.diff)).join(', ') || 'δείτε παραστατικά'));
  const vehicles = new Set(_ei.lines.map((l) => l.plate).filter(Boolean)).size;
  const sure = _ei.lines.filter((l) => l.match.status === 'sure').length;
  const suggest = _ei.lines.filter((l) => l.match.status === 'suggest').length;
  const none = _ei.lines.filter((l) => l.match.status === 'none').length;
  return `<div class="ei-band">
    <div class="ei-band-total">
      <div class="v">${exEur(total)}</div>
      <div class="ei-band-status ${ok ? 'ok' : 'bad'}"><span class="ei-dot ${ok ? 'ei-dot-ok' : 'ei-dot-warn'}" style="${ok ? '' : 'background:var(--danger)'}"></span>${escapeHtml(statusText)}</div>
    </div>
    <div class="ei-metrics">
      <div class="ei-metric"><div class="v">${_ei.lines.length}</div><div class="k">γραμμές</div></div>
      <div class="ei-metric"><div class="v">${vehicles}</div><div class="k">οχήματα/δρομολόγια</div></div>
      <div class="ei-metric ei-m-ok"><div class="v">${sure}</div><div class="k">σίγουρες</div></div>
      <div class="ei-metric ei-m-suggest"><div class="v">${suggest}</div><div class="k">προτάσεις</div></div>
      <div class="ei-metric ei-m-warn"><div class="v">${none}</div><div class="k">χωρίς δρομολόγιο</div></div>
    </div>
  </div>`;
}

// «47 χωρίς δρομολόγιο: 18 γενικά τέλη · 1 άγνωστη πινακίδα · 28 χωρίς
// διαδρομή εκείνη την ημέρα» (spec round 2 point 1) — counted client-side
// from the flat `none_reason` field so the reason is visible ΠΡΙΝ ανοίξει
// κανείς κάθε γραμμή μία-μία (αρχή 1: ό,τι δεν γίνεται πρέπει να ακούγεται).
// none_reason may be absent (Worker Φ2 not deployed yet) — every line just
// falls out of all four buckets and the sentence quietly shows 0 reasons,
// never crashes.
function eiNoneReasonCounts() {
  const counts = { general_fee: 0, unknown_plate: 0, no_rt_on_date: 0, no_plate: 0 };
  for (const l of _ei.lines) {
    if (l.match.status !== 'none') continue;
    const r = l.none_reason;
    if (r && Object.prototype.hasOwnProperty.call(counts, r)) counts[r]++;
  }
  return counts;
}

function eiNoneReasonSummaryHtml() {
  const noneTotal = _ei.lines.filter((l) => l.match.status === 'none').length;
  if (!noneTotal) return '';
  const c = eiNoneReasonCounts();
  const parts = [];
  if (c.general_fee) parts.push(c.general_fee + ' γενικ' + (c.general_fee === 1 ? 'ό τέλος' : 'ά τέλη'));
  if (c.unknown_plate) parts.push(c.unknown_plate + ' άγνωστ' + (c.unknown_plate === 1 ? 'η πινακίδα' : 'ες πινακίδες'));
  if (c.no_rt_on_date) parts.push(c.no_rt_on_date + ' χωρίς διαδρομή εκείνη την ημέρα');
  if (c.no_plate) parts.push(c.no_plate + ' χωρίς όχημα στο παραστατικό');
  if (!parts.length) return ''; // none_reason absent for all of them — nothing specific to say yet
  return `<div class="ei-none-summary">${noneTotal} χωρίς δρομολόγιο: ${escapeHtml(parts.join(' · '))}</div>`;
}

// «Όλα» / «Θέλουν απόφαση» (spec round 2 point 2) — a second, independent
// filter on top of the category chips: decide-mode hides every already-sure
// line so 269 γραμμές don't have to be scanned one by one to find the ~100
// that actually need a human. Same chip visual language as EI_CHIPS below.
function eiReviewToggleHtml() {
  const need = _ei.lines.filter((l) => l.match.status !== 'sure').length;
  return `<div class="ei-reviewrow">
    <button class="ei-chip${_ei.reviewMode === 'all' ? ' sel' : ''}" onclick="eiSetReviewMode('all')">Όλα <span class="ei-chip-n">${_ei.lines.length}</span></button>
    <button class="ei-chip${_ei.reviewMode === 'decide' ? ' sel' : ''}" onclick="eiSetReviewMode('decide')">Θέλουν απόφαση <span class="ei-chip-n">${need}</span></button>
  </div>`;
}

function eiSetReviewMode(mode) { _ei.reviewMode = mode; eiRenderShell(); }

function eiChipsRowHtml() {
  const counts = {};
  _ei.lines.forEach((l) => { counts[l.category] = (counts[l.category] || 0) + 1; });
  const chips = EI_CHIPS.map((ch) => {
    const n = ch.key === 'all' ? _ei.lines.length : (counts[ch.key] || 0);
    return `<button class="ei-chip${_ei.filter === ch.key ? ' sel' : ''}" onclick="eiSetFilter('${ch.key}')">${escapeHtml(ch.label)} <span class="ei-chip-n">${n}</span></button>`;
  }).join('');
  return `<div class="ei-chiprow">
    <div class="ei-chips">${chips}</div>
    <div class="ei-legend">
      <span><span class="ei-dot ei-dot-ok"></span>Σίγουρο</span>
      <span><span class="ei-dot ei-dot-suggest"></span>Πρόταση</span>
      <span><span class="ei-dot ei-dot-warn"></span>Χωρίς δρομολόγιο</span>
    </div>
  </div>`;
}

function eiSetFilter(key) { _ei.filter = key; eiRenderShell(); }

function eiGroupsHtml() {
  const groups = new Map();
  const order = [];
  for (const l of _ei.lines) {
    const key = l.plate || '__NOVEHICLE__';
    if (!groups.has(key)) { groups.set(key, []); order.push(key); }
    groups.get(key).push(l);
  }
  // «Χωρίς όχημα» πάντα τελευταία (Figma: last group), οι υπόλοιπες αλφαβητικά.
  order.sort((a, b) => (a === '__NOVEHICLE__' ? 1 : 0) - (b === '__NOVEHICLE__' ? 1 : 0) || a.localeCompare(b));
  const html = order.map((key) => {
    const groupLines = groups.get(key);
    // Δύο ανεξάρτητα φίλτρα μαζί (spec round 2 point 2): η κατηγορία (chip)
    // ΚΑΙ το review mode («Θέλουν απόφαση» = ό,τι δεν είναι ήδη σίγουρο). Μια
    // ομάδα εξαφανίζεται όταν δεν έχει καμία γραμμή που περνά και τα δύο.
    const visible = groupLines.filter((l) =>
      (_ei.filter === 'all' || l.category === _ei.filter) &&
      (_ei.reviewMode === 'all' || l.match.status !== 'sure'));
    if (!visible.length) return '';
    return key === '__NOVEHICLE__' ? eiNoVehicleGroupHtml(key, groupLines, visible) : eiVehicleGroupHtml(key, groupLines, visible);
  }).join('');
  return html || showEmpty({ title: 'Καμία γραμμή σε αυτή την κατηγορία', description: '' });
}

// Ομάδα «όλες σίγουρες» — καμία απόφαση δεν χρειάζεται εκεί, άρα κλείνει από
// μόνη της (spec round 2 point 2). Ρητή επιλογή του χρήστη (_ei.groupOpen)
// νικά πάντα το default, ίδιο μοτίβο με το ctWeekIsOpen (modules/costs.js).
function eiGroupAllSure(groupLines) {
  return groupLines.length > 0 && groupLines.every((l) => l.match.status === 'sure');
}
// Computed once, right after a parse response loads — see the comment at its
// only call site (eiLoadParseResult) for why this must NOT be recomputed on
// every render.
function eiInitialGroupOpen(lines) {
  const groups = {};
  for (const l of lines) {
    const key = l.plate || '__NOVEHICLE__';
    (groups[key] = groups[key] || []).push(l);
  }
  const open = {};
  for (const key in groups) open[key] = !eiGroupAllSure(groups[key]);
  return open;
}
function eiGroupIsOpen(key) {
  // A key that didn't exist at load time (e.g. a plate-link correction moved
  // a line into a plate group nobody had seen yet) starts open — it's mid
  // correction, the last thing it should do is hide itself.
  return Object.prototype.hasOwnProperty.call(_ei.groupOpen, key) ? _ei.groupOpen[key] : true;
}
function eiToggleGroup(key) {
  _ei.groupOpen[key] = !eiGroupIsOpen(key);
  eiRenderShell();
}
// key is a plate string (or the fixed '__NOVEHICLE__' token) embedded inside
// a single-quoted onclick attribute — escape both characters that would break
// out of it (a literal apostrophe is not something a real plate contains, but
// this stays correct instead of assuming that).
function eiJsStr(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

function eiVehicleGroupHtml(plate, allLines, visibleLines) {
  const total = allLines.reduce((a, l) => a + eiLineGross(l), 0);
  const allSure = eiGroupAllSure(allLines);
  const open = eiGroupIsOpen(plate);
  const sureLine = allLines.find((l) => l.match.status === 'sure' && l.match.rt_id);
  const rt = sureLine ? _ex.rts.find((r) => r.id === sureLine.match.rt_id) : null;
  const driver = rt ? exPersonName(rt) : '';
  const dates = rt ? exDateRange(rt.date_start, rt.date_end) : '';
  const head = `<div class="ei-grouphead" onclick="eiToggleGroup('${eiJsStr(plate)}')" style="cursor:pointer">
    <span class="ei-plate">${escapeHtml(plate)}</span>
    ${driver ? `<span>${escapeHtml(driver)}</span>` : ''}
    ${rt ? `<span>${escapeHtml(dates)}${rt.route_text ? ' · ' + escapeHtml(rt.route_text) : ''}</span>` : '<span class="ei-gdates dim">Χωρίς δρομολόγιο</span>'}
    <span class="ei-gcount">${allLines.length} γραμμές · ${exEur(total)}${allSure ? ' · όλες σίγουρες' : ''}</span>
    <span class="ei-caret ei-group-caret">${open ? '⌃' : '⌄'}</span>
  </div>`;
  return open ? head + visibleLines.map(eiLineRowHtml).join('') : head;
}

function eiNoVehicleGroupHtml(key, allLines, visibleLines) {
  const total = allLines.reduce((a, l) => a + eiLineGross(l), 0);
  const allSure = eiGroupAllSure(allLines);
  const open = eiGroupIsOpen(key);
  const head = `<div class="ei-grouphead ei-grouphead-none" onclick="eiToggleGroup('${key}')" style="cursor:pointer">
    <span class="ei-gname">Χωρίς όχημα · Γενικά τέλη DKV</span>
    <span class="ei-gnote">Χωρίς δρομολόγιο · γενικά έξοδα</span>
    <span class="ei-gcount">${allLines.length} γραμμές · ${exEur(total)}${allSure ? ' · όλες σίγουρες' : ''}</span>
    <span class="ei-caret ei-group-caret">${open ? '⌃' : '⌄'}</span>
  </div>`;
  return open ? head + visibleLines.map(eiLineRowHtml).join('') : head;
}

// Κατηγορία ως <select> (όχι click-to-reveal): η διόρθωση είναι μία ενέργεια
// (change), ίδιο μοτίβο με exEdCategoryChange (modules/expenses.js) — καμία
// δεύτερη σύμβαση για το ίδιο πράγμα (αρχή 3).
function eiCategorySelectHtml(l) {
  const cats = (typeof EX_CATEGORIES !== 'undefined') ? EX_CATEGORIES : [l.category];
  const opts = cats.map((c) => `<option value="${c}"${l.category === c ? ' selected' : ''}>${escapeHtml(eiCategoryLabel(c))}</option>`).join('');
  return `<select class="ei-catselect" onchange="eiChangeCategory(${l.id}, this.value)">${opts}</select>`;
}

// Περιγραφή: σταθμός/προϊόν + τιμή μονάδας στο ΝΟΜΙΣΜΑ ΤΟΥ ΠΑΡΑΣΤΑΤΙΚΟΥ, με
// μετατροπή σε EUR δίπλα όταν δεν είναι ήδη EUR (spec round 2 point 3 — πριν
// έδειχνε πάντα «€» ακόμη και για HUF, χωρίς ισοτιμία). Οι γραμμές split ανά
// διέλευση (spec round 2 point 1, νέα πεδία `sub`/`passages_count`) παίρνουν
// τη δική τους γραμμή περιγραφής· ο parser κρατά τα passages groups
// ξεχωριστά από τα lines (core/dkv-parser.js parseDkv) — η ένωση αυτή γίνεται
// ΜΟΝΟ εδώ, πληροφοριακά, όχι μέρος της συμφωνίας (§6 gate #1).
function eiDescription(l) {
  const parts = [];
  if (l.station) parts.push(escapeHtml(l.station) + (l.city ? ', ' + escapeHtml(l.city) : ''));
  else if (l.product) parts.push(escapeHtml(l.product));
  if (l.unit_price != null && l.unit) {
    const cur = l.currency || 'EUR';
    const priceTxt = Number(l.unit_price).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    parts.push(priceTxt + ' ' + escapeHtml(cur) + '/' + escapeHtml(l.unit));
    if (cur !== 'EUR' && l.fx_rate) {
      parts.push('→ EUR ισοτιμία ' + Number(l.fx_rate).toLocaleString('el-GR', { maximumFractionDigits: 6 }));
    }
  }
  if (l.sub != null) {
    parts.push('↳ από λίστα διελεύσεων · ' + (l.passages_count != null ? l.passages_count : '—') + ' διελεύσεις');
  }
  return parts.join(' · ') || '—';
}

function eiLineRowHtml(l) {
  const dateTxt = l.service_date ? exDate(l.service_date) : (l.period_from ? exDate(l.period_from) + '–' + exDate(l.period_to) : '—');
  const litersTxt = l.quantity != null && /LTR|л\./i.test(l.unit || '') ? Number(l.quantity).toLocaleString('el-GR', { maximumFractionDigits: 2 }) : '';
  const linkLabel = eiActionLabel(l);
  const isSplit = l.sub != null; // spec round 2 point 1/3: per-day split line
  // «ημέρα διαδρομής» hover hint (round 2 point 3): title="" only, no visible
  // text — the row is already busy, and this is a secondary detail.
  const dateTitle = l.service_date_source === 'passages' ? ' title="ημέρα διαδρομής"' : '';
  const linkOnclick = l.match.status === 'none' && l.none_reason === 'unknown_plate' ? 'eiTogglePlateEditor' : 'eiToggleRtEditor';
  const row = `<div class="ei-row${l.corrected ? ' corrected' : ''}${!l.selected ? ' unselected' : ''}${isSplit ? ' split' : ''}">
    <input type="checkbox" ${l.selected ? 'checked' : ''} onchange="eiToggleLine(${l.id})">
    <div class="s"${dateTitle}>${dateTxt}</div>
    <div class="ei-cat"><span class="ei-dot ${eiCatDotClass(l.category)}"></span>${eiCategorySelectHtml(l)}</div>
    <div class="s">${escapeHtml(l.country || '—')}</div>
    <div class="s ei-desc">${eiDescription(l)}</div>
    <div class="n r">${litersTxt}</div>
    <div class="n r">${exEur(l.net_eur != null ? l.net_eur : l.net)}</div>
    <div class="n r dim">${exEur(l.vat_eur != null ? l.vat_eur : l.vat)}</div>
    <div class="ei-rtcell">${eiRtCellHtml(l)}</div>
    <div class="ei-rowlink">${linkLabel ? `<button class="ei-link" onclick="${linkOnclick}(${l.id})">${escapeHtml(linkLabel)}</button>` : ''}</div>
  </div>`;
  return row + (_ei.rtEditingId === l.id ? eiRtEditorHtml(l) : '') + (_ei.plateEditingId === l.id ? eiPlateEditorHtml(l) : '');
}

// Κείμενο ΓΙΑΤΙ + σωστή ενέργεια ανά none_reason (spec round 2 point 1) —
// αντικαθιστά το γυμνό «Χωρίς δρομολόγιο», που δεν έλεγε τίποτα για το τι να
// κάνει κανείς (αρχή 1). none_reason απόν (Worker Φ2 δεν έχει γίνει ακόμη
// deploy) → η παλιά, γενική εμφάνιση.
function eiRtCellHtml(l) {
  const m = l.match || { status: 'none' };
  if (m.status === 'sure' && m.rt_id) {
    const rt = _ex.rts.find((r) => r.id === m.rt_id);
    const label = rt ? (exDateRange(rt.date_start, rt.date_end) + ' · ' + exPersonName(rt)) : ('RT #' + m.rt_id);
    return `<span class="ei-dot ei-dot-ok"></span><span class="s">${escapeHtml(label)}</span>`;
  }
  if (m.status === 'suggest') {
    const cand = (m.candidates || [])[0];
    const label = cand ? (exDateRange(cand.date_start, cand.date_end) + ' · ' + (cand.driver || cand.plate || '')) : 'Πρόταση';
    return `<span class="ei-dot ei-dot-suggest"></span><span class="s">${escapeHtml(label)}<span class="ei-caret">⌄</span></span>`;
  }
  const reason = l.none_reason || (m.general ? 'general_fee' : null);
  if (reason === 'general_fee') {
    return `<span class="ei-dot ei-dot-warn"></span><span class="s dim">Γενικό τέλος DKV · δεν χρεώνεται σε δρομολόγιο</span>`;
  }
  if (reason === 'unknown_plate') {
    return `<span class="ei-dot ei-dot-warn"></span><span class="s">Άγνωστη πινακίδα ${escapeHtml(l.plate || '—')}</span>`;
  }
  if (reason === 'no_rt_on_date') {
    return `<span class="ei-dot ei-dot-warn"></span><span class="s">Καμία διαδρομή του ${escapeHtml(l.plate || '—')} την ${escapeHtml(exDate(l.service_date))}<br><span class="ei-gnote">Πιθανό δρομολόγιο που δεν καταχωρήθηκε</span></span>`;
  }
  if (reason === 'no_plate') {
    return `<span class="ei-dot ei-dot-warn"></span><span class="s dim">Χωρίς όχημα στο παραστατικό</span>`;
  }
  return `<span class="ei-dot ei-dot-warn"></span><span class="s dim">Χωρίς δρομολόγιο</span>`;
}

// Ετικέτα του κουμπιού δεξιά — ίδια λογική με το eiRtCellHtml παραπάνω: το
// «γιατί» καθορίζει και τη σωστή ενέργεια, όχι μόνο το κείμενο (spec round 2
// point 1). Γενικό τέλος DKV: καμία ενέργεια — δεν έχει νόημα «δρομολόγιο».
function eiActionLabel(l) {
  const m = l.match || {};
  if (m.status === 'sure') return 'Αλλαγή';
  if (m.status === 'suggest') return 'Επιλογή';
  const reason = l.none_reason || (m.general ? 'general_fee' : null);
  if (reason === 'general_fee') return null;
  if (reason === 'unknown_plate') return 'Σύνδεση με φορτηγό…';
  if (reason === 'no_rt_on_date') return 'Επιλογή δρομολογίου…';
  return 'Επιλογή';
}

// Κλικ «Αλλαγή/Επιλογή» → 1) οι υποψήφιοι από το match.candidates (server),
// 2) «— άλλο (αναζήτηση) —» ανοίγει πεδίο κειμένου + πλήρη λίστα RT φιλτραρισμένη
// κατά πινακίδα/οδηγό (spec §3 «select of candidate RTs + "άλλο…" search»).
function eiToggleRtEditor(id) {
  _ei.rtEditingId = _ei.rtEditingId === id ? null : id;
  _ei.plateEditingId = null;
  eiRenderShell();
}

// «Σύνδεση με φορτηγό…» (spec round 2 point 1, reason=unknown_plate): η
// DKV αναγνώρισε μια πινακίδα που δεν υπάρχει στο _ex.lookups.trucks — π.χ.
// γράφτηκε λάθος στην κάρτα καυσίμων. Ο χρήστης διαλέγει το πραγματικό
// φορτηγό, η γραμμή ενημερώνεται και ΜΟΝΟ τότε ξαναπροτείνεται δρομολόγιο.
function eiTogglePlateEditor(id) {
  _ei.plateEditingId = _ei.plateEditingId === id ? null : id;
  _ei.rtEditingId = null;
  eiRenderShell();
}

function eiPlateEditorHtml(l) {
  const trucks = (_ex.lookups && _ex.lookups.trucks) || [];
  const opts = trucks.map((t) => `<option value="${t.id}">${escapeHtml(t.license_plate)}</option>`).join('');
  return `<div class="ei-rtedit">
    <select id="eiPlateSel_${l.id}" onchange="eiConfirmPlateLink(${l.id}, this.value)">
      <option value="" disabled selected>— σύνδεση με φορτηγό —</option>
      ${opts}
    </select>
  </div>`;
}

// Ξαναπροτείνει δρομολόγιο ΤΟΠΙΚΑ (χωρίς νέο αίτημα στον Worker) αφού
// συνδέθηκε το σωστό φορτηγό — ίδιο κριτήριο πλάκα+ημερομηνία με το Φ2
// matcher, εδώ όμως πάνω στο ήδη φορτωμένο _ex.rts (spec round 2 point 1
// «re-suggest RTs from _ex.rts for that truck/date client-side»).
function eiResuggestRtForLine(line) {
  const day = line.service_date || line.period_from;
  const cands = (_ex.rts || []).filter((r) => r.truck_id === line.truck_id && day && r.date_start <= day && (r.date_end || r.date_start) >= day);
  if (cands.length === 1) {
    line.match = { status: 'sure', rt_id: cands[0].id, candidates: [] };
    line.none_reason = null;
  } else if (cands.length > 1) {
    line.match = { status: 'suggest', rt_id: cands[0].id, candidates: cands.map((r) => ({ rt_id: r.id, plate: line.plate, driver: exPersonName(r), date_start: r.date_start, date_end: r.date_end })) };
    line.none_reason = null;
  } else {
    line.match = { status: 'none', rt_id: null, candidates: [] };
    line.none_reason = 'no_rt_on_date';
  }
}

function eiConfirmPlateLink(lineId, truckIdStr) {
  if (!truckIdStr) return;
  const line = _ei.lines.find((l) => l.id === lineId);
  const truck = ((_ex.lookups && _ex.lookups.trucks) || []).find((t) => t.id === Number(truckIdStr));
  if (!line || !truck) return;
  const rawPlate = line.plate; // key of the rule — the UNRECOGNIZED plate as read off the DKV card, not the truck's own plate
  line.truck_id = truck.id;
  line.plate = truck.license_plate;
  line.corrected = true;
  _ei.plateEditingId = null;
  eiResuggestRtForLine(line);
  if (window.confirm('Να ισχύει στο εξής για ' + rawPlate + ';')) {
    _ei.rules.push({ kind: 'plate', key: rawPlate, value: { truck_id: truck.id } });
  }
  eiRenderShell();
}

// The Worker spreads the match FLAT onto the line (match:'sure'|'suggest'|'none',
// rt_id, alternatives:[rt ids], general) — import-rules.mjs matchRoundTrip. The
// screen works with one object per line ({status, rt_id, candidates[]}) so the
// editor can list candidates with plate/driver/dates. Live test 8/9 14:05: with
// the raw flat shape every one of 269 lines rendered «Χωρίς δρομολόγιο» although
// the server had matched 162 — this is the single translation point.
function eiNormalizeMatch(l) {
  if (l.match && typeof l.match === 'object') return l.match;
  const status = typeof l.match === 'string' ? l.match : 'none';
  const rtInfo = (id) => {
    const r = (_ex.rts || []).find((x) => x.id === id);
    if (!r) return { rt_id: id };
    return {
      rt_id: id,
      plate: typeof exTruckName === 'function' ? exTruckName(r.truck_id) : '',
      driver: typeof exPersonName === 'function' ? exPersonName(r) : '',
      date_start: r.date_start, date_end: r.date_end,
    };
  };
  const ids = [];
  if (l.rt_id != null) ids.push(l.rt_id);
  for (const a of (l.alternatives || [])) if (!ids.includes(a)) ids.push(a);
  return { status, rt_id: l.rt_id != null ? l.rt_id : null, candidates: ids.map(rtInfo), general: !!l.general };
}

function eiRtEditorHtml(l) {
  const cands = (l.match && l.match.candidates) || [];
  const candOpts = cands.map((c) => `<option value="${c.rt_id}">${escapeHtml((c.plate || l.plate || '') + ' · ' + (c.driver || '') + ' · ' + (c.date_start || ''))}</option>`).join('');
  return `<div class="ei-rtedit">
    <select id="eiRtCandSel_${l.id}" onchange="eiConfirmRtChange(${l.id}, this.value)">
      <option value="" disabled selected>— διάλεξε δρομολόγιο —</option>
      ${candOpts}
      <option value="none">Χωρίς δρομολόγιο</option>
      <option value="__other__">— άλλο (αναζήτηση) —</option>
    </select>
    <input type="text" class="ei-rtsearch" id="eiRtSearch_${l.id}" placeholder="Αναζήτηση πινακίδα/οδηγό…" style="display:none" oninput="eiFilterRtOther(${l.id}, this.value)">
    <select id="eiRtOtherSel_${l.id}" style="display:none" onchange="eiConfirmRtChange(${l.id}, this.value)"></select>
  </div>`;
}

function eiFilterRtOther(lineId, q) {
  const sel = document.getElementById('eiRtOtherSel_' + lineId);
  if (!sel) return;
  const query = (q || '').trim().toLowerCase();
  const rows = _ex.rts.filter((r) => {
    if (!query) return true;
    return exTruckName(r.truck_id).toLowerCase().includes(query) || exPersonName(r).toLowerCase().includes(query);
  });
  sel.innerHTML = '<option value="" disabled selected>— επίλεξε —</option>'
    + rows.map((r) => `<option value="${r.id}">${escapeHtml(exTruckName(r.truck_id) + ' · ' + exPersonName(r) + ' · ' + exDateRange(r.date_start, r.date_end))}</option>`).join('')
    + '<option value="none">Χωρίς δρομολόγιο</option>';
}

// Κοινό τέλος διόρθωσης δρομολογίου: εφαρμόζει, σημαδεύει corrected, ρωτά
// «να ισχύει στο εξής;» και μόνο τότε προσθέτει τον κανόνα rt_pref (spec §4)
// — ο κανόνας ΔΕΝ εφαρμόζεται ξανά μέσα σε αυτή την προεπισκόπηση, μόνο
// καταγράφεται για τον Worker να τον χρησιμοποιήσει στην επόμενη εισαγωγή.
function eiConfirmRtChange(lineId, val) {
  if (val === '__other__') {
    const s = document.getElementById('eiRtSearch_' + lineId);
    const sel = document.getElementById('eiRtOtherSel_' + lineId);
    if (s) s.style.display = '';
    if (sel) { sel.style.display = ''; eiFilterRtOther(lineId, ''); }
    return;
  }
  const line = _ei.lines.find((l) => l.id === lineId);
  if (!line) return;
  const newRtId = (val === '' || val === 'none') ? null : Number(val);
  line.match = Object.assign({}, line.match, { rt_id: newRtId, status: newRtId ? 'sure' : 'none' });
  line.corrected = true;
  _ei.rtEditingId = null;
  const target = line.plate || 'αυτό το όχημα';
  const catLabel = eiCategoryLabel(line.category);
  if (window.confirm('Να ισχύει στο εξής για ' + target + ' · ' + catLabel + ';')) {
    _ei.rules.push({ kind: 'rt_pref', key: { plate: line.plate, line_type: line.category }, value: { rt_id: newRtId } });
  }
  eiRenderShell();
}

function eiChangeCategory(id, newCat) {
  const l = _ei.lines.find((x) => x.id === id);
  if (!l || l.category === newCat) return;
  l.category = newCat;
  l.corrected = true;
  if (window.confirm('Να ισχύει στο εξής για τον κωδικό προϊόντος ' + (l.product_code || '—') + ';')) {
    _ei.rules.push({ kind: 'category', key: l.product_code, value: { category: newCat } });
  }
  eiRenderShell();
}

function eiToggleLine(id) {
  const l = _ei.lines.find((x) => x.id === id);
  if (!l) return;
  l.selected = !l.selected;
  eiRenderShell();
}

function eiFooterHtml() {
  const selCount = eiSelectedCount();
  const total = _ei.lines.filter((l) => l.selected).reduce((a, l) => a + eiLineGross(l), 0);
  const docRef = _ei.doc && _ei.doc.id ? ' (παραστατικό ' + escapeHtml(String(_ei.doc.id)) + ')' : '';
  return `<div class="ei-footer">
    <div class="ei-footnote">Τα ποσά σε ξένο νόμισμα μετατράπηκαν με την ισοτιμία της DKV · το ZIP αποθηκεύεται και δένει με κάθε γραμμή${docRef}.</div>
    <div class="ei-footsum">${selCount} επιλεγμένες · ${exEur(total)} μικτό</div>
  </div>`;
}

// ═══════════════════ ΚΑΤΑΧΩΡΗΣΗ ═══════════════════

// Αφαιρεί τα πεδία που υπάρχουν μόνο για την προεπισκόπηση (id/selected/
// corrected/match) πριν το σώμα φτάσει στο /costs/import/commit — spec §5:
// «lines:[{...final}]» σημαίνει τα τελικά δεδομένα γραμμής, όχι το UI state.
function eiFinalLineForCommit(l) {
  const out = {};
  for (const k in l) {
    if (k === 'id' || k === 'selected' || k === 'corrected' || k === 'match') continue;
    out[k] = l[k];
  }
  out.rt_id = (l.match && l.match.rt_id != null) ? l.match.rt_id : null;
  out.corrected = !!l.corrected;
  return out;
}

async function eiCommit() {
  const rec = _ei.reconcile || {};
  if (!rec.ok) { showErrorToast('Δεν καταχωρείται όσο η συμφωνία με το E-SUMMARY δεν ταυτίζεται.', 'error'); return; }
  const selected = _ei.lines.filter((l) => l.selected);
  if (!selected.length) { showErrorToast('Καμία γραμμή επιλεγμένη.', 'error'); return; }
  _ei.committing = true;
  eiRenderShell();
  const body = {
    doc_id: _ei.doc && _ei.doc.id,
    reconcile_ok: true,
    lines: selected.map(eiFinalLineForCommit),
    rules: _ei.rules,
    examples: [],
  };
  try {
    const res = await ctFetch('/costs/import/commit', { method: 'POST', body });
    const n = (res && res.inserted != null) ? res.inserted : selected.length;
    const invoiceNo = res && res.invoice_no;
    showErrorToast('Καταχωρήθηκαν ' + n + ' γραμμές' + (invoiceNo ? ' · παραστατικό ' + invoiceNo : ''), 'info');
    renderExpenses();
  } catch (e) {
    _ei.committing = false;
    // 409 «έχει ήδη εισαχθεί»: το μήνυμα του Worker (spec §5) φέρει ήδη
    // ποιος/πότε — δείχνεται ως έχει, η εισαγωγή σταματά εδώ (spec §5/§6).
    exShowError(e);
    eiRenderShell();
  }
}
