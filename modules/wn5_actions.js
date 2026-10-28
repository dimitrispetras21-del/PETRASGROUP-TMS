// modules/wn5_actions.js — National v5 board actions (F4α T11–T18), behind FEATURES.WN_V5.
//
// Rules (in the spirit of modules/wi4_actions.js, which stays untouched):
//  1. Nothing runs at load: this file only defines window.WN5Act. A listener is added when a dialog opens (and
//     removed when it closes) or on the board root that WN5.paint() hands to WN5Act.bind() — the root is rebuilt
//     on every paint, so its one listener dies with it. Every handler starts with the WN5.active() guard.
//  2. Every /plan call goes through planFetch (core/plan-api.js): one fetch per press, never a resend (decision 44).
//     A failed press keeps the dialog open with the Worker's words; the next press is the user's.
//  3. Every refusal shows error.message as the Worker wrote it (principle 3). The only words of this file are
//     headings, button labels and the labels of core/wn5-labels.js.
//  4. Bodies come from the dialog's state only: a dialog snapshots what it shows when it opens and never reads
//     the live board again, so two presses send the same bytes (request_reused, F2 note 6). No Date.now().
//  5. No role gate (owner 10/10, Δ12 tile 8 «η οθόνη δεν κρύβει κουμπιά»): every role sees every button; the
//     Worker's 403 speaks in the strip.
//  6. Colours only through classes of assets/style.css (critics unit weekly_natl_v5: hex 0).
//  7. Until day L the Worker answers every non-dry write 409 writes_closed (PLAN_WRITES_OPEN = false). The first
//     such answer becomes a «ΠΡΟΕΠΙΣΚΟΠΗΣΗ» strip and locks every save button for the session (Ε-6); dry runs
//     and reads stay open.
(function () {
  'use strict';
  const WN5Act = {};
  const KIT = {};                       // internals shared with modules/wn5_veroia.js (T19); not a public API
  const ACTS = Object.create(null);     // data-act on the board root → handler(el, ev); each Task adds its own
  const K = () => PlanApi.KIND;
  const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const _log = (e, ctx) => { try { if (typeof logError === 'function') logError(e, ctx); } catch (_) { /* logging never breaks an action */ } };
  const _live = () => typeof WN5 !== 'undefined' && WN5.active();
  const _copy = (o) => JSON.parse(JSON.stringify(o == null ? {} : o));
  const _state = () => (typeof WN5 !== 'undefined' && typeof WN5.state === 'function' && WN5.state()) || { board: null, model: null };

  // ═══ Result strips (Ε-7): one per host, the Worker's message as it is ═══
  // The heading is the screen's own word for the KIND of answer; the text is error.message.
  // stale is «ΔΕΝ ΑΠΟΘΗΚΕΥΤΗΚΕ» like every 422 of Δ12 (2069:9518, the code table): the Worker's message already says
  // «Κάτι άλλαξε…», a heading with the same words read it twice.
  const STRIP_HEAD = Object.freeze({
    refusal: 'ΔΕΝ ΑΠΟΘΗΚΕΥΤΗΚΕ', stale: 'ΔΕΝ ΑΠΟΘΗΚΕΥΤΗΚΕ', reused: 'ΕΙΧΕ ΗΔΗ ΑΠΟΘΗΚΕΥΤΕΙ', need_token: 'ΧΡΕΙΑΖΕΤΑΙ ΕΠΙΒΕΒΑΙΩΣΗ',
    preview: 'ΠΡΟΕΠΙΣΚΟΠΗΣΗ', busy: 'ΔΕΝ ΑΠΟΘΗΚΕΥΤΗΚΕ', unknown: 'ΜΠΟΡΕΙ ΝΑ ΑΠΟΘΗΚΕΥΤΗΚΕ', leak: 'ΣΦΑΛΜΑ',
    slow: 'ΑΡΓΗ ΑΠΑΝΤΗΣΗ', schema: 'ΣΦΑΛΜΑ', failed: 'ΣΦΑΛΜΑ', forbidden: 'ΔΕΝ ΑΠΟΘΗΚΕΥΤΗΚΕ', client: 'ΣΦΑΛΜΑ',
    offline: 'ΧΩΡΙΣ ΣΥΝΔΕΣΗ', warning: 'ΠΡΟΕΙΔΟΠΟΙΗΣΗ',
  });
  let _closed = null;                   // the first 409 writes_closed of the session (Ε-6)
  const _closedErr = () => _closed;
  const _unkWarn = new Set();
  // The way on sits at the strip's end, Medium, in the strip's own colour (Δ12 .wn5-strip-act).
  function _act(el, text, fn) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'wi4-link wn5-strip-act'; b.textContent = text;
    b.addEventListener('click', fn);
    el.appendChild(b);
    return b;
  }
  // «Ανανέωση ↻» (Δ12 2069:9518, 2069:10146): when the base says the screen is behind — a stale_confirm, or a refusal
  // whose message (the Worker's own words, PLAN_RULE_TEXT) asks for «ανανέωσε». Read from the message, not from a
  // list of codes here: a second list of the Worker's codes would drift (principle 3).
  const _wantsReread = (x, kind) => kind === 'stale' || /ανανέωσε/i.test(String(x.message || ''));

  WN5Act.strip = function strip(hostEl, x) {
    if (!hostEl) return null;
    for (const old of hostEl.querySelectorAll(':scope > .wn5-strip')) old.remove();
    if (x == null || (Array.isArray(x) && !x.length)) return null;
    if (x && x._sessionGone) return null;            // the session flow (core/api.js) already took the page
    const el = document.createElement('div');
    el.className = 'wn5-strip';
    el.setAttribute('role', 'status');
    let kind;
    const h = document.createElement('b'); h.className = 'wn5-strip-h';
    const t = document.createElement('span'); t.className = 'wn5-strip-t';
    if (Array.isArray(x)) {
      kind = 'warning';
      const lines = x.map((w) => {
        const l = WN5Lab.warningLine(w);
        if (l.unknown && !_unkWarn.has(w && w.code)) { _unkWarn.add(w && w.code); _log(new Error('wn5: unknown warning ' + (w && w.code)), 'WN5Act warning'); }
        return l.text;
      });
      el.dataset.kind = kind; h.textContent = STRIP_HEAD.warning;
      // one warning is one line, «ΠΡΟΕΙΔΟΠΟΙΗΣΗ · …» (Δ12 2104:145961); only several make a list
      if (lines.length === 1) { t.textContent = lines[0]; el.append(h, t); }
      else {
        const ul = document.createElement('ul');
        for (const text of lines) { const li = document.createElement('li'); li.textContent = text; ul.appendChild(li); }
        el.append(h, ul);
      }
    } else {
      kind = x.kind === K().CLOSED ? 'preview' : (STRIP_HEAD[x.kind] ? x.kind : 'client');
      if (x.kind === K().CLOSED) {
        _closed = x;
        if (typeof WN5 !== 'undefined' && typeof WN5.markClosed === 'function') WN5.markClosed(x);
      }
      el.dataset.kind = kind;
      h.textContent = STRIP_HEAD[kind];
      // the Worker's words as they are; a body without a message still says its code, never an empty strip
      t.textContent = String(x.message || '') || '(' + String(x.code || 'χωρίς κωδικό') + ')';
      el.append(h, t);
      if (kind === 'unknown' && typeof WN5 !== 'undefined') {
        // «μπορεί να αποθηκεύτηκε» (Ε-7): the user checks the board, then presses the same button again (same request_id)
        _act(el, 'Έλεγχος στο board', () => { WN5.reload('check'); });
      } else if (typeof WN5 !== 'undefined' && _wantsReread(x, kind)) {
        // a re-read by hand, one per press (never automatic); an open dialog stays as it is
        const re = _act(el, 'Ανανέωση ', () => { WN5.reload('user'); });
        re.setAttribute('data-act', 'reload');
        // the «↻» is drawn as an icon (.wn5-ico-re); the glyph stays the button's text
        const ico = document.createElement('span'); ico.className = 'wn5-ico-re'; ico.setAttribute('aria-hidden', 'true'); ico.textContent = '↻';
        re.appendChild(ico);
      }
    }
    hostEl.insertBefore(el, hostEl.firstChild);
    return el;
  };

  // The board's own host for strips after a dialog closed (warnings of a save, a refusal of a direct action).
  function _boardHost() {
    const root = document.querySelector('#content > .wn5');
    if (!root) return null;
    let h = root.querySelector(':scope > .wn5-acthost');
    if (!h) {
      h = document.createElement('div');
      h.className = 'wn5-acthost';
      root.insertBefore(h, root.firstElementChild ? root.firstElementChild.nextSibling : null);   // under the title bar
    }
    return h;
  }

  // ═══ Dialogs: .wi4-dlg[role=dialog][data-wn5] (role=dialog keeps ←/→ off the week, core/ui.js _WK_OVERLAYS) ═══
  let _cur = null;
  function _close(d) {
    if (!d || d.closed) return;
    d.closed = true;
    window.removeEventListener('keydown', d.onKey, true);
    if (d.back.parentNode) d.back.parentNode.removeChild(d.back);
    if (_cur === d) _cur = null;
    if (d.ro) d.ro.disconnect();
    if (d.onClose) { try { d.onClose(); } catch (e) { _log(e, 'WN5Act dialog close'); } }
  }
  // opts: { wide, anchor (a popover placed under it), end (an element: the popover's right edge on its right edge, so
  // it opens to the left of it), ask (the two-step frame of Δ5: no «×», Άκυρο and the verb are
  // its only buttons — Esc and a click outside still close it), pop (a popover with no «×»: Esc, a click outside),
  // onClose }
  function _dlg(kind, title, opts) {
    opts = opts || {};
    WN5Act.closeAll();
    const back = document.createElement('div');
    back.className = 'wi4-dlg-back wn5-dlg-back' + (opts.anchor ? ' wn5-pop-back' : '');
    const dlg = document.createElement('div');
    dlg.className = 'wi4-dlg wn5-dlg' + (opts.wide ? ' wn5-wide' : '') + (opts.ask ? ' wn5-ask' : '');
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-label', title);
    dlg.setAttribute('data-wn5', kind);
    dlg.tabIndex = -1;
    dlg.innerHTML = '<div class="wi4-dlg-hd"><span class="wi4-dlg-t"></span>'
      + (opts.ask || opts.pop ? '' : '<button type="button" class="wi4-link wi4-dlg-x" aria-label="Κλείσιμο">×</button>') + '</div>'
      + '<div class="wn5-dlg-msg" role="status"></div><div class="wn5-dlg-b"></div><div class="wi4-dlg-ft"></div>';
    dlg.querySelector('.wi4-dlg-t').textContent = title;
    back.appendChild(dlg);
    document.body.appendChild(back);
    const d = { kind, back, dlg, msg: dlg.querySelector('.wn5-dlg-msg'), body: dlg.querySelector('.wn5-dlg-b'),
      ft: dlg.querySelector('.wi4-dlg-ft'), anchor: opts.anchor || null, end: opts.end || null, busy: false, locked: false, closed: false,
      onClose: opts.onClose || null, refresh: null };
    // Esc and a click outside close it, never in the middle of a send (its answer must land somewhere)
    d.onKey = (ev) => { if (ev.key === 'Escape' && !d.busy) { ev.preventDefault(); ev.stopPropagation(); _close(d); } };
    window.addEventListener('keydown', d.onKey, true);
    back.addEventListener('mousedown', (ev) => { if (ev.target === back && !d.busy) _close(d); });
    const x = dlg.querySelector('.wi4-dlg-x');
    if (x) x.addEventListener('click', () => { if (!d.busy) _close(d); });
    // A popover that grows after it was placed (a refusal strip, a redraw) is placed again, so its foot never ends
    // below the window (T13: the 422 strip pushed a fixed popover 34px past a 900px viewport)
    // It watches the content (strip + body), not the popover: _place sets the popover's own max-height, and watching
    // that would feed its own change back into the observer.
    if (d.anchor && typeof ResizeObserver === 'function') { d.ro = new ResizeObserver(() => { if (!d.closed) _place(d); }); d.ro.observe(d.msg); d.ro.observe(d.body); }
    _cur = d;
    return d;
  }
  // A popover sits under its anchor and inside the window; called after the content is in.
  // Taller than the room under the row, it keeps its top under the row and scrolls inside (.wn5-dlg overflow-y),
  // never moves up over the row and the «+» that opened it (Figma 2011:10305; T13 fidelity r2: 579px under RT 201
  // at 1440×900 was pushed to top 313). Only when the room under the row is short (< 240) and the room above is
  // larger does it open above the row instead, again without covering it.
  const POP_MIN = 240;
  function _place(d) {
    if (!d.anchor || !d.anchor.getBoundingClientRect) return;
    const r = d.anchor.getBoundingClientRect();
    // vertically the board row that holds the anchor (the «+» is 8px shorter than its row), so the row stays seen
    const row = d.anchor.closest ? d.anchor.closest('.wn5-row') : null;
    const v = row ? row.getBoundingClientRect() : r;
    d.dlg.style.maxHeight = '';
    const w = d.dlg.offsetWidth, h = d.dlg.offsetHeight, vh = window.innerHeight;
    const below = vh - v.bottom - 12, above = v.top - 12;
    const x = d.end && d.end.getBoundingClientRect ? d.end.getBoundingClientRect().right - w : r.left;
    d.dlg.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + 'px';
    if (h <= below || below >= POP_MIN || below >= above) {
      d.dlg.style.top = (v.bottom + 4) + 'px';
      if (h > below) d.dlg.style.maxHeight = Math.max(below, 0) + 'px';
    } else {
      d.dlg.style.top = Math.max(8, v.top - 4 - h) + 'px';
      if (h > above) d.dlg.style.maxHeight = Math.max(above, 0) + 'px';
    }
  }
  const SAVES = '[data-act="save"],[data-act="confirm"]';
  function _btns(d, sending) {
    for (const b of d.dlg.querySelectorAll(SAVES)) b.disabled = true;
    if (!sending && !d.locked) {
      if (d.refresh) d.refresh();
      else for (const b of d.dlg.querySelectorAll(SAVES)) b.disabled = false;
    }
  }
  function _lock(d) { d.locked = true; for (const b of d.dlg.querySelectorAll(SAVES)) b.disabled = true; }
  // Called by each dialog after it drew its buttons: before day L, the preview strip and no save (Ε-6).
  function _gate(d) { if (_closed) { WN5Act.strip(d.msg, _closed); _lock(d); } }

  WN5Act.closeAll = function closeAll() { if (_cur) _close(_cur); };

  // After a confirmed 200 (or a request_reused found on the board): re-read the board, then say what the base
  // said — warnings as a strip, and «ενημερώθηκε … διεθνών» only when this act tells the international desk (Ε-3).
  function _savedOn(w) {
    const st = typeof WN5 !== 'undefined' && WN5.state ? WN5.state() : null;
    const c = w && w.rt_id != null && st && st.board ? (st.board.cycles || []).find((x) => x.rt_id === w.rt_id) : null;
    const who = c && (c.truck || c.partner);
    return who ? Object.assign({ saved_on: who }, w) : w;
  }
  async function _afterSave(out, okText, opts) {
    opts = opts || {};
    let fresh = true;
    if (!opts.reloaded && typeof WN5 !== 'undefined') fresh = !!(await WN5.reload('save'));
    const host = _boardHost();
    // after a save the over_33 line names the vehicle (Δ12 tile 7): the cycle's truck or partner, from the board just read
    if (host && out && Array.isArray(out.warnings) && out.warnings.length) WN5Act.strip(host, out.warnings.map(_savedOn));
    const intl = opts.intl && out && Array.isArray(out.notice_ids) && out.notice_ids.length ? ' · ενημερώθηκε και ο υπεύθυνος διεθνών' : '';
    // okText may read the answer (e.g. already:true of a cancel says «ήταν ήδη ακυρωμένη»)
    const said = typeof okText === 'function' ? okText(out || {}) : okText;
    // F11: the save is real even when the read after it failed — the toast says both (the board's strip says why)
    if (typeof toast === 'function') toast(said + intl + (fresh ? '' : ' · ο πίνακας δεν ανανεώθηκε — πάτα Ανανέωση'), fresh ? 'success' : 'warn');
  }

  // One send of a dialog. req = { method, path, body, requestId? }.
  // opts = { slot (PlanApi.slot of a creation), onReused (pred for WN5.findAfterReuse), intl }
  async function _send(d, req, okText, opts) {
    opts = opts || {};
    if (_closed) { _gate(d); return null; }
    d.busy = true; _btns(d, true);
    let out;
    try {
      out = await planFetch(req.method, req.path, req.requestId ? { body: req.body, requestId: req.requestId } : { body: req.body });
    } catch (e) {
      d.busy = false;
      if (e && e._sessionGone) return null;
      if (e && e.kind === K().REUSED && opts.onReused && typeof WN5 !== 'undefined') {
        // request_reused = the FIRST press was saved and the answer carries no ids: the board says what was
        // saved, so read it before saying «αποθηκεύτηκε» (F2 note 6)
        const hit = await WN5.findAfterReuse(opts.onReused);
        if (hit) {
          if (opts.slot) opts.slot.confirm();
          _close(d);
          await _afterSave({ warnings: [], notice_ids: [] }, (typeof okText === 'function' ? okText({}) : okText) + ' (είχε ήδη σταλεί)', { reloaded: true });
          return hit;
        }
      }
      WN5Act.strip(d.msg, e);
      // A request_reused the board does not show (the record lies in another week, or the form was edited after a
      // plan_unknown): the SAME slot id would answer request_reused on every press — a dead end. The Worker's strip
      // says where to look; the save stays locked until the window closes (a new window = a new request_id).
      if (e && (e.kind === K().CLOSED || e.kind === K().REUSED)) _lock(d); else _btns(d, false);
      if (opts.onFail) { try { opts.onFail(e); } catch (e2) { _log(e2, 'WN5Act send onFail'); } }
      return null;
    }
    if (opts.slot) opts.slot.confirm();      // a new request_id only after a confirmed 200 (replayed included)
    _close(d);
    await _afterSave(out, okText, { intl: opts.intl });
    return out;
  }

  // ═══ Two steps: dry run → list → confirm (S-82) ═══
  const DOC_KINDS = Object.freeze(['payroll_amount', 'costs', 'local_payroll', 'invoiced']);   // «Παραστατικά που υπάρχουν» (Δ5)
  // The grey box at the end of a token list (Figma H4 2125:7771, H6 2147:7768): the list is a promise only while
  // nothing changes (stale_confirm). Δ5 draws none, so a caller asks for it with spec.note = true.
  const TOKEN_NOTE = 'Αν αλλάξει κάτι στο μεταξύ, η λίστα ξαναβγαίνει.';
  const _unkCons = new Set();
  function _consHTML(dry, s, fieldVal) {
    const list = Array.isArray(dry && dry.consequences) ? dry.consequences : [];
    const li = (c) => {
      const l = WN5Lab.consequenceLine(c);
      if (l.unknown && !_unkCons.has(c && c.kind)) { _unkCons.add(c && c.kind); _log(new Error('wn5: unknown consequence ' + (c && c.kind)), 'WN5Act consequence'); }
      // the category word before the line, as Δ5 / H4 draw it («Μισθοδοσία · γραμμή μισθοδοσίας …»)
      const cat = c && Object.prototype.hasOwnProperty.call(WN5Lab.CATEGORY, c.kind) ? WN5Lab.CATEGORY[c.kind] + ' · ' : '';
      return '<li data-kind="' + _esc(c && c.kind) + '"' + (l.unknown ? ' data-unknown="1"' : '') + '>' + _esc(cat + l.text) + '</li>';
    };
    const docs = list.filter((c) => DOC_KINDS.includes(c && c.kind));
    const acts = list.filter((c) => !DOC_KINDS.includes(c && c.kind));
    // s.what: rows the screen adds to «Τι θα γίνει» from the board it holds, before the base's own (Δ5 2053:8081 —
    // plan_rt_clear sends only the documents, the cycle and its loads are on the board). No data-kind: they are
    // not consequences of the base.
    const what = typeof s.what === 'function' ? (s.what(list) || []) : [];
    let h = (s.intro || []).map((p) => '<p>' + _esc(p) + '</p>').join('');
    if (docs.length) h += '<div class="wn5-cons-h">Παραστατικά που υπάρχουν</div><ul class="wn5-cons">' + docs.map(li).join('') + '</ul>';
    if (acts.length || what.length) h += '<div class="wn5-cons-h">Τι θα γίνει</div><ul class="wn5-cons">'
      + what.map((t) => '<li data-row="what">' + _esc(t) + '</li>').join('') + acts.map(li).join('') + '</ul>';
    if (!list.length && !what.length) h += '<p class="wn5-none">Καμία επίπτωση: δεν αλλάζει τίποτα άλλο.</p>';
    if (s.note === true) h += '<p class="wn5-tok">' + _esc(TOKEN_NOTE) + '</p>';
    if (s.field) h += '<label class="wn5-field"><span>' + _esc(s.field.label) + '</span><textarea data-field rows="2">' + _esc(fieldVal || '') + '</textarea></label>';
    return h;
  }
  let _ask = null;                       // { s, d, resolve, field }
  function _askDialog(dry, s) {
    return new Promise((resolve) => {
      if (!_ask || _ask.s !== s || _ask.d.closed) {
        const d = _dlg(s.kind, s.title, { ask: true, onClose: () => { if (_ask && _ask.d === d) { const r = _ask.resolve; _ask = null; if (r) r(null); } } });
        _ask = { s, d, resolve: null, field: '' };
        d.ft.innerHTML = '<button type="button" class="wi4-btn" data-act="cancel">Άκυρο</button>'
          + '<button type="button" class="wi4-btn pri' + (s.danger ? ' wn5-danger' : '') + '" data-act="confirm">' + _esc(s.verb) + '</button>';
        d.refresh = () => {
          const c = d.dlg.querySelector('[data-act="confirm"]');
          if (c) c.disabled = d.locked || d.busy || (!!s.field && !(_ask && _ask.field.trim()));
        };
        d.dlg.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-act]');
          if (!b || b.disabled) return;
          if (b.dataset.act === 'cancel') { if (!d.busy) _close(d); return; }
          if (b.dataset.act !== 'confirm' || !_ask || _ask.d !== d || !_ask.resolve) return;
          const r = _ask.resolve; _ask.resolve = null;
          WN5Act.strip(d.msg, null);
          d.busy = true; _btns(d, true);
          r({ extra: s.field ? { [s.field.key]: _ask.field.trim() } : {} });
        });
        d.dlg.addEventListener('input', (ev) => { if (ev.target.matches('[data-field]')) { _ask.field = ev.target.value; d.refresh(); } });
      }
      _ask.resolve = resolve;
      const d = _ask.d;
      d.busy = false;
      d.body.innerHTML = _consHTML(dry, s, _ask.field);
      _gate(d);
      d.refresh();
      const f = d.dlg.querySelector('[data-field]') || d.dlg.querySelector('[data-act="confirm"]');
      if (f && !f.disabled) f.focus();
    });
  }
  WN5Act._ui = {
    ask: _askDialog,
    // a failure: inside the open two-step dialog, else on the caller's host, else on the board
    fail(s, e) {
      if (_ask && !_ask.d.closed) { _ask.d.busy = false; WN5Act.strip(_ask.d.msg, e); if (e && e.kind === K().CLOSED) _lock(_ask.d); else _ask.d.refresh(); return; }
      WN5Act.strip((s && s.host) || _boardHost(), e);
    },
    done() { if (_ask) _close(_ask.d); },
  };

  WN5Act.twoStep = async function twoStep(spec) {
    const s = Object.assign({ kind: 'confirm', verb: 'Επιβεβαίωση', danger: false }, spec);
    const ui = WN5Act._ui;
    // a fresh copy each time: planFetch adds dry_run / confirm_token to what it is given
    const dryRun = () => planFetch(s.method, s.path, { body: _copy(s.body), dry: true });
    let dry;
    try { dry = await dryRun(); } catch (e) { ui.fail(s, e); return null; }
    let opened = false;
    for (;;) {
      const list = Array.isArray(dry.consequences) ? dry.consequences : [];
      let extra = {};
      // s.ask: the dialog opens even when the base sends no list, because the screen has rows of its own to say
      // first (H6 2147:7746: «σβήνονται και τα n τμήματα» — plan_rt_clear lists no segment)
      if (opened || s.field || s.ask || dry.needs_confirm === true || list.length > 0) {
        opened = true;
        const ans = await ui.ask(dry, s);
        if (!ans) return null;
        extra = ans.extra || {};
      } else if (_closed) {
        ui.fail(s, _closed);                 // Ε-6: the execution would only be a second 409
        return null;
      }
      // the SAME body as the dry run, plus what the dialog asked for and the token (decision 7)
      const body = Object.assign(_copy(s.body), extra, { confirm_token: dry.confirm_token });
      try {
        const out = await planFetch(s.method, s.path, { body });
        if (opened) ui.done();
        return out;
      } catch (e) {
        ui.fail(s, e);
        if (e && (e.kind === K().NEED_TOKEN || e.kind === K().STALE)) {
          // the list changed (or was never seen): a new dry run, the new list, its token
          try { dry = await dryRun(); } catch (e2) { ui.fail(s, e2); if (!opened) return null; }
          opened = true;
          continue;
        }
        if (!opened) return null;
        // the dialog stays open with the strip; nothing is sent again until the user presses again
      }
    }
  };

  // ═══ The board root: one delegated click listener per painted root ═══
  WN5Act.bind = function bind(root) {
    if (!root || root._wn5Bound) return;
    root._wn5Bound = true;
    root.addEventListener('click', (ev) => {
      if (!_live()) return;
      const el = ev.target.closest('[data-act]');
      if (!el || !root.contains(el)) return;
      const fn = ACTS[el.getAttribute('data-act')];
      if (!fn) return;                     // a data-act of another file (T5/T7) keeps its own handler
      ev.preventDefault(); ev.stopPropagation();
      try { fn(el, ev); } catch (e) { _log(e, 'WN5Act ' + el.getAttribute('data-act')); }
    });
  };

  Object.assign(KIT, { esc: _esc, log: _log, copy: _copy, state: _state, dlg: _dlg, close: _close, place: _place,
    lock: _lock, btns: _btns, gate: _gate, send: _send, afterSave: _afterSave, boardHost: _boardHost, closedErr: _closedErr });

  // ═══ T12 · Athens time, the board snapshot, the stops of an assignment ═══
  // Display and request times are Europe/Athens wall times (the board sends ISO with offset; days are Athens days,
  // computed by the server). A request time is built from a day + a typed HH:MM with the offset of THAT day, never
  // from the clock (rule 4).
  const _TZ = 'Europe/Athens';
  let _fmt = null;
  function _parts(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    if (!_fmt) _fmt = new Intl.DateTimeFormat('en-GB', { timeZone: _TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const p = {};
    for (const x of _fmt.formatToParts(d)) p[x.type] = x.value;
    return { ymd: p.year + '-' + p.month + '-' + p.day, hm: (p.hour === '24' ? '00' : p.hour) + ':' + p.minute };
  }
  const _hm = (iso) => { const p = _parts(iso); return p ? p.hm : '—'; };
  const _ymdOf = (iso) => { const p = _parts(iso); return p ? p.ymd : null; };
  const DOW = ['Κυρ', 'Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ'];
  // typed in capitals (never text-transform: the tonos stays in some browsers)
  const DOW_GEN = ['ΤΗΣ ΚΥΡΙΑΚΗΣ', 'ΤΗΣ ΔΕΥΤΕΡΑΣ', 'ΤΗΣ ΤΡΙΤΗΣ', 'ΤΗΣ ΤΕΤΑΡΤΗΣ', 'ΤΗΣ ΠΕΜΠΤΗΣ', 'ΤΗΣ ΠΑΡΑΣΚΕΥΗΣ', 'ΤΟΥ ΣΑΒΒΑΤΟΥ'];
  const _dow = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
  const _dm = (ymd) => (ymd ? ymd.slice(8, 10) + '/' + ymd.slice(5, 7) : '—');
  const _dayShort = (ymd) => (ymd ? DOW[_dow(ymd)] + ' ' + _dm(ymd) : '—');
  const _addDays = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
  // the Athens offset of a wall time on a day ('+03:00' in summer, '+02:00' in winter)
  function _offset(ymd, hm) {
    const [y, m, d] = ymd.split('-').map(Number);
    const [h, mi] = hm.split(':').map(Number);
    const guess = Date.UTC(y, m - 1, d, h, mi);
    const p = _parts(new Date(guess).toISOString());
    const [py, pm, pd] = p.ymd.split('-').map(Number);
    const [ph, pmi] = p.hm.split(':').map(Number);
    const off = Math.round((Date.UTC(py, pm - 1, pd, ph, pmi) - guess) / 60000);
    const a = Math.abs(off);
    return (off >= 0 ? '+' : '-') + String(Math.floor(a / 60)).padStart(2, '0') + ':' + String(a % 60).padStart(2, '0');
  }
  const _iso = (ymd, hm) => ymd + 'T' + hm + ':00' + _offset(ymd, hm);
  // a window that ends at or before it starts ends the next day (a 22:00–06:00 arrival)
  const _win = (ymd, from, to) => [_iso(ymd, from), _iso(to <= from ? _addDays(ymd, 1) : ymd, to)];
  // «0730», «7:30» → «07:30»; anything else → '' (the same reading as wi4_actions _hhmm)
  function _hhmm(v) {
    let s = String(v || '').trim();
    if (/^\d{4}$/.test(s)) s = s.slice(0, 2) + ':' + s.slice(2);
    else if (/^\d:\d{2}$/.test(s)) s = '0' + s;
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : '';
  }
  const _t = (x) => (typeof x === 'string' && /^\d{2}:\d{2}$/.test(x) ? x : _hm(x));      // model times: HH:MM or ISO
  const _pal = (n) => String(Math.round(Number(n) * 10) / 10).replace('.', ',');
  const _sum = (a) => a.reduce((s, x) => s + (typeof x === 'number' && isFinite(x) ? x : 0), 0);
  const _clientErr = (code, message) => ({ kind: 'client', code, message });
  const _id = (v) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; };
  const _norm = (s) => (typeof fhSearchNorm === 'function' ? fhSearchNorm(s) : String(s || '').toLowerCase());

  const _cycles = () => { const b = _state().board; return b && Array.isArray(b.cycles) ? b.cycles : []; };
  const _cycle = (rtId) => _cycles().find((c) => c.rt_id === rtId) || null;
  function _allItems() {
    const b = _state().board || {};
    return [...(b.waiting || []).map((x) => Object.assign({ at_hub: false }, x)), ...(b.hub || []).map((x) => Object.assign({ at_hub: true }, x))];
  }
  const _item = (pieceId) => _allItems().find((x) => x.piece_id === pieceId) || null;
  // a group goes whole: plan_put_group takes every waiting piece of the order, the ones at the hub too (072:860)
  const _groupItems = (g) => _allItems().filter((x) => (g.order_id != null ? x.order_id === g.order_id : x.nat_order_id === g.nat_order_id));
  function _row(rtId) {
    const m = _state().model;
    for (const d of (m && m.days) || []) for (const r of d.rows || []) if (r.rtId === rtId) return r;
    return null;
  }
  function _dayRows(ymd) {
    const m = _state().model;
    const d = m && (m.days || []).find((x) => x.date === ymd);
    return d ? (d.rows || []).filter((r) => r.kind === 'cycle' && r.rtId != null) : [];
  }
  // the hub's location id: the Veroia stop the model names, else the catalogue (PlanIds.hub)
  function _hubId() {
    const m = _state().model;
    for (const d of (m && m.days) || []) for (const r of d.rows || []) for (const sd of [r.kath, r.anod]) {
      if (sd && sd.veroia && sd.veroia.stopId != null) {
        const c = _cycle(r.rtId);
        const s = c && (c.stops || []).find((x) => x.stop_id === sd.veroia.stopId);
        if (s) return s.location_id;
      }
    }
    return typeof PlanIds !== 'undefined' ? PlanIds.hub() : null;
  }
  // the board's own rule (WN5L.waitSide: the hub ends, then 075's direction), so the window never assigns the other side
  const _sideFor = (it) => WN5L.waitSide(it, _hubId());
  // what a piece needs on the target side (plan_h_put): a stop at its position (pickup) and at its national end
  // (drop, or Veroia with to_hub). null place = the board did not send it (hub[] of 072, Ε-26).
  function _needs(it, toHub, hub) {
    const pick = it.at_hub ? hub : (it.position_location_id == null ? null : it.position_location_id);
    const drop = toHub ? hub : (it.nat_to_location_id == null ? null : it.nat_to_location_id);
    // day / key: a stop with no window of its own (every VS bridge: order_stops hold dates only, 074a) is placed on
    // ITS day — the loading on nat_ready_day, the delivery on nat_due_day — with the window the user gives (B1, 28/10)
    const dLoad = it.nat_ready_day || null, dDrop = it.nat_due_day || it.nat_ready_day || null;
    return [
      { loc: pick, from: it.load_from || null, to: it.load_to || null, hub: pick != null && pick === hub, role: 'load', day: dLoad, key: 'load:' + pick },
      { loc: drop, from: it.deliver_from || null, to: it.deliver_to || null, hub: drop != null && drop === hub, role: 'drop', day: dDrop, key: 'drop:' + drop },
    ];
  }
  // B1 (live 28/10): 072 refuses a new stop without planned_from / planned_to (decision 4: the base invents no hour),
  // and a VS bridge has no window on the board. A window-less stop takes the window the user gave (typed[n.key]), and
  // until then the whole of its day, 00:00–23:59 — always shown where it is used (Δ1 fields, «+» line, split badge),
  // never a silent hour. null = the stop's day is not known either (then it stays «window» missing).
  const DAY_WIN = Object.freeze({ from: '00:00', to: '23:59' });
  function _dayWin(n, typed) {
    const v = (typed && typed[n.key]) || DAY_WIN;
    const f = _hhmm(v.from), t = _hhmm(v.to);
    return n && n.day && f && t ? _win(n.day, f, t) : null;
  }
  // One stop per place per side (decision 6): a live stop of the target on that side is named by stop_id; any other
  // place becomes a new stop with its pieces' window (the earliest start, the latest end of the pieces there); a NEW
  // Veroia stop takes the window the user typed (Ε-5: the base invents no hour, and neither does the screen).
  // Never seq (decision 5), never one stop_id twice. missing: 'place' | 'window' | 'hub'.
  function _stopsFor(needs, cyc, side, hubWin, winOf) {
    const out = [], seen = new Map(), miss = new Set();
    for (const n of needs) {
      if (n.loc == null) { miss.add('place'); continue; }
      const prev = seen.get(n.loc);
      if (prev) {
        if (prev.location_id != null && !n.hub && n.from && n.to) {
          if (new Date(n.from) < new Date(prev.planned_from)) prev.planned_from = n.from;
          if (new Date(n.to) > new Date(prev.planned_to)) prev.planned_to = n.to;
        }
        continue;
      }
      const ex = cyc && (cyc.stops || []).find((s) => s.side === side && s.location_id === n.loc);
      let st;
      if (ex) st = { ref: 's' + ex.stop_id, stop_id: ex.stop_id };
      else if (n.hub) {
        // a moved piece brings its Veroia window from the source stop (072:1208-1215: places and windows of the
        // source); only a load that never had one waits for the typed window
        const w = hubWin || (n.own && n.from && n.to ? [n.from, n.to] : null);
        if (!w) { miss.add('hub'); continue; }
        st = { ref: 'n' + n.loc, location_id: n.loc, side, planned_from: w[0], planned_to: w[1] };
      }
      else if (!n.from || !n.to) {
        const w = typeof winOf === 'function' ? winOf(n) : null;
        if (!w) { miss.add('window'); continue; }
        st = { ref: 'n' + n.loc, location_id: n.loc, side, planned_from: w[0], planned_to: w[1] };
      }
      else st = { ref: 'n' + n.loc, location_id: n.loc, side, planned_from: n.from, planned_to: n.to };
      seen.set(n.loc, st);
      out.push(st);
    }
    return { stops: out, missing: [...miss] };
  }
  function _cycText(c, r) {
    const t = r && r.tiles && r.tiles[0];
    const par = c.trip_type === 'PARTNER';
    return { cls: par ? 'par' : (c.truck_id != null ? 'own' : 'un'),
      l1: t && t.line1 ? t.line1 : (par ? (c.partner || '—') : ([c.truck, c.trailer].filter(Boolean).join(' · ') || 'ΠΡΟΣ ΑΝΑΘΕΣΗ')),
      l2: t && t.line2 ? t.line2 : (par ? '' : (c.driver || '')) };
  }
  // an own vehicle's plates in DM Mono like the board's ΑΝΑΘΕΣΗ cell (.wi4-plate, Figma Δ1), never the body font
  const _boxHTML = (x) => '<div class="wi4-box ' + x.cls + '"><span class="wi4-l1' + (x.cls === 'own' ? ' wi4-plate' : '') + '">' + _esc(x.l1) + '</span>' + (x.l2 ? '<span class="wi4-l2">' + _esc(x.l2) + '</span>' : '') + '</div>';
  const _sideOfRow = (r, side) => (r ? (side === 'ANODOS' ? r.anod : r.kath) : null);
  const _sidePal = (r, side) => { const sd = _sideOfRow(r, side); return sd && typeof sd.pallets === 'number' ? sd.pallets : 0; };
  const _veroiaOf = (r, side) => { const sd = _sideOfRow(r, side); return sd && sd.veroia ? _t(sd.veroia.from) + '–' + _t(sd.veroia.to) : null; };
  // over capacity is a warning, never a refusal (Δ1, Ε-17: the sum of the side's loadings, like 072 over_33)
  const _capHTML = (n, tail) => '<span class="wn5-cap' + (n > 33 ? ' over' : '') + '">→ ' + _pal(n) + '/33' + (n > 33 ? ' · υπέρβαση ' + _pal(n - 33) : '') + (tail || '') + '</span>';
  const _optsHTML = (list, cur) => list.filter((x) => x.active).map((x) => '<option value="' + x.id + '"' + (x.id === cur ? ' selected' : '') + '>' + _esc(x.label) + '</option>').join('');
  // trucks with no cycle over that day; a cycle that ENDS that day frees its truck from its end time (display only:
  // the DB refuses a real overlap with truck_busy)
  function _freeTrucks(day, exceptTruck) {
    const busy = new Map();
    for (const c of _cycles()) {
      if (c.trip_type !== 'OWNED' || c.truck_id == null || !(c.date_start <= day && day <= c.date_end)) continue;
      const v = _ymdOf(c.end_at) === day ? _hm(c.end_at) : 'busy';
      const p = busy.get(c.truck_id);
      busy.set(c.truck_id, p === 'busy' || v === 'busy' ? 'busy' : (!p || v > p ? v : p));
    }
    const all = typeof PlanIds !== 'undefined' ? PlanIds.list('truck') : [];
    return all.filter((t) => t.active && t.id !== exceptTruck && busy.get(t.id) !== 'busy').map((t) => Object.assign({ from: busy.get(t.id) || null, next: _nextCycle(t.id, day) }, t));
  }
  // the truck's next cycle after that day on the loaded board (Δ1 «επόμενο: ΑΝΟΔΟΣ Τετ 14/10»): its first stop's side
  // and its start day. The board holds one week, so null means «not on this board», and the line is left out —
  // never «no next cycle».
  function _nextCycle(truckId, day) {
    const c = _cycles().filter((x) => x.trip_type === 'OWNED' && x.truck_id === truckId && x.date_start > day)
      .sort((a, b) => String(a.date_start).localeCompare(String(b.date_start)))[0];
    const s0 = c && (c.stops || []).slice().sort((a, b) => a.seq - b.seq)[0];
    const side = s0 ? ({ ANODOS: 'ΑΝΟΔΟΣ', KATHODOS: 'ΚΑΘΟΔΟΣ' })[s0.side] || null : null;
    return c ? { side, day: c.date_start } : null;
  }
  function _rate(txt) {
    const s = String(txt == null ? '' : txt).trim().replace(',', '.');
    if (!s) return { ok: true, v: null };                 // empty = «κόμιστρο λείπει», never 0 (S-44)
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? { ok: true, v: Math.round(n * 100) / 100 } : { ok: false, v: null };
  }
  Object.assign(KIT, { parts: _parts, hm: _hm, ymdOf: _ymdOf, dm: _dm, dayShort: _dayShort, addDays: _addDays, iso: _iso, win: _win, hhmm: _hhmm,
    t: _t, pal: _pal, sum: _sum, clientErr: _clientErr, id: _id, norm: _norm, cycles: _cycles, cycle: _cycle, item: _item, groupItems: _groupItems,
    row: _row, dayRows: _dayRows, hubId: _hubId, sideFor: _sideFor, needs: _needs, stopsFor: _stopsFor, dayWin: _dayWin, cycText: _cycText, boxHTML: _boxHTML,
    sidePal: _sidePal, veroiaOf: _veroiaOf, capHTML: _capHTML, optsHTML: _optsHTML, freeTrucks: _freeTrucks, rate: _rate, DOW_GEN, dow: _dow });

  // ═══ T12 · the assignment window Δ1 (Figma 2051:7735): one window for four entries ═══
  // The request of one candidate, from the window's state only. cand: 'rt:<id>' | 'truck:<id>' | 'partner'.
  function _assignReq(st, cand) {
    const parts = String(cand || '').split(':');
    const kind = parts[0], id = _id(parts[1]);
    // T14: «Πίσω στην αναμονή» / «Πίσω στη Βέροια» — wait takes no stops (072:1162)
    if (st.mode === 'move' && kind === 'wait') return { method: 'POST', path: '/plan/move', body: { from: st.from, target: { wait: true } } };
    if (st.mode === 'vehicle') {
      // only what the user chose: a key sent as null would EMPTY it (vehicle_clear_use_clear, 072:1680)
      if (kind === 'truck' && id) {
        const set = { trip_type: 'OWNED', truck_id: id };
        if (st.trailer) set.trailer_id = st.trailer;
        if (st.driver) set.driver_id = st.driver;
        return { method: 'PATCH', path: '/plan/rt/' + st.rtId, body: { set } };
      }
      if (kind === 'partner' && st.partner) {
        const r = _rate(st.rateTxt);
        return r.ok ? { method: 'PATCH', path: '/plan/rt/' + st.rtId, body: { set: { trip_type: 'PARTNER', partner_id: st.partner, partner_rate: r.v } } } : null;
      }
      return null;
    }
    let target, cyc = null;
    if (kind === 'rt' && id && st.cyc[id]) { cyc = st.cyc[id]; target = { rt_id: id, side: st.side }; }
    else if (kind === 'truck' && id) target = { new_rt: { trip_type: 'OWNED', truck_id: id, trailer_id: st.trailer || null, driver_id: st.driver || null }, side: st.side };
    else if (kind === 'partner' && st.partner) {
      const r = _rate(st.rateTxt);
      if (!r.ok) return null;
      target = { new_rt: { trip_type: 'PARTNER', partner_id: st.partner, partner_rate: r.v }, side: st.side };
    } else return null;
    const f = _hhmm(st.hubFrom), t = _hhmm(st.hubTo);
    const r = _stopsFor(st.needs, cyc, st.side, f && t ? _win(st.day, f, t) : null, (n) => _dayWin(n, st.win));
    if (r.missing.length) return { missing: r.missing };
    if (st.mode === 'move') return { method: 'POST', path: '/plan/move', body: { from: st.from, target, stops: r.stops } };
    return { method: 'POST', path: '/plan/legs', body: st.group ? { group: st.group, target, stops: r.stops } : { pieces: st.pieces, target, stops: r.stops } };
  }

  // a group header: the caps label, then a lighter suffix (Figma Δ1: «ΚΥΚΛΟΙ ΤΗΣ ΔΕΥΤΕΡΑΣ 12/10 · ένωση · 4»)
  const _grpHTML = (grp, label, tail) => '<div class="wn5-grp-h" data-grp="' + grp + '">' + _esc(label) + (tail ? '<span>' + _esc(tail) + '</span>' : '') + '</div>';
  function _assignHTML(st) {
    const vehicle = st.mode === 'vehicle';
    let h = '';
    // «Όλο το … μαζί»: every VS (Figma Δ1 2051:7746, audit B-18 — the band said nothing for a one-piece VS or an export,
    // and the user did not learn why a VS does not split here), and a national whose several pieces stand at Veroia.
    // The Veroia board is the one place that splits; a one-delivery national has nothing to split.
    const vsSrc = !!(st.group && st.group.order_id != null);
    if (!vehicle && st.group && (vsSrc || (st.items.length > 1 && st.items.every((it) => it.at_hub)))) h += '<div class="wn5-grey">Όλο το ' + _esc(st.ref) + ' μαζί · σπάσιμο μόνο στον Πίνακα Βέροιας</div>';
    if (vehicle) h += '<div class="wn5-grey">Ένωση με άλλο κύκλο: «Μεταφορά σε…» από τη φόρμα σκέλους (όλη η πλευρά).</div>';
    h += '<input type="search" class="wn5-dq" data-q placeholder="Αναζήτηση φορτηγού, οδηγού ή συνεργάτη" value="' + _esc(st.q) + '">';
    if (!st.ids.ok) h += '<div class="wn5-miss" data-ids-miss>Οι κατάλογοι δεν είναι διαθέσιμοι ακόμη: νέο φορτηγό και συνεργάτης ανοίγουν όταν έρθουν.</div>';
    if (!vehicle && _stopsFor(st.needs, null, st.side, ['probe', 'probe'], (n) => _dayWin(n, st.win)).missing.length) {
      h += '<div class="wn5-miss" data-place-miss>Η ανάθεση θέλει τον προορισμό και την ημέρα κάθε φόρτωσης και παράδοσης· για αυτή την παραγγελία δεν ήρθαν από τη βάση.</div>';
    }
    // B1: one window per stop the board brought without one (a VS bridge), on its own day, filled with the whole day
    if (!vehicle) {
      const seenW = new Set();
      for (const n of st.needs) {
        if (n.hub || n.loc == null || (n.from && n.to) || !n.day || seenW.has(n.key)) continue;
        seenW.add(n.key);
        const v = st.win[n.key] || DAY_WIN;
        h += '<div class="wn5-hubwin wn5-stopwin" data-stopwin="' + _esc(n.key) + '"><span>' + (n.role === 'load' ? 'Φόρτωση' : 'Παράδοση') + ' ' + _esc(_placeName(n.loc)) + ' · ' + _esc(_dayShort(n.day)) + ' *</span>'
          + '<input class="wn5-hm" data-win="' + _esc(n.key) + '" data-k="from" inputmode="numeric" placeholder="ΗΗ:ΛΛ" value="' + _esc(v.from) + '"> – '
          + '<input class="wn5-hm" data-win="' + _esc(n.key) + '" data-k="to" inputmode="numeric" placeholder="ΗΗ:ΛΛ" value="' + _esc(v.to) + '">'
          + '<small>όλη η ημέρα, αν δεν ξέρεις ώρα</small></div>';
      }
    }
    // a move carries the source's Veroia window (_stopsFor), so the field shows only when a Veroia stop would have no
    // window: an asterisk over a field nothing waits for claims a requirement that does not exist (Figma 2011:9294)
    if (!vehicle && st.needs.some((n) => n.hub && !(n.own && n.from && n.to))) {
      h += '<div class="wn5-hubwin"><span>' + (st.side === 'ANODOS' ? 'Άφιξη Βέροιας *' : 'Παράθυρο φόρτωσης Βέροιας *') + '</span>'
        + '<input class="wn5-hm" data-hub="from" inputmode="numeric" placeholder="ΗΗ:ΛΛ" value="' + _esc(st.hubFrom) + '"> – '
        + '<input class="wn5-hm" data-hub="to" inputmode="numeric" placeholder="ΗΗ:ΛΛ" value="' + _esc(st.hubTo) + '">'
        + '<small>μόνο όταν γίνεται νέα στάση Βέροιας</small></div>';
    }
    if (!vehicle) {
      // a group with no line is not drawn (Figma Δ1 shows only groups with content, audit B-21): «· 0» heads nothing
      if (st.rows.length || st.road.length) h += _grpHTML('rt', 'ΚΥΚΛΟΙ ' + DOW_GEN[_dow(st.day)] + ' ' + _dm(st.day), ' · ένωση · ' + st.rows.length);
      for (const r of st.rows) {
        const c = st.cyc[r.rtId];
        const tx = _cycText(c, r.row);
        let rate = '';
        if (c.trip_type === 'PARTNER') {
          rate = c.partner_rate == null
            ? ' <span class="wn5-flag-red">κόμιστρο λείπει</span> <span class="wn5-nw"><input class="wn5-rate" data-rate-rt="' + c.rt_id + '" inputmode="decimal" placeholder="—" aria-label="Κόμιστρο €"><span class="wn5-eur">€</span></span> <button type="button" class="wi4-btn sm" data-act="rate" data-rt="' + c.rt_id + '" hidden>Κράτα</button>'
            : ' <span class="wn5-cand-m">κόμιστρο ' + _esc(_pal(c.partner_rate)) + ' €</span>';
        }
        // a partner cycle keeps the board's own fact on its second line («Μόνο κάθοδος · συνεργάτης», the model's gap
        // side), with the Veroia window and the pallets on the first (Figma Δ1 Pelagos row)
        const gap = c.trip_type === 'PARTNER' && r.row && r.row.anod && r.row.anod.gap ? r.row.anod.gap.text : null;
        const where = r.veroia ? 'Βέροια ' + r.veroia : 'χωρίς στάση Βέροιας';
        const l1 = gap ? where + ' · ' + _pal(r.pallets) + 'π σήμερα' : where;
        const l2 = gap || _pal(r.pallets) + 'π σήμερα';
        h += '<div class="wn5-cand" data-line="rt" data-s="' + _esc(_norm([tx.l1, tx.l2, c.code].join(' '))) + '">' + _boxHTML(tx)
          + '<span class="wn5-cand-m"><b>' + _esc(l1) + '</b><span>' + _esc(l2) + '</span></span>'
          + '<span>' + _capHTML(r.pallets + st.pallets) + rate + '</span>'
          + '<button type="button" class="wi4-btn sm" data-act="save" data-cand="rt:' + c.rt_id + '">' + (st.mode === 'move' ? 'Μεταφορά' : 'Ένωση') + '</button></div>';
      }
      for (const c of st.road) {
        // the box as on the board (its row's tile: «κύκλος n/m»); «ως Δευ 22:00» names the day, the date is in the row
        h += '<div class="wn5-cand wn5-na" data-line="road">' + _boxHTML(_cycText(c, _row(c.rt_id)))
          + '<span class="wn5-cand-m"><b>' + _esc(_dayShort(c.date_start) + ' · στο δρόμο · Βέροια ως ' + DOW[_dow(_ymdOf(c.end_at))] + ' ' + _hm(c.end_at)) + '</b></span><span></span><span></span></div>';
      }
    }
    // without the catalogue the list's size is unknown, never 0 (principle 1): the header has no count then, and the
    // line above says why
    // B-21: hidden only when the catalogue says 0 — without it the count is unknown and the header stays (line above)
    if (st.free.length || !st.ids.ok) h += _grpHTML('free', 'ΕΛΕΥΘΕΡΑ ΦΟΡΤΗΓΑ', ' · ' + (vehicle ? 'άλλο όχημα' : 'νέος κύκλος') + (st.ids.ok ? ' · ' + st.free.length : ''));
    for (const t of st.free) {
      const key = 'truck:' + t.id;
      const next = t.next ? 'επόμενο: ' + (t.next.side ? t.next.side + ' ' : '') + _dayShort(t.next.day) : '';
      h += '<div class="wn5-cand" data-line="free" data-s="' + _esc(_norm(t.label)) + '"><div class="wi4-box own"><span class="wi4-l1 wi4-plate">' + _esc(t.label) + '</span></div>'
        + '<span class="wn5-cand-m"><b>' + _esc(t.from ? 'ελεύθερο από ' + t.from : 'ελεύθερο') + '</b>' + (next ? '<span>' + _esc(next) + '</span>' : '') + '</span>'
        + '<span>' + (vehicle ? '' : _capHTML(st.pallets, ' · νέος κύκλος')) + '</span>'
        + '<button type="button" class="wi4-btn sm" data-act="pick" data-cand="' + key + '"' + (st.ids.ok ? '' : ' disabled') + '>Ανάθεση</button></div>';
      if (st.pick === key) {
        h += '<div class="wn5-more" data-more="' + key + '">'
          + '<label class="wn5-field"><span>Ρυμούλκα</span><select data-trailer data-fh-search><option value="">—</option>' + _optsHTML(st.trailers, st.trailer) + '</select></label>'
          + '<label class="wn5-field"><span>Οδηγός</span><select data-driver data-fh-search><option value="">—</option>' + _optsHTML(st.drivers, st.driver) + '</select></label>'
          + '<button type="button" class="wi4-btn sm pri" data-act="save" data-cand="' + key + '">Ανάθεση</button></div>';
      }
    }
    h += _grpHTML('partner', 'ΣΥΝΕΡΓΑΤΗΣ', st.ids.ok ? ' · ' + st.partners.filter((p) => p.active).length : '')
      + '<div class="wn5-cand" data-line="partner" data-s="' + _esc(_norm(st.partners.map((p) => p.label).join(' '))) + '">'
      + '<label class="wn5-field"><span>Συνεργάτης</span><select data-partner data-fh-search' + (st.ids.ok ? '' : ' disabled') + '><option value="">—</option>' + _optsHTML(st.partners, st.partner) + '</select></label>'
      + '<span class="wn5-cand-m"><span>κόμιστρο · κενό = «κόμιστρο λείπει»</span></span>'
      + '<span>' + (vehicle ? '' : _capHTML(st.pallets, ' · δρομολόγιο συνεργάτη') + ' ') + '<span class="wn5-nw"><input class="wn5-rate" data-rate inputmode="decimal" placeholder="—" value="' + _esc(st.rateTxt) + '" aria-label="Κόμιστρο €"><span class="wn5-eur">€</span></span></span>'
      + '<button type="button" class="wi4-btn sm" data-act="save" data-cand="partner">Ανάθεση</button></div>';
    if (st.mode === 'move') {
      h += '<div class="wn5-grp-h" data-grp="wait">ΑΛΛΟ</div><div class="wn5-cand" data-line="wait">'
        // Figma 2011:9294 «Πίσω στη Βέροια» / «… σπάσιμο μόνο εκεί», a choice like the others: its title at the list's
        // left edge (no box), the moved pallets at the right. Its «απόθεμα Βέροιας» is left out: the base makes stock
        // only of a split's remainder (071 v_piece_state.is_stock), and the line must not claim it (R-66).
        // «Πίσω στην αναμονή» (a load picked up elsewhere) is not in Figma: R-66.
        + '<span class="wn5-alt"><b>' + (st.allHub ? 'Πίσω στη Βέροια' : 'Πίσω στην αναμονή') + '</b>'
        + '<span>' + (st.allHub ? 'σπάσιμο μόνο εκεί' : 'γυρίζουν ΠΡΟΣ ΑΝΑΘΕΣΗ') + '</span></span>'
        + '<span><span class="wn5-alt-p">' + _pal(st.pallets) + 'π</span></span>'
        + '<button type="button" class="wi4-btn sm" data-act="save" data-cand="wait">Μεταφορά</button></div>';
      // the source vehicle after the move (Figma 2011:9294 «ΚΖΗ 2108 · 33 → 24/33»), from its board row; a source
      // with no row on the loaded board has no line, never a guessed load
      if (st.src) h += '<div class="wn5-srcafter" data-src-after>' + _esc(st.src.label) + ' · ' + _pal(st.src.before) + ' → ' + _pal(st.src.before - st.pallets) + '/33</div>';
    }
    return h;
  }

  WN5Act.assign = async function assign(src, ctx) {
    ctx = Object.assign({ entry: 'row' }, ctx || {});
    const vehicle = !src || (!src.group && !src.pieces);
    const st = { mode: vehicle ? 'vehicle' : 'legs', rtId: _id(ctx.rtId), side: ctx.side === 'ANODOS' ? 'ANODOS' : 'KATHODOS', day: ctx.day || null,
      group: null, pieces: null, items: [], needs: [], pallets: 0, cyc: {}, rows: [], road: [], free: [], trailers: [], drivers: [], partners: [],
      ids: { ok: false }, pick: null, trailer: null, driver: null, partner: null, rateTxt: '', hubFrom: '', hubTo: '', filter: 'all', q: '', meta: '', ref: '', skipRt: null, from: null, win: {} };
    let title;
    // the snapshot: every value a body can carry is copied now (rule 4)
    if (vehicle) {
      const c = _cycle(st.rtId);
      if (!c) { WN5Act.strip(_boardHost(), _clientErr('rt_missing', 'Ο κύκλος δεν είναι στο board που φορτώθηκε — ανανέωσε')); return null; }
      st.cyc[c.rt_id] = _copy(c);
      const r = _row(c.rt_id);
      st.day = st.day || (r && r.dayKey) || c.date_start;
      const now = _cycText(c, r);
      title = 'Ανάθεση · ' + (c.code || 'κύκλος');
      st.meta = _dayShort(st.day) + ' · τώρα: ' + now.l1 + (now.l2 ? ' · ' + now.l2 : '');
    } else {
      const list = src.group ? _groupItems(src.group) : (src.pieces || []).map((p) => _item(p.piece_id)).filter(Boolean);
      if (!list.length) { WN5Act.strip(_boardHost(), _clientErr('piece_missing', 'Η παράδοση δεν είναι πια στο board — ανανέωσε')); return null; }
      st.items = _copy(list);
      st.group = src.group ? _copy(src.group) : null;
      st.pieces = src.pieces ? _copy(src.pieces) : null;
      const take = new Map((src.pieces || []).map((p) => [p.piece_id, p]));
      const hub = _hubId();
      st.needs = st.items.flatMap((it) => _needs(it, !!(take.get(it.piece_id) || {}).to_hub, hub));
      st.pallets = _sum(st.items.map((it) => { const p = take.get(it.piece_id); return p && typeof p.take_pallets === 'number' ? p.take_pallets : it.pallets; }));
      st.day = st.day || st.items[0].nat_ready_day || null;
      if (!ctx.side) st.side = _sideFor(st.items[0]);
      // F7 (live 28/10): an order without a reference is named by its number («Ανάθεση · #17 → …»), never «—»
      const i0 = st.items[0];
      st.ref = i0.reference || (i0.nat_order_id != null ? '#' + i0.nat_order_id : i0.order_id != null ? '#' + i0.order_id : '—');
      const vs = st.items[0].kind === 'vs_import' && st.items[0].load_from ? ' · φτάνει ' + _hm(st.items[0].load_from) : '';
      st.meta = _dayShort(st.day) + ' · ' + st.items.length + (st.items.length === 1 ? ' παράδοση' : ' παραδόσεις') + ' · ' + _pal(st.pallets) + 'π' + vs;
    }
    if (!st.day) { WN5Act.strip(_boardHost(), _clientErr('day_missing', 'Η ημέρα της ανάθεσης δεν είναι γνωστή — ανανέωσε')); return null; }
    // F12 (live 28/10): the Veroia window the order already has (its shipment's window at the hub) fills the field,
    // still editable — never asked again. Only a window of the assignment's own day: the field's hours are put on
    // st.day (_win), so a window of another day would move to the wrong date.
    if (!vehicle && !st.hubFrom && !st.hubTo) {
      const hw = (st.needs || []).find((n) => n.hub && n.from && n.to && _ymdOf(n.from) === st.day);
      if (hw) { st.hubFrom = _hm(hw.from); st.hubTo = _hm(hw.to); }
    }
    await _loadCands(st);
    if (!vehicle) {
      // «Ανάθεση · VS-118 → Rentis +2» (Figma Δ1): the first delivery's place, then how many other deliveries. Named
      // after the catalogue loads (the board has ids, not names, for waiting loads); a place the board did not send
      // (072 hub[], Ε-26) or a catalogue that did not come reads «—», never the client in its place.
      const drop = st.needs[1] || {};
      const pl = drop.loc == null ? null : drop.hub ? { name: 'Βέροια' } : (typeof PlanIds !== 'undefined' ? PlanIds.place(drop.loc) : null);
      title = 'Ανάθεση · ' + st.ref + ' → ' + ((pl && pl.name) || '—') + (st.items.length > 1 ? ' +' + (st.items.length - 1) : '');
    }
    return _picker(st, 'assign', title);
  };

  // The candidates of a window, snapshotted: the day's cycles (minus st.skipRt, the source of a move), the cycles
  // still on the road that day (shown, not offered), the catalogue lists (Ε-2). Shared by Δ1 and «Μεταφορά σε…»
  // (Δ1 note: «Ίδια λίστα στη «Μεταφορά σε…» της φόρμας σκέλους»).
  async function _loadCands(st) {
    const vehicle = st.mode === 'vehicle';
    if (!vehicle) {
      const ids = new Set();
      for (const r of _dayRows(st.day)) {
        const c = _cycle(r.rtId);
        if (!c || c.rt_id === st.skipRt) continue;
        ids.add(c.rt_id);
        st.cyc[c.rt_id] = _copy(c);
        st.rows.push({ rtId: c.rt_id, row: _copy(r), pallets: _sidePal(r, st.side), veroia: _veroiaOf(r, st.side) });
      }
      st.road = _copy(_cycles().filter((c) => !ids.has(c.rt_id) && c.rt_id !== st.skipRt && c.date_start < st.day && st.day <= c.date_end));
    }
    st.ids = typeof PlanIds !== 'undefined' ? await PlanIds.load() : { ok: false };
    if (st.ids.ok) {
      const own = vehicle ? st.cyc[st.rtId].truck_id : null;
      st.free = _freeTrucks(st.day, own);
      st.trailers = PlanIds.list('trailer'); st.drivers = PlanIds.list('driver'); st.partners = PlanIds.list('partner');
    }
  }
  // One press of a candidate: an assignment is one send; a move goes through the two steps (T14).
  function _pickSave(d, st, cand) {
    const req = _assignReq(st, cand);
    if (!req || req.missing) return;
    if (st.mode !== 'move') { _send(d, req, st.mode === 'vehicle' ? 'Άλλαξε το όχημα' : 'Ανατέθηκε', { intl: true }); return; }
    // a move drops legs: the two steps of S-82; a refusal before the list lands in this window (host)
    d.busy = true; _btns(d, true);
    WN5Act.twoStep({ method: req.method, path: req.path, body: req.body, kind: 'move', title: 'Μεταφορά · ' + st.what, verb: 'Μεταφορά', host: d.msg })
      .then(async (out) => {
        if (!d.closed) { d.busy = false; _btns(d, false); }
        if (out) { _close(d); await _afterSave(out, 'Μεταφέρθηκε', { intl: true }); }
      });
  }
  function _picker(st, kind, title) {
    const d = _dlg(kind, title, { wide: true });
    d.ft.innerHTML = '<button type="button" class="wi4-btn" data-act="cancel">Άκυρο</button>';
    // Figma Δ1 header: the meta inline after the title in grey, «Μόνο ελεύθερα | Όλα» at the top right. In the header,
    // not the body, so a redraw of the body keeps the filter where it is.
    const hd = d.dlg.querySelector('.wi4-dlg-hd');
    // A move's meta is its own row under the title (Figma 2013:7752), so it opens without the inline «· » separator
    hd.querySelector('.wi4-dlg-t').insertAdjacentHTML('afterend', '<span class="wn5-dlg-meta">' + (kind === 'move' ? '' : '· ') + _esc(st.meta) + '</span>'
      + '<span class="wn5-seg" role="group">'
      + '<button type="button" data-act="seg" data-v="free" class="' + (st.filter === 'free' ? 'on' : '') + '">Μόνο ελεύθερα</button>'
      + '<button type="button" data-act="seg" data-v="all" class="' + (st.filter === 'all' ? 'on' : '') + '">Όλα</button></span>');
    const filter = () => {
      const q = st.q ? _norm(st.q) : '';
      for (const ln of d.body.querySelectorAll('.wn5-cand[data-line]')) {
        const off = (st.filter === 'free' && (ln.dataset.line === 'rt' || ln.dataset.line === 'road')) || (q && !String(ln.dataset.s || '').includes(q));
        ln.hidden = !!off;
      }
      // a group whose every line is filtered out loses its header too: «ΚΥΚΛΟΙ … · 3» over nothing reads as a list
      // that failed to paint. A group that has no lines at all keeps its header (its count, or the line that says why).
      for (const gh of d.body.querySelectorAll('.wn5-grp-h')) {
        const lines = [];
        for (let n = gh.nextElementSibling; n && !n.matches('.wn5-grp-h'); n = n.nextElementSibling) if (n.matches('.wn5-cand[data-line]')) lines.push(n);
        gh.hidden = lines.length > 0 && lines.every((n) => n.hidden);
      }
    };
    d.refresh = () => {
      for (const b of d.dlg.querySelectorAll(SAVES)) {
        const req = _assignReq(st, b.dataset.cand);
        const needsIds = !/^(rt:|wait$)/.test(b.dataset.cand || '');   // the board gives these ids; new vehicles need the catalogue
        b.disabled = d.locked || d.busy || !req || !!req.missing || (needsIds && !st.ids.ok);
      }
    };
    const draw = () => {
      d.body.innerHTML = _assignHTML(st);
      if (typeof fhSelectSearchIn === 'function') fhSelectSearchIn(d.body);
      filter();
      d.refresh();
    };
    d.dlg.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-act]');
      if (!b || b.disabled || !_live()) return;
      const a = b.dataset.act;
      if (a === 'cancel') { if (!d.busy) _close(d); }
      else if (a === 'seg') { st.filter = b.dataset.v === 'free' ? 'free' : 'all'; for (const x of d.dlg.querySelectorAll('.wn5-seg button')) x.classList.toggle('on', x.dataset.v === st.filter); filter(); }
      else if (a === 'pick') { st.pick = st.pick === b.dataset.cand ? null : b.dataset.cand; st.trailer = null; st.driver = null; draw(); }
      else if (a === 'save') _pickSave(d, st, b.dataset.cand);
      else if (a === 'rate') {
        // a partner cycle's rate is its own act (one RPC), never piggy-backed on «Ένωση»
        const rt = _id(b.dataset.rt);
        const inp = rt && d.dlg.querySelector('[data-rate-rt="' + rt + '"]');
        const r = _rate(inp && inp.value);
        if (rt && r.ok && r.v !== null) _send(d, { method: 'PATCH', path: '/plan/rt/' + rt, body: { set: { partner_rate: r.v } } }, 'Γράφτηκε το κόμιστρο');
      }
    });
    d.dlg.addEventListener('input', (ev) => {
      const el = ev.target;
      if (el.matches('[data-q]')) { st.q = el.value; filter(); }
      else if (el.matches('[data-hub]')) { if (el.dataset.hub === 'from') st.hubFrom = el.value; else st.hubTo = el.value; d.refresh(); }
      else if (el.matches('[data-win]')) {
        const w = st.win[el.dataset.win] || (st.win[el.dataset.win] = Object.assign({}, DAY_WIN));
        w[el.dataset.k === 'to' ? 'to' : 'from'] = el.value;
        d.refresh();
      }
      else if (el.matches('[data-rate]')) { st.rateTxt = el.value; d.refresh(); }
      else if (el.matches('[data-rate-rt]')) {
        // «Κράτα» only once there is a rate to keep: an empty press did nothing, and the hidden button keeps the partner
        // line on one 40px row as Figma Δ1 2051:7735 (field + € + the line's button)
        const r = _rate(el.value), kb = d.dlg.querySelector('[data-act="rate"][data-rt="' + el.dataset.rateRt + '"]');
        if (kb) kb.hidden = !(r.ok && r.v !== null);
      }
    });
    d.dlg.addEventListener('change', (ev) => {
      const el = ev.target;
      if (el.matches('[data-trailer]')) st.trailer = _id(el.value);
      else if (el.matches('[data-driver]')) st.driver = _id(el.value);
      else if (el.matches('[data-partner]')) st.partner = _id(el.value);
      else return;
      d.refresh();
    });
    draw();
    _gate(d);
    return d;
  }

  // red «ΠΡΟΣ ΑΝΑΘΕΣΗ» of a waiting order (the row) or of a cycle without vehicle, and «Ανάθεση» of ΕΠΟΜΕΝΑ;
  // the ids are read at click time (rule of v4: never a DOM index)
  ACTS.assign = (el) => {
    const card = el.closest('.wn5-qcard[data-piece]');
    const row = el.closest('.wn5-row');
    const pid = _id(card ? card.dataset.piece : row && row.dataset.piece);
    if (pid) {
      const it = _item(pid);
      if (!it) { WN5Act.strip(_boardHost(), _clientErr('piece_missing', 'Η παράδοση δεν είναι πια στο board — ανανέωσε')); return; }
      const group = it.order_id != null ? { order_id: it.order_id } : (it.nat_order_id != null ? { nat_order_id: it.nat_order_id } : null);
      const dayEl = row && row.closest('.wn5-day[data-date]');
      WN5Act.assign(group ? { group } : { pieces: [{ piece_id: pid }] },
        { day: it.nat_ready_day || (dayEl && dayEl.dataset.date) || null, side: _sideFor(it), entry: card ? 'queue' : 'row' });
      return;
    }
    const rt = _id(row && row.dataset.rt);
    if (rt) WN5Act.assign(null, { entry: 'row', rtId: rt });
  };

  // ═══ T13 · «+» on a side: «Νέα παραγγελία | Από αναμονή» (Figma 2011:10022) ═══
  // A place's name for a line: the board's own stop name first, then the catalogue (Ε-2), never invented.
  function _placeName(loc) {
    if (loc == null) return '—';
    for (const c of _cycles()) for (const s of c.stops || []) if (s.location_id === loc && s.location) return s.location;
    const p = typeof PlanIds !== 'undefined' ? PlanIds.place(loc) : null;
    return p && p.name ? p.name : '—';
  }
  // the city under the place (Figma 2011:10306): the catalogue's only (the board carries none); '' until it is read
  function _placeCity(loc) {
    try { const p = loc != null && typeof PlanIds !== 'undefined' ? PlanIds.place(loc) : null; return p && p.city ? p.city : ''; } catch (e) { return ''; }
  }
  const _wd = (ymd) => (ymd ? DOW[_dow(ymd)] : '—');
  // «φεύγει ως 22:00» / «φεύγει ως Τετ 22:00»: the day is the base's leave_by (decision 18), named only when it is not
  // the side's own day (Figma 2011:10350/10426); «22:00» is the screen's word (S-113). Overdue = «έπρεπε να φύγει …» in
  // red (.wn5-late), which already says it is late: no « · καθυστέρηση» tail to break the 40px line.
  const _leaveBy = (it, day) => (it.leave_by ? (it.overdue ? 'έπρεπε να φύγει ' : 'φεύγει ως ') + (it.leave_by === day ? '' : _wd(it.leave_by) + ' ') + '22:00' : '');
  function _takeOf(st, it) {
    // one decimal at most, more than 0, not above the stock (072:742-750 refuse the rest; the button stays off)
    const s = String(st.take[it.piece_id] == null ? it.pallets : st.take[it.piece_id]).trim().replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) && n > 0 && n <= it.pallets && Math.round(n * 10) === n * 10 ? n : null;
  }
  function _plusReq(st, it) {
    if (it._ro) return null;
    const f = _hhmm(st.hubFrom), t = _hhmm(st.hubTo);
    const r = _stopsFor(_needs(it, false, st.hub), st.cyc, st.side, f && t ? _win(st.day, f, t) : null, (n) => _dayWin(n));
    if (r.missing.length) return { missing: r.missing };
    const piece = { piece_id: it.piece_id };
    if (it.is_stock) {
      const n = _takeOf(st, it);
      if (n === null) return null;
      piece.take_pallets = n;               // stock: always the number typed (equal = no split, 072:744)
    }
    return { method: 'POST', path: '/plan/legs', body: { pieces: [piece], target: { rt_id: st.rtId, side: st.side }, stops: r.stops } };
  }
  const _plusWin = (st, it) => (st.side === 'ANODOS' ? [it.load_from, it.load_to] : [it.deliver_from, it.deliver_to]);
  // What the line does to the side, as chips pushed against «Πρόσθεσε» (Figma 2011:10306): warnings first (amber), then
  // x/33. Without overflow the rank rides in the x/33 chip («→ 33/33 · μπαίνει 3η»); over 33 it is its own chip. A load
  // for another day than the side's stops says so INSTEAD of a rank, which would rank it among another day's stops
  // (2011:10426); a VS that reaches Veroia at or after the side's loading window starts says when (2011:10382).
  function _plusChips(st, it) {
    const anod = st.side === 'ANODOS';
    const win = _plusWin(st, it);
    const n = st.pallets + (it.is_stock ? (_takeOf(st, it) || 0) : it.pallets);
    const warn = [];
    const day = _ymdOf(win[0]);
    const other = !!day && st.sideDays.length > 0 && !st.sideDays.includes(day);
    if (other) warn.push((anod ? 'φόρτωση ' : 'παράδοση ') + _wd(day) + ', άλλη ημέρα');
    let late = false;
    if (!anod && !it.is_stock && it.kind === 'vs_import' && it.load_from && st.hubWin && new Date(it.load_from) >= new Date(st.hubWin[0])) {
      late = true;
      warn.push('φτάνει ' + _hm(it.load_from) + ' · φόρτωση ' + _hm(st.hubWin[0]) + '–' + _hm(st.hubWin[1]));
    }
    let k = null;
    try {
      if (!other && typeof WN5L !== 'undefined' && win[0]) { const x = WN5L.stopRank(st.sideStops, win[0]); if (Number.isFinite(x) && x > 0) k = x; }
    } catch (e) { _log(e, 'WN5Act plus stopRank'); }
    let h = warn.map((w) => '<span class="wn5-cap over">' + _esc(w) + '</span>').join('');
    if (n > 33) h += _capHTML(n) + (k ? '<span class="wn5-cap">μπαίνει ' + k + 'η</span>' : '');
    else h += _capHTML(n, k ? (late ? ' · ' : ' · μπαίνει ') + k + 'η' : '');
    return h;
  }
  // what a missing stop needs: the Veroia window is the user's field above the list (missing 'hub'); a place or a
  // window that the board does not carry is the base's (Ε-26)
  function _missText(st, miss) {
    const own = miss.includes('hub') ? (st.side === 'ANODOS' ? 'συμπλήρωσε την άφιξη Βέροιας' : 'συμπλήρωσε το παράθυρο φόρτωσης Βέροιας') : '';
    const base = miss.some((m) => m !== 'hub') ? 'λείπει ο προορισμός ή το παράθυρο από τη βάση' : '';
    return [base, own].filter(Boolean).join(' · ');
  }
  function _plusLineHTML(st, it) {
    const anod = st.side === 'ANODOS';
    const win = _plusWin(st, it);
    // B1: a piece with no window of its own goes in on its day, whole day — said here, never a silent hour
    const wday = st.side === 'ANODOS' ? it.nat_ready_day : (it.nat_due_day || it.nat_ready_day);
    const when = win[0] ? _wd(_ymdOf(win[0])) + ' ' + _hm(win[0]) + '–' + _hm(win[1]) : wday ? _wd(wday) + ' όλη η ημέρα' : '—';
    const loc = anod ? it.position_location_id : it.nat_to_location_id;
    const place = _placeName(loc), city = _placeCity(loc);
    const req = _plusReq(st, it);
    const miss = req && req.missing ? '<span class="wn5-miss">' + _esc(_missText(st, req.missing)) + '</span>' : '';
    const pal = it.is_stock
      ? '<span class="' + (it.overdue ? 'wn5-late' : 'wn5-leave') + '">' + _esc(_pal(it.pallets) + 'π · ' + _leaveBy(it, st.day)) + '</span>'
      : '<span>' + _esc(_pal(it.pallets)) + 'π</span>';
    const take = it.is_stock && !it._ro ? '<label class="wn5-take">πόσες <input class="wn5-hm" data-take="' + it.piece_id + '" inputmode="decimal" value="' + _esc(st.take[it.piece_id] == null ? it.pallets : st.take[it.piece_id]) + '"> από ' + _esc(_pal(it.pallets)) + '</label>' : '';
    const s = _norm([it.client, it.reference, place, city].join(' '));
    // col 1 = the place, as the frame (the group header names the client); the client and the reference stay in the
    // line's title and in its search text. ΑΝΟΔΟΣ adds its reference under the place (2011:10446 «Aspropyrgos · VS-140»).
    return '<div class="wn5-pline' + (it._ro ? ' wn5-na' : '') + '" data-piece="' + it.piece_id + '" data-s="' + _esc(s) + '" title="' + _esc([it.client, it.reference].filter(Boolean).join(' · ')) + '">'
      + '<span class="wn5-cand-m wn5-pl-who"><b>' + _esc(place) + '</b><span><span data-city="' + _esc(loc == null ? '' : loc) + '">' + _esc(city) + '</span>'
      + (anod && it.reference ? '<span class="wn5-pl-ref">' + _esc(it.reference) + '</span>' : '') + '</span></span>'
      + '<span class="wn5-cand-m wn5-pl-when"><b>' + _esc(when) + '</b>' + pal + '</span>'
      + '<span class="wn5-pcap">' + (it._ro ? '' : '<span class="wn5-pchips">' + _plusChips(st, it) + '</span>' + take) + miss + '</span>'
      + (it._ro ? '<span class="wn5-pl-ro">για την ΑΝΟΔΟ</span>' : '<button type="button" class="wi4-btn sm" data-act="save" data-piece="' + it.piece_id + '">Πρόσθεσε</button>') + '</div>';
  }
  const _cnt = (items) => (items.length > 1 ? ' · ' + items.length : '');
  function _plusGroups(st) {
    const all = _copy(_allItems());
    const anodIt = all.filter((it) => !it.is_stock && _sideFor(it) === 'ANODOS');
    const groups = [];
    if (st.side === 'KATHODOS') {
      const kath = all.filter((it) => !it.is_stock && _sideFor(it) === 'KATHODOS');
      const by = (key, head) => {
        const m = new Map();
        for (const it of kath.filter((x) => key(x) != null)) { const k = key(it); if (!m.has(k)) m.set(k, []); m.get(k).push(it); }
        for (const items of m.values()) {
          const vs = items[0].kind === 'vs_import';
          // «φτάνει» = the time the load is at Veroia: a VS's load_from, and a national's only when its pickup IS Veroia
          // (at the hub or positioned there). A national picked up at its own place has load_from = that pickup window,
          // not an arrival, so it gets no «φτάνει» (Ε-35: no ETA the board does not carry).
          const atV = vs || items[0].at_hub || (items[0].position_location_id != null && items[0].position_location_id === st.hub);
          const arr = atV && items[0].load_from ? ' · φτάνει ' + _hm(items[0].load_from) : '';
          // the grey «αργό VS» chip = the base's overdue of a waiting VS (Ε-35: the flag only, no time — plan_board
          // carries none); the count only from two lines up (Figma 2011:10373 «· φτάνει 18:00 · 3π»)
          const chip = vs && items.some((x) => x.overdue === true) ? 'αργό VS' : null;
          groups.push({ head: head(items[0]), chip, sub: arr + _cnt(items) + ' · ' + _pal(_sum(items.map((x) => x.pallets))) + 'π', items });
        }
      };
      by((x) => (x.kind === 'vs_import' ? 'o' + x.order_id : null), (x) => (x.reference || 'VS') + ' · ' + (x.client || '—'));
      by((x) => (x.kind === 'national' ? 'n' + x.nat_order_id : null), (x) => 'ΕΘΝ · ' + (x.client || '—'));
      const stock = all.filter((it) => it.is_stock && it.at_hub);
      if (stock.length) groups.push({ head: 'ΑΠΟΘΕΜΑ ΒΕΡΟΙΑΣ', sub: _cnt(stock) + ' · ' + _pal(_sum(stock.map((x) => x.pallets))) + 'π', items: stock });
      if (anodIt.length) groups.push({ head: 'ΑΙΤΗΜΑΤΑ ΑΝΟΔΟΥ', sub: _cnt(anodIt) + ' · μόνο από το «+» της ΑΝΟΔΟΥ', items: anodIt.map((x) => Object.assign(x, { _ro: true })) });
    } else if (anodIt.length) {
      // Figma 2011:10446 «ΑΙΤΗΜΑΤΑ ΑΝΟΔΟΥ · ΔΙΕΘΝΩΝ · στη Βέροια ως Τετ 08:00»: «ΔΙΕΘΝΩΝ» only when every request is an
      // international's (order_id), the deadline is the earliest end of their windows at Veroia; never invented.
      const intl = anodIt.every((x) => x.order_id != null) ? ' · ΔΙΕΘΝΩΝ' : '';
      const by = anodIt.map((x) => x.deliver_to).filter((x) => x && !isNaN(new Date(x).getTime())).sort((a, b) => new Date(a) - new Date(b))[0];
      groups.push({ head: 'ΑΙΤΗΜΑΤΑ ΑΝΟΔΟΥ' + intl, sub: by ? ' · στη Βέροια ως ' + _wd(_ymdOf(by)) + ' ' + _hm(by) : _cnt(anodIt), items: anodIt });
    }
    return groups;
  }

  WN5Act.plus = function plus(rtId, side, anchorEl) {
    const c = _cycle(_id(rtId));
    if (!c) { WN5Act.strip(_boardHost(), _clientErr('rt_missing', 'Ο κύκλος δεν είναι στο board που φορτώθηκε — ανανέωσε')); return null; }
    side = side === 'ANODOS' ? 'ANODOS' : 'KATHODOS';
    const r = _row(c.rt_id);
    const sd = _sideOfRow(r, side);
    const hub = _hubId();
    // the snapshot (rule 4): the cycle, the side's capacity, the waiting pieces as they are now
    const sideStops = _copy((c.stops || []).filter((s) => s.side === side && s.location_id !== hub));
    const hubStop = (c.stops || []).find((s) => s.side === side && s.location_id === hub) || null;
    const st = { rtId: c.rt_id, side, cyc: _copy(c), hub, day: (sd && sd.day) || (r && r.dayKey) || c.date_start,
      pallets: _sidePal(r, side), veroia: _veroiaOf(r, side), take: {}, hubFrom: '', hubTo: '', q: '', mode: 'wait', groups: [],
      sideStops, sideDays: [...new Set(sideStops.map((s) => s.stop_day || _ymdOf(s.planned_from)).filter(Boolean))],
      hubWin: hubStop && hubStop.planned_from && hubStop.planned_to ? [hubStop.planned_from, hubStop.planned_to] : null };
    st.groups = _plusGroups(st);
    st.hubStop = !!hubStop;
    const box = _cycText(c, r);
    const anod = side === 'ANODOS';
    const title = anod ? 'Πρόσθεσε στην ΑΝΟΔΟ' : 'Πρόσθεσε στην ΚΑΘΟΔΟ';
    const meta = [box.l1.split(' · ')[0], _dayShort(st.day), st.veroia ? 'φόρτωση ' + st.veroia : null, _pal(st.pallets) + '/33'].filter(Boolean).join(' · ');
    // A popover (Figma 2011:10306/10447): no «×» and no footer — Esc, a click outside or another «+» close it. The
    // header holds title · meta and «Νέα παραγγελία | Από αναμονή», like Δ1 (T12): a redraw of the body keeps them.
    const d = _dlg('plus', title, { anchor: anchorEl, wide: true, pop: true });
    d.dlg.classList.add('wn5-plusdlg');
    if (anod) d.dlg.classList.add('wn5-plus-a');
    d.dlg.querySelector('.wi4-dlg-t').insertAdjacentHTML('afterend', '<span class="wn5-dlg-meta">· ' + _esc(meta) + '</span>'
      + '<span class="wn5-seg" role="group"><button type="button" data-act="seg" data-v="new">Νέα παραγγελία</button>'
      + '<button type="button" data-act="seg" data-v="wait" class="on">Από αναμονή</button></span>');
    const filter = () => {
      const q = st.q ? _norm(st.q) : '';
      for (const ln of d.body.querySelectorAll('.wn5-pline')) ln.hidden = !!q && !String(ln.dataset.s || '').includes(q);
    };
    const byId = (pid) => { for (const g of st.groups) for (const it of g.items) if (it.piece_id === pid) return it; return null; };
    d.refresh = () => {
      for (const b of d.dlg.querySelectorAll('[data-act="save"][data-piece]')) {
        const it = byId(_id(b.dataset.piece));
        const req = it && _plusReq(st, it);
        b.disabled = d.locked || d.busy || !req || !!req.missing;
      }
    };
    const draw = () => {
      for (const x of d.dlg.querySelectorAll('.wi4-dlg-hd .wn5-seg button')) x.classList.toggle('on', x.dataset.v === st.mode);
      let h = '';
      if (st.mode === 'new') {
        h += '<p class="wn5-miss">Η σύντομη φόρμα ανοίγει με τη φόρμα εθνικής v5.</p>';
      } else {
        // Figma 2011:10315/10316 (ΚΑΘΟΔΟΣ only; the ΑΝΟΔΟΣ frame 10446 has no hint): what «Νέα παραγγελία» pre-fills.
        // Drawn only once the form exists, as the ΠΡΟΡΥΘΜΙΣΗ; an unassigned cycle has no truck to name, so it is left out.
        if (!anod && typeof WN5Form !== 'undefined' && typeof WN5Form.openOrder === 'function') {
          const truck = box.cls === 'un' ? null : box.l1.split(' · ')[0];
          h += '<div class="wn5-grey wn5-phint">«Νέα παραγγελία» ανοίγει τη σύντομη φόρμα με ' + _esc(_dayShort(st.day)) + ', ΚΑΘΟΔΟ'
            + (truck ? ' και ' + _esc(truck) : '') + ' έτοιμα· Τιμή € (χωρίς ΦΠΑ) υποχρεωτική.</div>';
        }
        // Figma 2011:10446: the ΑΝΟΔΟΣ popover has no search (its list is the requests of one side's day)
        if (!anod) h += '<input type="search" class="wn5-dq" data-q placeholder="Αναζήτηση στην αναμονή (πελάτης, σημείο, VS)" value="' + _esc(st.q) + '">';
        if (!st.hubStop && st.groups.some((g) => g.items.some((it) => !it._ro && _needs(it, false, hub).some((n) => n.hub)))) {
          h += '<div class="wn5-hubwin"><span>' + (anod ? 'Άφιξη Βέροιας *' : 'Παράθυρο φόρτωσης Βέροιας *') + '</span>'
            + '<input class="wn5-hm" data-hub="from" placeholder="ΗΗ:ΛΛ" value="' + _esc(st.hubFrom) + '"> – <input class="wn5-hm" data-hub="to" placeholder="ΗΗ:ΛΛ" value="' + _esc(st.hubTo) + '"></div>';
        }
        if (!st.groups.length) h += '<p class="wn5-none">Καμία παράδοση σε αναμονή για αυτό το σκέλος.</p>';
        for (const g of st.groups) h += '<div class="wn5-grp-h">' + _esc(g.head) + (g.chip ? '<span class="wn5-grp-c">' + _esc(g.chip) + '</span>' : '') + '<span class="wn5-grp-s">' + _esc(g.sub) + '</span></div>' + g.items.map((it) => _plusLineHTML(st, it)).join('');
        // Figma 2011:10022 (ΑΝΟΔΟΣ): «ΠΡΟΡΥΘΜΙΣΗ · Άδειες παλέτες · εθνική 1 € · Άνοιγμα» — the T20 form prefilled (Ε-39).
        // Drawn only once the form exists, so no dead line before T20.
        if (anod && typeof WN5Form !== 'undefined' && typeof WN5Form.openOrder === 'function') {
          // one line from the row's 24px inset (2011:10488): label · sub, then «Άνοιγμα» at the right — not the Δ1
          // candidate grid, whose empty 176px box column pushed the text 200px in and stacked it
          h += '<div class="wn5-grp-h">ΠΡΟΡΥΘΜΙΣΗ</div><div class="wn5-cand wn5-preset" data-line="preset"><span class="wn5-preset-m"><b>Άδειες παλέτες · εθνική 1 €</b>'
            + '<span>πελάτης, σημείο, ποσότητα</span></span><button type="button" class="wi4-btn sm" data-act="preset">Άνοιγμα</button></div>';
        }
        // the closing grey band of the ΚΑΘΟΔΟΣ frame (2011:10444); the ΑΝΟΔΟΣ frame has none (it has no stock)
        // Approved copy of 2011:10445; «(π.χ. …)» names the first arriving VS of this list (none → left out, never invented).
        // The T21 sentence («Αλλαγές ή αφαίρεση: κλικ στο σκέλος → φόρμα σκέλους.») joins with the leg form.
        if (!anod) {
          const vsEx = st.groups.find((g) => g.items.some((it) => it.kind === 'vs_import' && it.reference));
          const eg = vsEx ? ' (π.χ. ' + vsEx.items.find((it) => it.kind === 'vs_import' && it.reference).reference + ')' : '';
          h += '<p class="wn5-grey wn5-pnote">Προειδοποίηση, όχι άρνηση. Ποσότητα («πόσες») μόνο για απόθεμα που είναι ήδη στη Βέροια (owner 21/10): το υπόλοιπο μένει απόθεμα. Φορτίο που φτάνει' + _esc(eg) + ' μπαίνει ολόκληρο· για σπάσιμο → Πίνακας Βέροιας «Σπάσε…».</p>';
        }
      }
      d.body.innerHTML = h;
      filter();
      d.refresh();
      _place(d);
    };
    d.dlg.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-act]');
      if (!b || b.disabled || !_live()) return;
      const a = b.dataset.act;
      if (a === 'seg') {
        st.mode = b.dataset.v === 'new' ? 'new' : 'wait';
        if (st.mode === 'new' && typeof WN5Form !== 'undefined' && typeof WN5Form.openOrder === 'function') {
          _close(d);
          WN5Form.openOrder({ side, day: st.day, rtId: st.rtId, veroia: sd && sd.veroia ? { from: _t(sd.veroia.from), to: _t(sd.veroia.to) } : undefined });
          return;
        }
        draw();
      } else if (a === 'preset') {
        _close(d);
        WN5Form.openOrder({ side, day: st.day, rtId: st.rtId, veroia: sd && sd.veroia ? { from: _t(sd.veroia.from), to: _t(sd.veroia.to) } : undefined, preset: 'empties' });
      } else if (a === 'save') {
        const it = byId(_id(b.dataset.piece));
        const req = it && _plusReq(st, it);
        if (req && !req.missing) _send(d, req, 'Προστέθηκε στο σκέλος', { intl: true });
      }
    });
    d.dlg.addEventListener('input', (ev) => {
      const el = ev.target;
      if (el.matches('[data-q]')) { st.q = el.value; filter(); return; }
      if (el.matches('[data-hub]')) {
        if (el.dataset.hub === 'from') st.hubFrom = el.value; else st.hubTo = el.value;
        // the «λείπει …» of each line follows the field (it said «συμπλήρωσε …» a moment ago)
        for (const ln of d.body.querySelectorAll('.wn5-pline[data-piece]')) {
          const it = byId(_id(ln.dataset.piece)), m = ln.querySelector('.wn5-miss'), req = it && _plusReq(st, it);
          if (m && !(req && req.missing)) m.remove();
          else if (m) m.textContent = _missText(st, req.missing);
        }
      } else if (el.matches('[data-take]')) {
        const pid = _id(el.dataset.take); st.take[pid] = el.value;
        const it = byId(pid), chips = el.closest('.wn5-pline').querySelector('.wn5-pchips');
        if (it && chips) chips.innerHTML = _plusChips(st, it);
      } else return;
      d.refresh();
    });
    draw();
    _gate(d);
    // the city under each place comes from the catalogue (Ε-2): filled in place when it is read, never a redraw (a
    // typed «πόσες» or search stays as it is); without the catalogue the line keeps the place alone
    if (typeof PlanIds !== 'undefined') {
      PlanIds.load().then((res) => {
        if (!res || !res.ok || d.closed) return;
        for (const x of d.body.querySelectorAll('[data-city]')) { const loc = _id(x.dataset.city); if (loc) x.textContent = _placeCity(loc); }
        for (const ln of d.body.querySelectorAll('.wn5-pline[data-piece]')) {
          const it = byId(_id(ln.dataset.piece));
          if (it) { const loc = st.side === 'ANODOS' ? it.position_location_id : it.nat_to_location_id; ln.dataset.s = _norm([it.client, it.reference, _placeName(loc), _placeCity(loc)].join(' ')); }
        }
      }, (e) => _log(e, 'WN5Act plus PlanIds'));
    }
    return d;
  };
  ACTS.plus = (el) => { const row = el.closest('.wn5-row[data-rt]'); WN5Act.plus(_id(row && row.dataset.rt), el.dataset.side, el); };

  // ═══ T14 · «Μεταφορά σε…» (Δ6): the Δ1 list in mode 'move', then the two steps ═══
  // What a moved piece needs on its new side, read from the SOURCE cycle (072:1208-1215: where its first moved leg
  // picks up, where it ends): its load stop and its unload stop there, with their windows.
  function _moveParts(src, pieceIds, hub) {
    const needs = [], items = [];
    for (const pid of pieceIds) {
      let pick = null, drop = null, leg = null;
      for (const s of src.stops || []) for (const l of s.legs || []) {
        if (l.piece_id !== pid) continue;
        if (l.act === 'load' && !pick) { pick = s; leg = l; }
        if (l.act === 'unload') drop = s;
      }
      if (!pick || !drop) continue;
      needs.push({ loc: pick.location_id, from: pick.planned_from, to: pick.planned_to, hub: pick.location_id === hub, own: true },
                 { loc: drop.location_id, from: drop.planned_from, to: drop.planned_to, hub: drop.location_id === hub, own: true });
      items.push({ piece_id: pid, side: pick.side, pallets: leg.pallets, client: leg.client, reference: leg.reference, pickHub: pick.location_id === hub,
        dropLoc: drop.location_id, dropName: drop.location_id === hub ? 'Βέροια' : (drop.location || null), dropFrom: drop.planned_from || null });
    }
    return { needs, items };
  }

  // Where the board shows the pieces after ✈ «Σπάσιμο»: «για μοίρασμα» only when the Veroia board lists them
  // (072 has no mark for «sent to be split» yet, Ε-41: a piece without a prior drop comes back as «ΠΡΟΣ ΑΝΑΘΕΣΗ»).
  function _whereBack(pieceIds) {
    const m = _state().model;
    const ids = new Set(pieceIds);
    return ((m && m.hub && m.hub.split) || []).some((h) => ids.has(h.pieceId))
      ? 'Οι παραδόσεις γύρισαν στη Βέροια για μοίρασμα'
      : 'Οι παραδόσεις γύρισαν στη Βέροια ως ΠΡΟΣ ΑΝΑΘΕΣΗ';
  }

  WN5Act.move = async function move(from, ctx) {
    ctx = ctx || {};
    const src = _cycle(_id(from && from.rt_id));
    if (!src) { WN5Act.strip(ctx.host || _boardHost(), _clientErr('rt_missing', 'Ο κύκλος δεν είναι στο board που φορτώθηκε — ανανέωσε')); return null; }
    const hub = _hubId();
    let pieceIds;
    if (Array.isArray(from.piece_ids)) pieceIds = from.piece_ids.map(_id).filter(Boolean);
    else {
      // a whole side: its loads whose delivery is not done (an executed leg stays, 072:1098)
      const side = from.side === 'ANODOS' ? 'ANODOS' : 'KATHODOS';
      const done = new Set((src.stops || []).filter((s) => s.executed).map((s) => s.stop_id));
      const dropOf = new Map();
      for (const s of src.stops || []) for (const l of s.legs || []) if (l.act === 'unload') dropOf.set(l.piece_id, s.stop_id);
      pieceIds = [...new Set((src.stops || []).filter((s) => s.side === side).flatMap((s) => (s.legs || []).filter((l) => l.act === 'load' && !done.has(dropOf.get(l.piece_id))).map((l) => l.piece_id)))];
    }
    const mp = _moveParts(src, pieceIds, hub);
    const side = from.side || (mp.items[0] && mp.items[0].side) || 'KATHODOS';
    const r = _row(src.rt_id);
    const sd = _sideOfRow(r, side);
    // Figma 2013:7751/7752: «Μεταφορά σε… · Phi Deli · 9π» over «VS-118 · ΚΑΘΟΔΟΣ · παράδοση Τρί 13/10» — where it
    // goes and how much, then which load, which side, which delivery day. Never the client (the Δ1 rule of T12).
    const sideW = side === 'ANODOS' ? 'ΑΝΟΔΟΣ' : 'ΚΑΘΟΔΟΣ';
    const whole = !Array.isArray(from.piece_ids);
    const pal = _sum(mp.items.map((x) => x.pallets));
    const drops = [...new Set(mp.items.map((x) => x.dropLoc))];
    const place = mp.items[0] ? (mp.items[0].dropName || _placeName(mp.items[0].dropLoc)) : '—';
    const refs = [...new Set(mp.items.map((x) => x.reference).filter(Boolean))].join(', ') || '—';
    const firstDrop = mp.items.map((x) => x.dropFrom).filter(Boolean).sort((a, b) => new Date(a) - new Date(b))[0];
    const head = whole ? 'όλη η ' + sideW + ' · ' + _pal(pal) + 'π' : place + (drops.length > 1 ? ' +' + (drops.length - 1) : '') + ' · ' + _pal(pal) + 'π';
    const meta = [whole ? (src.code || 'κύκλος') : refs, sideW, whole ? mp.items.length + (mp.items.length === 1 ? ' παράδοση' : ' παραδόσεις') : null,
      firstDrop ? 'παράδοση ' + _dayShort(_ymdOf(firstDrop)) : null].filter(Boolean).join(' · ');
    const what = whole ? 'όλη η ' + sideW + ' του ' + (src.code || 'κύκλου') : refs + ' · ' + place;
    const tx0 = _cycText(src, r);
    const srcAfter = r ? { label: src.trip_type === 'PARTNER' ? tx0.l1 : (src.truck || tx0.l1), before: _sidePal(r, side) } : null;
    const st = { mode: 'move', from: _copy(from), side, day: ctx.day || (sd && sd.day) || (r && r.dayKey) || src.date_start, skipRt: src.rt_id,
      rtId: null, group: null, pieces: null, items: _copy(mp.items), needs: _copy(mp.needs), pallets: _sum(mp.items.map((x) => x.pallets)),
      allHub: mp.items.length > 0 && mp.items.every((x) => x.pickHub), cyc: {}, rows: [], road: [], free: [], trailers: [], drivers: [], partners: [],
      ids: { ok: false }, pick: null, trailer: null, driver: null, partner: null, rateTxt: '', hubFrom: '', hubTo: '', filter: 'all', q: '', ref: '',
      what, meta, src: srcAfter };
    if (ctx.direct === 'wait') {
      // ✈ «Σπάσιμο παραγγελιών → Βέροια»: no list of candidates, straight to the two steps — ONLY when every
      // delivery loads at Veroia. target {wait:true} sends a piece back to where it stands (072:1162): for a load
      // picked up elsewhere that is not Veroia, and a line saying «στη Βέροια» would lie (principles 1, 2). So: a
      // visible refusal on the board, and nothing is sent.
      // No undelivered load on the ΚΑΘΟΔΟΣ (all delivered, or none): «φορτώνει και αλλού» would be untrue — its own line.
      if (!mp.items.length) {
        WN5Act.strip(ctx.host || _boardHost(), _clientErr('nothing_to_split', 'Δεν υπάρχουν παραδόσεις της ΚΑΘΟΔΟΥ για σπάσιμο στο ' + (src.code || 'κύκλο')));
        return null;
      }
      if (!st.allHub) {
        WN5Act.strip(ctx.host || _boardHost(), _clientErr('not_all_hub', 'Το «Σπάσιμο παραγγελιών → Βέροια» θέλει όλες τις παραδόσεις της ΚΑΘΟΔΟΥ να φορτώνουν στη Βέροια· ' + (src.code || 'ο κύκλος') + ' φορτώνει και αλλού — άνοιξε το σκέλος και «Μεταφορά σε…»'));
        return null;
      }
      // the body of the «ΑΛΛΟ» line itself (one builder for both ways to the same act, principle 3)
      const req = _assignReq(st, 'wait');
      const out = await WN5Act.twoStep({ method: req.method, path: req.path, body: req.body, kind: 'move',
        title: 'Σπάσιμο παραγγελιών → Βέροια · ' + (src.code || ''), verb: 'Μεταφορά', host: ctx.host });
      // the words follow the re-read board (_afterSave reloads first), never the promise of the menu line
      if (out) await _afterSave(out, () => _whereBack(pieceIds), { intl: true });
      return out;
    }
    await _loadCands(st);
    return _picker(st, 'move', 'Μεταφορά σε… · ' + head);
  };

  // ═══ T15 · «Καθαρισμός ανάθεσης» (Δ5 2053:8079): two steps on POST /plan/rt/:id/clear ═══
  // «Τι θα γίνει» of Δ5 (2053:8081), what plan_rt_clear does (decision 12, 072:1837-1896): the vehicle leaves the
  // WHOLE cycle — truck and driver only, never the trailer, and the cycle number once (the truck's other cycles
  // stay); the deliveries of the ΚΑΘΟΔΟΣ and the loadings of the ΑΝΟΔΟΣ stay together as ΠΡΟΣ ΑΝΑΘΕΣΗ; a payroll
  // line with an amount is deleted; cost lines stay without a cycle and the desk gets a costs_without_rt notice.
  function _clearWhat(c, r, list) {
    const who = c.trip_type === 'PARTNER' ? [c.partner].filter(Boolean) : [c.truck, c.driver].filter(Boolean);
    const no = r && r.cycleNo;
    let from = 'από όλο τον κύκλο (κάθοδος + άνοδος)';
    if (no && no.m > 1) {
      const rest = [];
      for (let k = 1; k <= no.m; k++) if (k !== no.n) rest.push(k + '/' + no.m);
      from = 'από τον κύκλο ' + no.n + '/' + no.m + '· ' + (rest.length === 1 ? 'ο ' + rest[0] + ' μένει' : 'οι ' + rest.join(', ') + ' μένουν');
    }
    const rows = [(who.length ? who.join(' · ') : 'η ανάθεση') + (who.length > 1 ? ' βγαίνουν ' : ' βγαίνει ') + from];
    const days = (pts) => {
      const d = [...new Set(pts.map((p) => p.day).filter(Boolean))].sort();
      return d.length ? ' (' + _dayShort(d[0]) + (d.length > 1 ? '–' + _dayShort(d[d.length - 1]) : '') + ')' : '';
    };
    const del = (r && r.kath && r.kath.to) || [], load = (r && r.anod && r.anod.from) || [];
    const parts = [];
    if (del.length) parts.push(del.length + (del.length === 1 ? ' παράδοση' : ' παραδόσεις') + days(del));
    if (load.length) parts.push(load.length + (load.length === 1 ? ' φόρτωση' : ' φορτώσεις') + ' ΑΝΟΔΟΥ' + days(load));
    rows.push(parts.length ? parts.join(' + ') + (del.length + load.length > 1 ? ' → μαζί ΠΡΟΣ ΑΝΑΘΕΣΗ' : ' → ΠΡΟΣ ΑΝΑΘΕΣΗ')
      : 'οι στάσεις του κύκλου → ΠΡΟΣ ΑΝΑΘΕΣΗ');
    if (list.some((x) => x && x.kind === 'payroll_amount')) rows.push('η μισθοδοσία του κύκλου σβήνεται');
    return rows.concat(_costRows(list, true));
  }
  // «DKV: οι 2 γραμμές μένουν χωρίς δρομολόγιο» per costs item; « → ειδοποίηση» where the act raises the notice
  // (Δ5 / H6 clear: Φ2 decision 13). H4 removal draws it without: whether a removal raises one is Φ3's (DKV-3).
  function _costRows(list, notice) {
    const rows = [];
    for (const x of list) {
      if (!x || x.kind !== 'costs') continue;
      const n = typeof x.count === 'number' ? x.count : null;
      rows.push((x.pay_source || 'Έξοδα') + ': ' + (n === 1 ? 'η 1 γραμμή μένει' : 'οι ' + (n === null ? '' : n + ' ') + 'γραμμές μένουν')
        + ' χωρίς δρομολόγιο' + (notice ? ' → ειδοποίηση' : ''));
    }
    return rows;
  }
  KIT.costRows = _costRows;
  // H6 «Καθαρισμός ανάθεσης» on a cycle with segments (Figma 2147:7746, decision 12): every segment goes and the cycle
  // keeps ONE segment without assignment; loads and stops stay. names = the segment labels as the card shows them.
  function _clearSegWhat(names, list) {
    const rows = ['σβήνονται και τα ' + names.length + ' τμήματα (' + names.join(', ') + ')', 'ο κύκλος μένει με ένα τμήμα χωρίς ανάθεση'];
    const pay = list.filter((x) => x && x.kind === 'payroll_amount').length;
    if (pay > 1) rows.push('οι ' + pay + ' γραμμές μισθοδοσίας σβήνονται');
    else if (pay === 1) rows.push('η μισθοδοσία του κύκλου σβήνεται');
    return rows.concat(_costRows(list, true), ['φορτία και στάσεις δεν αλλάζουν']);
  }
  // opts.segs (the cycle card, T26): the labels of a cycle's segments. With two or more, the H6 dialog: the RT code in
  // the title (several vehicles), no Δ5 line, the segment rows, the token note, and the list always shown before the
  // clear — even with no document, the segments that go are said before anything is written.
  WN5Act.clear = async function clear(rtId, opts) {
    const c = _cycle(_id(rtId));
    if (!c) { WN5Act.strip(_boardHost(), _clientErr('rt_missing', 'Ο κύκλος δεν είναι στο board που φορτώθηκε — ανανέωσε')); return null; }
    const segs = opts && Array.isArray(opts.segs) && opts.segs.length > 1 ? opts.segs.slice() : null;
    const r = _row(c.rt_id);
    const box = _cycText(c, r);
    const no = r && r.cycleNo ? ' · κύκλος ' + (r.cycleNo.m > 1 ? r.cycleNo.n + '/' + r.cycleNo.m : r.cycleNo.n) : '';
    const out = await WN5Act.twoStep(segs ? {
      method: 'POST', path: '/plan/rt/' + c.rt_id + '/clear', body: {}, kind: 'clear', danger: true, verb: 'Καθαρισμός',
      title: 'Καθαρισμός ανάθεσης · ' + (c.code || 'RT-' + c.rt_id) + ';', ask: true, note: true,
      what: (list) => _clearSegWhat(segs, list),
    } : {
      method: 'POST', path: '/plan/rt/' + c.rt_id + '/clear', body: {}, kind: 'clear', danger: true, verb: 'Καθαρισμός',
      title: 'Καθαρισμός ανάθεσης · ' + box.l1.split(' · ')[0] + no + ';',
      // Δ5's own words (Ε-8): after 072b a breakdown is a vehicle change of the cycle card (decision 36)
      intro: ['Λάθος ανάθεση: ό,τι καθαρίζεται, δεν έγινε. Βλάβη: «Αλλαγή οχήματος» στην καρτέλα κύκλου.'],
      what: (list) => _clearWhat(c, r, list),
    });
    // a costs_without_rt notice goes to the national desk: it shows in the notices strip after the re-read
    if (out) await _afterSave(out, 'Καθαρίστηκε η ανάθεση', {});
    return out;
  };

  // ═══ T16 · the date panel Δ4 (Figma 2053:7837): a dry run per change, the same body on save ═══
  const MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
  const WD = ['Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα', 'Κυ'];
  const _utc = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const _dayDiff = (a, b) => Math.round((_utc(b) - _utc(a)) / 86400000);
  // the same wall time N days later in Athens (display and explicit stops; the base shifts by an interval)
  const _shiftIso = (iso, n) => { const p = _parts(iso); return p ? _iso(_addDays(p.ymd, n), p.hm) : iso; };
  function _dateBody(st) {
    const delta = st.sel ? _dayDiff(st.cur, st.sel) : 0;
    const f = _hhmm(st.from), t = _hhmm(st.to);
    const stops = [];
    // a new Veroia window on the stop's OLD day: the base applies stops, then the shift (072:1714-1733)
    if (st.vStop && f && t && (f !== st.from0 || t !== st.to0)) {
      const w = _win(st.vDay, f, t);
      stops.push({ stop_id: st.vStop.stop_id, planned_from: w[0], planned_to: w[1] });
    }
    // ☐ ANODOS too: its stops explicit in the SAME body (one shift per body; one save = one act, Ε-4)
    if (delta && st.alsoAnod) for (const s of st.anodStops) stops.push({ stop_id: s.stop_id, planned_from: _shiftIso(s.planned_from, delta), planned_to: _shiftIso(s.planned_to, delta) });
    const body = {};
    if (stops.length) body.stops = stops;
    if (delta) body.shift = { side: st.side, delta: delta + ' days' };
    return Object.keys(body).length ? body : null;
  }
  function _calHTML(st) {
    const y = st.view[0], m = st.view[1];
    const lead = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;        // Monday first
    const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    let h = '<div class="wn5-cal"><div class="wn5-cal-h"><button type="button" class="wi4-link" data-act="mon" data-d="-1" aria-label="Προηγούμενος μήνας">‹</button>'
      + '<span>' + MONTHS[m] + ' ' + y + '</span><button type="button" class="wi4-link" data-act="mon" data-d="1" aria-label="Επόμενος μήνας">›</button></div><div class="wn5-cal-g">'
      + WD.map((w) => '<span class="wn5-cal-w">' + w + '</span>').join('');
    for (let i = 0; i < lead; i++) h += '<span></span>';
    for (let dd = 1; dd <= days; dd++) {
      const ymd = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
      // Figma 2053:7881: once another day is chosen, the cycle's own day keeps a dashed ring (what it was)
      const cls = (ymd === (st.sel || st.cur) ? ' sel' : '') + (st.sel && ymd === st.cur ? ' orig' : '') + (ymd === st.today ? ' today' : '');
      h += '<button type="button" class="wn5-cal-d' + cls + '" data-act="day" data-day="' + ymd + '">' + dd + '</button>';
    }
    // the last week runs to Sunday with the next month's first days, greyed and not a choice (Figma «1» after 31)
    const tail = (7 - ((lead + days) % 7)) % 7;
    for (let dd = 1; dd <= tail; dd++) h += '<span class="wn5-cal-d out" aria-hidden="true">' + dd + '</span>';
    return h + '</div></div>';
  }
  const _dayHm = (iso) => DOW[_dow(_ymdOf(iso))] + ' ' + _hm(iso);                // «Τετ 12:00»
  // one result row (Figma 2053:7939-7950): the name, under it «old day → » and the new value in blue
  const _resLi = (name, old, now, attr) => '<li' + (attr || '') + '><div class="wn5-res-n">' + name + '</div><div class="wn5-res-s">' + _esc(old)
    + (now == null ? '' : ' → <b>' + _esc(now) + '</b>') + '</div></li>';
  // a cycle of the loaded board by its RT code (plates · n/m, its rt for «Ανάθεση n/m…»); null when not on it
  function _cycleByCode(code) {
    const c = code ? _cycles().find((x) => x.code === code) : null;
    if (!c) return null;
    const r = _row(c.rt_id);
    // «2/2» only when the truck has more than one cycle (Figma 2053:8076); a lone cycle is named by its plates
    const no = r && r.cycleNo && r.cycleNo.m > 1 ? r.cycleNo.n + '/' + r.cycleNo.m : null;
    return { rtId: c.rt_id, no, start: c.start_at, label: [_cycText(c, r).l1.split(' · ')[0], no].filter(Boolean).join(' · ') };
  }
  // What a conflict can honestly name. 072 sends next_rt:null with EVERY conflict (072:1820-1824), so the row is
  // never built on next_rt. Only truck_busy / driver_busy carry the other cycle, its RT code in conflict.detail
  // (plan_h_busy, 072:1434-1450; the Worker keeps detail). It is «Επόμενος κύκλος», with the way out and
  // «Ανάθεση…», only when it starts after this cycle; an earlier one is named neutrally. Any other code (a window,
  // a constraint name, a busy code without detail): the Worker's words alone, nothing guessed (principle 8).
  const BUSY_WHO = { truck_busy: 'φορτηγό', driver_busy: 'οδηγό' };
  function _conflictOf(st, cf) {
    if (!cf || !Object.prototype.hasOwnProperty.call(BUSY_WHO, cf.code) || cf.detail == null || !String(cf.detail).trim()) return null;
    const code = String(cf.detail).trim();
    const o = _cycleByCode(code);
    const self = _cycle(st.rtId);
    const next = !!(o && o.start && self && self.start_at) && new Date(o.start) > new Date(self.start_at);
    return { label: o ? o.label : code, next, rtId: next ? o.rtId : null, no: o ? o.no : null, who: BUSY_WHO[cf.code] };
  }
  function _dateResHTML(st) {
    const body = _dateBody(st);
    if (!body) return '<p class="wn5-none">Διάλεξε ημέρα ή άλλαξε το παράθυρο.</p>';
    const delta = st.sel ? _dayDiff(st.cur, st.sel) : 0;
    const n = Math.abs(delta);
    const sgn = (delta > 0 ? '+' : '−') + n;
    let h = '<div class="wn5-cons-h">ΑΠΟΤΕΛΕΣΜΑ' + (delta ? ' · ' + sgn + (n === 1 ? ' ΗΜΕΡΑ' : ' ΗΜΕΡΕΣ') : '') + '</div><ul class="wn5-res">';
    const f = _hhmm(st.from), t = _hhmm(st.to);
    let k = 0, kathEnd = null;
    const after = new Map();
    for (const s of st.sideStops) {
      const isV = !!st.vStop && s.stop_id === st.vStop.stop_id;
      let a = s.planned_from, b = s.planned_to;
      if (isV && f && t) { const w = _win(st.vDay, f, t); a = w[0]; b = w[1]; }
      if (delta) { a = _shiftIso(a, delta); b = _shiftIso(b, delta); }
      after.set(s.stop_id, [a, b]);
      if (!kathEnd || new Date(b) > new Date(kathEnd)) kathEnd = b;
      const place = [((s.legs || [])[0] || {}).client, s.location].filter(Boolean).join(' · ');
      // numbered = the side's own work as the board numbers it (KATHODOS its deliveries, ANODOS its loadings);
      // a loading on the way (THESSALONIKI) is named, never counted as a delivery
      const no = st.num ? st.num.get(s.stop_id) : (isV ? null : ++k);
      const loads = (s.legs || []).some((l) => l.act === 'load'), unloads = (s.legs || []).some((l) => l.act === 'unload');
      const name = isV ? (st.side === 'KATHODOS' ? 'Φόρτωση Βέροιας' : 'Βέροια · τέλος κύκλου')
        : no != null ? no + '  ' + place
        : (loads && !unloads ? 'Φόρτωση · ' : 'Παράδοση · ') + place;
      h += _resLi(_esc(name), _dayShort(_ymdOf(s.planned_from)), _dayShort(_ymdOf(a)) + ' · ' + _hm(a) + '–' + _hm(b), ' data-stop="' + _esc(s.stop_id) + '"');
      // «↳ Φόρτωση με τοπικό» under the stop it serves (Figma 2069:8573). 072 moves its day to the stop's new
      // Athens day (plan_rt_update step 3, local_loading_day): «δεν αλλάζει» only when that day is its own day.
      const ll = s.local_loading;
      if (ll) {
        const time = [ll.time_from, ll.time_to].filter(Boolean).map((x) => String(x).slice(0, 5)).join('–');
        const newDay = _ymdOf(a);
        const old = (ll.move_date ? _dayShort(ll.move_date) : '—') + (time ? ' ' + time : '');
        h += '<li class="wn5-res-loc" data-local="' + _esc(ll.local_move_id) + '"><div class="wn5-res-n">↳ Φόρτωση με τοπικό · <b>' + _esc(ll.driver || 'χωρίς οδηγό') + '</b></div>'
          + '<div class="wn5-res-s">' + _esc(old) + (ll.move_date && newDay && newDay !== ll.move_date ? ' → <b>' + _esc(_dayShort(newDay)) + '</b>' : ' · δεν αλλάζει') + '</div></li>';
      }
    }
    // own cycle without ANODOS: the empty return after the last delivery moves with it (Figma 2053:7951; board T5)
    if (st.gapStop && after.has(st.gapStop.stop_id)) {
      const g = st.gapStop, nb = after.get(g.stop_id)[1];
      const was = 'ελεύθερο από ' + _dayShort(_ymdOf(g.planned_to)) + ' ' + _hm(g.planned_to);
      h += _resLi(_esc('Κενό γύρισμα · ' + (g.location || '—')), was, nb === g.planned_to ? null : _dayShort(_ymdOf(nb)) + ' ' + _hm(nb), ' data-row="gap"');
    }
    // the ANODOS of this cycle (Figma 2053:8070-8075): stays put unless ticked; amber when the KATHODOS now ends after it starts
    if (delta && st.anodStops.length) {
      const lo = st.anodLoads.length ? st.anodLoads : st.anodStops;
      const a0 = lo.reduce((x, s) => (new Date(s.planned_from) < new Date(x) ? s.planned_from : x), lo[0].planned_from);
      const b0 = lo.reduce((x, s) => (new Date(s.planned_to) > new Date(x) ? s.planned_to : x), lo[0].planned_to);
      const d0 = _dayShort(_ymdOf(a0));
      const name = _esc('ΑΝΟΔΟΣ · ' + lo.length + (lo.length === 1 ? ' φορτίο' : ' φορτία') + ' · ' + _hm(a0) + '–' + _hm(b0));
      const over = !st.alsoAnod && kathEnd && new Date(kathEnd) > new Date(a0);
      if (st.alsoAnod) h += _resLi(name, d0, _dayShort(_ymdOf(_shiftIso(a0, delta))), ' data-row="anod"');
      else h += '<li data-row="anod"' + (over ? ' class="wn5-res-warn"' : '') + '><div class="wn5-res-n">' + name + '</div><div class="wn5-res-s">'
        + _esc(d0 + (over ? ' · πριν τελειώσει η ΚΑΘΟΔΟΣ (' + _dayHm(kathEnd) + ')' : ' · δεν αλλάζει')) + '</div></li>';
      const last = st.anodStops[st.anodStops.length - 1];
      // a placeholder: the panel puts its ONE checkbox here (stable, never re-created while a preview arrives)
      h += '<li class="wn5-res-chk" data-chk data-lab="' + _esc('Μετακίνηση και της ΑΝΟΔΟΥ ' + sgn) + '" data-sub="'
        + _esc('→ ' + _dayShort(_ymdOf(_shiftIso(a0, delta))) + ' · τέλος κύκλου ως ' + _dayShort(_ymdOf(_shiftIso(last.planned_to, delta))) + ' ' + _hm(last.planned_to)) + '"></li>';
    }
    const pv = st.preview;
    if (pv) {
      if (pv.conflict) {
        // a conflict is a red line and never saves (Figma 2053:8076-8078); its name only from conflict.detail
        const cx = _conflictOf(st, pv.conflict);
        const red = '<div class="wn5-res-s wn5-conflict">' + _esc(pv.conflict.message || '(' + (pv.conflict.code || 'σύγκρουση') + ')') + ' · δεν αποθηκεύεται</div>';
        if (!cx) h += '<li data-row="conflict">' + red + '</li>';
        else if (!cx.next) h += '<li data-row="conflict"><div class="wn5-res-n">' + _esc('Κύκλος · ' + cx.label) + '</div>' + red + '</li>';
        else h += '<li data-row="next"><div class="wn5-res-n">' + _esc('Επόμενος κύκλος · ' + cx.label) + '</div>' + red
          + '<div class="wn5-res-s">' + _esc('Άλλη ημέρα ή ανάθεση ' + (cx.no ? 'του ' + cx.no : 'του επόμενου κύκλου') + ' σε άλλο ' + cx.who + '.') + '</div></li>';
      } else if (pv.next_rt) {
        // without a conflict 072 sends the next cycle of the truck or driver (072:1796-1801)
        const nx = _cycleByCode(pv.next_rt.code);
        h += _resLi(_esc('Επόμενος κύκλος · ' + (nx ? nx.label : pv.next_rt.code || '—')), _dayShort(_ymdOf(pv.next_rt.start_at)) + ' ' + _hm(pv.next_rt.start_at), null, ' data-row="next"');
      } else h += '<li data-row="next"><div class="wn5-res-n">Επόμενος κύκλος · κανένας</div></li>';
    }
    h += '</ul>';
    // 072b (👤7 = β): a change that removes a vehicle handover names it here, under ΑΠΟΤΕΛΕΣΜΑ, with the base's list;
    // the save then carries that list's token (rtSaveBody). Drawn from the dry-run answer only: an edit drops it.
    const da = st.dryAnswer;
    if (da && da.needs_confirm === true) {
      h += '<ul class="wn5-cons">' + (Array.isArray(da.consequences) ? da.consequences : []).map((c) => {
        const l = WN5Lab.consequenceLine(c);
        if (l.unknown && !_unkCons.has(c && c.kind)) { _unkCons.add(c && c.kind); _log(new Error('wn5: unknown consequence ' + (c && c.kind)), 'WN5Act datePanel'); }
        // the handover's date and hour never part (T26 fidelity): «13/10 03:00» stays on one line
        return '<li data-kind="' + _esc(c && c.kind) + '"' + (l.unknown ? ' data-unknown="1"' : '') + '><span>' + _esc(l.text).replace(/\d{1,2}\/\d{1,2} \d{1,2}:\d{2}/g, (m) => '<span class="wn5-nw">' + m + '</span>') + '</span></li>';
      }).join('') + '</ul>';
    }
    if (pv) {
      for (const v of pv.vs_day || []) h += '<p class="wn5-intl">' + _esc('ενημερώνει τη διεθνή #' + v.order_id + ' · ' + _dm(String(v.from || '').slice(0, 10)) + ' → ' + _dm(String(v.to || '').slice(0, 10))) + '</p>';
      if ((pv.warnings || []).length) h += '<ul class="wn5-cons">' + pv.warnings.map((w) => '<li data-kind="' + _esc(w && w.code) + '">' + _esc(WN5Lab.warningLine(w).text) + '</li>').join('') + '</ul>';
    } else if (!st.err) h += '<p class="wn5-none">Διαβάζει την προεπισκόπηση…</p>';
    return h + '<p class="wn5-none wn5-res-end">Οι ώρες μένουν ίδιες· τα παράθυρα ξαναελέγχονται.</p>';
  }

  WN5Act.datePanel = function datePanel(rtId, side, anchorEl) {
    const c = _cycle(_id(rtId));
    if (!c) { WN5Act.strip(_boardHost(), _clientErr('rt_missing', 'Ο κύκλος δεν είναι στο board που φορτώθηκε — ανανέωσε')); return null; }
    side = side === 'ANODOS' ? 'ANODOS' : 'KATHODOS';
    const hub = _hubId();
    const sideStops = _copy((c.stops || []).filter((s) => s.side === side));
    if (!sideStops.length) { WN5Act.strip(_boardHost(), _clientErr('side_empty', 'Αυτή η πλευρά δεν έχει στάσεις: το «+» βάζει πρώτο φορτίο')); return null; }
    const vStop = sideStops.find((s) => s.location_id === hub) || null;
    const ref = side === 'KATHODOS' && vStop ? vStop : sideStops[0];
    const cur = _ymdOf(ref.planned_from);
    const st = { rtId: c.rt_id, side, sideStops, vStop, vDay: vStop ? _ymdOf(vStop.planned_from) : null, cur, sel: null,
      view: [Number(cur.slice(0, 4)), Number(cur.slice(5, 7)) - 1],
      from0: vStop ? _hm(vStop.planned_from) : '', to0: vStop ? _hm(vStop.planned_to) : '', from: '', to: '', alsoAnod: false,
      anodStops: side === 'KATHODOS' ? _copy((c.stops || []).filter((s) => s.side === 'ANODOS')) : [],
      // display only (the «σήμερα» ring of the calendar); never part of a body
      today: typeof localToday === 'function' ? localToday() : null, preview: null, err: null, okFor: null, seq: 0,
      // the body of the last dry run and its answer (072b: needs_confirm / confirm_token / consequences); any edit
      // after it drops the answer, so a token never outlives the change it was given for
      dryBody: null, dryAnswer: null };
    st.from = st.from0; st.to = st.to0;
    const r = _row(c.rt_id);
    const box = _cycText(c, r);
    const no = r && r.cycleNo ? ' · κύκλος ' + (r.cycleNo.m > 1 ? r.cycleNo.n + '/' + r.cycleNo.m : r.cycleNo.n) : '';
    // the side's own work as the board numbers it (KATHODOS: deliveries, ANODOS: loadings); no row → the old count
    const sd = _sideOfRow(r, side);
    const own = sd ? (side === 'KATHODOS' ? sd.to : sd.from) : null;
    st.num = own ? new Map(own.map((p) => [p.stopId, p.n])) : null;
    st.anodLoads = r && r.anod ? st.anodStops.filter((s) => (r.anod.from || []).some((p) => p.stopId === s.stop_id)) : [];
    // «Κενό γύρισμα»: an own cycle with no ANODOS frees the truck after its last delivery (the board's T5 line)
    const lastTo = side === 'KATHODOS' && c.trip_type !== 'PARTNER' && !st.anodStops.length && sd && sd.to.length ? sd.to[sd.to.length - 1] : null;
    st.gapStop = lastTo ? sideStops.find((s) => s.stop_id === lastTo.stopId) || null : null;
    const nDel = own ? own.length : sideStops.filter((s) => s.location_id !== hub).length;
    const head = (side === 'KATHODOS' ? 'ΚΑΘΟΔΟΣ' : 'ΑΝΟΔΟΣ') + ' · ' + box.l1.split(' · ')[0] + no + ' · ' + nDel + (nDel === 1 ? (side === 'KATHODOS' ? ' παράδοση' : ' φόρτωση') : (side === 'KATHODOS' ? ' παραδόσεις' : ' φορτώσεις'));
    const d = _dlg('date', side === 'KATHODOS' ? 'Ημερομηνία φόρτωσης Βέροιας' : 'Ημερομηνία ΑΝΟΔΟΥ', { anchor: anchorEl });
    // the meta under the title, across the dialog (Figma 2053:7840)
    d.dlg.querySelector('.wi4-dlg-t').insertAdjacentHTML('afterend', '<span class="wn5-dlg-meta">' + _esc(head) + '</span>');
    // «Ανάθεση n/m…» (Figma 2082:7735): only for a conflict whose next cycle is on the loaded board
    d.ft.innerHTML = '<button type="button" class="wi4-btn" data-act="next" style="display:none"></button>'
      + '<button type="button" class="wi4-btn" data-act="cancel">Άκυρο</button><button type="button" class="wi4-btn pri" data-act="save">Αποθήκευση</button>';
    d.refresh = () => {
      const b = d.dlg.querySelector('[data-act="save"]');
      const body = _dateBody(st);
      if (!b) return;
      b.disabled = d.locked || d.busy || !body || st.okFor !== JSON.stringify(body) || !rtSaveBody(st.dryBody, st.dryAnswer);
      b.textContent = st.dryAnswer && st.dryAnswer.needs_confirm === true ? 'Αποθήκευση · επιβεβαίωση' : 'Αποθήκευση';
    };
    // The skeleton is built ONCE. A preview answer redraws only the result column: the window inputs are never
    // re-created (someone typing an hour while a dry run is in flight keeps the field and the keystrokes; a
    // removed focused input fired blur → change → a nested redraw inside innerHTML = NotFoundError, review r1),
    // and the ΑΝΟΔΟΣ checkbox is one element moved into its row, never rebuilt. The calendar redraws on a click only.
    d.body.innerHTML = '<div class="wn5-datep"><div><div data-cal></div>' + (vStop ? '<div class="wn5-hubwin"><span>' + (side === 'KATHODOS' ? 'Παράθυρο' : 'Άφιξη Βέροιας') + '</span>'
      + '<input class="wn5-hm" data-win="from" value="' + _esc(st.from) + '"> – <input class="wn5-hm" data-win="to" value="' + _esc(st.to) + '"></div>' : '')
      + '</div><div class="wn5-datep-r"></div></div>';
    const calEl = d.body.querySelector('[data-cal]'), resEl = d.body.querySelector('.wn5-datep-r');
    const chk = document.createElement('li');
    chk.className = 'wn5-res-chk';
    chk.innerHTML = '<label class="wn5-anod"><input type="checkbox" data-anod><span></span></label><div class="wn5-res-s"></div>';
    const drawCal = () => {
      const f = document.activeElement, day = f && calEl.contains(f) ? f.dataset.day : null;
      calEl.innerHTML = _calHTML(st);
      const again = day && calEl.querySelector('[data-day="' + day + '"]');
      if (again) again.focus();
    };
    let drawing = false, redo = false;
    const draw = () => {
      if (drawing) { redo = true; return; }     // never a redraw inside a redraw
      drawing = true;
      try {
        const hadFocus = document.activeElement === chk.querySelector('input');
        resEl.innerHTML = _dateResHTML(st);
        const ph = resEl.querySelector('li[data-chk]');
        if (ph) {
          chk.querySelector('span').textContent = ph.dataset.lab;
          chk.querySelector('.wn5-res-s').textContent = ph.dataset.sub;
          chk.querySelector('input').checked = st.alsoAnod;
          ph.replaceWith(chk);
          if (hadFocus) chk.querySelector('input').focus();
        }
        const cx = st.preview && st.preview.conflict ? _conflictOf(st, st.preview.conflict) : null;
        const nb = d.ft.querySelector('[data-act="next"]');
        nb.style.display = cx && cx.next ? '' : 'none';
        nb.textContent = cx && cx.next ? 'Ανάθεση ' + (cx.no || 'επόμενου κύκλου') + '…' : '';
        nb.dataset.rt = cx && cx.next ? cx.rtId : '';
        if (st.err) WN5Act.strip(d.msg, st.err);
        else if (_closed) WN5Act.strip(d.msg, _closed);
        else WN5Act.strip(d.msg, null);
        d.refresh();
        _place(d);
      } finally { drawing = false; }
      if (redo) { redo = false; draw(); }
    };
    // one dry run per change; an answer that is no longer for the panel's state is dropped (seq). keep = a refusal
    // of the save that stays on the strip over the new dry run (428 need_token / 422 stale_confirm: the new list)
    const run = async (keep) => {
      const body = _dateBody(st);
      st.preview = null; st.err = keep || null; st.okFor = null; st.dryBody = null; st.dryAnswer = null;
      if (!body) { draw(); return; }
      const my = ++st.seq;
      const key = JSON.stringify(body);
      draw();
      try {
        const out = await planFetch('PATCH', '/plan/rt/' + st.rtId, { body: _copy(body), dry: true });
        if (my !== st.seq || d.closed) return;
        st.preview = out && out.preview ? out.preview : null;
        if (!st.preview) {
          st.err = _clientErr('bad_answer', 'Η προεπισκόπηση ήρθε χωρίς αποτέλεσμα — ενημέρωσε τον Δημήτρη');
          _log(new Error('wn5: rt dry run without preview'), 'WN5Act datePanel');
        } else {
          st.dryBody = body; st.dryAnswer = out;
          if (!st.preview.conflict) st.okFor = key;     // a conflict never saves (Figma Δ4 β)
        }
      } catch (e) {
        if (my !== st.seq || d.closed) return;
        st.err = e;
      }
      draw();
    };
    d.dlg.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-act]');
      if (!b || b.disabled || !_live()) return;
      const a = b.dataset.act;
      if (a === 'cancel') { if (!d.busy) _close(d); }
      else if (a === 'next') { if (!d.busy && b.dataset.rt) WN5Act.assign(null, { entry: 'row', rtId: _id(b.dataset.rt) }); }
      else if (a === 'mon') { const v = new Date(Date.UTC(st.view[0], st.view[1] + Number(b.dataset.d), 1)); st.view = [v.getUTCFullYear(), v.getUTCMonth()]; drawCal(); _place(d); }
      else if (a === 'day') { st.sel = b.dataset.day === st.cur ? null : b.dataset.day; drawCal(); run(); }
      else if (a === 'save') {
        const body = _dateBody(st);
        const sb = rtSaveBody(st.dryBody, st.dryAnswer);
        // the list changed (422 stale_confirm) or was never seen (428): a new dry run shows the new list and token,
        // the same rule as twoStep; the user presses again
        const onFail = (e) => { if (e && (e.kind === K().NEED_TOKEN || e.kind === K().STALE)) run(e); };
        if (body && sb && st.okFor === JSON.stringify(body)) _send(d, { method: 'PATCH', path: '/plan/rt/' + st.rtId, body: sb }, 'Άλλαξε η ημερομηνία', { intl: true, onFail });
      }
    });
    d.dlg.addEventListener('input', (ev) => {
      // an edit after the dry run: its token dies with it (072b), the save waits for the next dry run
      if (ev.target.matches('[data-win]')) { if (ev.target.dataset.win === 'from') st.from = ev.target.value; else st.to = ev.target.value; st.okFor = null; if (st.dryAnswer) { st.dryAnswer = null; draw(); } else d.refresh(); }
    });
    d.dlg.addEventListener('change', (ev) => {
      if (ev.target.matches('[data-win]')) run();
      else if (ev.target.matches('[data-anod]')) { st.alsoAnod = ev.target.checked; run(); }
    });
    drawCal();
    draw();
    _gate(d);
    return d;
  };
  ACTS.date = (el) => { const row = el.closest('.wn5-row[data-rt]'); WN5Act.datePanel(_id(row && row.dataset.rt), el.dataset.side, el); };

  // ═══ T17 · «Φόρτωση με τοπικό» (decision 44): request_id on the creation, never on the cancel ═══
  // the stops a local driver can load: the cycle's ΚΑΘΟΔΟΣ pickups outside Veroia (Veroia is loaded by the cycle's
  // truck). The ΑΝΟΔΟΣ pickups are the truck's own work in the south (Figma 2011:7745 row 3: «… → Βέροια · για
  // <delivery>»); 072 takes any stop, so this is the screen's offer only — owner question in the T17 ledger.
  function _localStops(c, hub) {
    return (c.stops || []).filter((s) => s.side === 'KATHODOS' && s.location_id !== hub && (s.legs || []).some((l) => l.act === 'load'));
  }
  function _localBody(st) {
    const body = { rt_stop_id: st.stop, driver_id: st.driver, truck_id: st.truck };
    if (st.trailer) body.trailer_id = st.trailer;
    const f = _hhmm(st.from), t = _hhmm(st.to);
    if (f) body.time_from = f;
    if (t) body.time_to = t;
    if (String(st.notes || '').trim()) body.notes = String(st.notes).trim();
    return body;
  }
  WN5Act.local = async function local(rtStopId, rtId) {
    const sid = _id(rtStopId);
    let c = rtId ? _cycle(_id(rtId)) : null;
    if (!c && sid) c = _cycles().find((x) => (x.stops || []).some((s) => s.stop_id === sid)) || null;
    if (!c) { WN5Act.strip(_boardHost(), _clientErr('rt_missing', 'Ο κύκλος δεν είναι στο board που φορτώθηκε — ανανέωσε')); return null; }
    const stops = _copy(_localStops(c, _hubId()));
    const st = { rtId: c.rt_id, stop: stops.some((s) => s.stop_id === sid) ? sid : null, driver: null, truck: null, trailer: null,
      from: '', to: '', notes: '', ids: { ok: false },
      // one id per open creation window (decision 44): kept in this closure only, minted now, renewed after a 200
      slot: PlanApi.slot() };
    st.ids = typeof PlanIds !== 'undefined' ? await PlanIds.load() : { ok: false };
    const lists = st.ids.ok ? { d: PlanIds.list('driver'), t: PlanIds.list('truck'), r: PlanIds.list('trailer') } : { d: [], t: [], r: [] };
    const d = _dlg('local', 'Φόρτωση με τοπικό · ' + (c.code || 'κύκλος'), { onClose: () => st.slot.close() });
    d.ft.innerHTML = '<button type="button" class="wi4-btn" data-act="cancel">Άκυρο</button><button type="button" class="wi4-btn pri" data-act="save">Αποθήκευση</button>';
    const stopLabel = (s) => _dayShort(_ymdOf(s.planned_from)) + ' · ' + _hm(s.planned_from) + '–' + _hm(s.planned_to) + ' · ' + (s.location || '—')
      + ' · ' + [...new Set((s.legs || []).filter((l) => l.act === 'load').map((l) => l.client))].join(', ');
    d.body.innerHTML = (st.ids.ok ? '' : '<div class="wn5-miss" data-ids-miss>Οι κατάλογοι δεν είναι διαθέσιμοι ακόμη: οδηγός και φορτηγό διαλέγονται όταν έρθουν.</div>')
      + '<label class="wn5-field"><span>Στάση *</span><select data-stop><option value="">—</option>'
      + stops.map((s) => '<option value="' + s.stop_id + '"' + (s.stop_id === st.stop ? ' selected' : '') + '>' + _esc(stopLabel(s)) + '</option>').join('') + '</select></label>'
      + (stops.length ? '' : '<p class="wn5-none">Ο κύκλος δεν φορτώνει έξω από τη Βέροια.</p>')
      + '<label class="wn5-field"><span>Οδηγός *</span><select data-driver data-fh-search><option value="">—</option>' + _optsHTML(lists.d, null) + '</select></label>'
      + '<label class="wn5-field"><span>Φορτηγό *</span><select data-truck data-fh-search><option value="">—</option>' + _optsHTML(lists.t, null) + '</select></label>'
      + '<label class="wn5-field"><span>Ρυμούλκα</span><select data-trailer data-fh-search><option value="">—</option>' + _optsHTML(lists.r, null) + '</select></label>'
      + '<div class="wn5-hubwin"><span>Ώρα</span><input class="wn5-hm" data-time="from" placeholder="ΗΗ:ΛΛ"> – <input class="wn5-hm" data-time="to" placeholder="ΗΗ:ΛΛ"></div>'
      + '<label class="wn5-field"><span>Σημειώσεις</span><textarea data-notes rows="2"></textarea></label>'
      + '<p class="wn5-none">Η ημέρα της φόρτωσης είναι η ημέρα της στάσης· η σειρά του κύκλου δεν αλλάζει, φαίνεται η ↳ υποσημείωση.</p>';
    if (typeof fhSelectSearchIn === 'function') fhSelectSearchIn(d.body);
    d.refresh = () => {
      const b = d.dlg.querySelector('[data-act="save"]');
      // a typed time that is not HH:MM keeps the button off: it would be stored as text (072 time_from is free text)
      const badTime = (st.from && !_hhmm(st.from)) || (st.to && !_hhmm(st.to));
      if (b) b.disabled = d.locked || d.busy || !st.ids.ok || !st.stop || !st.driver || !st.truck || !!badTime;
    };
    d.dlg.addEventListener('change', (ev) => {
      const el = ev.target;
      if (el.matches('[data-stop]')) st.stop = _id(el.value);
      else if (el.matches('[data-driver]')) st.driver = _id(el.value);
      else if (el.matches('[data-truck]')) st.truck = _id(el.value);
      else if (el.matches('[data-trailer]')) st.trailer = _id(el.value);
      else return;
      d.refresh();
    });
    d.dlg.addEventListener('input', (ev) => {
      const el = ev.target;
      if (el.matches('[data-time]')) { if (el.dataset.time === 'from') st.from = el.value; else st.to = el.value; }
      else if (el.matches('[data-notes]')) st.notes = el.value;
      else return;
      d.refresh();
    });
    d.dlg.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-act]');
      if (!b || b.disabled || !_live()) return;
      if (b.dataset.act === 'cancel') { if (!d.busy) _close(d); return; }
      if (b.dataset.act !== 'save') return;
      const body = _localBody(st);
      const stopId = body.rt_stop_id, driverId = body.driver_id;
      _send(d, { method: 'POST', path: '/plan/local-loading', body, requestId: st.slot.id }, 'Γράφτηκε η φόρτωση με τοπικό', {
        slot: st.slot,
        // request_reused = the first press was saved: the board must show this loading before «αποθηκεύτηκε»
        onReused: (b2) => {
          for (const cy of (b2 && b2.cycles) || []) for (const s of cy.stops || []) {
            if (s.stop_id === stopId && s.local_loading && s.local_loading.driver_id === driverId) return s.local_loading;
          }
          return null;
        },
      });
    });
    d.refresh();
    _gate(d);
    return d;
  };

  WN5Act.localCancel = function localCancel(localMoveId) {
    const id = _id(localMoveId);
    let hit = null;
    for (const c of _cycles()) for (const s of c.stops || []) if (s.local_loading && s.local_loading.local_move_id === id) hit = { c, s };
    if (!hit) { WN5Act.strip(_boardHost(), _clientErr('local_missing', 'Η φόρτωση με τοπικό δεν είναι πια στο board — ανανέωσε')); return null; }
    const ll = hit.s.local_loading;
    const d = _dlg('local', 'Ακύρωση φόρτωσης με τοπικό');
    d.body.innerHTML = '<p>' + _esc([ll.driver || '—', _dayShort(ll.move_date), [ll.time_from, ll.time_to].filter(Boolean).join('–'), hit.s.location || '—', hit.c.code || ''].filter(Boolean).join(' · ')) + '</p>'
      + '<p class="wn5-none">Η φόρτωση ακυρώνεται· η στάση και οι παραδόσεις του κύκλου μένουν.</p>';
    d.ft.innerHTML = '<button type="button" class="wi4-btn" data-act="cancel">Άκυρο</button><button type="button" class="wi4-btn pri wn5-danger" data-act="confirm">Ακύρωση φόρτωσης</button>';
    d.dlg.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-act]');
      if (!b || b.disabled || !_live()) return;
      if (b.dataset.act === 'cancel') { if (!d.busy) _close(d); return; }
      if (b.dataset.act !== 'confirm') return;
      // no request_id on a cancel (072:2229); a second cancel answers already:true
      _send(d, { method: 'POST', path: '/plan/local-loading', body: { local_move_id: id, cancel: true } },
        (out) => (out.already ? 'Η φόρτωση με τοπικό ήταν ήδη ακυρωμένη' : 'Ακυρώθηκε η φόρτωση με τοπικό'));
    });
    _gate(d);
    return d;
  };
  ACTS['local-cancel'] = (el) => WN5Act.localCancel(_id(el.dataset.lm));

  // ═══ T18 · order card and «Διαγραφή παραγγελίας» (Figma 2011:10496), from the loaded board only (Ε-9) ═══
  // Everything the board knows of one national order: its waiting pieces and its legs on the week's cycles.
  function _orderFacts(natOrderId) {
    const items = _allItems().filter((x) => x.nat_order_id === natOrderId);
    const legs = [];
    for (const c of _cycles()) for (const s of c.stops || []) for (const l of s.legs || []) if (l.nat_order_id === natOrderId) legs.push({ c, s, l });
    return { items, legs };
  }
  const _temp = (t) => (typeof t === 'number' && isFinite(t) ? (t > 0 ? '+' : '') + String(t).replace('.', ',') + ' °C' : '—');
  const _sideWord = (side) => (side === 'ANODOS' ? 'ΑΝΟΔΟΣ' : 'ΚΑΘΟΔΟΣ');
  function _cardHTML(no, f) {
    const any = f.items[0] || (f.legs[0] && f.legs[0].l) || {};
    // «#N-2244» (Figma 2011:10506 / 10583): the '#' before the reference too, not only before the bare id
    const ref = '#' + (any.reference || no);
    // price and PE: the waiting pieces carry them, and since 074 the cycle's legs too (live F12, 28/10: an assigned
    // order read «Τιμή —» / «PE —» while the base had them). The dispatcher sees the price (locked decision 23/8).
    const src = f.items.concat(f.legs.map((x) => x.l));
    const price = src.find((x) => typeof x.price === 'number');
    const pe = src.find((x) => typeof x.pallet_exchange === 'boolean');
    const pal = _sum(f.items.map((x) => x.pallets)) + _sum(f.legs.filter((x) => x.l.act === 'load').map((x) => x.l.pallets));
    const assigned = f.legs.length > 0;
    const side = assigned ? f.legs[0].s.side : (f.items[0] ? _sideFor(f.items[0]) : 'KATHODOS');
    const row = (k, v) => '<div class="wn5-kv"><span>' + _esc(k) + '</span><b>' + _esc(v) + '</b></div>';
    // a long value wraps between its « · » parts, never inside one (fidelity T18: «10:00–» / «12:00» split the window)
    const rowP = (k, parts) => '<div class="wn5-kv"><span>' + _esc(k) + '</span><b>'
      + parts.map((p) => '<span class="wn5-np">' + _esc(p) + '</span>').join(' · ') + '</b></div>';
    // the Figma card is a navy head with the chips under the title, then one ruled section per heading
    const sec = (head, rows) => '<section class="wn5-sec"><div class="wn5-sec-h">' + head + '</div>' + rows + '</section>';
    const chips = '<div class="wn5-chips"><span class="wn5-chip">ΕΘΝΙΚΗ</span><span class="wn5-chip">' + _sideWord(side) + '</span>'
      + '<span class="wn5-chip ' + (assigned ? 'ok' : 'un') + '">' + (assigned ? 'ΑΝΑΤΕΘΗΚΕ' : 'ΠΡΟΣ ΑΝΑΘΕΣΗ') + '</span></div>';
    let h = sec('ΣΤΟΙΧΕΙΑ', row('Πελάτης', any.client || '—')
      // absent on both the pieces and the legs = «—», never a guess
      + row('Τιμή', price ? _pal(price.price) + ' € (χωρίς ΦΠΑ) · τιμολογείται χωριστά' : '—')
      + row('Παλέτες', pal ? _pal(pal) : '—') + row('Θερμοκρασία', _temp(any.temperature_c)) + row('PE', pe ? (pe.pallet_exchange ? 'Ναι' : 'Όχι') : '—'));
    // one national order has one client, already in «Πελάτης»: a stop line names the place, the day and the window,
    // never the client again (live F12, 28/10 — it read as a second place under the first)
    const stopLine = (s, l) => [s.location || '—', _dayShort(_ymdOf(s.planned_from)), _hm(s.planned_from) + '–' + _hm(s.planned_to), _pal(l.pallets) + 'π'];
    const when = (a, b) => (a ? [_dayShort(_ymdOf(a)), _hm(a) + '–' + _hm(b)] : ['—']);
    let st = '';
    for (const x of f.legs) st += rowP(x.l.act === 'load' ? 'Φόρτωση' : 'Παράδοση', stopLine(x.s, x.l));
    for (const it of f.items) {
      st += rowP('Φόρτωση', [_placeName(it.at_hub ? _hubId() : it.position_location_id), ...when(it.load_from, it.load_to), _pal(it.pallets) + 'π'])
        + rowP('Παράδοση', [_placeName(it.nat_to_location_id), ...when(it.deliver_from, it.deliver_to), _pal(it.pallets) + 'π']);
    }
    h += sec('ΣΤΑΣΕΙΣ', st);
    let cy = '';
    const seen = new Set();
    for (const x of f.legs) {
      if (seen.has(x.c.rt_id)) continue;
      seen.add(x.c.rt_id);
      const r = _row(x.c.rt_id), t0 = r && r.tiles && r.tiles[0];
      const sd = _sideOfRow(r, x.s.side);
      const vs = sd && sd.veroia && sd.veroia.stopId != null ? (x.c.stops || []).find((s) => s.stop_id === sd.veroia.stopId) : null;
      const v = _veroiaOf(r, x.s.side);
      // «Βέροια Δευ 12/10 16:00–18:00» (2011:10560): the Veroia stop's own day, no « · » between day and window
      // Figma 2011:10556 «ΚΖΗ 2108 · Dimou A. · νέος κύκλος»: truck · driver · the cycle word — no trailer, no RT code.
      // A handover cycle (072b, several tiles) names its first segment as the board's first tile does (truck, driver).
      const veh = x.c.trip_type === 'PARTNER' ? [x.c.partner]
        : x.c.truck_id == null ? ['ΠΡΟΣ ΑΝΑΘΕΣΗ']
          : r && r.tiles && r.tiles.length > 1 && t0 ? [t0.line1, t0.line2] : [x.c.truck, x.c.driver || 'χωρίς οδηγό'];
      const cn = r && r.cycleNo ? 'κύκλος ' + (r.cycleNo.m > 1 ? r.cycleNo.n + '/' + r.cycleNo.m : r.cycleNo.n) : null;
      const vp = veh.concat(cn).filter((t) => t && t !== '—');
      cy += rowP('Φορτηγό', vp.length ? vp : ['—'])
        + row('Σκέλος', _sideWord(x.s.side) + (v ? ' · Βέροια ' + (vs ? _dayShort(_ymdOf(vs.planned_from)) + ' ' : '') + v : ''));
    }
    if (!seen.size) cy += row('Φορτηγό', 'ΠΡΟΣ ΑΝΑΘΕΣΗ');
    h += sec('ΚΥΚΛΟΣ', cy);
    // «invoiced» is not on the board: the delete list (dry run) says it when it is true
    h += sec('ΤΙΜΟΛΟΓΗΣΗ', row('Τιμολογήθηκε', '—'));
    return { html: h, chips, ref, client: any.client || '—', pal };
  }
  // «Τι θα γίνει» rows the screen adds from the board it holds (Figma 2011:10585–10600): each vehicle's x/33 after the
  // order leaves, each stop left with no leg (plan_h_stops_sweep drops it), and each cycle that stays. The base's own
  // list follows them.
  function _deleteWhat(f, ctx, list) {
    const out = ['σβήνεται 1 παραγγελία · ' + (ctx.client || '—') + (ctx.pal ? ' · ' + _pal(ctx.pal) + 'π' : '')];
    const sides = new Map();
    for (const x of f.legs) {
      if (x.l.act !== 'load') continue;
      const k = x.c.rt_id + '|' + x.s.side;
      const p = sides.get(k) || { c: x.c, side: x.s.side, n: 0 };
      p.n += Number(x.l.pallets) || 0;
      sides.set(k, p);
    }
    for (const p of sides.values()) {
      const before = _sidePal(_row(p.c.rt_id), p.side);
      out.push((p.c.truck || p.c.partner || p.c.code || '—') + ' πάει ' + _pal(before) + ' → ' + _pal(Math.max(0, before - p.n)) + '/33');
    }
    const stops = new Set();
    for (const x of f.legs) {
      if (stops.has(x.s.stop_id) || !(x.s.legs || []).every((l) => l.nat_order_id === ctx.no)) continue;
      stops.add(x.s.stop_id);
      out.push('η στάση ' + (x.s.location || '—') + ' · ' + _wd(_ymdOf(x.s.planned_from)) + ' ' + _hm(x.s.planned_from) + '–' + _hm(x.s.planned_to)
        + ' φεύγει από την ' + (x.s.side === 'ANODOS' ? 'άνοδο' : 'κάθοδο'));
    }
    // Figma 2011:10597: a cycle that keeps other legs stays with its payroll line. 072 lists rt_cancelled (with the
    // payroll) only for a cycle the order empties; the row is said only when the board agrees (another leg of another
    // order on the cycle) AND the base sent no rt_cancelled for it — never a «μένει» the base would contradict.
    const gone = new Set((list || []).filter((c) => c && c.kind === 'rt_cancelled').map((c) => Number(c.rt_id)));
    const cyc = [...new Map(f.legs.map((x) => [x.c.rt_id, x.c])).values()];
    const stay = cyc.filter((c) => !gone.has(Number(c.rt_id))
      && (c.stops || []).some((s) => (s.legs || []).some((l) => l.nat_order_id !== ctx.no)));
    for (const c of stay) {
      const name = cyc.length > 1 ? ' ' + (c.code || '—') : '';
      out.push((c.trip_type === 'PARTNER' ? '' : 'η μισθοδοσία δεν αλλάζει · ') + 'ο κύκλος' + name + ' μένει');
    }
    return out;
  }

  WN5Act.orderCard = function orderCard(natOrderId) {
    const no = _id(natOrderId);
    const f = no ? _orderFacts(no) : { items: [], legs: [] };
    if (!f.items.length && !f.legs.length) {
      if (typeof toast === 'function') toast('Η παραγγελία #' + (no || '—') + ' είναι σε άλλη εβδομάδα — άνοιξε εκείνη την εβδομάδα', 'info');
      return null;
    }
    const card = _cardHTML(no, f);
    // 520 wide as the Figma card (2011:10503), the .wn5-dlg default — not the 800 «wide» shell
    const d = _dlg('card', card.ref + ' · ' + card.client);
    d.dlg.classList.add('wn5-ocard');
    // Figma audit B-25: a long client name stops at two lines (CSS), the whole title stays readable on hover
    d.dlg.querySelector('.wi4-dlg-t').title = card.ref + ' · ' + card.client;
    d.dlg.querySelector('.wi4-dlg-hd').insertAdjacentHTML('beforeend', card.chips);
    d.body.innerHTML = card.html;
    // «Επεξεργασία» opens the v5 national form (T20); delete is here and nowhere else (owner 19/10)
    d.ft.innerHTML = '<button type="button" class="wi4-btn" data-act="edit">Επεξεργασία</button>'
      + '<button type="button" class="wi4-btn wn5-danger-o" data-act="delete">Διαγραφή παραγγελίας</button>';
    d.dlg.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-act]');
      if (!b || b.disabled || !_live()) return;
      if (b.dataset.act === 'delete') WN5Act.deleteOrder(no, { host: d.msg, ref: card.ref, client: card.client, pal: card.pal });
      else if (b.dataset.act === 'edit') {
        _close(d);   // the card's own close (its listeners go with it) before the form takes the screen
        WN5Form.openOrder({ natOrderId: no });   // T20: edit = PATCH /plan/orders/:id, only what changed
      }
    });
    _gate(d);
    return d;
  };

  WN5Act.deleteOrder = async function deleteOrder(natOrderId, ctx) {
    ctx = ctx || {};
    const no = _id(natOrderId);
    if (!no) return null;
    const f = _orderFacts(no);
    const out = await WN5Act.twoStep({
      method: 'POST', path: '/plan/delete', body: { nat_order_id: no }, kind: 'delete', danger: true, verb: 'Διαγραφή', host: ctx.host,
      title: 'Διαγραφή παραγγελίας ' + (ctx.ref || '#' + no) + ';',
      // owner 21/10: «δεν έγινε», final, no restore (S-80)
      intro: ['Η διαγραφή είναι οριστική: δεν υπάρχει επαναφορά. Αν έγινε λάθος, καταχωρείται νέα παραγγελία· το ίχνος μένει στο Audit Trail.'],
      // 072 lists «invoiced» whenever national_orders.invoiced is true (plan_delete), so its absence from the list is
      // the base saying «not invoiced» (Figma 2011:10600)
      what: (list) => _deleteWhat(f, Object.assign({ no }, ctx), list).concat(list.some((c) => c && c.kind === 'invoiced') ? [] : ['δεν είχε τιμολογηθεί · τίποτα στο ERP']),
      // the reason is checked at execution only and is not part of the token (072:1951-1966)
      field: { key: 'reason', label: 'Λόγος διαγραφής *' },
    });
    if (out) await _afterSave(out, 'Διαγράφηκε η παραγγελία ' + (ctx.ref || '#' + no), {});
    return out;
  };

  // The distinct orders of a cycle on the loaded board: national orders and the international orders of its VS.
  function _cycleOrderMaps(c) {
    const nat = new Map(), vs = new Map();
    for (const s of (c && c.stops) || []) for (const l of s.legs || []) {
      if (l.nat_order_id != null) nat.set(l.nat_order_id, l);
      else if (l.order_id != null) vs.set(l.order_id, l);
    }
    return { nat, vs };
  }
  // the number beside ✈ «Άνοιγμα παραγγελιών»; null (no number) when the cycle is not on the board
  WN5Act.cycleOrderCount = function cycleOrderCount(rtId) {
    const c = _cycle(_id(rtId));
    if (!c) return null;
    const { nat, vs } = _cycleOrderMaps(c);
    return nat.size + vs.size;
  };
  // ✈ «Άνοιγμα παραγγελιών»: one national order = its card; else the list (a VS is the international's order)
  WN5Act.cycleOrders = function cycleOrders(rtId) {
    const c = _cycle(_id(rtId));
    if (!c) { WN5Act.strip(_boardHost(), _clientErr('rt_missing', 'Ο κύκλος δεν είναι στο board που φορτώθηκε — ανανέωσε')); return null; }
    const { nat, vs } = _cycleOrderMaps(c);
    if (nat.size === 1 && !vs.size) return WN5Act.orderCard([...nat.keys()][0]);
    const d = _dlg('card', 'Παραγγελίες · ' + (c.code || 'κύκλος'));
    let h = '';
    for (const [no, l] of nat) h += '<div class="wn5-cand" data-line="nat"><span class="wn5-cand-m"><b>' + _esc(l.reference || '#' + no) + '</b><span>' + _esc(l.client || '—') + '</span></span><span>εθνική</span><span></span>'
      + '<button type="button" class="wi4-btn sm" data-act="card" data-no="' + no + '">Καρτέλα</button></div>';
    for (const [, l] of vs) h += '<div class="wn5-cand" data-line="vs"><span class="wn5-cand-m"><b>' + _esc(l.reference || 'VS') + '</b><span>' + _esc(l.client || '—') + '</span></span>'
      + '<span>διεθνής παραγγελία · αλλάζει από το Weekly Διεθνών</span><span></span><span></span></div>';
    d.body.innerHTML = h || '<p class="wn5-none">Ο κύκλος δεν έχει παραγγελίες.</p>';
    d.ft.innerHTML = '<button type="button" class="wi4-btn" data-act="cancel">Κλείσιμο</button>';
    d.dlg.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-act]');
      if (!b || !_live()) return;
      if (b.dataset.act === 'cancel') _close(d);
      else if (b.dataset.act === 'card') WN5Act.orderCard(_id(b.dataset.no));
    });
    return d;
  };

  // ═══ the actions of T12–T18 go above this line ═══

  // 072b (👤7 = β): the Δ4 dry run of PATCH /plan/rt/:id carries needs_confirm / confirm_token / consequences ONLY
  // when the change would remove a vehicle handover; the execution sends that token back. A dry run with
  // preview.conflict brings no list and no token, and that never means «nothing is removed» (072b plan
  // §Παράδοση στη Φ4 (ii)): no save until a new dry run without the conflict. ONE rule, used by the Δ4 panel.
  function rtSaveBody(dryBody, dryAnswer) {
    if (!dryBody || !dryAnswer || dryAnswer.dry_run !== true) return null;
    if (dryAnswer.preview && dryAnswer.preview.conflict) return null;
    const body = Object.assign({}, dryBody);
    delete body.dry_run;
    if (dryAnswer.needs_confirm === true) {
      if (!dryAnswer.confirm_token) return null;
      body.confirm_token = dryAnswer.confirm_token;
    }
    return body;
  }
  WN5Act.rtSaveBody = rtSaveBody;

  WN5Act._kit = KIT;
  window.WN5Act = WN5Act;
})();
