// ═══════════════════════════════════════════════════════════════
// CORE — SHARE MENU (owner 25/8/2026)
// Δεξί κλικ / παρατεταμένο πάτημα σε κουμπί εκτύπωσης → ΔΙΚΟ ΜΑΣ μενού
// (Εκτύπωση · Λήψη PDF · Κοινή χρήση PDF · Κοινή χρήση κειμένου · Αντιγραφή).
// Το φύλλο εφαρμογών (WhatsApp/Mail/AirDrop) το ανοίγει ΤΟ ΛΕΙΤΟΥΡΓΙΚΟ μέσω
// navigator.share() — δεν το μιμούμαστε. ΕΝΑ εξάρτημα για όλες τις οθόνες:
// οκτώ αντίγραφα του ίδιου μενού = οκτώ εκδοχές που αποκλίνουν (αρχή 3).
// Το PDF ΕΙΝΑΙ η εκτύπωση (owner 25/8, Διόρθωση 2): παράγεται από τον Worker
// (/print/pdf, Browser Rendering) που αποδίδει το ΙΔΙΟ print.html — μία πηγή
// αλήθειας για το έγγραφο. Η χειροποίητη διάταξη jsPDF ήταν ΔΕΥΤΕΡΗ υλοποίηση
// του ίδιου εγγράφου και αφαιρέθηκε (αρχή 3 + 8). Αριστερό κλικ: ανέγγιχτο.
'use strict';

(function () {
  let _menuEl = null;

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


  // Το PDF έρχεται από τον Worker — ο καλών δίνει pdfUrl() με τα ΙΔΙΑ params
  // της σελίδας εκτύπωσης. Αποτυχία = μήνυμα με τον λόγο, ποτέ σιωπή.
  async function _fetchPdfBlob(opts) {
    const jwt = localStorage.getItem('tms_jwt');
    const res = await fetch(opts.pdfUrl(), { headers: jwt ? { Authorization: 'Bearer ' + jwt } : {} });
    if (!res.ok) {
      let msg = 'HTTP ' + res.status;
      try { msg = (await res.json()).error || msg; } catch (_) {}
      throw new Error(msg);
    }
    return await res.blob();
  }

  function _fileName(opts) {
    const base = (opts.fileName || opts.title || 'petras-doc')
      .replace(/[^\p{L}\p{N}\- ]/gu, '').trim().replace(/\s+/g, '-').slice(0, 60);
    return (base || 'petras-doc') + '.pdf';
  }

  function _isAbort(e) { return e && (e.name === 'AbortError' || e.name === 'NotAllowedError'); }

  async function _sharePdf(opts) {
    let blob;
    try { blob = await _fetchPdfBlob(opts); }
    catch (e) { _toast('Το PDF δεν δημιουργήθηκε: ' + e.message, 'danger'); return; }
    const file = new File([blob], _fileName(opts), { type: 'application/pdf' });
    // Αλυσίδα υποχώρησης — ό,τι δεν γίνεται, ακούγεται (αρχή 1):
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ title: opts.title, files: [file] }); }
      catch (e) { if (!_isAbort(e)) _toast('Η κοινή χρήση απέτυχε: ' + e.message, 'danger'); }
      return; // ακύρωση χρήστη = όχι σφάλμα, κανένα toast
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: opts.title, text: await opts.getText() });
        _toast('Ο browser δεν μοιράζεται αρχεία — στάλθηκε το κείμενο. Το PDF: «Λήψη PDF».');
      } catch (e) { if (!_isAbort(e)) _toast('Η κοινή χρήση απέτυχε: ' + e.message, 'danger'); }
      return;
    }
    _saveBlob(blob, _fileName(opts));
    _toast('Ο browser δεν έχει κοινή χρήση — το PDF κατέβηκε· στείλ’ το ως συνημμένο.');
  }

  // getText μπορεί να είναι και async (η λίστα το φέρνει από το /print/pdf
  // &format=text — ίδιος παραγωγός με το preview, ένα αντίγραφο λογικής).
  async function _shareText(opts) {
    let text;
    try { text = await opts.getText(); }
    catch (e) { _toast('Το κείμενο δεν φορτώθηκε: ' + e.message, 'danger'); return; }
    if (navigator.share) {
      try { await navigator.share({ title: opts.title, text }); }
      catch (e) { if (!_isAbort(e)) _toast('Η κοινή χρήση απέτυχε: ' + e.message, 'danger'); }
      return;
    }
    await navigator.clipboard.writeText(text);
    _toast('Ο browser δεν έχει κοινή χρήση — το κείμενο αντιγράφηκε· επικόλλησέ το όπου θες.');
  }

  function _saveBlob(blob, name) {
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  }

  async function _downloadPdf(opts) {
    try { _saveBlob(await _fetchPdfBlob(opts), _fileName(opts)); }
    catch (e) { _toast('Το PDF δεν δημιουργήθηκε: ' + e.message, 'danger'); }
  }

  async function _copyText(opts) {
    try { await navigator.clipboard.writeText(await opts.getText()); _toast('Αντιγράφηκε.'); }
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
      ...(opts.pdfUrl ? [
        ['Λήψη PDF', () => _downloadPdf(opts)],
        ['Κοινή χρήση PDF', () => _sharePdf(opts)]
      ] : []),
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

  // opts: { title, getText, fileName?, onPrint?, pdfUrl? } — χωρίς pdfUrl οι επιλογές PDF δεν εμφανίζονται
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

  // Delegated παραλλαγή (Διόρθωση 1, owner 25/8): ΕΝΑΣ ακροατής στον πρόγονο —
  // οι πίνακες ξαναχτίζονται σε κάθε render και per-element listeners θα
  // χάνονταν ΣΙΩΠΗΛΑ (αρχή 1). Το αριστερό κλικ δεν αγγίζεται πουθενά.
  function shareMenuDelegate(rootEl, selector, optsFromEl) {
    if (!rootEl || rootEl._shareDelegated) return;
    rootEl._shareDelegated = true;
    rootEl.addEventListener('contextmenu', (e) => {
      const el = e.target.closest(selector);
      if (!el) return;
      const opts = optsFromEl(el);
      if (!opts) return;
      e.preventDefault(); e.stopPropagation();
      _openMenu(e.clientX, e.clientY, opts);
    });
    let lpTimer = null, sx = 0, sy = 0;
    rootEl.addEventListener('touchstart', (e) => {
      const el = e.target.closest(selector); if (!el) return;
      const t = e.touches[0]; sx = t.clientX; sy = t.clientY;
      lpTimer = setTimeout(() => {
        const opts = optsFromEl(el);
        if (opts) { el._lpFired = true; _openMenu(sx, sy, opts); if (navigator.vibrate) navigator.vibrate(12); }
      }, 550);
    }, { passive: true });
    rootEl.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (Math.hypot(t.clientX - sx, t.clientY - sy) > 10) clearTimeout(lpTimer);
    }, { passive: true });
    rootEl.addEventListener('touchend', () => clearTimeout(lpTimer));
    rootEl.addEventListener('click', (e) => {
      const el = e.target.closest(selector);
      if (el && el._lpFired) { el._lpFired = false; e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
  }

  window.attachShareMenu = attachShareMenu;
  window.shareMenuDelegate = shareMenuDelegate;
})();
