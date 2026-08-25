// ═══════════════════════════════════════════════════════════════
// CORE — SHARE MENU (owner 25/8/2026)
// Δεξί κλικ / παρατεταμένο πάτημα σε κουμπί εκτύπωσης → ΔΙΚΟ ΜΑΣ μενού
// (Εκτύπωση · Λήψη PDF · Κοινή χρήση PDF · Κοινή χρήση κειμένου · Αντιγραφή).
// Το φύλλο εφαρμογών (WhatsApp/Mail/AirDrop) το ανοίγει ΤΟ ΛΕΙΤΟΥΡΓΙΚΟ μέσω
// navigator.share() — δεν το μιμούμαστε. ΕΝΑ εξάρτημα για όλες τις οθόνες:
// οκτώ αντίγραφα του ίδιου μενού = οκτώ εκδοχές που αποκλίνουν (αρχή 3).
// Το PDF είναι ΚΕΙΜΕΝΟ (jsPDF text API + DejaVu subset με ελληνικά), όχι
// φωτογραφία html2canvas: ένα CMR που φτάνει θολό σε πελάτη είναι χειρότερο
// από το να μη σταλεί. Αριστερό κλικ: μένει ό,τι έκανε πάντα — δεν το αγγίζουμε.
'use strict';

(function () {
  const VENDOR_JSPDF = 'assets/vendor/jspdf.umd.min.js';
  const VENDOR_FONT = 'assets/vendor/pdf-font-el.js';
  let _menuEl = null;
  let _pdfLibReady = null; // Promise — lazy: τα ~530KB φορτώνουν ΜΟΝΟ αν ζητηθεί PDF

  function _toast(msg, kind) {
    if (typeof toast === 'function') { toast(msg, kind || 'info'); return; }
    // Το print.html δεν έχει toast() — αυτόνομο, ώστε η αποτυχία να ακούγεται παντού.
    let t = document.getElementById('shToast');
    if (!t) {
      t = document.createElement('div'); t.id = 'shToast';
      t.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#0B1929;color:#fff;padding:10px 18px;border-radius:8px;font:13px "DM Sans",sans-serif;z-index:99999;max-width:86vw;box-shadow:0 4px 18px rgba(11,25,41,.35)';
      document.body.appendChild(t);
    }
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(t._h); t._h = setTimeout(() => { t.style.display = 'none'; }, 4500);
  }

  function _loadScript(src) {
    return new Promise((ok, bad) => {
      const s = document.createElement('script');
      s.src = src; s.onload = ok;
      s.onerror = () => bad(new Error('Δεν φορτώθηκε το ' + src));
      document.head.appendChild(s);
    });
  }

  function _ensurePdfLib() {
    if (!_pdfLibReady) {
      _pdfLibReady = Promise.all([
        window.jspdf ? Promise.resolve() : _loadScript(VENDOR_JSPDF),
        window.PDF_FONT_EL ? Promise.resolve() : _loadScript(VENDOR_FONT)
      ]).catch(e => { _pdfLibReady = null; throw e; });
    }
    return _pdfLibReady;
  }

  // Emoji/WA-markdown έξω από το PDF: το DejaVu subset δεν έχει pictographs —
  // θα έβγαζαν κενά κουτάκια δίπλα σε ονόματα πελατών. Τα '*' είναι σύνταξη
  // WhatsApp (bold), όχι περιεχόμενο.
  function _pdfSanitize(s) {
    return String(s)
      .replace(/\*(\S(?:[^*]*\S)?)\*/g, '$1')
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0E}\u{FE0F}\u{200D}]/gu, '')
      .replace(/[ \t]{2,}/g, ' ');
  }

  async function _buildPdf(opts) {
    await _ensurePdfLib();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const F = window.PDF_FONT_EL;
    doc.addFileToVFS(F.file, F.b64);
    doc.addFont(F.file, F.name, 'normal');
    doc.setFont(F.name, 'normal');
    const M = 14, W = 210 - 2 * M, H = 297 - M;
    let y = M + 4;
    doc.setFontSize(13);
    doc.text(_pdfSanitize(opts.title || 'PETRAS GROUP'), M, y);
    y += 4;
    doc.setDrawColor(2, 132, 199); doc.setLineWidth(0.5);
    doc.line(M, y, 210 - M, y);
    y += 7;
    doc.setFontSize(10);
    const raw = _pdfSanitize(opts.getText());
    for (const para of raw.split('\n')) {
      const lines = para === '' ? [''] : doc.splitTextToSize(para, W);
      for (const ln of lines) {
        if (y > H - 6) { doc.addPage(); doc.setFont(F.name, 'normal'); doc.setFontSize(10); y = M + 4; }
        doc.text(ln, M, y);
        y += 5;
      }
    }
    return doc;
  }

  function _fileName(opts) {
    const base = (opts.fileName || opts.title || 'petras-doc')
      .replace(/[^\p{L}\p{N}\- ]/gu, '').trim().replace(/\s+/g, '-').slice(0, 60);
    return (base || 'petras-doc') + '.pdf';
  }

  function _isAbort(e) { return e && (e.name === 'AbortError' || e.name === 'NotAllowedError'); }

  async function _sharePdf(opts) {
    let doc;
    try { doc = await _buildPdf(opts); }
    catch (e) { _toast('Το PDF δεν δημιουργήθηκε: ' + e.message, 'danger'); return; }
    const file = new File([doc.output('blob')], _fileName(opts), { type: 'application/pdf' });
    // Αλυσίδα υποχώρησης — ό,τι δεν γίνεται, ακούγεται (αρχή 1):
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ title: opts.title, files: [file] }); }
      catch (e) { if (!_isAbort(e)) _toast('Η κοινή χρήση απέτυχε: ' + e.message, 'danger'); }
      return; // ακύρωση χρήστη = όχι σφάλμα, κανένα toast
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: opts.title, text: opts.getText() });
        _toast('Ο browser δεν μοιράζεται αρχεία — στάλθηκε το κείμενο. Το PDF: «Λήψη PDF».');
      } catch (e) { if (!_isAbort(e)) _toast('Η κοινή χρήση απέτυχε: ' + e.message, 'danger'); }
      return;
    }
    doc.save(_fileName(opts));
    _toast('Ο browser δεν έχει κοινή χρήση — το PDF κατέβηκε· στείλ’ το ως συνημμένο.');
  }

  async function _shareText(opts) {
    if (navigator.share) {
      try { await navigator.share({ title: opts.title, text: opts.getText() }); }
      catch (e) { if (!_isAbort(e)) _toast('Η κοινή χρήση απέτυχε: ' + e.message, 'danger'); }
      return;
    }
    await navigator.clipboard.writeText(opts.getText());
    _toast('Ο browser δεν έχει κοινή χρήση — το κείμενο αντιγράφηκε· επικόλλησέ το όπου θες.');
  }

  async function _downloadPdf(opts) {
    try { (await _buildPdf(opts)).save(_fileName(opts)); }
    catch (e) { _toast('Το PDF δεν δημιουργήθηκε: ' + e.message, 'danger'); }
  }

  async function _copyText(opts) {
    try { await navigator.clipboard.writeText(opts.getText()); _toast('Αντιγράφηκε.'); }
    catch (e) { _toast('Η αντιγραφή απέτυχε: ' + e.message, 'danger'); }
  }

  function _closeMenu(e) {
    // Μόνο αριστερό κλικ κλείνει το μενού: κάποια εργαλεία/συσκευές παράγουν
    // click και για το δεξί — αυτό έκλεινε το μενού την ώρα που άνοιγε.
    if (e && e.type === 'click' && e.button !== 0) return;
    if (_menuEl) { _menuEl.remove(); _menuEl = null; }
    document.removeEventListener('click', _closeMenu, true);
    document.removeEventListener('keydown', _escClose, true);
  }
  function _escClose(e) { if (e.key === 'Escape') _closeMenu(); }

  function _openMenu(x, y, opts) {
    _closeMenu();
    const items = [
      ['Εκτύπωση', () => (opts.onPrint ? opts.onPrint() : window.print())],
      ['Λήψη PDF', () => _downloadPdf(opts)],
      ['Κοινή χρήση PDF', () => _sharePdf(opts)],
      ['Κοινή χρήση κειμένου', () => _shareText(opts)],
      ['Αντιγραφή κειμένου', () => _copyText(opts)]
    ];
    const m = document.createElement('div');
    m.id = 'shMenu';
    m.style.cssText = 'position:fixed;z-index:99998;background:#fff;border:1px solid rgba(11,25,41,.18);border-radius:10px;box-shadow:0 8px 28px rgba(11,25,41,.22);padding:5px;min-width:210px;font:13.5px "DM Sans",sans-serif;color:#0B1929';
    items.forEach(([label, fn]) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'display:block;width:100%;text-align:left;background:none;border:none;border-radius:6px;padding:9px 12px;font:inherit;color:inherit;cursor:pointer';
      b.onmouseenter = () => { b.style.background = '#F0F9FF'; };
      b.onmouseleave = () => { b.style.background = 'none'; };
      b.onclick = (e) => { e.stopPropagation(); _closeMenu(); fn(); };
      m.appendChild(b);
    });
    document.body.appendChild(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
    m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
    _menuEl = m;
    setTimeout(() => {
      document.addEventListener('click', _closeMenu, true);
      document.addEventListener('keydown', _escClose, true);
    }, 0);
  }

  // opts: { title, getText, fileName?, onPrint? }
  function attachShareMenu(buttonEl, opts) {
    if (!buttonEl || buttonEl._shareMenuAttached) return;
    buttonEl._shareMenuAttached = true;
    buttonEl.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      _openMenu(e.clientX, e.clientY, opts);
    });
    // Κινητό: δεν υπάρχει δεξί κλικ — χωρίς long-press το κουμπί απλώς δεν
    // θα έκανε τίποτα εκεί (οι φωτογραφίες του owner ήταν από iPhone).
    let lpTimer = null, lpFired = false, sx = 0, sy = 0;
    buttonEl.addEventListener('touchstart', (e) => {
      const t = e.touches[0]; sx = t.clientX; sy = t.clientY; lpFired = false;
      lpTimer = setTimeout(() => {
        lpFired = true;
        _openMenu(sx, sy, opts);
        if (navigator.vibrate) navigator.vibrate(12);
      }, 550);
    }, { passive: true });
    buttonEl.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (Math.hypot(t.clientX - sx, t.clientY - sy) > 10) clearTimeout(lpTimer);
    }, { passive: true });
    buttonEl.addEventListener('touchend', () => { clearTimeout(lpTimer); });
    // μετά από long-press, το click που ακολουθεί ΔΕΝ πρέπει να τυπώσει
    buttonEl.addEventListener('click', (e) => {
      if (lpFired) { e.preventDefault(); e.stopImmediatePropagation(); lpFired = false; }
    }, true);
  }

  window.attachShareMenu = attachShareMenu;
})();
