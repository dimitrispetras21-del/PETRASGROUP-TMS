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
        _act(el, 'Ανανέωση ↻', () => { WN5.reload('user'); }).setAttribute('data-act', 'reload');
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
    if (d.onClose) { try { d.onClose(); } catch (e) { _log(e, 'WN5Act dialog close'); } }
  }
  // opts: { wide, anchor (a popover placed under it), ask (the two-step frame of Δ5: no «×», Άκυρο and the verb are
  // its only buttons — Esc and a click outside still close it), onClose }
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
      + (opts.ask ? '' : '<button type="button" class="wi4-link wi4-dlg-x" aria-label="Κλείσιμο">×</button>') + '</div>'
      + '<div class="wn5-dlg-msg" role="status"></div><div class="wn5-dlg-b"></div><div class="wi4-dlg-ft"></div>';
    dlg.querySelector('.wi4-dlg-t').textContent = title;
    back.appendChild(dlg);
    document.body.appendChild(back);
    const d = { kind, back, dlg, msg: dlg.querySelector('.wn5-dlg-msg'), body: dlg.querySelector('.wn5-dlg-b'),
      ft: dlg.querySelector('.wi4-dlg-ft'), anchor: opts.anchor || null, busy: false, locked: false, closed: false,
      onClose: opts.onClose || null, refresh: null };
    // Esc and a click outside close it, never in the middle of a send (its answer must land somewhere)
    d.onKey = (ev) => { if (ev.key === 'Escape' && !d.busy) { ev.preventDefault(); ev.stopPropagation(); _close(d); } };
    window.addEventListener('keydown', d.onKey, true);
    back.addEventListener('mousedown', (ev) => { if (ev.target === back && !d.busy) _close(d); });
    const x = dlg.querySelector('.wi4-dlg-x');
    if (x) x.addEventListener('click', () => { if (!d.busy) _close(d); });
    _cur = d;
    return d;
  }
  // A popover sits under its anchor and inside the window; called after the content is in.
  function _place(d) {
    if (!d.anchor || !d.anchor.getBoundingClientRect) return;
    const r = d.anchor.getBoundingClientRect();
    const w = d.dlg.offsetWidth, h = d.dlg.offsetHeight;
    d.dlg.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
    d.dlg.style.top = Math.max(8, Math.min(r.bottom + 4, window.innerHeight - h - 8)) + 'px';
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
    if (!opts.reloaded && typeof WN5 !== 'undefined') await WN5.reload('save');
    const host = _boardHost();
    // after a save the over_33 line names the vehicle (Δ12 tile 7): the cycle's truck or partner, from the board just read
    if (host && out && Array.isArray(out.warnings) && out.warnings.length) WN5Act.strip(host, out.warnings.map(_savedOn));
    const intl = opts.intl && out && Array.isArray(out.notice_ids) && out.notice_ids.length ? ' · ενημερώθηκε και ο υπεύθυνος διεθνών' : '';
    // okText may read the answer (e.g. already:true of a cancel says «ήταν ήδη ακυρωμένη»)
    const said = typeof okText === 'function' ? okText(out || {}) : okText;
    if (typeof toast === 'function') toast(said + intl, 'success');
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
      return null;
    }
    if (opts.slot) opts.slot.confirm();      // a new request_id only after a confirmed 200 (replayed included)
    _close(d);
    await _afterSave(out, okText, { intl: opts.intl });
    return out;
  }

  // ═══ Two steps: dry run → list → confirm (S-82) ═══
  const DOC_KINDS = Object.freeze(['payroll_amount', 'costs', 'local_payroll', 'invoiced']);   // «Παραστατικά που υπάρχουν» (Δ5)
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
    let h = (s.intro || []).map((p) => '<p>' + _esc(p) + '</p>').join('');
    if (docs.length) h += '<div class="wn5-cons-h">Παραστατικά που υπάρχουν</div><ul class="wn5-cons">' + docs.map(li).join('') + '</ul>';
    if (acts.length) h += '<div class="wn5-cons-h">Τι θα γίνει</div><ul class="wn5-cons">' + acts.map(li).join('') + '</ul>';
    if (!list.length) h += '<p class="wn5-none">Καμία επίπτωση: δεν αλλάζει τίποτα άλλο.</p>';
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
      if (opened || s.field || dry.needs_confirm === true || list.length > 0) {
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

  // ═══ the actions of T12–T18 go above this line ═══

  WN5Act._kit = KIT;
  window.WN5Act = WN5Act;
})();
