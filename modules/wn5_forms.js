// National v5 F4α — the order forms. Figma KO7l2AfucR3HJEDIg1Yptr: «Νέο groupage εθνικής» 2011:9624 (also the
// normal load and the short form of the «+», 2011:10022 «Νέα παραγγελία»), and — added by T21/T22 — the leg form
// 2011:9294 / Δ7 2069:7746. One global: WN5Form.
//
// Rules (spec §J/§K, F2 binding notes, decisions 20, 21, 31, 41, 44):
//   - the only writes are POST /plan/orders (create) and PATCH /plan/orders/:id (edit), always through planFetch:
//     ONE fetch per press, never _atRetry, never the offline queue;
//   - one request_id per OPEN create form (PlanApi.slot), in memory only: the same id on every press, after a
//     lost answer, plan_unknown, busy_retry or slow; a new one only after a confirmed 200 (slot.confirm) or when
//     the form closes (slot.close). A new uuid per press would turn a resend into a second order;
//   - the body comes ONLY from what the form holds when «Αποθήκευση» is pressed (_body): no clock, no read of
//     the live board. The target cycle's stops are a snapshot taken when the form opened, so two presses send
//     the same bytes and the Worker's replay (same id + same body, 072 plan_h_replay) recognises them;
//   - request_reused (422) = the FIRST press was saved and the answer has no ids: re-read the board and find
//     the order(s) before saying «αποθηκεύτηκε»; replayed:true (200) = success with the first ids;
//   - no Greek text of the Worker or of the DB here (principle 3): refusals are error.message (WN5Act.strip),
//     warnings come AFTER the save from the answer (Ε-3), never from a threshold of the screen;
//   - no role guard (owner 10/10, decision 41): every role may press, the Worker's PLAN_PERMS answers;
//   - nothing at load: no listener, timer, observer or fetch until a form opens; the listeners live on the
//     dialog and die with it, the one window Esc listener is removed on close.
(function () {
  'use strict';
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
  const SIDE_GR = Object.freeze({ KATHODOS: 'ΚΑΘΟΔΟΣ', ANODOS: 'ΑΝΟΔΟΣ' });
  const DIR_GR = Object.freeze({ KATHODOS: 'ΚΑΘΟΔΟΣ (Βορράς → Νότος)', ANODOS: 'ΑΝΟΔΟΣ (Νότος → Βορράς)' });
  // «στάσεις στην ΚΑΘΟΔΟ» (Figma 2011:10012): the closing line needs the accusative, not the nominative of SIDE_GR
  const SIDE_ACC = Object.freeze({ KATHODOS: 'ΚΑΘΟΔΟ', ANODOS: 'ΑΝΟΔΟ' });
  // the header sub of the create form; groupage has its own (Figma 2011:9628), the «+» short form names its side
  const SUB_NEW = '· ΠΡΟΣ ΑΝΑΘΕΣΗ ή στο σκέλος ενός κύκλου';
  const SUB_GRP = '· όλες οι παραγγελίες στο ίδιο σκέλος ενός κύκλου';
  const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const _log = (e, where) => { try { if (typeof logError === 'function') logError(e, where); } catch (_) { /* never hide the form's own failure */ } };
  const _hubRec = () => (typeof F !== 'undefined' && F.VEROIA_LOC) || null;

  class FormError extends Error { constructor(text) { super(text); this.name = 'FormError'; this.text = text; } }

  // ── pure part: tests/wn5-order-body.test.js runs these in a vm ─────────────────────────────────────────────
  // Athens wall time → ISO with the offset of THAT day (+03 summer, +02 winter). The DB casts a timestamptz
  // without an offset in the session zone (UTC): a bare «2026-10-12T16:00» would land 3 hours late.
  // Pure: Date.UTC and Intl on a given instant, never the clock.
  let _offFmt = null;
  function _offMin(ms) {
    if (!_offFmt) _offFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Athens', timeZoneName: 'longOffset' });
    const p = _offFmt.formatToParts(new Date(ms)).find((x) => x.type === 'timeZoneName');
    const m = /GMT(?:([+-])(\d{1,2})(?::?(\d{2}))?)?$/.exec(p ? p.value : '');
    if (!m) return null;
    if (!m[1]) return 0;
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
  }
  function _iso(day, hm) {
    if (!DAY.test(String(day || '')) || !HM.test(String(hm || ''))) return null;
    const wall = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), +hm.slice(0, 2), +hm.slice(3, 5));
    let off = _offMin(wall - 120 * 60000);
    if (off == null) return null;
    const again = _offMin(wall - off * 60000);   // the guess was on the other side of a DST change
    if (again != null) off = again;
    const a = Math.abs(off);
    return `${day}T${hm}:00${off < 0 ? '-' : '+'}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
  }
  let _partFmt = null;
  function _parts(iso) {
    const ms = Date.parse(String(iso || ''));
    if (!Number.isFinite(ms)) return null;
    if (!_partFmt) _partFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const o = {};
    for (const p of _partFmt.formatToParts(new Date(ms))) o[p.type] = p.value;
    return { day: `${o.year}-${o.month}-${o.day}`, hm: `${o.hour}:${o.minute}` };
  }
  const _dlab = (day) => (typeof WI4 !== 'undefined' && WI4.dayLabel ? WI4.dayLabel(day) : String(day || ''));
  // the «ΣΕΙΡΑ ΣΤΑΣΕΩΝ ΚΑΤΑ ΩΡΑ» lines name the weekday only (Figma 9624 «Δευ 08:00–10:00», Δ7 «ως Τετ 22:00»)
  const _dow = (day) => _dlab(day).split(' ')[0];
  // «Τρί 06:00–08:00» from two ISO ends; a window over midnight names both days
  function _win(fromIso, toIso) {
    const a = _parts(fromIso), b = _parts(toIso);
    if (!a || !b) return '—';
    return a.day === b.day ? `${_dlab(a.day)} ${a.hm}–${b.hm}` : `${_dlab(a.day)} ${a.hm} – ${_dlab(b.day)} ${b.hm}`;
  }
  // A time typed in a 71px text field (Figma 2011:9645 «16:00»): the native <input type=time> follows the browser's
  // locale (12-hour «04:00 μ.μ.» in el-GR) and is cut at that width. «1600», «16.00», «9:00» → «16:00» / «09:00»;
  // anything else stays as typed, so _check names it instead of guessing (principle 1).
  function _hmNorm(v) {
    const t = String(v == null ? '' : v).trim();
    const m = /^(\d{1,2})[:.]?(\d{2})$/.exec(t);
    if (!m) return t;
    const out = `${m[1].padStart(2, '0')}:${m[2]}`;
    return HM.test(out) ? out : t;
  }
  const HM_INPUT = 'class="form-input wn5f-hm" type="text" inputmode="numeric" maxlength="5" placeholder="ΗΗ:ΛΛ" autocomplete="off"';
  function _num(v) {
    const s = String(v == null ? '' : v).trim().replace(',', '.');
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }
  // shipments / pieces are numeric(6,1): 2.55 would be rounded by the DB while the summary kept 2.55 (decision 20)
  const _dec1 = (n) => Number.isFinite(n) && Math.abs(Math.round(n * 10) - n * 10) < 1e-9;
  const _p10 = (rows) => Math.round(rows.reduce((a, r) => a + (Number.isFinite(r.pallets) ? r.pallets : 0), 0) * 10);
  const _pal = (n) => String(Math.round(n * 10) / 10).replace('.', ',');

  // Ε-19: N loads × 1 delivery or 1 load × N deliveries pair by themselves; N×M has no single answer (which load
  // goes where?), so it is refused instead of guessed (principle 1).
  function _pairs(o) {
    if (o.loads.length > 1 && o.drops.length > 1) throw new FormError('ένα ζεύγος ανά γραμμή: πολλές φορτώσεις με μία παράδοση ή μία φόρτωση με πολλές παραδόσεις');
    if (o.drops.length === 1) return o.loads.map((l) => [l, o.drops[0], l.pallets]);
    return o.drops.map((d) => [o.loads[0], d, d.pallets]);
  }
  // One stop per place of the form on the target side: the cycle's own stop there (snapshot of the open), or a
  // new one spanning the earliest «από» to the latest «έως» of its rows. plan_h_stop_at finds a piece's stop by
  // place, so two new stops at one place would be refused as ambiguous.
  function _stops(st) {
    const side = st.target.side;
    const byLoc = new Map();
    for (const o of st.orders) for (const r of o.loads.concat(o.drops)) {
      const f = _iso(r.day, r.from), t = _iso(r.day, r.to);
      const e = byLoc.get(r.location_id);
      if (!e) byLoc.set(r.location_id, { from: f, to: t });
      else {
        if (Date.parse(f) < Date.parse(e.from)) e.from = f;
        if (Date.parse(t) > Date.parse(e.to)) e.to = t;
      }
    }
    const out = [];
    let n = 0;
    for (const [loc, w] of byLoc) {
      const ex = (st.cycleStops || []).find((s) => s.side === side && s.location_id === loc);
      n += 1;
      if (ex) out.push({ ref: 's' + n, stop_id: ex.stop_id });
      else out.push({ ref: 's' + n, location_id: loc, side, planned_from: w.from, planned_to: w.to });
    }
    return out;
  }
  // The body of POST /plan/orders: exactly the keys of plan_orders_create (072:596-640), nothing else. The
  // request_id is NOT here: planFetch adds the slot's id (opts.requestId), so the replay md5 never sees it.
  function _body(st) {
    const orders = st.orders.map((o) => {
      const out = { client_id: o.client_id, price: o.price, pallet_exchange: o.pallet_exchange };
      if (o.reference) out.reference = o.reference;
      if (o.goods) out.goods = o.goods;
      if (o.notes) out.notes = o.notes;
      if (o.temperature_c !== null && o.temperature_c !== undefined) out.temperature_c = o.temperature_c;
      out.shipments = _pairs(o).map(([l, d, pallets]) => ({
        origin_location_id: l.location_id, dest_location_id: d.location_id, pallets,
        load_from: _iso(l.day, l.from), load_to: _iso(l.day, l.to),
        deliver_from: _iso(d.day, d.from), deliver_to: _iso(d.day, d.to),
      }));
      return out;
    });
    const body = { orders };
    if (st.target) {
      body.target = { rt_id: st.target.rt_id, side: st.target.side };
      body.stops = _stops(st);
    }
    return body;
  }
  // The form's own lines (screen words for its own fields, never a Worker text): nothing is sent while one shows.
  function _check(st) {
    const out = [];
    if (!st.orders.length) out.push('Καμία παραγγελία στη φόρμα');
    st.orders.forEach((o, i) => {
      const n = st.orders.length > 1 ? `Παραγγελία ${i + 1}: ` : '';
      if (!Number.isSafeInteger(o.client_id)) out.push(n + 'Πελάτης *: διάλεξε πελάτη από τη λίστα');
      if (!(Number.isFinite(o.price) && o.price > 0)) out.push(n + 'Τιμή € (χωρίς ΦΠΑ) *: γράψε την τιμή');
      if (Number.isNaN(o.temperature_c)) out.push(n + 'Θερμοκρασία °C: αριθμός');
      if (typeof o.pallet_exchange !== 'boolean') out.push(n + 'PE · ανταλλαγή παλετών: διάλεξε Ναι ή Όχι');
      if (!o.loads.length) out.push(n + 'ΣΗΜΕΙΑ ΦΟΡΤΩΣΗΣ: τουλάχιστον ένα');
      if (!o.drops.length) out.push(n + 'ΣΗΜΕΙΑ ΠΑΡΑΔΟΣΗΣ: τουλάχιστον ένα');
      for (const [k, rows] of [['φόρτωση', o.loads], ['παράδοση', o.drops]]) rows.forEach((r, j) => {
        const w = `${n}${k} ${j + 1}: `;
        if (!Number.isSafeInteger(r.location_id)) out.push(w + 'διάλεξε τοποθεσία από τη λίστα');
        if (!DAY.test(String(r.day || ''))) out.push(w + 'γράψε ημέρα');
        if (!HM.test(String(r.from || '')) || !HM.test(String(r.to || ''))) out.push(w + 'γράψε παράθυρο από – έως');
        else if (!r.until && r.from >= r.to) out.push(w + 'το «έως» πρέπει να είναι μετά το «από»');
        if (!(Number.isFinite(r.pallets) && r.pallets > 0 && _dec1(r.pallets))) out.push(w + 'παλέτες: αριθμός πάνω από 0, ένα δεκαδικό το πολύ');
      });
      if (o.loads.length > 1 && o.drops.length > 1) out.push(n + 'ένα ζεύγος ανά γραμμή: πολλές φορτώσεις με μία παράδοση ή μία φόρτωση με πολλές παραδόσεις');
      else if (o.loads.length && o.drops.length && _p10(o.loads) !== _p10(o.drops)) out.push(n + 'οι παλέτες φόρτωσης δεν ισούνται με τις παλέτες παράδοσης');
    });
    if (st.target) {
      // A new stop needs planned_to > planned_from (071 rt_stops_win); an arrival «ως» has one time only, so it
      // can only use the cycle's own Veroia stop of that side.
      for (const o of st.orders) for (const r of o.drops) {
        if (!r.until) continue;
        const ex = (st.cycleStops || []).some((s) => s.side === st.target.side && s.location_id === r.location_id);
        if (!ex) { out.push('Ο κύκλος δεν έχει στάση Βέροιας στην ΑΝΟΔΟ — όρισέ τη πρώτα από την ημέρα του σκέλους'); return out; }
      }
    }
    return out;
  }
  // request_reused: which orders of the board are the ones this body created? Same client, same reference (or
  // none) and the same pallets; the highest id wins (the first press is that client's latest order).
  function _findOrders(board, body) {
    if (!board || !body || !Array.isArray(body.orders)) return null;
    const agg = new Map();
    const add = (x, pallets) => {
      if (x.nat_order_id == null) return;
      const a = agg.get(x.nat_order_id) || { nat_order_id: x.nat_order_id, client_id: x.client_id, reference: x.reference || null, p10: 0 };
      a.p10 += Math.round((Number(pallets) || 0) * 10);
      agg.set(x.nat_order_id, a);
    };
    for (const w of board.waiting || []) add(w, w.pallets);
    for (const h of board.hub || []) add(h, h.pallets);
    for (const c of board.cycles || []) for (const s of c.stops || []) for (const l of s.legs || []) if (l.act === 'load') add(l, l.pallets);
    const used = new Set();
    const out = [];
    for (const o of body.orders) {
      const p10 = Math.round(o.shipments.reduce((a, s) => a + s.pallets, 0) * 10);
      const hit = [...agg.values()]
        .filter((a) => !used.has(a.nat_order_id) && a.client_id === o.client_id && a.reference === (o.reference || null) && a.p10 === p10)
        .sort((a, b) => b.nat_order_id - a.nat_order_id)[0];
      if (!hit) return null;
      used.add(hit.nat_order_id);
      out.push({ nat_order_id: hit.nat_order_id, reference: hit.reference });
    }
    return out;
  }
  // PATCH /plan/orders/:id: only what changed (plan_order_update 072:1329 set + shipments). Times compare as
  // instants: the board writes UTC, the form writes the Athens offset.
  function _patchBody(orig, st) {
    const set = {};
    for (const k of ['price', 'reference', 'goods', 'notes', 'temperature_c', 'pallet_exchange']) {
      const v = st[k];
      if (v === undefined || v === null || v === '' || (typeof v === 'number' && !Number.isFinite(v))) continue;
      if (v !== orig[k]) set[k] = v;
    }
    const shipments = [];
    for (const s of st.ships || []) {
      const o = (orig.ships || []).find((x) => x.shipment_id === s.shipment_id);
      if (!o) continue;
      const ch = {};
      if (Number.isFinite(s.pallets) && Math.round(s.pallets * 10) !== Math.round(o.pallets * 10)) ch.pallets = s.pallets;
      for (const k of ['load_from', 'load_to', 'deliver_from', 'deliver_to']) if (s[k] && Date.parse(s[k]) !== Date.parse(o[k])) ch[k] = s[k];
      if (Object.keys(ch).length) shipments.push(Object.assign({ shipment_id: s.shipment_id }, ch));
    }
    const body = {};
    if (Object.keys(set).length) body.set = set;
    if (shipments.length) body.shipments = shipments;
    return body;
  }

  // ── the dialog (one open form at a time: one request_id in play) ───────────────────────────────────────────
  let _f = null;
  let _closedErr = null;   // Ε-6: the first 409 writes_closed of the session; later forms open with it shown

  function _open(f, title, sub, html, foot) {
    if (_f) _close(_f);
    try { if (typeof WN5Act !== 'undefined') WN5Act.closeAll(); } catch (_) { /* one v5 window at a time */ }
    const back = document.createElement('div');
    back.className = 'wi4-dlg-back wn5f-back';
    // the board's cleanup removes every body-level v5 overlay by this mark when the page leaves (weekly_natl_v5.js)
    back.setAttribute('data-wn5-overlay', 'form');
    const box = document.createElement('div');
    box.className = 'wi4-dlg wn5f wn5f-' + f.kind;
    // role=dialog: core/ui.js _WK_OVERLAYS then keeps ←/→ from changing the week under the open form
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.dataset.wn5 = f.kind;
    box.innerHTML = `<div class="wi4-dlg-hd wn5f-hd"><span class="wi4-dlg-t">${title}</span><span class="wn5f-sub">${sub}</span>`
      + `<span class="wn5f-cap" data-cap></span><button type="button" class="wi4-dlg-x" data-act="cancel" aria-label="Κλείσιμο">×</button></div>`
      + `<div class="wn5f-body">${html}</div><div class="wn5f-msg" data-err></div><div data-strip></div>`
      + `<div class="wn5f-done" data-done hidden></div>`
      + `<div class="wi4-dlg-ft wn5f-ft"><span class="wn5f-ft-note">${foot}</span>`
      + `<button type="button" class="wi4-btn" data-act="cancel">Άκυρο</button>`
      + `<button type="button" class="wi4-btn pri" data-act="save">Αποθήκευση</button></div>`;
    back.appendChild(box);
    document.body.appendChild(back);
    f.el = box;
    f.back = back;
    f.onKey = (ev) => { if (ev.key === 'Escape' && !f.busy) { ev.preventDefault(); ev.stopPropagation(); _close(f); } };
    window.addEventListener('keydown', f.onKey, true);
    box.addEventListener('click', (ev) => _onClick(f, ev));
    box.addEventListener('input', () => _refresh(f));
    box.addEventListener('change', () => _refresh(f));
    // a place or client picked from the list (fhPickLinked on mousedown) fires no input: the field's blur refreshes
    box.addEventListener('focusout', (ev) => {
      const t = ev.target;
      if (t && t.classList && t.classList.contains('wn5f-hm') && t.value) t.value = _hmNorm(t.value);
      _refresh(f);
    });
    _f = f;
    return box;
  }
  function _close(f) {
    if (!f) return;
    if (f.slot) { f.slot.close(); f.slot = null; }   // the id dies with the form: the next open mints a new one
    window.removeEventListener('keydown', f.onKey, true);
    if (f.back && f.back.parentNode) f.back.parentNode.removeChild(f.back);
    if (_f === f) _f = null;
  }
  const _strip = (f) => f.el.querySelector('[data-strip]');
  function _lines(f, lines) {
    const box = f.el.querySelector('[data-err]');
    box.innerHTML = lines.map((l) => `<div>${_esc(l)}</div>`).join('');
  }
  function _setSave(f) {
    const b = f.el.querySelector('[data-act="save"]');
    if (b) b.disabled = !!(f.busy || f.done || f.locked || f.noIds || f.blocked);
  }
  function _refresh(f) { if (f.onRefresh) f.onRefresh(f); _setSave(f); }
  function _onClick(f, ev) {
    const t = ev.target.closest('[data-act],[data-mode],[data-pe]');
    if (!t || !f.el.contains(t)) return;
    if (t.dataset.pe) {
      const b = t.closest('[data-peh]');
      b.dataset.peh = t.dataset.pe;
      b.querySelectorAll('[data-pe]').forEach((x) => x.classList.toggle('on', x === t));
      return _refresh(f);
    }
    if (t.dataset.mode) return _setMode(f, t.dataset.mode);
    const a = t.dataset.act;
    if (a === 'cancel') { if (!f.busy) _close(f); return; }
    if (a === 'save') { if (!t.disabled) f.onSave(f); return; }
    if (a === 'add-order') { _addOrder(f); return _refresh(f); }
    if (a === 'add-empties') { _addEmpties(f); return _refresh(f); }
    if (a === 'del-order') { t.closest('.wn5f-ord').remove(); _renumber(f); return _refresh(f); }
    if (a === 'add-row') {
      const box = t.closest('.wn5f-ord').querySelector(`.wn5f-rows[data-k="${t.dataset.k}"]`);
      box.insertAdjacentHTML('beforeend', _rowHTML(f, t.dataset.k));
      return _refresh(f);
    }
    if (a === 'del-row') { t.closest('.wn5f-row').remove(); return _refresh(f); }
    if (a === 'check-board') { _checkBoard(f); return; }
    if (f.onAct) f.onAct(f, a, t, ev);   // the leg form's own buttons (T21, T22)
  }

  // The board as the form opens (decision 31: the loaded week, read once more so the snapshot is fresh).
  async function _board() {
    try { return await WN5.findAfterReuse((b) => b); }
    catch (e) { _log(e, 'WN5Form board'); return null; }
  }

  // ── the create form ────────────────────────────────────────────────────────────────────────────────────────
  function _peHTML(cur) {
    return `<div class="wn5f-tog" data-peh="${cur == null ? '' : cur ? 'yes' : 'no'}">`
      + `<button type="button" data-pe="yes" class="${cur === true ? 'on' : ''}">Ναι</button>`
      + `<button type="button" data-pe="no" class="${cur === false ? 'on' : ''}">Όχι</button></div>`;
  }
  function _rowHTML(f, k) {
    const pid = 'wn5l' + (++f.seq);
    return `<div class="wn5f-row" data-k="${k}" data-pid="${pid}">`
      + `<div class="wn5f-loc">${fhLocSelect(pid, '', 'fhLocDrop')}</div>`
      + `<input class="form-input" type="date" data-f="day" value="${_esc(f.dayDefault || '')}">`
      + `<span class="wn5f-win"><span class="wn5f-from"><input ${HM_INPUT} data-f="from" aria-label="από"><span class="wn5f-dash">–</span></span>`
      + `<input ${HM_INPUT} data-f="to" aria-label="έως"></span>`
      + `<input class="form-input" data-f="pal" inputmode="decimal" aria-label="Παλέτες">`
      + `<button type="button" class="wn5f-x" data-act="del-row" aria-label="Αφαίρεση γραμμής">×</button></div>`;
  }
  function _blockHTML(f) {
    const cid = 'wn5c' + (++f.seq);
    const head = `<div class="wn5f-th"><span>Τοποθεσία</span><span>Ημέρα</span><span data-wh>Παράθυρο από – έως *</span><span>Παλέτες *</span></div>`;
    // Figma 2011:9671: no head line — the block's «×» ends the fields row, «Παραγγελία n» is a chip in its foot
    return `<div class="wn5f-ord">`
      + `<div class="wn5f-fields">`
      + `<label class="wn5f-f"><span>Πελάτης *</span><span data-cpick="${cid}">${fhClientSelect(cid, '', '', 'fhClientDrop')}</span></label>`
      + `<label class="wn5f-f"><span>Τιμή € (χωρίς ΦΠΑ) *</span><input class="form-input" data-f="price" inputmode="decimal"></label>`
      + `<label class="wn5f-f"><span>Θερμοκρασία °C</span><input class="form-input" data-f="temp" inputmode="decimal"></label>`
      + `<div class="wn5f-f"><span>PE · ανταλλαγή παλετών</span>${_peHTML(null)}</div>`
      + `<button type="button" class="wn5f-x wn5f-ox" data-act="del-order" aria-label="Αφαίρεση παραγγελίας">×</button></div>`
      + `<div class="wn5f-grid3">`
      + `<label class="wn5f-f"><span>Αναφορά</span><input class="form-input" data-f="ref"></label>`
      + `<label class="wn5f-f"><span>Είδος</span><input class="form-input" data-f="goods"></label>`
      + `<label class="wn5f-f"><span>Σημειώσεις</span><input class="form-input" data-f="notes"></label></div>`
      + `<div class="wn5f-sec">ΣΗΜΕΙΑ ΦΟΡΤΩΣΗΣ</div>${head}<div class="wn5f-rows" data-k="load">${_rowHTML(f, 'load')}</div>`
      + `<button type="button" class="wn5f-add" data-act="add-row" data-k="load">+ σημείο φόρτωσης</button>`
      + `<div class="wn5f-sec">ΣΗΜΕΙΑ ΠΑΡΑΔΟΣΗΣ</div>${head}<div class="wn5f-rows" data-k="drop">${_rowHTML(f, 'drop')}</div>`
      + `<button type="button" class="wn5f-add" data-act="add-row" data-k="drop">+ σημείο παράδοσης</button>`
      + `<div class="wn5f-ord-ft"><b class="wn5f-chip" data-ordn></b><span class="wn5f-ord-sum" data-osum></span></div></div>`;
  }
  function _orderHTML(f) {
    const opts = ['<option value="">— ΠΡΟΣ ΑΝΑΘΕΣΗ</option>'].concat(f.cycles.map((c) => `<option value="${c.rt_id}">${_esc(c.label)}</option>`)).join('');
    return `<div class="wn5f-head">`
      + `<label class="wn5f-f"><span>Κατεύθυνση *</span><select class="form-input" id="wn5f-dir">`
      + `<option value="KATHODOS">${DIR_GR.KATHODOS}</option><option value="ANODOS">${DIR_GR.ANODOS}</option></select></label>`
      + `<label class="wn5f-f"><span data-vdayl>Ημ. φόρτωσης Βέροιας *</span><input class="form-input" type="date" id="wn5f-vday"></label>`
      + `<label class="wn5f-f"><span data-vwinl>Παράθυρο φόρτωσης Βέροιας *</span><span class="wn5f-win"><span class="wn5f-from" data-vfromw><input ${HM_INPUT} id="wn5f-vfrom" aria-label="από"><span class="wn5f-dash">–</span></span><input ${HM_INPUT} id="wn5f-vto" aria-label="έως"></span></label>`
      + `<label class="wn5f-f"><span>Φορτηγό (προαιρετικό)</span><select class="form-input" id="wn5f-tgt">${opts}</select></label></div>`
      + `<div class="wn5f-sec">ΤΥΠΟΣ ΚΑΤΑΧΩΡΗΣΗΣ</div><div class="wn5f-modes">`
      + `<button type="button" class="wn5f-mode" data-mode="normal"><span class="wn5f-mode-t"><i class="wn5f-radio" aria-hidden="true"></i>Κανονικό φορτίο</span><span class="wn5f-mode-s">Ένας πελάτης — 1 παραγγελία</span></button>`
      + `<button type="button" class="wn5f-mode" data-mode="groupage"><span class="wn5f-mode-t"><i class="wn5f-radio" aria-hidden="true"></i>Groupage</span><span class="wn5f-mode-s">Πολλοί πελάτες, ένα φορτηγό — 1 παραγγελία ανά πελάτη, ίδιο σκέλος, χωρίς βήμα ένωσης</span></button></div>`
      + `<div class="wn5f-ords">${_blockHTML(f)}</div>`
      + `<div class="wn5f-adds"><button type="button" class="wn5f-add" data-act="add-order">+ παραγγελία</button>`
      + `<button type="button" class="wn5f-add" data-act="add-empties">+ Άδειες παλέτες · 1 €</button></div>`
      + `<div class="wn5f-sum" data-sum></div>`;
  }
  function _addOrder(f) { f.el.querySelector('.wn5f-ords').insertAdjacentHTML('beforeend', _blockHTML(f)); _renumber(f); }
  // «+ Άδειες παλέτες · 1 €» (Figma 2011:9624; the ΠΡΟΡΥΘΜΙΣΗ of 2011:10022, Ε-39): a national order PREFILLED for
  // empty pallets — goods «Άδειες παλέτες», price 1 — with Veroia as its loading point on ΚΑΘΟΔΟΣ (Veroia as the A of
  // a national, spec §3) or its delivery point on ΑΝΟΔΟΣ (the board's «Άδειες παλέτες 1 €» → Βέροια). No route of
  // its own: the user still picks the client, the other point and the pallets, and the body is the form's state.
  function _addEmpties(f) {
    const blocks = [...f.el.querySelectorAll('.wn5f-ord')];
    const last = blocks[blocks.length - 1];
    const untouched = last && !(document.getElementById('lv_' + last.querySelector('[data-cpick]').dataset.cpick) || {}).value
      && !last.querySelector('[data-f="price"]').value;
    if (!untouched) { if (f.mode !== 'groupage') _setMode(f, 'groupage'); _addOrder(f); }
    const b = [...f.el.querySelectorAll('.wn5f-ord')].pop();
    const set = (sel, v) => { const x = b.querySelector(sel); if (x) { x.value = v; x.dispatchEvent(new Event('input', { bubbles: true })); } };
    set('[data-f="goods"]', 'Άδειες παλέτες');
    set('[data-f="price"]', '1');
    const hub = _hubRec();
    const k = f.el.querySelector('#wn5f-dir').value === 'ANODOS' ? 'drop' : 'load';
    const row = b.querySelector(`.wn5f-rows[data-k="${k}"] .wn5f-row`);
    let name = null;
    try { name = (PlanIds.place(PlanIds.id('location', hub)) || {}).name || null; } catch (_) { name = null; }
    // the rec decides the place; the label is only what the picker shows
    if (hub && row && typeof fhPickLinked === 'function') fhPickLinked(row.dataset.pid, hub, name || 'Βέροια');
  }
  function _renumber(f) { f.el.querySelectorAll('.wn5f-ord').forEach((b, i) => { b.querySelector('[data-ordn]').textContent = 'Παραγγελία ' + (i + 1); }); }
  function _setMode(f, mode) {
    f.mode = mode;
    if (mode === 'normal') f.el.querySelectorAll('.wn5f-ord').forEach((b, i) => { if (i > 0) b.remove(); });
    f.el.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    f.el.classList.toggle('grp', mode === 'groupage');
    f.el.querySelector('.wi4-dlg-t').textContent = mode === 'groupage' ? 'Νέο groupage εθνικής' : 'Νέα παραγγελία εθνικής';
    if (f.p.rtId == null) f.el.querySelector('.wn5f-sub').textContent = mode === 'groupage' ? SUB_GRP : SUB_NEW;
    _renumber(f);
    _refresh(f);
  }
  // The raw rows as typed (labels and rec ids): used by the live summary, which needs no numeric ids.
  function _raw(f) {
    const dir = f.el.querySelector('#wn5f-dir').value;
    const hub = _hubRec();
    return [...f.el.querySelectorAll('.wn5f-ord')].map((b) => {
      const cid = b.querySelector('[data-cpick]').dataset.cpick;
      const v = (sel) => { const x = b.querySelector(sel); return x ? x.value : ''; };
      const rows = (k) => [...b.querySelectorAll(`.wn5f-rows[data-k="${k}"] .wn5f-row`)].map((r) => {
        const rec = (document.getElementById('lv_' + r.dataset.pid) || {}).value || '';
        const until = k === 'drop' && dir === 'ANODOS' && !!hub && rec === hub;
        r.classList.toggle('until', until);
        const to = _hmNorm(r.querySelector('[data-f="to"]').value);
        return { rec, label: (document.getElementById('ls_' + r.dataset.pid) || {}).value || '', day: r.querySelector('[data-f="day"]').value,
          from: until ? to : _hmNorm(r.querySelector('[data-f="from"]').value), to, until, pallets: _num(r.querySelector('[data-f="pal"]').value), hub: !!hub && rec === hub };
      });
      return { cid, rec: (document.getElementById('lv_' + cid) || {}).value || '', client: (document.getElementById('ls_' + cid) || {}).value || '',
        price: _num(v('[data-f="price"]')), temperature_c: _num(v('[data-f="temp"]')), pe: b.querySelector('[data-peh]').dataset.peh,
        reference: v('[data-f="ref"]').trim(), goods: v('[data-f="goods"]').trim(), notes: v('[data-f="notes"]').trim(), loads: rows('load'), drops: rows('drop') };
    });
  }
  // DOM → state with numeric ids (PlanIds, Ε-2). A rec without its number throws PlanError ids_missing: shown,
  // nothing sent.
  function _readState(f) {
    const dir = f.el.querySelector('#wn5f-dir').value;
    const tgt = f.el.querySelector('#wn5f-tgt').value;
    const st = { side: dir, target: null, cycleStops: [], orders: [] };
    if (tgt) { st.target = { rt_id: Number(tgt), side: dir }; st.cycleStops = f.cycleStops[tgt] || []; }
    for (const o of _raw(f)) {
      const row = (r) => ({ location_id: r.rec ? PlanIds.id('location', r.rec) : null, day: r.day, from: r.from, to: r.to, pallets: r.pallets, until: r.until });
      st.orders.push({ client_id: o.rec ? PlanIds.id('client', o.rec) : null, price: o.price, temperature_c: o.temperature_c,
        pallet_exchange: o.pe === 'yes' ? true : o.pe === 'no' ? false : null, reference: o.reference, goods: o.goods, notes: o.notes,
        loads: o.loads.map(row), drops: o.drops.map(row) });
    }
    return st;
  }
  function _orderRefresh(f) {
    const dir = f.el.querySelector('#wn5f-dir').value;
    f.el.querySelector('[data-vdayl]').textContent = dir === 'ANODOS' ? 'Ημ. άφιξης Βέροιας *' : 'Ημ. φόρτωσης Βέροιας *';
    f.el.querySelector('[data-vwinl]').textContent = dir === 'ANODOS' ? 'Άφιξη Βέροιας ως *' : 'Παράθυρο φόρτωσης Βέροιας *';
    f.el.querySelector('[data-vfromw]').hidden = dir === 'ANODOS';
    const raw = _raw(f);
    // the header's Veroia day/window fills an empty Veroia row: one value typed once (Figma 9624)
    const vday = f.el.querySelector('#wn5f-vday').value, vf = _hmNorm(f.el.querySelector('#wn5f-vfrom').value), vt = _hmNorm(f.el.querySelector('#wn5f-vto').value);
    f.el.querySelectorAll('.wn5f-row').forEach((r) => {
      const rec = (document.getElementById('lv_' + r.dataset.pid) || {}).value || '';
      if (rec && rec === _hubRec()) {
        const d = r.querySelector('[data-f="day"]'), a = r.querySelector('[data-f="from"]'), b = r.querySelector('[data-f="to"]');
        if (!d.value && vday) d.value = vday;
        if (!a.value && vf) a.value = vf;
        if (!b.value && vt) b.value = vt;
      }
    });
    // a drop section whose rows are all Veroia arrivals heads its window «Άφιξη ως *» (Figma Δ7 2069:7995)
    f.el.querySelectorAll('.wn5f-ord').forEach((b) => {
      const rows = [...b.querySelectorAll('.wn5f-rows[data-k="drop"] .wn5f-row')];
      const h = b.querySelectorAll('[data-wh]')[1];
      if (h) h.textContent = rows.length && rows.every((r) => r.classList.contains('until')) ? 'Άφιξη ως *' : 'Παράθυρο από – έως *';
    });
    let total = 0, ships = 0;
    const seq = [];
    const cli = [];
    raw.forEach((o, i) => {
      const lp = o.loads.reduce((a, r) => a + (Number.isFinite(r.pallets) ? r.pallets : 0), 0);
      total += lp;
      ships += o.loads.length > 1 && o.drops.length > 1 ? 0 : Math.max(o.loads.length, o.drops.length);
      const nl = o.loads.length, nd = o.drops.length;
      const txt = [`${nl} ${nl === 1 ? 'φόρτωση' : 'σημεία φόρτωσης'}`, `${nd} ${nd === 1 ? 'παράδοση' : 'παραδόσεις'}`, `${_pal(lp)}π`]
        .concat(Number.isFinite(o.price) && o.price > 0 ? [`${_pal(o.price)} €`] : []).concat(['τιμολογείται χωριστά']).join(' · ');
      const box = f.el.querySelectorAll('[data-osum]')[i];
      if (box) box.textContent = txt;
      // the summary's client line (Figma 2011:9938): «Orion Foods · 2 φορτώσεις · 10π · 640 €»
      cli.push([o.client || '—'].concat(nl > 1 ? [`${nl} φορτώσεις`] : []).concat([`${_pal(lp)}π`])
        .concat(Number.isFinite(o.price) && o.price > 0 ? [`${_pal(o.price)} €`] : []).join(' · '));
      for (const [act, rows] of [['φόρτωση', o.loads], ['παράδοση', o.drops]]) for (const r of rows)
        if (DAY.test(r.day) && HM.test(r.to)) seq.push({ k: r.day + 'T' + (r.from || r.to), when: r.until ? `ως ${_dow(r.day)} ${r.to}` : `${_dow(r.day)} ${r.from}–${r.to}`, act, place: r.hub ? 'Βέροια' : r.label, clients: [o.client || '—'], pal: r.pallets });
    });
    seq.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
    // Figma 2011:9940: orders at the same place in the same window are ONE stop line («Zeta, Kappa · 20π»)
    const lines = [];
    for (const x of seq) {
      const same = lines.find((y) => y.k === x.k && y.when === x.when && y.act === x.act && y.place === x.place && !!x.place);
      if (!same) { lines.push(Object.assign({}, x, { clients: x.clients.slice() })); continue; }
      same.clients.push(x.clients[0]);
      same.pal = Number.isFinite(same.pal) && Number.isFinite(x.pal) ? same.pal + x.pal : NaN;
    }
    // whole names, never a first word (DESIGN.md #6): Figma's «Zeta, Kappa» shortens, a shortened name can mislead
    const who = (l) => l.clients.join(', ');
    const n = raw.length;
    const tgtSel = f.el.querySelector('#wn5f-tgt');
    const where = tgtSel.value ? tgtSel.options[tgtSel.selectedIndex].text : 'ΠΡΟΣ ΑΝΑΘΕΣΗ';
    const day = f.el.querySelector('#wn5f-vday').value;
    f.el.querySelector('[data-cap]').textContent = `σύνολο ${_pal(total)}/33`;
    f.el.querySelector('[data-sum]').innerHTML =
      `<div class="wn5f-sum-h"><b>${n} ${n === 1 ? 'παραγγελία θα δημιουργηθεί' : 'παραγγελίες θα δημιουργηθούν'} · ${SIDE_GR[dir]}${DAY.test(day) ? ' · ' + _esc(_dlab(day)) : ''} · ${_esc(where)}</b><b>${_pal(total)}/33 παλέτες</b></div>`
      + (n > 1 ? `<div class="wn5f-sum-c">${_esc(cli.concat(['κάθε παραγγελία τιμολογείται χωριστά']).join('   ·   '))}</div>` : '')
      + `<div class="wn5f-sec">ΣΕΙΡΑ ΣΤΑΣΕΩΝ ΚΑΤΑ ΩΡΑ</div><ol class="wn5f-seq">`
      + lines.map((x, i) => `<li><span class="wn5f-seq-n">${i + 1}</span><span class="wn5f-seq-w">${_esc(x.when)}</span><span class="wn5f-seq-a">${x.act}</span><span class="wn5f-seq-p">${_esc(x.place || '—')}</span><span class="wn5f-seq-c">${_esc(who(x))}</span><span class="wn5f-seq-q">${Number.isFinite(x.pal) ? _pal(x.pal) + 'π' : '—'}</span></li>`).join('')
      + `</ol><div class="wn5f-note wn5f-sum-n">Θα γραφτούν σε μία συναλλαγή: ${n} ${n === 1 ? 'παραγγελία' : 'παραγγελίες'} → ${ships} ${ships === 1 ? 'αποστολή' : 'αποστολές'} → στάσεις στην ${SIDE_ACC[dir]}${DAY.test(day) ? ' ' + _esc(_dlab(day)) : ''} (${_esc(where)}). Χωρίς βήμα ένωσης.</div>`;
    f.el.querySelector('[data-act="add-order"]').hidden = f.mode !== 'groupage';
    f.el.querySelectorAll('[data-act="del-order"]').forEach((b) => { b.hidden = f.mode !== 'groupage' || n < 2; });
    const save = f.el.querySelector('[data-act="save"]');
    if (!f.done) save.textContent = n > 1 ? `Αποθήκευση · ${n} παραγγελίες` : 'Αποθήκευση';
  }

  async function _saveOrder(f) {
    if (f.busy || f.done || f.locked) return;
    let st, body;
    try { st = _readState(f); }
    catch (e) { if (typeof PlanError !== 'undefined' && e instanceof PlanError) WN5Act.strip(_strip(f), e); else _lines(f, [String(e && e.message || e)]); return; }
    const probs = _check(st);
    _lines(f, probs);
    if (probs.length) return;
    try { body = _body(st); } catch (e) { _lines(f, [e.text || String(e.message || e)]); return; }
    f.busy = true;
    _setSave(f);
    try {
      const ans = await planFetch('POST', '/plan/orders', { body, requestId: f.slot.id });
      f.slot.confirm();   // confirmed 200 (replayed too): the next order of this form needs a new id
      _done(f, ans, null);
    } catch (e) {
      await _failed(f, e, body);
    } finally {
      f.busy = false;
      _setSave(f);
    }
  }
  async function _failed(f, e, body) {
    if (typeof PlanError === 'undefined' || !(e instanceof PlanError)) {
      _log(e, 'WN5Form save');
      _lines(f, ['Δεν αποθηκεύτηκε: ' + String(e && e.message || e)]);
      return;
    }
    const K = PlanApi.KIND;
    WN5Act.strip(_strip(f), e);
    if (e.kind === K.CLOSED) { WN5.markClosed(e); _closedErr = e; f.locked = true; return; }
    if (e.kind === K.LEAK) { f.locked = true; return; }   // the write WAS kept: never press again
    if (e.kind === K.REUSED && body) {
      // the first press is saved; the answer has no ids — find it on a fresh board before any «αποθηκεύτηκε»
      const found = await WN5.findAfterReuse((b) => _findOrders(b, body));
      if (found) { if (f.slot) f.slot.confirm(); _done(f, null, found); return; }
      f.locked = true;   // the Worker's text says where to look; a resend would be refused again
      return;
    }
    if (e.kind === K.UNKNOWN && f.kind === 'order') {
      f.lastBody = body;
      // WN5Act.strip's own «Έλεγχος στο board» only re-reads; the form's one also looks for THIS order (_findOrders)
      const s = _strip(f).querySelector('.wn5-strip') || _strip(f);
      s.querySelectorAll('.wn5-strip-act').forEach((b) => b.remove());
      s.insertAdjacentHTML('beforeend', '<button type="button" class="wi4-link wn5-strip-act" data-act="check-board">Έλεγχος στο board</button>');
    }
  }
  // Ε-7: after «μπορεί να αποθηκεύτηκε» the user checks the board; found = saved (no resend), else the same
  // button again sends the SAME request_id (a replay if the first did land).
  async function _checkBoard(f) {
    const found = await WN5.findAfterReuse((b) => _findOrders(b, f.lastBody));
    if (found) { if (f.slot) f.slot.confirm(); _done(f, null, found); return; }
    _lines(f, ['Δεν βρέθηκε στο Εβδομαδιαίο — πάτα ξανά «Αποθήκευση»: στέλνει το ίδιο αίτημα, δεν γράφει δεύτερη φορά']);
  }
  function _done(f, ans, found) {
    f.done = true;
    const ids = ans ? ((ans.ids && (ans.ids.nat_order_ids || (ans.ids.nat_order_id != null ? [ans.ids.nat_order_id] : []))) || [])
                    : found.map((x) => x.nat_order_id);
    const n = ids.length || 1;
    const why = ans && ans.replayed ? ' · το πρώτο πάτημα είχε ήδη αποθηκευτεί' : found ? ' · βρέθηκε στο Εβδομαδιαίο' : '';
    const d = f.el.querySelector('[data-done]');
    d.hidden = false;
    d.textContent = `Αποθηκεύτηκε · ${n === 1 ? '1 παραγγελία' : n + ' παραγγελίες'}${ids.length ? ' · #' + ids.join(' · #') : ''}${why}`;
    _lines(f, []);
    if (ans && Array.isArray(ans.warnings) && ans.warnings.length) WN5Act.strip(_strip(f), ans.warnings);
    else if (!found) _strip(f).innerHTML = '';
    f.el.querySelector('[data-act="save"]').hidden = true;
    f.el.querySelectorAll('.wn5f-ft [data-act="cancel"]').forEach((b) => { b.textContent = 'Κλείσιμο'; });
    if (ans) WN5.reload('order-saved');
  }

  // ── edit (from the order card «Επεξεργασία», T18) ─────────────────────────────────────────────────────────
  // What the 072 board carries of an order: waiting/hub pieces have the shipment, its windows and the price;
  // legs of a cycle have neither. Missing values are «not known», never zero (trap 2).
  function _editSource(board, id) {
    if (!board) return null;
    const w = (board.waiting || []).filter((x) => x.nat_order_id === id);
    const legs = [];
    for (const c of board.cycles || []) for (const s of c.stops || []) for (const l of s.legs || []) if (l.nat_order_id === id) legs.push(l);
    if (!w.length && !legs.length) return null;
    const any = w[0] || legs[0];
    return {
      nat_order_id: id, client: any.client || '', reference: any.reference || '',
      price: w[0] && w[0].price !== undefined ? w[0].price : null,
      temperature_c: any.temperature_c === undefined ? null : any.temperature_c,
      pallet_exchange: w[0] && typeof w[0].pallet_exchange === 'boolean' ? w[0].pallet_exchange : null,
      goods: '', notes: '', riding: legs.length > 0,
      ships: w.map((x) => ({ shipment_id: x.shipment_id, origin: x.nat_from_location_id, dest: x.nat_to_location_id, pallets: x.pallets,
        load_from: x.load_from, load_to: x.load_to, deliver_from: x.deliver_from, deliver_to: x.deliver_to })),
    };
  }
  const _placeName = (id) => { const p = typeof PlanIds !== 'undefined' ? PlanIds.place(id) : null; return p ? p.name : '#' + id; };
  function _editHTML(f) {
    const e = f.edit;
    const t = (iso) => _parts(iso) || { day: '', hm: '' };
    const ro = e.riding ? ' disabled' : '';
    const ships = e.ships.map((s) => {
      const lf = t(s.load_from), lt = t(s.load_to), df = t(s.deliver_from), dt = t(s.deliver_to);
      return `<div class="wn5f-ship" data-ship="${s.shipment_id}"><span>${_esc(_placeName(s.origin))} → ${_esc(_placeName(s.dest))}</span>`
        + `<input class="form-input" type="date" data-f="lday" value="${lf.day}"${ro}><input class="form-input" type="time" data-f="lfrom" value="${lf.hm}"${ro}><input class="form-input" type="time" data-f="lto" value="${lt.hm}"${ro}>`
        + `<input class="form-input" type="date" data-f="dday" value="${df.day}"${ro}><input class="form-input" type="time" data-f="dfrom" value="${df.hm}"${ro}><input class="form-input" type="time" data-f="dto" value="${dt.hm}"${ro}>`
        + `<input class="form-input" data-f="pal" inputmode="decimal" value="${_esc(s.pallets)}"${ro}></div>`;
    }).join('');
    return `<div class="wn5f-grid4">`
      + `<div class="wn5f-f"><span>Πελάτης</span><span class="wn5f-ro">${_esc(e.client || '—')}</span></div>`
      + `<label class="wn5f-f"><span>Τιμή € (χωρίς ΦΠΑ) *</span><input class="form-input" data-f="price" inputmode="decimal" value="${e.price == null ? '' : _esc(e.price)}" placeholder="${e.price == null ? 'χωρίς αλλαγή' : ''}"></label>`
      + `<label class="wn5f-f"><span>Θερμοκρασία °C</span><input class="form-input" data-f="temp" inputmode="decimal" value="${e.temperature_c == null ? '' : _esc(e.temperature_c)}"></label>`
      + `<div class="wn5f-f"><span>PE · ανταλλαγή παλετών</span>${_peHTML(e.pallet_exchange)}</div></div>`
      + (e.price == null ? '<div class="wn5f-note">Η τιμή δεν έρχεται με το board για παραγγελία σε κύκλο — γράψε τιμή μόνο για να την αλλάξεις.</div>' : '')
      + `<div class="wn5f-grid3"><label class="wn5f-f"><span>Αναφορά</span><input class="form-input" data-f="ref" value="${_esc(e.reference)}"></label>`
      + `<label class="wn5f-f"><span>Είδος</span><input class="form-input" data-f="goods"></label><label class="wn5f-f"><span>Σημειώσεις</span><input class="form-input" data-f="notes"></label></div>`
      + `<div class="wn5f-sec">ΑΠΟΣΤΟΛΕΣ</div><div class="wn5f-ships-h"><span>Διαδρομή</span><span>Φόρτωση από – έως</span><span>Παράδοση από – έως</span><span>Παλέτες</span></div>${ships}`
      + (e.riding ? '<div class="wn5f-note">Φορτίο σε κύκλο: παλέτες και παράθυρα αλλάζουν με «Μεταφορά σε…» ή από την ημέρα του σκέλους.</div>' : '');
  }
  function _readEdit(f) {
    const v = (sel) => { const x = f.el.querySelector(sel); return x ? x.value : ''; };
    const peh = f.el.querySelector('[data-peh]').dataset.peh;
    return {
      price: _num(v('[data-f="price"]')), temperature_c: _num(v('[data-f="temp"]')), reference: v('[data-f="ref"]').trim(),
      goods: v('[data-f="goods"]').trim(), notes: v('[data-f="notes"]').trim(), pallet_exchange: peh === 'yes' ? true : peh === 'no' ? false : null,
      ships: f.edit.riding ? [] : [...f.el.querySelectorAll('[data-ship]')].map((r) => {
        const g = (k) => r.querySelector(`[data-f="${k}"]`).value;
        return { shipment_id: Number(r.dataset.ship), pallets: _num(g('pal')), load_from: _iso(g('lday'), g('lfrom')), load_to: _iso(g('lday'), g('lto')),
          deliver_from: _iso(g('dday'), g('dfrom')), deliver_to: _iso(g('dday'), g('dto')) };
      }),
    };
  }
  async function _saveEdit(f) {
    if (f.busy || f.done || f.locked) return;
    const st = _readEdit(f);
    const probs = [];
    if (st.price !== null && !(Number.isFinite(st.price) && st.price > 0)) probs.push('Τιμή € (χωρίς ΦΠΑ) *: αριθμός πάνω από 0');
    if (Number.isNaN(st.temperature_c)) probs.push('Θερμοκρασία °C: αριθμός');
    for (const s of st.ships) {
      if (!(Number.isFinite(s.pallets) && s.pallets > 0 && _dec1(s.pallets))) probs.push('παλέτες: αριθμός πάνω από 0, ένα δεκαδικό το πολύ');
      if (!s.load_from || !s.load_to || !s.deliver_from || !s.deliver_to) probs.push('παράθυρο από – έως σε κάθε αποστολή');
    }
    const body = probs.length ? null : _patchBody(f.edit, st);
    if (body && !body.set && !body.shipments) probs.push('Τίποτα δεν άλλαξε');
    _lines(f, probs);
    if (probs.length) return;
    f.busy = true;
    _setSave(f);
    try {
      const ans = await planFetch('PATCH', '/plan/orders/' + f.edit.nat_order_id, { body });
      _done(f, ans, null);
    } catch (e) { await _failed(f, e, null); }
    finally { f.busy = false; _setSave(f); }
  }

  // Ε-6: the session's first 409 writes_closed, whether a form or another v5 window got it (WN5Act keeps its own)
  function _closedNow() {
    if (_closedErr) return _closedErr;
    try { return (typeof WN5Act !== 'undefined' && WN5Act._kit && typeof WN5Act._kit.closedErr === 'function' && WN5Act._kit.closedErr()) || null; }
    catch (_) { return null; }
  }
  async function openOrder(prefill) {
    const p = prefill || {};
    try { await fhLoadLocations(); } catch (e) { _log(e, 'WN5Form.openOrder locations'); }
    if (typeof _fhLocationsArr === 'undefined' || !_fhLocationsArr.length) {
      // P1 4/10 (orders_natl.js:806-822): without the places list every row would be unpickable
      if (typeof toast === 'function') toast('Οι τοποθεσίες δεν φορτώθηκαν — η φόρμα δεν άνοιξε. Ξαναδοκίμασε.', 'danger');
      _log(new Error('wn5 order form: empty locations list'), 'WN5Form.openOrder');
      return false;
    }
    const ids = await PlanIds.load();
    const board = await _board();
    const f = { kind: 'order', p, seq: 0, busy: false, done: false, locked: false, mode: 'normal', cycleStops: {}, cycles: [], dayDefault: p.day || '' };
    for (const c of (board && board.cycles) || []) {
      f.cycleStops[c.rt_id] = (c.stops || []).map((s) => ({ stop_id: s.stop_id, location_id: s.location_id, side: s.side }));
      const who = c.trip_type === 'PARTNER' ? (c.partner || 'Συνεργάτης') : [c.truck, c.driver].filter(Boolean).join(' · ');
      f.cycles.push({ rt_id: c.rt_id, label: `${c.code || 'RT-' + c.rt_id} · ${who || 'χωρίς όχημα'}` });
    }
    if (p.natOrderId != null) {
      f.kind = 'order';
      f.edit = _editSource(board, p.natOrderId);
      if (!f.edit) {   // Ε-9: the card reads the loaded week only
        if (typeof toast === 'function') toast('Η παραγγελία #' + p.natOrderId + ' είναι σε άλλη εβδομάδα — άνοιξέ την από εκείνη', 'warn');
        return false;
      }
      f.onSave = _saveEdit;
      f.onRefresh = null;
      _open(f, 'Επεξεργασία παραγγελίας #' + _esc(p.natOrderId), '· ' + _esc(f.edit.client || ''), _editHTML(f), 'Μία «Αποθήκευση» = μία συναλλαγή.');
      if (!ids.ok) WN5Act.strip(_strip(f), ids.err);
      if (_closedNow()) { WN5Act.strip(_strip(f), _closedNow()); f.locked = true; }
      _refresh(f);
      return true;
    }
    f.onSave = _saveOrder;
    f.onRefresh = _orderRefresh;
    f.slot = PlanApi.slot();   // ONE id for this open form (decision 44)
    _open(f, 'Νέα παραγγελία εθνικής', '· ΠΡΟΣ ΑΝΑΘΕΣΗ ή στο σκέλος ενός κύκλου', _orderHTML(f), 'Μία «Αποθήκευση» = μία συναλλαγή· αν αποτύχει ένα κομμάτι, δεν γράφεται τίποτα.');
    const dir = f.el.querySelector('#wn5f-dir'), tgt = f.el.querySelector('#wn5f-tgt');
    if (p.side === 'ANODOS' || p.side === 'KATHODOS') dir.value = p.side;
    if (p.rtId != null) {
      // the «+» of a row: side and cycle are the row's, not choices (Figma 10022 «… έτοιμα»)
      tgt.value = String(p.rtId);
      tgt.disabled = true;
      dir.disabled = true;
      const c = ((board && board.cycles) || []).find((x) => x.rt_id === p.rtId);
      const hubSel = (c && c.stops || []).filter((s) => s.side === dir.value).sort((a, b) => a.seq - b.seq);
      const hubStop = hubSel.find((s) => { try { return s.location_id === PlanIds.id('location', _hubRec()); } catch (_) { return false; } });
      const v = p.veroia || (hubStop ? { from: hubStop.planned_from, to: hubStop.planned_to } : null);
      const day = p.day || (hubStop ? hubStop.stop_day : '');
      if (day) { f.el.querySelector('#wn5f-vday').value = day; f.dayDefault = day; f.el.querySelectorAll('[data-f="day"]').forEach((x) => { if (!x.value) x.value = day; }); }
      if (v) {
        const a = /^\d\d:\d\d$/.test(v.from) ? v.from : (_parts(v.from) || {}).hm, b = /^\d\d:\d\d$/.test(v.to) ? v.to : (_parts(v.to) || {}).hm;
        if (a) f.el.querySelector('#wn5f-vfrom').value = a;
        if (b) f.el.querySelector('#wn5f-vto').value = b;
      }
      f.el.querySelector('.wn5f-sub').textContent = '· σύντομη φόρμα του «+» · ' + SIDE_GR[dir.value];
    }
    _setMode(f, 'normal');
    if (p.preset === 'empties') _addEmpties(f);   // the ΠΡΟΡΥΘΜΙΣΗ «Άνοιγμα» of the «+» (T13, Figma 10022)
    if (!ids.ok) { WN5Act.strip(_strip(f), ids.err); f.noIds = true; }   // Ε-2: no numbers for the pickers yet
    if (_closedNow()) { WN5Act.strip(_strip(f), _closedNow()); f.locked = true; }
    _refresh(f);
    return true;
  }

  window.WN5Form = Object.freeze({ openOrder, _body, _check, _patchBody, _findOrders, _iso, _parts });
})();
