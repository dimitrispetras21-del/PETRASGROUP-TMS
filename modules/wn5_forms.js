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
  // F1 (owner 28/10): a point's window is optional. Left empty, it is the whole of the point's day, 00:00–23:59 — the
  // value the Δ1 quick fix gives a window-less stop (#160) — because shipments_win / rt_stops_win (071) hold a window
  // on every national point and the base invents no hour. Never a silent hour: every reader names it «όλη η ημέρα»
  // through ONE rule, WN5L.allDay / WN5L.DAY_WIN (core/wn5-logic.js, loaded before this file).
  const _dayWin = () => WN5L.DAY_WIN;
  const _allDay = (from, to) => from === _dayWin().from && to === _dayWin().to;
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
  // A day typed in a day field (live 28/10: «typing in the date fields does not change the value, only the picker
  // works»). The native date input sat under the weekday label in 100px: a click landed on a segment the user could not
  // see, «29» went into the year (0029) and the label still read «15/10». The field is now text, read here:
  // «29/10», «29/10/2026», «29.10.26», «2910», «29102026», «2026-10-29». A day without a year takes the year that puts it
  // nearest to ref (the field's own day, else today), so «02/01» typed on a 30/12 is the next January. A year that is
  // typed must be within a year of ref (code review: «29/10/20» was 2020, six years back, without a word). Anything else
  // is null: the form names it, never a guessed day (principle 1). Pure: no clock, ref is given.
  function _dayParse(text, ref) {
    const s = String(text == null ? '' : text).trim();
    if (!s) return '';
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s), d, mo, y = null;
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else {
      m = /^(\d{1,2})[/.\- ](\d{1,2})(?:[/.\- ](\d{2}|\d{4}))?$/.exec(s) || /^(\d{2})(\d{2})(\d{2}|\d{4})?$/.exec(s);
      if (!m) return null;
      d = +m[1]; mo = +m[2];
      if (m[3]) y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    }
    const at = (yy) => { const t = new Date(Date.UTC(yy, mo - 1, d)); return t.getUTCFullYear() === yy && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? t.getTime() : null; };
    const out = (ms) => (ms == null ? null : new Date(ms).toISOString().slice(0, 10));
    const hasRef = DAY.test(String(ref || ''));
    const ry = hasRef ? +ref.slice(0, 4) : null;
    if (y !== null) return y >= 2000 && y <= 2099 && (ry === null || Math.abs(y - ry) <= 1) ? out(at(y)) : null;
    if (!hasRef) return null;
    const r = Date.UTC(ry, +ref.slice(5, 7) - 1, +ref.slice(8, 10));
    let best = null;
    for (const yy of [ry - 1, ry, ry + 1]) { const ms = at(yy); if (ms !== null && (best === null || Math.abs(ms - r) < Math.abs(best - r))) best = ms; }
    return out(best);
  }
  // lucide «calendar» at 14px: the picker of a day field, the native one, opened on purpose
  const CAL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
  // One day field: the typed text (.wn5f-dayx), the native date input that holds the ISO day every reader reads (its
  // data-f / id stay there) and opens only from the calendar button, never under a click on the text.
  function _dayHTML(attrs, v, ro, year) {
    return `<span class="wn5f-day"${year ? ' data-y' : ''}><input class="form-input wn5f-dayx" type="text" inputmode="numeric" maxlength="10" autocomplete="off" placeholder="${year ? 'ηη/μμ/εεεε' : 'ηη/μμ'}" aria-label="Ημέρα"${ro || ''}>`
      + `<input class="wn5f-dayp" type="date" ${attrs} value="${_esc(v || '')}" tabindex="-1" aria-hidden="true"${ro || ''}>`
      + `<button type="button" class="wn5f-dayc" data-act="day-pick" tabindex="-1" aria-label="Ημερολόγιο"${ro || ''}>${CAL}</button></span>`;
  }
  // F1: the window headers lose their «*» and say what an empty window means
  const WIN_HEAD = 'Παράθυρο από – έως · κενό: όλη η ημέρα';
  const PRICE_KEPT = 'Τιμή € (χωρίς ΦΠΑ): η παραγγελία έχει ήδη τιμή — γράψε αριθμό· μια γραμμένη τιμή δεν σβήνεται';
  // Owner 31/10 (flexible-rules study Κ1 / question 6): while a national is not invoiced, every role changes its price
  // (the dispatcher writes it when he learns it, F4); once invoiced, only owner and accountant. The form knows
  // «invoiced» only when GET /plan/orders/:id says it (invoiced: true; the SQL draft that adds it also makes
  // plan_order_update refuse it, principle 4): an order whose read says nothing stays open, as every order is today.
  const PRICE_ROLES = Object.freeze(['owner', 'accountant']);
  const _priceRo = (invoiced) => invoiced === true && !PRICE_ROLES.includes(typeof ROLE !== 'undefined' ? ROLE : '');
  const PRICE_RO_TITLE = 'Τιμολογημένη: η τιμή αλλάζει μόνο από owner ή λογιστήριο';
  const UNTIL_HEAD = 'Άφιξη ως · κενό: όλη η ημέρα';
  // A row's window as sent (F1): both ends empty = the whole day; one end only is NOT guessed — it stays as typed and
  // _check names it. An arrival «ως» row (one time, Veroia on ΑΝΟΔΟΣ) empty = by the end of its day, 23:59, and it
  // reads «ως … 23:59» as the board shows that stop (never «όλη η ημέρα»: it is a deadline, not a window).
  // allDay: the whole day was used or typed, for the summary.
  function _rowWin(until, from, to) {
    if (until) return { from: to === '' ? _dayWin().to : to, to: to === '' ? _dayWin().to : to, allDay: false };
    if (from === '' && to === '') return { from: _dayWin().from, to: _dayWin().to, allDay: true };
    return { from, to, allDay: _allDay(from, to) };
  }
  // «Τρί όλη η ημέρα» / «Τρί 06:00–08:00» of two ISO ends (the leg form's readers): the one rule of WN5L
  const _hmw = (a, b) => (WN5L.allDay(a, b) ? 'όλη η ημέρα' : `${_hm(a)}–${_hm(b)}`);
  function _num(v) {
    const s = String(v == null ? '' : v).trim().replace(',', '.');
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }
  // shipments / pieces are numeric(6,1): 2.55 would be rounded by the DB while the summary kept 2.55 (decision 20)
  const _dec1 = (n) => Number.isFinite(n) && Math.abs(Math.round(n * 10) - n * 10) < 1e-9;
  const _p10 = (rows) => Math.round(rows.reduce((a, r) => a + (Number.isFinite(r.pallets) ? r.pallets : 0), 0) * 10);
  // F1/F4 (owner 28/10, 080): pallets not known yet read «;» (WN5L.palText's word), never 0
  const _pal = (n) => (n == null ? ';' : String(Math.round(n * 10) / 10).replace('.', ','));
  const _palU = (n, unk) => WN5L.palText(n, unk);   // «12+;» known 12 and unknowns, «;» all unknown (one rule: WN5L)

  // Ε-19: N loads × 1 delivery or 1 load × N deliveries pair by themselves; N×M has no single answer (which load
  // goes where?), so it is refused instead of guessed (principle 1).
  function _pairs(o) {
    if (o.loads.length > 1 && o.drops.length > 1) throw new FormError('ένα ζεύγος ανά γραμμή: πολλές φορτώσεις με μία παράδοση ή μία φόρτωση με πολλές παραδόσεις');
    // F1 (080): one load and one delivery = one shipment; the pallets written on either row are its pallets (the
    // other may stay empty); a 1×N / N×1 takes each row of its N side, and an empty one stays unknown (null)
    if (o.loads.length === 1 && o.drops.length === 1) return [[o.loads[0], o.drops[0], o.loads[0].pallets != null ? o.loads[0].pallets : o.drops[0].pallets]];
    if (o.drops.length === 1) return o.loads.map((l) => [l, o.drops[0], l.pallets]);
    return o.drops.map((d) => [o.loads[0], d, d.pallets]);
  }
  // One stop per place of the form on the target side: the cycle's own stop there (snapshot of the open), or a
  // new one spanning the earliest «από» to the latest «έως» of its rows. plan_h_stop_at finds a piece's stop by
  // place, so two new stops at one place would be refused as ambiguous.
  function _stops(st) {
    const side = st.target.side;
    const byLoc = new Map();
    // F1 (code review 28/10): a row left without a window (the whole day) asks nothing of the stop, so it never widens
    // the hours another order agreed at the same place: the timed rows make the window, the whole-day rows only when
    // a place has nothing else.
    // F66 (owner 31/10): an arrival «ως» (Veroia on ΑΝΟΔΟΣ) has one time, and a new stop needs planned_to >
    // planned_from (071 rt_stops_win). A cycle with no Veroia stop on its ΑΝΟΔΟΣ («Κενό γύρισμα») gets one on the
    // arrival day: open from the end of the order's last loading that day (else the day's start) to the «ως».
    const untilFrom = (o, d) => o.loads.filter((l) => l.day === d.day && l.to && l.to < d.to).map((l) => l.to).sort().pop() || '00:00';
    const rows = st.orders.flatMap((o) => o.loads.concat(o.drops.map((d) => (d.until && d.to > '00:00' ? Object.assign({}, d, { from: untilFrom(o, d) }) : d))));
    for (const r of rows.filter((x) => !x.allDay).concat(rows.filter((x) => x.allDay))) {
      const f = _iso(r.day, r.from), t = _iso(r.day, r.to);
      const e = byLoc.get(r.location_id);
      if (!e) byLoc.set(r.location_id, { from: f, to: t, allDay: !!r.allDay });
      else if (!r.allDay || e.allDay) {
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
  // The body of POST /plan/orders: exactly the keys of plan_orders_create (072:596-640, + direction since 075),
  // nothing else. The request_id is NOT here: planFetch adds the slot's id (opts.requestId), so the replay md5 never
  // sees it. direction = the form's Κατεύθυνση (live bug 28/10, order #17: it was never sent, and an order that never
  // touches Veroia showed on the other side); with a target 075 requires it to equal the target's side, which it is.
  function _body(st) {
    const orders = st.orders.map((o) => {
      const out = { client_id: o.client_id, price: o.price, pallet_exchange: o.pallet_exchange };
      if (st.side === 'KATHODOS' || st.side === 'ANODOS') out.direction = st.side;
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
      // F4 (owner 28/10, 080): the price is optional — empty = «λείπει» (NULL, never 0); a price that is written is > 0
      if (o.price !== null && !(Number.isFinite(o.price) && o.price > 0)) out.push(n + 'Τιμή € (χωρίς ΦΠΑ): αριθμός πάνω από 0, ή κενό (λείπει)');
      if (Number.isNaN(o.temperature_c)) out.push(n + 'Θερμοκρασία °C: αριθμός');
      if (typeof o.pallet_exchange !== 'boolean') out.push(n + 'PE · ανταλλαγή παλετών: διάλεξε Ναι ή Όχι');
      if (!o.loads.length) out.push(n + 'ΣΗΜΕΙΑ ΦΟΡΤΩΣΗΣ: τουλάχιστον ένα');
      if (!o.drops.length) out.push(n + 'ΣΗΜΕΙΑ ΠΑΡΑΔΟΣΗΣ: τουλάχιστον ένα');
      for (const [k, rows] of [['φόρτωση', o.loads], ['παράδοση', o.drops]]) rows.forEach((r, j) => {
        const w = `${n}${k} ${j + 1}: `;
        if (!Number.isSafeInteger(r.location_id)) out.push(w + 'διάλεξε τοποθεσία από τη λίστα');
        if (!DAY.test(String(r.day || ''))) out.push(w + 'γράψε ημέρα');
        if (!HM.test(String(r.from || '')) || !HM.test(String(r.to || ''))) {
          out.push(w + (r.until ? 'άφιξη ως: ΗΗ:ΛΛ, ή κενό (ως 23:59)' : 'παράθυρο: ΗΗ:ΛΛ και στα δύο άκρα, ή κανένα (όλη η ημέρα)'));
        }
        else if (!r.until && r.from >= r.to) out.push(w + 'το «έως» πρέπει να είναι μετά το «από»');
        // F1 (080): pallets are optional — empty = not known yet (NULL, the board writes «;»)
        if (r.pallets !== null && !(Number.isFinite(r.pallets) && r.pallets > 0 && _dec1(r.pallets))) out.push(w + 'παλέτες: αριθμός πάνω από 0 (ένα δεκαδικό), ή κενό (άγνωστες)');
      });
      if (o.loads.length > 1 && o.drops.length > 1) out.push(n + 'ένα ζεύγος ανά γραμμή: πολλές φορτώσεις με μία παράδοση ή μία φόρτωση με πολλές παραδόσεις');
      else if (o.loads.length && o.drops.length) {
        // F1: the pallets of the shipments come from the N side (the 1×1: from either row). Known on both sides: they
        // must add up as before. The one row of the 1 side known while an N row is empty: which number is meant? Said,
        // never guessed (principle 1).
        const nRows = o.drops.length === 1 ? o.loads : o.drops, one = o.drops.length === 1 ? o.drops[0] : o.loads[0];
        const all = o.loads.concat(o.drops);
        if (all.every((r) => r.pallets !== null)) { if (_p10(o.loads) !== _p10(o.drops)) out.push(n + 'οι παλέτες φόρτωσης δεν ισούνται με τις παλέτες παράδοσης'); }
        else if (nRows.length > 1 && one.pallets !== null && nRows.some((r) => r.pallets === null)) {
          out.push(n + 'παλέτες: γράψε τες σε κάθε ' + (o.drops.length === 1 ? 'φόρτωση' : 'παράδοση') + ', ή άφησε κενή και τη ' + (o.drops.length === 1 ? 'μία παράδοση' : 'μία φόρτωση'));
        }
      }
    });
    // F66: an arrival «ως» on a cycle with no Veroia stop on that side makes one (_stops); only «ως 00:00» has no
    // time before it on its day
    if (st.target) {
      for (const o of st.orders) for (const r of o.drops) {
        if (!r.until || r.to > '00:00') continue;
        const ex = (st.cycleStops || []).some((s) => s.side === st.target.side && s.location_id === r.location_id);
        if (!ex) { out.push('Άφιξη Βέροιας ως 00:00: γράψε ώρα μετά τις 00:00'); return out; }
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
  // PATCH /plan/orders/:id: only what changed (plan_order_update 072:1329 set + shipments, 077 new / removed points).
  // Times compare as instants: the board writes UTC, the form writes the Athens offset. An empty field is «not shown»
  // (never sent) unless orig.full: then the form showed the order's own value (077 read, F13) and emptying a text or
  // the temperature clears it on purpose (null). A written price is never emptied (no_price; F4, 080: an order may have
  // none yet), PE and the side are choices.
  const _CLEARABLE = ['reference', 'goods', 'notes', 'temperature_c'];
  const _min = (iso) => Math.floor(Date.parse(iso) / 60000);
  function _patchBody(orig, st) {
    const set = {};
    for (const k of ['price', 'reference', 'goods', 'notes', 'temperature_c', 'pallet_exchange', 'direction']) {
      const v = st[k], o = typeof orig[k] === 'string' ? orig[k].trim() : orig[k];
      if (typeof v === 'number' && !Number.isFinite(v)) continue;
      if (v === undefined || v === null || v === '') {
        if (orig.full && _CLEARABLE.includes(k) && o !== undefined && o !== null && o !== '') set[k] = null;
        continue;
      }
      if (v !== o) set[k] = v;
    }
    const shipments = [];
    for (const s of st.ships || []) {
      const o = (orig.ships || []).find((x) => x.shipment_id === s.shipment_id);
      if (!o) continue;
      const ch = {};
      if (Number.isFinite(s.pallets) && Math.round(s.pallets * 10) !== Math.round(o.pallets * 10)) ch.pallets = s.pallets;
      // to the minute: the form holds ΗΗ:ΛΛ, so a stored end with seconds (23:59:59) is never «changed» by reading it back
      for (const k of ['load_from', 'load_to', 'deliver_from', 'deliver_to']) if (s[k] && _min(s[k]) !== _min(o[k])) ch[k] = s[k];
      if (Object.keys(ch).length) shipments.push(Object.assign({ shipment_id: s.shipment_id }, ch));
    }
    for (const id of st.removed || []) shipments.push({ shipment_id: id, remove: true });
    // a new point: every field, as at creation (077 refuses a missing one by name)
    for (const s of st.news || []) {
      shipments.push({ origin_location_id: s.origin_location_id, dest_location_id: s.dest_location_id, pallets: s.pallets,
        load_from: s.load_from, load_to: s.load_to, deliver_from: s.deliver_from, deliver_to: s.deliver_to });
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
    box.addEventListener('input', (ev) => { _dayInput(ev.target); _refresh(f); });
    box.addEventListener('change', (ev) => { _dayInput(ev.target); _refresh(f); });
    box.addEventListener('focusin', (ev) => { if (ev.target.classList && ev.target.classList.contains('wn5f-dayx')) _dayEdit(ev.target); });
    // the click that FOCUSES a day keeps the whole day selected (its mouseup would drop the selection for a caret): the
    // keys replace the day, never append to it. Marked at that mousedown only, so a later click (or a Tab focus) is
    // left to the browser.
    box.addEventListener('mousedown', (ev) => { const x = ev.target; if (x && x.classList && x.classList.contains('wn5f-dayx') && document.activeElement !== x) x._selOnce = true; });
    box.addEventListener('mouseup', (ev) => { const x = ev.target; if (x && x._selOnce) { x._selOnce = false; ev.preventDefault(); } });
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
    if (f.onClose) { try { f.onClose(f); } catch (e) { _log(e, 'WN5Form close'); } }   // the leg form's board mark (T21)
    window.removeEventListener('keydown', f.onKey, true);
    if (f.back && f.back.parentNode) f.back.parentNode.removeChild(f.back);
    if (_f === f) _f = null;
  }
  const _strip = (f) => f.el.querySelector('[data-strip]');
  function _lines(f, lines) {
    const box = f.el.querySelector('[data-err]');
    box.innerHTML = lines.map((l) => `<div>${_esc(l)}</div>`).join('');
  }
  // F26 (live 28/10): a save that cannot go says why beside its button, in red, while the form is being filled — the
  // lines under the form came only after a press, below the fold of a long form. Screen words for its own fields, in
  // the board's one footer reason (WN5Act's «Λείπει: …» of Δ1 / Δ4, owner 28/10).
  function _why(f, text) {
    const k = typeof WN5Act !== 'undefined' && WN5Act._kit && typeof WN5Act._kit.why === 'function' ? WN5Act._kit.why : null;
    if (k) k(f.el.querySelector('.wn5f-ft [data-act="cancel"]'), 'beforebegin', text || null);
  }
  // «Λείπει: τόπος παράδοσης» — what the rows still lack, from the rows as typed (a name typed but not picked from the
  // list has no place: an order cannot be saved without its destination, 072 plan_orders_create dest_location_id)
  function _lackText(o) {
    const out = [];
    if (o.cid !== undefined && !o.rec) out.push('πελάτης');
    if (o.loads.some((r) => !r.rec)) out.push('τόπος φόρτωσης');
    if (o.drops.some((r) => !r.rec)) out.push('τόπος παράδοσης');
    return out;
  }
  function _setSave(f) {
    const b = f.el.querySelector('[data-act="save"]');
    if (b) b.disabled = !!(f.busy || f.done || f.locked || f.noIds || f.blocked);
  }
  // Figma 2011:9641/9704 show the weekday («Δευ 12/10/2026» in the head, «Δευ 12/10» in a row). While a day field is
  // not being typed in, its text IS that label of the ISO day the body reads (.wn5f-dayp); empty, the placeholder is a
  // short hint. A text that is not a day stays as typed, in red, and its day is empty: the save names it.
  function _dayText(f) {
    f.el.querySelectorAll('.wn5f-day').forEach((w) => {
      const x = w.querySelector('.wn5f-dayx'), p = w.querySelector('.wn5f-dayp'), c = w.querySelector('.wn5f-dayc');
      if (!x || !p) return;
      const v = p.value, has = DAY.test(v);
      w.classList.toggle('has', has);
      // a disabled day (a read-only point, a point marked for removal) is disabled whole: text and calendar
      x.disabled = p.disabled;
      if (c) c.disabled = p.disabled;
      if (document.activeElement === x) return;   // never rewritten under the keys
      const bad = !has && !!x.dataset.raw;
      x.classList.toggle('bad', bad);
      x.value = has ? _dlab(v) + (w.hasAttribute('data-y') ? '/' + v.slice(0, 4) : '') : bad ? x.dataset.raw : '';
    });
  }
  // focus on a day's text: «dd/mm/yyyy» of its day (or the text left invalid), all selected so the keys replace it.
  // ref = the day it had (else today, display only): the year of a «dd/mm» typed next (_dayParse).
  function _dayEdit(x) {
    const p = x.parentElement.querySelector('.wn5f-dayp');
    if (!p) return;
    const v = p.value;
    x.dataset.ref = DAY.test(v) ? v : (typeof localToday === 'function' ? localToday() : '');
    x.value = DAY.test(v) ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : (x.dataset.raw || '');
    x.select();
  }
  // every key in a day's text sets its ISO day; the picker (or a script) setting the ISO day clears a typed error
  function _dayInput(t) {
    const w = t && t.closest ? t.closest('.wn5f-day') : null;
    if (!w) return;
    const x = w.querySelector('.wn5f-dayx'), p = w.querySelector('.wn5f-dayp');
    if (!x || !p) return;
    // F44: a day the user typed or picked is theirs — it no longer follows what the screen filled (data-auto)
    if (t === p || t === x) delete p.dataset.auto;
    if (t === p) { delete x.dataset.raw; return; }
    if (t !== x) return;
    const d = _dayParse(x.value, x.dataset.ref);
    if (d === null) { p.value = ''; x.dataset.raw = x.value; }
    else { p.value = d; delete x.dataset.raw; }
  }
  function _refresh(f) { if (f.onRefresh) f.onRefresh(f); _dayText(f); _setSave(f); }
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
    if (a === 'day-pick') {
      // the native picker of the day, opened on purpose (showPicker: Chrome 99+, Safari 16+, Firefox 101+)
      const p = t.closest('.wn5f-day').querySelector('.wn5f-dayp');
      if (p && !p.disabled) { try { p.showPicker(); } catch (e) { _log(e, 'WN5Form day picker'); } }
      return;
    }
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
      + _dayHTML('data-f="day"' + (f.dayDefault ? ' data-auto="1"' : ''), f.dayDefault, '', false)
      + `<span class="wn5f-win"><span class="wn5f-from"><input ${HM_INPUT} data-f="from" aria-label="από"><span class="wn5f-dash">–</span></span>`
      + `<input ${HM_INPUT} data-f="to" aria-label="έως"></span>`
      + `<input class="form-input" data-f="pal" inputmode="decimal" aria-label="Παλέτες">`
      + `<button type="button" class="wn5f-x" data-act="del-row" aria-label="Αφαίρεση γραμμής">×</button></div>`;
  }
  function _blockHTML(f) {
    const cid = 'wn5c' + (++f.seq);
    const head = `<div class="wn5f-th"><span>Τοποθεσία</span><span>Ημέρα</span><span data-wh>${WIN_HEAD}</span><span>Παλέτες · κενό: ;</span></div>`;
    // Figma 2011:9671: no head line — the block's «×» ends the fields row, «Παραγγελία n» is a chip in its foot
    return `<div class="wn5f-ord">`
      + `<div class="wn5f-fields">`
      + `<label class="wn5f-f"><span>Πελάτης *</span><span data-cpick="${cid}">${fhClientSelect(cid, '', '', 'fhClientDrop')}</span></label>`
      + `<label class="wn5f-f"><span>Τιμή € (χωρίς ΦΠΑ)</span><input class="form-input" data-f="price" inputmode="decimal" placeholder="κενό: λείπει"></label>`
      + `<label class="wn5f-f"><span>Θερμοκρασία °C</span><input class="form-input" data-f="temp" inputmode="decimal"></label>`
      // Figma audit B-22 (owner 31/10): a new order starts on «Όχι»; the dispatcher presses «Ναι» when there is exchange
      + `<div class="wn5f-f"><span>PE · ανταλλαγή παλετών</span>${_peHTML(false)}</div>`
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
      + `<label class="wn5f-f"><span data-vdayl>Ημ. φόρτωσης Βέροιας *</span>${_dayHTML('id="wn5f-vday"', '', '', true)}</label>`
      + `<label class="wn5f-f"><span data-vwinl>Παράθυρο φόρτωσης Βέροιας</span><span class="wn5f-win"><span class="wn5f-from" data-vfromw><input ${HM_INPUT} id="wn5f-vfrom" aria-label="από"><span class="wn5f-dash">–</span></span><input ${HM_INPUT} id="wn5f-vto" aria-label="έως"></span></label>`
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
        const w = _rowWin(until, _hmNorm(r.querySelector('[data-f="from"]').value), _hmNorm(r.querySelector('[data-f="to"]').value));
        return { rec, label: (document.getElementById('ls_' + r.dataset.pid) || {}).value || '', day: r.querySelector('[data-f="day"]').value,
          from: w.from, to: w.to, until, allDay: w.allDay, pallets: _num(r.querySelector('[data-f="pal"]').value), hub: !!hub && rec === hub };
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
      const row = (r) => ({ location_id: r.rec ? PlanIds.id('location', r.rec) : null, day: r.day, from: r.from, to: r.to, pallets: r.pallets, until: r.until, allDay: r.allDay });
      st.orders.push({ client_id: o.rec ? PlanIds.id('client', o.rec) : null, price: o.price, temperature_c: o.temperature_c,
        pallet_exchange: o.pe === 'yes' ? true : o.pe === 'no' ? false : null, reference: o.reference, goods: o.goods, notes: o.notes,
        loads: o.loads.map(row), drops: o.drops.map(row) });
    }
    return st;
  }
  // The head's Veroia window (ΚΑΘΟΔΟΣ: από – έως; ΑΝΟΔΟΣ: «Άφιξη ως» only): empty or whole, never half (F1).
  function _headWinCheck(f) {
    const dir = f.el.querySelector('#wn5f-dir').value;
    const vf = _hmNorm(f.el.querySelector('#wn5f-vfrom').value), vt = _hmNorm(f.el.querySelector('#wn5f-vto').value);
    if (dir === 'ANODOS') return vt === '' || HM.test(vt) ? [] : ['Άφιξη Βέροιας ως: ΗΗ:ΛΛ, ή κενό'];
    if (vf === '' && vt === '') return [];
    return HM.test(vf) && HM.test(vt) ? [] : ['Παράθυρο φόρτωσης Βέροιας: ΗΗ:ΛΛ και στα δύο άκρα, ή κανένα'];
  }
  function _orderRefresh(f) {
    const dir = f.el.querySelector('#wn5f-dir').value;
    f.el.querySelector('[data-vdayl]').textContent = dir === 'ANODOS' ? 'Ημ. άφιξης Βέροιας *' : 'Ημ. φόρτωσης Βέροιας *';
    f.el.querySelector('[data-vwinl]').textContent = dir === 'ANODOS' ? 'Άφιξη Βέροιας ως' : 'Παράθυρο φόρτωσης Βέροιας';
    f.el.querySelector('[data-vfromw]').hidden = dir === 'ANODOS';
    const raw = _raw(f);
    // F44 (F33's rule): with no Veroia stop on the cycle yet, an ΑΝΟΔΟΣ arrival the screen filled follows the order's
    // own loading — its last loading day — until the user types the arrival day
    const vEl = f.el.querySelector('#wn5f-vday');
    if (dir === 'ANODOS' && vEl.dataset.auto) {
      const last = [...f.el.querySelectorAll('.wn5f-rows[data-k="load"] [data-f="day"]')].map((x) => x.value).filter((v) => DAY.test(v)).sort().pop();
      if (last && last !== vEl.value) vEl.value = last;
    }
    // the header's Veroia day/window fills an empty Veroia row: one value typed once (Figma 9624); a Veroia row the
    // screen filled (data-auto) follows the header, one the user typed never
    const vday = vEl.value, vf = _hmNorm(f.el.querySelector('#wn5f-vfrom').value), vt = _hmNorm(f.el.querySelector('#wn5f-vto').value);
    const whole = _headWinCheck(f).length === 0;   // F1: half a head window never reaches the rows
    f.el.querySelectorAll('.wn5f-row').forEach((r) => {
      const rec = (document.getElementById('lv_' + r.dataset.pid) || {}).value || '';
      if (rec && rec === _hubRec()) {
        const d = r.querySelector('[data-f="day"]'), a = r.querySelector('[data-f="from"]'), b = r.querySelector('[data-f="to"]');
        // a day typed wrong stays wrong, in red (_dayInput): the head never fills it over the user's keys
        const typed = d.parentElement && d.parentElement.querySelector('.wn5f-dayx');
        if ((!d.value || (d.dataset.auto && d.value !== vday)) && vday && !(typed && typed.dataset.raw)) { d.value = vday; d.dataset.auto = '1'; }
        if (whole && !a.value && vf) a.value = vf;
        if (whole && !b.value && vt) b.value = vt;
      }
    });
    // a drop section whose rows are all Veroia arrivals heads its window «Άφιξη ως *» (Figma Δ7 2069:7995)
    f.el.querySelectorAll('.wn5f-ord').forEach((b) => {
      const rows = [...b.querySelectorAll('.wn5f-rows[data-k="drop"] .wn5f-row')];
      const h = b.querySelectorAll('[data-wh]')[1];
      if (h) h.textContent = rows.length && rows.every((r) => r.classList.contains('until')) ? UNTIL_HEAD : WIN_HEAD;
    });
    let total = 0, totalUnk = 0, ships = 0;
    // {pal: known sum | null when all unknown | NaN when a typo, unk: count of unknown}
    const _palAgg = (xs) => (xs.some((x) => Number.isNaN(x)) ? { pal: NaN, unk: 0 }
      : { pal: xs.every((x) => x === null) ? null : xs.reduce((a, x) => a + (Number.isFinite(x) ? x : 0), 0), unk: xs.filter((x) => x === null).length });
    const seq = [];
    const cli = [];
    raw.forEach((o, i) => {
      // the pallets of the order = those of its shipments (_pairs: the 1×1 takes either row); unknown ones are counted
      // apart and said «+;», never added as 0 (F1)
      let sp, prs = null;
      try { prs = o.loads.length && o.drops.length ? _pairs(o) : null; } catch (_) { prs = null; }
      sp = prs ? prs.map((x) => x[2]) : o.loads.map((r) => r.pallets);
      const lp = sp.reduce((a, x) => a + (Number.isFinite(x) ? x : 0), 0), lu = sp.filter((x) => x === null).length;
      total += lp; totalUnk += lu;
      ships += o.loads.length > 1 && o.drops.length > 1 ? 0 : Math.max(o.loads.length, o.drops.length);
      const nl = o.loads.length, nd = o.drops.length;
      const txt = [`${nl} ${nl === 1 ? 'φόρτωση' : 'σημεία φόρτωσης'}`, `${nd} ${nd === 1 ? 'παράδοση' : 'παραδόσεις'}`, `${_palU(lp, lu)}π`]
        .concat(Number.isFinite(o.price) && o.price > 0 ? [`${_pal(o.price)} €`] : o.price === null ? ['τιμή λείπει'] : []).concat(['τιμολογείται χωριστά']).join(' · ');
      const box = f.el.querySelectorAll('[data-osum]')[i];
      if (box) box.textContent = txt;
      // the summary's client line (Figma 2011:9938): «Orion Foods · 2 φορτώσεις · 10π · 640 €»
      cli.push([o.client || '—'].concat(nl > 1 ? [`${nl} φορτώσεις`] : []).concat([`${_palU(lp, lu)}π`])
        .concat(Number.isFinite(o.price) && o.price > 0 ? [`${_pal(o.price)} €`] : o.price === null ? ['τιμή λείπει'] : []).join(' · '));
      // a stop carries the pallets its shipments will have (_pairs), not its raw row: the one row of a 1×1 / N×1 / 1×N
      // side carries them all (code review xhigh r3: an N×1 delivery left empty is NOT «;» when every load is known),
      // a row of the N side its own shipment's (_pairs takes that row's own pallets)
      const palOf = (r, single) => (prs && single ? _palAgg(sp) : _palAgg([r.pallets]));
      for (const [act, rows, single] of [['φόρτωση', o.loads, nl === 1], ['παράδοση', o.drops, nd === 1]]) for (const r of rows)
        if (DAY.test(r.day) && HM.test(r.to)) seq.push(Object.assign({ k: r.day + 'T' + (r.from || r.to), when: r.until ? `ως ${_dow(r.day)} ${r.to}` : r.allDay ? `${_dow(r.day)} όλη η ημέρα` : `${_dow(r.day)} ${r.from}–${r.to}`, act, place: r.hub ? 'Βέροια' : r.label, clients: [o.client || '—'] }, palOf(r, single)));
    });
    seq.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
    // Figma 2011:9940: orders at the same place in the same window are ONE stop line («Zeta, Kappa · 20π»)
    const lines = [];
    for (const x of seq) {
      const same = lines.find((y) => y.k === x.k && y.when === x.when && y.act === x.act && y.place === x.place && !!x.place);
      if (!same) { lines.push(Object.assign({}, x, { clients: x.clients.slice() })); continue; }
      same.clients.push(x.clients[0]);
      // F1: an unknown keeps the known sum and is said «+;»; a typo (NaN) still reads «—»
      same.unk += x.unk;
      same.pal = Number.isNaN(same.pal) || Number.isNaN(x.pal) ? NaN : same.pal === null && x.pal === null ? null : (same.pal || 0) + (x.pal || 0);
    }
    // whole names, never a first word (DESIGN.md #6): Figma's «Zeta, Kappa» shortens, a shortened name can mislead
    const who = (l) => l.clients.join(', ');
    const n = raw.length;
    const tgtSel = f.el.querySelector('#wn5f-tgt');
    const where = tgtSel.value ? tgtSel.options[tgtSel.selectedIndex].text : 'ΠΡΟΣ ΑΝΑΘΕΣΗ';
    const day = f.el.querySelector('#wn5f-vday').value;
    f.el.querySelector('[data-cap]').textContent = `σύνολο ${_palU(total, totalUnk)}/33`;
    f.el.querySelector('[data-sum]').innerHTML =
      `<div class="wn5f-sum-h"><b>${n} ${n === 1 ? 'παραγγελία θα δημιουργηθεί' : 'παραγγελίες θα δημιουργηθούν'} · ${SIDE_GR[dir]}${DAY.test(day) ? ' · ' + _esc(_dlab(day)) : ''} · ${_esc(where)}</b><b>${_palU(total, totalUnk)}/33 παλέτες</b></div>`
      + (n > 1 ? `<div class="wn5f-sum-c">${_esc(cli.concat(['κάθε παραγγελία τιμολογείται χωριστά']).join('   ·   '))}</div>` : '')
      + `<div class="wn5f-sec">ΣΕΙΡΑ ΣΤΑΣΕΩΝ ΚΑΤΑ ΩΡΑ</div><ol class="wn5f-seq">`
      + lines.map((x, i) => `<li><span class="wn5f-seq-n">${i + 1}</span><span class="wn5f-seq-w">${_esc(x.when)}</span><span class="wn5f-seq-a">${x.act}</span><span class="wn5f-seq-p">${_esc(x.place || '—')}</span><span class="wn5f-seq-c">${_esc(who(x))}</span><span class="wn5f-seq-q">${Number.isNaN(x.pal) ? '—' : _palU(x.pal, x.unk) + 'π'}</span></li>`).join('')
      + `</ol><div class="wn5f-note wn5f-sum-n">Θα γραφτούν σε μία συναλλαγή: ${n} ${n === 1 ? 'παραγγελία' : 'παραγγελίες'} → ${ships} ${ships === 1 ? 'αποστολή' : 'αποστολές'} → στάσεις στην ${SIDE_ACC[dir]}${DAY.test(day) ? ' ' + _esc(_dlab(day)) : ''} (${_esc(where)}). Χωρίς βήμα ένωσης.</div>`;
    f.el.querySelector('[data-act="add-order"]').hidden = f.mode !== 'groupage';
    f.el.querySelectorAll('[data-act="del-order"]').forEach((b) => { b.hidden = f.mode !== 'groupage' || n < 2; });
    const save = f.el.querySelector('[data-act="save"]');
    if (!f.done) save.textContent = n > 1 ? `Αποθήκευση · ${n} παραγγελίες` : 'Αποθήκευση';
    const lack = [...new Set(raw.flatMap(_lackText))];
    _why(f, !f.done && lack.length ? 'Λείπει: ' + lack.join(', ') : null);
  }

  async function _saveOrder(f) {
    if (f.busy || f.done || f.locked) return;
    let st, body;
    try { st = _readState(f); }
    catch (e) { if (typeof PlanError !== 'undefined' && e instanceof PlanError) WN5Act.strip(_strip(f), e); else _lines(f, [String(e && e.message || e)]); return; }
    // F1 (code review 28/10): the head's Veroia window fills the empty Veroia rows only when it is whole; half of it is
    // named HERE, at the field the user typed, never as a row error the user did not cause
    const probs = _headWinCheck(f).concat(_check(st));
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
    // the board check finds a CREATED order (_findOrders); an edit replays by its request_id instead (077)
    if (e.kind === K.UNKNOWN && f.kind === 'order' && !f.edit) {
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
    _why(f, null);
    // A-7: the leg form's «Στο RT-… ›» waits for this read, so its list shows the point just added
    if (ans) f.reloaded = WN5.reload('order-saved');
  }

  // ── edit (from the order card «Επεξεργασία», T18) ─────────────────────────────────────────────────────────
  // F13 (live test 28/10): the form opens on what GET /plan/orders/:id answers (077 plan_order_read): every field and
  // every live point of the order, wherever its pieces are. The board carries them only for waiting pieces, so an order
  // on a cycle opened with empty notes, price and points, and a save could not tell «empty» from «not shown».
  // full: true = these are the order's own values, so a field emptied here is cleared on purpose (_patchBody).
  function _editFromRead(ans) {
    const o = ans && ans.order;
    if (!o || o.nat_order_id == null || !Array.isArray(ans.shipments) || !ans.shipments.length) return null;
    const ships = ans.shipments.map((s) => ({ shipment_id: s.shipment_id, origin: s.origin_location_id, dest: s.dest_location_id,
      pallets: s.pallets == null ? null : Number(s.pallets), load_from: s.load_from, load_to: s.load_to, deliver_from: s.deliver_from, deliver_to: s.deliver_to,
      rides: s.rides === true, vs_locked: s.vs_locked === true, waits: s.waits === true, at_hub: s.at_hub === true,
      rt_codes: Array.isArray(s.rt_codes) ? s.rt_codes : [] }));
    return {
      full: true, nat_order_id: o.nat_order_id, client: o.client || '',
      price: o.price == null ? null : Number(o.price), temperature_c: o.temperature_c == null ? null : Number(o.temperature_c),
      pallet_exchange: typeof o.pallet_exchange === 'boolean' ? o.pallet_exchange : null,
      reference: o.reference || '', goods: o.goods || '', notes: o.notes || '', invoiced: o.invoiced === true,
      direction: o.direction === 'KATHODOS' || o.direction === 'ANODOS' ? o.direction : null,
      // the side is the cycle's while a point rides onward; one waiting at Veroia (F23) has nothing planned yet
      riding: ships.some((s) => s.rides && !(s.at_hub && s.waits)), ships,
    };
  }
  const _placeName = (id) => { const p = typeof PlanIds !== 'undefined' ? PlanIds.place(id) : null; return p ? p.name : '#' + id; };
  const _editDay = (k, v, ro) => _dayHTML(`data-f="${k}"`, v, ro, false);
  // F30 (owner 28/10): the truck's stops of a riding point, from the board as loaded (WN5.state, read-only, no fetch):
  // the loading at the point's origin and the delivery at its destination, by the order's legs. Empty when the order's
  // cycle is not on the loaded week — then nothing is named, never guessed.
  function _rideStops(natOrderId, s) {
    const w = typeof WN5 !== 'undefined' && typeof WN5.state === 'function' ? WN5.state() : null;
    const out = [];
    for (const c of (w && w.board && w.board.cycles) || []) for (const x of c.stops || []) for (const l of x.legs || []) {
      if (l.nat_order_id !== natOrderId) continue;
      const k = l.act === 'load' && x.location_id === s.origin ? 'load' : l.act === 'unload' && x.location_id === s.dest ? 'drop' : null;
      if (k && !out.some((o) => o.stop_id === x.stop_id)) out.push({ k, rt_id: c.rt_id, code: c.code || 'RT-' + c.rt_id, side: x.side, stop_id: x.stop_id, from: x.planned_from, to: x.planned_to });
    }
    return out.sort((a, b) => (a.k === b.k ? 0 : a.k === 'load' ? -1 : 1));
  }
  // «Φορτηγό RT-1293 · φόρτωση Δευ 26/10 όλη η ημέρα [Αλλαγή ώρας στάσης ›] · παράδοση …»: what the truck does there, and
  // the way to move it (F29, the day panel of that one stop). The order's own window changes in the row above.
  // one text for a ride stop, drawn here and redrawn after a save that moved it (081)
  const _rideText = (code, k, from, to) => `${code} · ${k === 'load' ? 'φόρτωση' : 'παράδοση'} ${_dlab((_parts(from) || {}).day)} ${_hmw(from, to)}`;
  function _rideHTML(e, s) {
    const st = _rideStops(e.nat_order_id, s);
    if (!st.length) return '';
    return `<div class="wn5f-shipstop" data-shipstop="${s.shipment_id}">` + st.map((x) => `<span data-ridestop="${x.stop_id}" data-k="${x.k}" data-code="${_esc(x.code)}">${_esc(_rideText(x.code, x.k, x.from, x.to))}</span>`
      + `<button type="button" class="wn5f-lnk" data-act="stop-time" data-rt="${x.rt_id}" data-side="${x.side}" data-stop="${x.stop_id}">Αλλαγή ώρας στάσης ›</button>`).join('')
      + '</div>';
  }
  function _shipHTML(e, s) {
    const t = (iso) => _parts(iso) || { day: '', hm: '' };
    // F30 (owner 28/10): a riding point keeps its leg and cycle and its pallets, day and window change HERE, in place
    // (072 plan_order_update takes them: shipments + plan_h_resize on the riding piece, audit before/after). Only its
    // places stay as they are (077 piece_busy) and its ×: a riding point leaves only by «Μεταφορά σε…». A VS bridge
    // is the international's (decision 21, vs_locked).
    const lf = t(s.load_from), lt = t(s.load_to), df = t(s.deliver_from), dt = t(s.deliver_to);
    // a window over midnight cannot be held by one day field per side: read back it would land on the first day and a
    // save would shorten it without a word (code review 28/10). Shown, never sent; the board changes it.
    const twoDays = lf.day !== lt.day || df.day !== dt.day;
    // live F23 (28/10): a point whose pieces stand at Veroia, planned no further (077 waits + at_hub), keeps its dates
    // and pallets editable as a waiting row; the route then starts at Veroia, where it stands
    const hubWait = s.at_hub && s.waits;
    const lock = s.vs_locked || twoDays;
    const ro = lock ? ' disabled' : '';
    // F1 (080, code review xhigh r2): a locked point whose pallets are not known yet keeps its PALLETS open — a two-day
    // point is read-only here, yet B-100, the card and the Veroia panel send the desk here to write them (plan_h_resize,
    // unknown -> known by 080). Never a VS bridge.
    const palOnly = lock && !s.vs_locked && s.pallets == null;
    // at Veroia the loading already happened: its side stays as loaded, the delivery and the pallets stay editable
    const lro = lock || hubWait ? ' disabled' : '';
    // F1 (owner 28/10): a whole-day window shows as empty fields, as the create form writes it («κενό: όλη η ημέρα»)
    const lAll = WN5L.allDay(s.load_from, s.load_to), dAll = WN5L.allDay(s.deliver_from, s.deliver_to);
    const where = hubWait ? '<small class="wn5f-shipc"> · στη Βέροια</small>'
      : (s.rt_codes.length ? `<small class="wn5f-shipc"> · σε κύκλο ${_esc(s.rt_codes.join(', '))}</small>` : '')
      // a riding point over two days is locked too: the reason is said beside the cycle (code review high, F30 merge)
      + (twoDays ? '<small class="wn5f-shipc"> · παράθυρο σε δύο ημέρες: αλλάζει από το Εβδομαδιαίο</small>' : '');
    const from = hubWait && _hubId() != null ? _hubId() : s.origin;
    // × on every point that waits (a two-day one too: 077 removes it), never on the last one (077 refuses shipments:last: the delete of the order is
    // «Διαγραφή παραγγελίας», with its own list)
    const x = !(s.rides || s.vs_locked) && e.ships.length > 1
      ? `<button type="button" class="wn5f-x" data-act="del-ship" aria-label="Αφαίρεση σημείου">×</button>` : '<span></span>';
    return `<div class="wn5f-ship" data-ship="${s.shipment_id}"${lock ? ' data-ro' : ''}${palOnly ? ' data-palonly' : ''}><span>${_esc(_placeName(from))} → ${_esc(_placeName(s.dest))}${where}</span>`
      // the create form's fields (2011:9704): a day with its weekday label, ΗΗ:ΛΛ text — the native time input is
      // 12-hour in el-GR and cut in its cell (_hmNorm note)
      + `${_editDay('lday', lf.day, lro)}<input ${HM_INPUT} data-f="lfrom" value="${lAll ? '' : lf.hm}"${lro}><input ${HM_INPUT} data-f="lto" value="${lAll ? '' : lt.hm}"${lro}>`
      + `${_editDay('dday', df.day, ro)}<input ${HM_INPUT} data-f="dfrom" value="${dAll ? '' : df.hm}"${ro}><input ${HM_INPUT} data-f="dto" value="${dAll ? '' : dt.hm}"${ro}>`
      + `<input class="form-input" data-f="pal" inputmode="decimal" value="${s.pallets == null ? '' : _esc(s.pallets)}"${s.pallets == null ? ' placeholder="άγνωστες"' : ''}${palOnly ? '' : ro}>${x}</div>`
      + (s.rides && !hubWait && !s.vs_locked ? _rideHTML(e, s) : '');
  }
  // F21 (live test 28/10, #84 needs a 2nd delivery): a new point of the order. Both ends are picked from the places
  // list; the end the order already has (its one loading place for a new delivery, its one delivery place for a new
  // loading) is pre-picked and stays changeable. The window fields start empty = the whole day (F1's one rule, _rowWin /
  // WN5L.DAY_WIN, 00:00–23:59: never an invented hour; the user types one if the client gave one).
  function _newShipHTML(f, k) {
    const po = 'wn5n' + (++f.seq), pd = 'wn5n' + (++f.seq);
    const first = f.edit.ships[0] || {};
    const ld = (_parts(first.load_from) || {}).day || '', dd = (_parts(first.deliver_from) || {}).day || '';
    return `<div class="wn5f-ship wn5f-new" data-newship data-k="${k}" data-po="${po}" data-pd="${pd}" data-ld="${ld}" data-dd="${dd}">`
      + `<span class="wn5f-ends"><span class="wn5f-loc">${fhLocSelect(po, '', 'fhLocDrop')}</span><span class="wn5f-arr">→</span>`
      + `<span class="wn5f-loc">${fhLocSelect(pd, '', 'fhLocDrop')}</span></span>`
      + `${_editDay('lday', ld, '')}<input ${HM_INPUT} data-f="lfrom"><input ${HM_INPUT} data-f="lto">`
      + `${_editDay('dday', dd, '')}<input ${HM_INPUT} data-f="dfrom"><input ${HM_INPUT} data-f="dto">`
      + `<input class="form-input" data-f="pal" inputmode="decimal" aria-label="Παλέτες">`
      + `<button type="button" class="wn5f-x" data-act="del-ship" aria-label="Αφαίρεση νέου σημείου">×</button></div>`;
  }
  function _addShip(f, k) {
    f.el.querySelector('[data-ships]').insertAdjacentHTML('beforeend', _newShipHTML(f, k));
    const row = [...f.el.querySelectorAll('[data-newship]')].pop();
    const one = (key) => { const v = [...new Set(f.edit.ships.map((s) => s[key]))]; return v.length === 1 ? v[0] : null; };
    const id = k === 'drop' ? one('origin') : one('dest');
    const p = id == null || typeof PlanIds === 'undefined' ? null : PlanIds.place(id);
    if (p && p.legacy_id && typeof fhPickLinked === 'function') fhPickLinked(k === 'drop' ? row.dataset.po : row.dataset.pd, p.legacy_id, p.name);
  }
  function _editHTML(f) {
    const e = f.edit;
    const dro = e.riding ? ' disabled' : '';
    return `<div class="wn5f-grid4">`
      + `<div class="wn5f-f"><span>Πελάτης</span><span class="wn5f-ro">${_esc(e.client || '—')}</span></div>`
      + `<label class="wn5f-f"><span>Τιμή € (χωρίς ΦΠΑ)</span><input class="form-input" data-f="price" inputmode="decimal" value="${e.price == null ? '' : _esc(e.price)}" placeholder="${e.price == null ? 'λείπει' : ''}"${_priceRo(e.invoiced) ? ` disabled title="${PRICE_RO_TITLE}"` : ''}></label>`
      + `<label class="wn5f-f"><span>Θερμοκρασία °C</span><input class="form-input" data-f="temp" inputmode="decimal" value="${e.temperature_c == null ? '' : _esc(e.temperature_c)}"></label>`
      + `<div class="wn5f-f"><span>PE · ανταλλαγή παλετών</span>${_peHTML(e.pallet_exchange)}</div></div>`
      // 075: the side is corrected here (the repair of #17); on a cycle the cycle's side holds, so it stays as it is
      + `<label class="wn5f-f"><span>Κατεύθυνση</span><select class="form-input" data-f="dir"${dro}>`
      + (e.direction ? '' : '<option value="" selected>— δεν έχει δηλωθεί</option>')
      + ['KATHODOS', 'ANODOS'].map((k) => `<option value="${k}"${e.direction === k ? ' selected' : ''}>${DIR_GR[k]}</option>`).join('')
      + `</select></label>`
      // F4 (080): read from the order itself (077), a null price is «none yet» — said, and written here when known
      + (e.price == null && !_priceRo(e.invoiced) ? '<div class="wn5f-note">Η παραγγελία δεν έχει ακόμη τιμή — γράψε την εδώ όταν τη μάθεις.</div>' : '')
      + `<div class="wn5f-grid3"><label class="wn5f-f"><span>Αναφορά</span><input class="form-input" data-f="ref" value="${_esc(e.reference)}"></label>`
      + `<label class="wn5f-f"><span>Είδος</span><input class="form-input" data-f="goods" value="${_esc(e.goods)}"></label>`
      + `<label class="wn5f-f"><span>Σημειώσεις</span><input class="form-input" data-f="notes" value="${_esc(e.notes)}"></label></div>`
      + `<div class="wn5f-sec">ΑΠΟΣΤΟΛΕΣ</div><div class="wn5f-ships-h"><span>Διαδρομή</span><span>Φόρτωση από – έως</span><span>Παράδοση από – έως</span><span>Παλέτες</span><span></span></div>`
      + `<div class="wn5f-ships" data-ships>${e.ships.map((s) => _shipHTML(e, s)).join('')}</div>`
      + `<div class="wn5f-adds"><button type="button" class="wn5f-add" data-act="add-ship" data-k="drop">+ σημείο παράδοσης</button>`
      + `<button type="button" class="wn5f-add" data-act="add-ship" data-k="load">+ σημείο φόρτωσης</button></div>`
      // owner 28/10: a new point is not put on the order's cycle by itself — one board move puts it on a truck
      + '<div class="wn5f-note">Παράθυρο κενό: όλη η ημέρα. Νέο σημείο: μένει ΠΡΟΣ ΑΝΑΘΕΣΗ — βάλ\' το σε φορτηγό από το Εβδομαδιαίο.</div>'
      // F30: what a save does to a riding point, said before it is pressed (principle 1)
      // 081: the stop follows only when it is this point's alone (the base decides, and before 081 runs it never does):
      // the note claims neither; the line after the save says which stop moved and which stayed
      + (e.riding ? '<div class="wn5f-note" data-ridenote>Σημείο σε κύκλο: παλέτες, ημέρα και παράθυρο αλλάζουν εδώ και μένει στο ίδιο φορτηγό. Μετά την αποθήκευση γράφεται αν άλλαξε και η στάση του φορτηγού.</div>' : '');
  }
  function _readEdit(f) {
    const v = (sel) => { const x = f.el.querySelector(sel); return x ? x.value : ''; };
    const peh = f.el.querySelector('[data-peh]').dataset.peh;
    const win = (r) => {
      const g = (k) => r.querySelector(`[data-f="${k}"]`).value;
      const t = (k) => _hmNorm(g(k));
      // F1: both ends empty = the whole day (the create form's _rowWin); one end only stays as typed and is named
      const lw = _rowWin(false, t('lfrom'), t('lto')), dw = _rowWin(false, t('dfrom'), t('dto'));
      return { pallets: _num(g('pal')), load_from: _iso(g('lday'), lw.from), load_to: _iso(g('lday'), lw.to),
        deliver_from: _iso(g('dday'), dw.from), deliver_to: _iso(g('dday'), dw.to) };
    };
    const rec = (pid) => (document.getElementById('lv_' + pid) || {}).value || '';
    return {
      price: _num(v('[data-f="price"]')), temperature_c: _num(v('[data-f="temp"]')), reference: v('[data-f="ref"]').trim(),
      goods: v('[data-f="goods"]').trim(), notes: v('[data-f="notes"]').trim(), pallet_exchange: peh === 'yes' ? true : peh === 'no' ? false : null,
      direction: f.edit.riding ? null : (v('[data-f="dir"]') || null),
      // F30: a riding point is sent like a waiting one (its pallets, day, window); a VS or two-day point is shown only
      ships: [...f.el.querySelectorAll('[data-ship]:not([data-ro]):not([data-rm])')].map((r) => Object.assign({ shipment_id: Number(r.dataset.ship) }, win(r)))
        // F1 (080): a two-day point of unknown pallets sends its pallets only (_shipHTML data-palonly), never a window;
        // a point marked for removal sends nothing but the removal
        .concat([...f.el.querySelectorAll('[data-ship][data-palonly]:not([data-rm])')].map((r) => ({ shipment_id: Number(r.dataset.ship),
          pallets: _num(r.querySelector('[data-f="pal"]').value), palOnly: true }))),
      removed: [...f.el.querySelectorAll('[data-ship][data-rm]')].map((r) => Number(r.dataset.ship)),
      // the picked places as rec ids; _saveEdit turns them into numbers (PlanIds, Ε-2)
      news: [...f.el.querySelectorAll('[data-newship]')].map((r) => Object.assign({ k: r.dataset.k, origin_rec: rec(r.dataset.po), dest_rec: rec(r.dataset.pd) }, win(r))),
    };
  }
  // The form's own lines for the points it adds or removes (screen words, never a Worker text)
  function _checkEdit(f, st) {
    const out = [];
    // F4 (080): an order may stay without a price; a WRITTEN price is never emptied (072 no_price) — said, never dropped
    // as «no change»
    if (st.price === null) { if (f.edit.price !== null) out.push(PRICE_KEPT); }
    else if (!(Number.isFinite(st.price) && st.price > 0)) out.push('Τιμή € (χωρίς ΦΠΑ): αριθμός πάνω από 0');
    if (Number.isNaN(st.temperature_c)) out.push('Θερμοκρασία °C: αριθμός');
    const win = (s, w, stored) => {
      // pallets stored as unknown (NULL, F4) and left empty is no change: never a refusal of a save the user did not ask
      const unknownKept = s.pallets === null && stored && stored.pallets === null;
      if (!unknownKept && !(Number.isFinite(s.pallets) && s.pallets > 0 && _dec1(s.pallets))) {
        out.push(w + 'παλέτες: αριθμός πάνω από 0, ένα δεκαδικό το πολύ' + (stored && stored.pallets === null ? ', ή κενό (άγνωστες)' : ''));
      }
      if (s.palOnly) return;   // its windows are the cycle's: never read, never sent
      if (!s.load_from || !s.load_to || !s.deliver_from || !s.deliver_to) out.push(w + 'ημέρα, και παράθυρο: ΗΗ:ΛΛ και στα δύο άκρα, ή κανένα (όλη η ημέρα)');
      else if (Date.parse(s.load_from) > Date.parse(s.load_to) || Date.parse(s.deliver_from) > Date.parse(s.deliver_to)) out.push(w + 'το «έως» πρέπει να είναι μετά το «από»');
      else if (Date.parse(s.load_from) > Date.parse(s.deliver_to)) out.push(w + 'η παράδοση πριν από τη φόρτωση');
    };
    // an existing point is named by its route, so a line says WHICH row (code review high)
    st.ships.forEach((s) => { const o = f.edit.ships.find((x) => x.shipment_id === s.shipment_id);
      win(s, o && f.edit.ships.length > 1 ? `${_placeName(o.origin)} → ${_placeName(o.dest)}: ` : '', o); });
    st.news.forEach((s, i) => {
      const w = `νέο σημείο ${i + 1}: `;
      if (!s.origin_rec) out.push(w + 'διάλεξε τοποθεσία φόρτωσης από τη λίστα');
      if (!s.dest_rec) out.push(w + 'διάλεξε τοποθεσία παράδοσης από τη λίστα');
      if (s.origin_rec && s.origin_rec === s.dest_rec) out.push(w + 'ίδια τοποθεσία φόρτωσης και παράδοσης');
      win(s, w);
    });
    if (st.removed.length && st.removed.length >= f.edit.ships.length && !st.news.length) {
      out.push('Η παραγγελία κρατά τουλάχιστον ένα σημείο — για να τη σβήσεις: «Διαγραφή παραγγελίας»');
    }
    return out;
  }
  // F26 in the edit form: a new point without its places says so beside «Αποθήκευση», as the create form does
  function _editRefresh(f) {
    if (f.done) return;
    const rec = (pid) => (document.getElementById('lv_' + pid) || {}).value || '';
    const lack = [];
    for (const r of f.el.querySelectorAll('[data-newship]')) {
      if (!rec(r.dataset.po)) lack.push('τόπος φόρτωσης');
      if (!rec(r.dataset.pd)) lack.push('τόπος παράδοσης');
    }
    _why(f, lack.length ? 'Λείπει: ' + [...new Set(lack)].join(', ') : null);
  }
  // A new row the user has touched: a time or pallets typed, a day moved off its pre-filled day, or its own end picked
  // (the other end comes pre-picked by _addShip). The row «+ σημείο» of the leg form opens with (A-7) is not a change.
  function _newTouched(r) {
    if (!r) return false;
    const v = (k) => (r.querySelector(`[data-f="${k}"]`) || {}).value || '';
    const own = r.dataset.k === 'drop' ? r.dataset.pd : r.dataset.po;
    return ['lfrom', 'lto', 'dfrom', 'dto', 'pal'].some((k) => v(k) !== '') || v('lday') !== (r.dataset.ld || '') || v('dday') !== (r.dataset.dd || '')
      || !!(r.querySelector('.wn5f-dayx.bad')) || !!((document.getElementById('lv_' + own) || {}).value);
  }
  // Anything typed that a close would lose (code review): what a save would send, a row removed or added, and also
  // what is typed but cannot be sent yet (a day in red, a price that is no number, half a window) — never «not dirty»
  // because the save would refuse it.
  function _editDirty(f) {
    const st = _readEdit(f);
    const rows = [...f.el.querySelectorAll('[data-newship]')];
    st.news = st.news.filter((n, i) => _newTouched(rows[i]));
    if (st.news.length || st.removed.length || f.el.querySelector('[data-ship] .wn5f-dayx.bad')) return true;
    if (_checkEdit(f, st).length) return true;
    const b = _patchBody(f.edit, st);
    return !!(b.set || b.shipments);
  }
  async function _saveEdit(f) {
    if (f.busy || f.done || f.locked) return;
    const st = _readEdit(f);
    const probs = _checkEdit(f, st);
    let body = null;
    if (!probs.length) {
      try {
        st.news = st.news.map((s) => Object.assign({}, s, { origin_location_id: PlanIds.id('location', s.origin_rec), dest_location_id: PlanIds.id('location', s.dest_rec) }));
      } catch (e) {
        if (typeof PlanError !== 'undefined' && e instanceof PlanError) { _lines(f, []); WN5Act.strip(_strip(f), e); return; }
        throw e;
      }
      body = _patchBody(f.edit, st);
      if (!body.set && !body.shipments) probs.push('Τίποτα δεν άλλαξε');
    }
    _lines(f, probs);
    if (probs.length) return;
    f.busy = true;
    _setSave(f);
    try {
      // one request_id per open form (decision 44): a new point or a removal replays on a second press (077)
      const ans = await planFetch('PATCH', '/plan/orders/' + f.edit.nat_order_id, { body, requestId: f.slot.id });
      f.slot.confirm();
      _done(f, ans, null);
      // F30: a riding point whose day or window changed keeps its truck's stop as it was — said, with the way to move it:
      // the button under the point when its cycle is on the loaded week, else the cycle's leg form. A point waiting at
      // Veroia has no onward stop to name.
      const moved = (body.shipments || []).filter((x) => { const o = f.edit.ships.find((y) => y.shipment_id === x.shipment_id) || {};
        return x.shipment_id != null && !x.remove && o.rides && !(o.at_hub && o.waits) && ['load_from', 'load_to', 'deliver_from', 'deliver_to'].some((k) => k in x); });
      // 081: the base moved the point's own stops in this save and named the ones it kept (warnings stop_kept, in the
      // strip by _done). Before 081 runs the answer has no stops_moved: the line below says the stop did not change.
      const follow = ans && ans.ids && Array.isArray(ans.ids.stops_moved) ? ans.ids.stops_moved : null;
      if (follow && follow.length) {
        const codes = [...new Set(follow.map((x) => x.rt_code).filter(Boolean))];
        f.el.querySelector('[data-done]').textContent += ` · η στάση του φορτηγού ακολούθησε${codes.length ? ' (' + codes.join(', ') + ')' : ''}`;
        // the stop rows under the point show the stop where it is now, not the board as it was before the save
        for (const m of follow) {
          const a = m && m.after;
          if (!a) continue;
          f.el.querySelectorAll(`[data-ridestop="${Number(m.stop_id)}"]`).forEach((sp) => { sp.textContent = _rideText(sp.dataset.code, sp.dataset.k, a.planned_from, a.planned_to); });
        }
      }
      if (moved.length && !follow) {
        const here = moved.every((x) => f.el.querySelector(`[data-shipstop="${x.shipment_id}"] [data-act="stop-time"]`));
        f.el.querySelector('[data-done]').textContent += here ? ' · η ώρα της στάσης του φορτηγού δεν άλλαξε: «Αλλαγή ώρας στάσης ›» στο σημείο'
          : ' · η ώρα της στάσης του φορτηγού δεν άλλαξε: αλλάζει από το σκέλος του κύκλου (άλλη εβδομάδα)';
      }
      const added = (ans && ans.ids && ans.ids.new_shipment_ids) || [];
      // owner 31/10 (pack 2): a new point of an order that rides goes on the same truck, after its last stop — one
      // more write after the board read. When it cannot (no single truck, a refusal), the point waits and the old
      // line below says so, with the base's reason in the strip (wn5_edit.js putNew).
      let put = null;
      if (added.length && typeof WN5Edit !== 'undefined') {
        try { await f.reloaded; } catch (_) { /* the board's own strip says the read failed */ }
        put = await WN5Edit.putNew({ natOrderId: f.edit.nat_order_id, shipmentIds: added, leg: f.p.leg || null, host: _strip(f) });
      }
      if (put && put.text) f.el.querySelector('[data-done]').textContent += ' · ' + put.text;
      else if (added.length) {
        f.el.querySelector('[data-done]').textContent += ` · ${added.length === 1 ? 'νέο σημείο' : added.length + ' νέα σημεία'} ΠΡΟΣ ΑΝΑΘΕΣΗ: βάλ' ${added.length === 1 ? 'το' : 'τα'} σε φορτηγό από το Εβδομαδιαίο`;
        // A-7: opened from a leg («+ σημείο» of the leg form): the way back to that leg, one press away
        const leg = f.p.leg;
        if (leg && Number.isSafeInteger(leg.rtId)) {
          f.el.querySelector('[data-done]').insertAdjacentHTML('beforeend', ` <button type="button" class="wn5f-lnk" data-act="to-leg">Στο ${_esc(leg.code || 'RT-' + leg.rtId)} · ${SIDE_GR[leg.side] || ''} ›</button>`);
        }
      }
    } catch (e) { await _failed(f, e, null); }
    finally { f.busy = false; _setSave(f); }
  }
  async function _openEdit(p, ids) {
    let ans = null, err = null;
    try { ans = await planFetch('GET', '/plan/orders/' + p.natOrderId); } catch (e) { err = e; }
    const edit = err ? null : _editFromRead(ans);
    if (!edit) {
      // F13: never a form on values it could not read — the user would save over what was not shown (principle 1)
      if (!err) err = new Error('GET /plan/orders/' + p.natOrderId + ': answer without order or points');
      if (typeof PlanError === 'undefined' || !(err instanceof PlanError)) _log(err, 'WN5Form edit read');
      if (typeof toast === 'function') toast('Η παραγγελία #' + p.natOrderId + ' δεν διαβάστηκε — η φόρμα δεν άνοιξε: ' + String(err.message || err), 'danger');
      return false;
    }
    const f = { kind: 'order', p, seq: 0, busy: false, done: false, locked: false, edit };
    f.onSave = _saveEdit;
    f.onRefresh = _editRefresh;
    f.slot = PlanApi.slot();   // ONE id for this open form (decision 44): a new point is a creation
    _open(f, 'Επεξεργασία παραγγελίας #' + _esc(p.natOrderId), '· ' + _esc(edit.client || ''), _editHTML(f), 'Μία «Αποθήκευση» = μία συναλλαγή.');
    f.onAct = (ff, a, t) => {
      if (a === 'to-leg') {
        // A-7: the new point waits (owner 28/10); one board move puts it on the leg it was added from — the «+» of that
        // side, its waiting list read after this save (f.reloaded), where «Πρόσθεσε» is one press
        const leg = ff.p.leg;
        _close(ff);
        Promise.resolve(ff.reloaded).then(() => {
          WN5Act.plus(leg.rtId, leg.side, _plusAnchor(leg.rtId, leg.side));
        }).catch((e) => _log(e, 'WN5Form to-leg'));
        return;
      }
      if (a === 'stop-time') {
        // F30 → F29: the truck's stop moves in its own panel (dry run, list), one act per save (Ε-4). Changes typed here
        // and not saved would be lost with the form: said, never dropped in silence (principle 1)
        if (!ff.done && _editDirty(ff)) { _lines(ff, ['Αποθήκευσε πρώτα τις αλλαγές της παραγγελίας (ή «Άκυρο»), μετά άλλαξε την ώρα της στάσης']); return; }
        const anchor = document.querySelector(`#content .wn5-row[data-rt="${t.dataset.rt}"]`) || document.querySelector('#content .wn5');
        _close(ff);
        WN5Act.datePanel(Number(t.dataset.rt), t.dataset.side, anchor, { stopId: Number(t.dataset.stop) });
        return;
      }
      if (ff.done || ff.locked) return;   // saved or closed: no row the form could no longer send
      if (a === 'add-ship') { _addShip(ff, t.dataset.k); return _refresh(ff); }
      if (a !== 'del-ship') return;
      const row = t.closest('.wn5f-ship');
      if (row.hasAttribute('data-newship')) { row.remove(); return _refresh(ff); }
      // an existing point is marked, not dropped from the screen: one more press brings it back before «Αποθήκευση»
      const rm = !row.hasAttribute('data-rm');
      row.toggleAttribute('data-rm', rm);
      // ↺ gives each field back the lock _shipHTML drew (read once, at the first ×): a two-day point stays read-only,
      // the loading of a point at Veroia stays locked, the unknown pallets of a locked point (F1) come back open —
      // one source for «which field is locked», never a second rule here (code review xhigh r4)
      if (!row.hasAttribute('data-lock0')) {
        row.querySelectorAll('input').forEach((x) => { x.dataset.lock0 = x.disabled ? '1' : ''; });
        row.setAttribute('data-lock0', '');
      }
      row.querySelectorAll('input').forEach((x) => { x.disabled = rm || x.dataset.lock0 === '1'; });
      t.textContent = rm ? '↺' : '×';
      t.setAttribute('aria-label', rm ? 'Επαναφορά σημείου' : 'Αφαίρεση σημείου');
      return _refresh(ff);
    };
    if (!ids.ok) WN5Act.strip(_strip(f), ids.err);
    if (_closedNow()) { WN5Act.strip(_strip(f), _closedNow()); f.locked = true; }
    // A-7: «+ σημείο φόρτωσης / παράδοσης» of the leg form opens here with its new row ready
    if (!f.locked && (p.addShip === 'load' || p.addShip === 'drop')) _addShip(f, p.addShip);
    _refresh(f);
    return true;
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
    if (p.natOrderId != null) return _openEdit(p, ids);   // F13: the order's own read, never the board's
    const board = await _board();
    const f = { kind: 'order', p, seq: 0, busy: false, done: false, locked: false, mode: 'normal', cycleStops: {}, cycles: [], dayDefault: p.day || '' };
    for (const c of (board && board.cycles) || []) {
      f.cycleStops[c.rt_id] = (c.stops || []).map((s) => ({ stop_id: s.stop_id, location_id: s.location_id, side: s.side }));
      const who = c.trip_type === 'PARTNER' ? (c.partner || 'Συνεργάτης') : [c.truck, c.driver].filter(Boolean).join(' · ');
      f.cycles.push({ rt_id: c.rt_id, label: `${c.code || 'RT-' + c.rt_id} · ${who || 'χωρίς όχημα'}` });
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
      // F44/F46 (live 31/10): the Veroia day is the cycle's own Veroia stop on that side, before the cycle's start
      // (p.day): the start put a Veroia arrival on Thu 29 for a cycle that stops at Veroia on Fri 30, fixed by hand
      // three times. The points keep the cycle's day as before. What the screen fills is marked data-auto and follows
      // (_orderRefresh); a day the user types or picks stays theirs (_dayInput).
      const hubDay = hubStop ? hubStop.stop_day || '' : '';
      const day = p.day || hubDay, vd = hubDay || p.day || '';
      const vEl = f.el.querySelector('#wn5f-vday');
      if (vd) { vEl.value = vd; if (!hubDay) vEl.dataset.auto = '1'; }
      if (day) { f.dayDefault = day; f.el.querySelectorAll('[data-f="day"]').forEach((x) => { if (!x.value) { x.value = day; x.dataset.auto = '1'; } }); }
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

  // ── the leg form (T21): Figma 2011:9294, Δ7 2069:7746 ──────────────────────────────────────────────────────
  // A VS is the international's (price, invoicing, its pallets and windows change there: decision 21, vs_locked);
  // a national order is edited here, ONE order per «Αποθήκευση» (Ε-4: one save = one RPC = one transaction);
  // moving goes through «Μεταφορά σε…» (WN5Act.move, its own dry run and list), never a delete; the stop times
  // change from the day panel (Δ4, WN5Act.datePanel: the whole side, or one stop from «Αλλαγή ώρας ›»), never from this save.
  // The hub as the board names it (WN5Act's model: the Veroia stop of a painted side), else the catalogue: PlanIds
  // runs on its stub until GET /plan/lookups exists, and a null hub only shows «Βέροια» by its name.
  function _hubId() {
    try { const k = typeof WN5Act !== 'undefined' && WN5Act._kit; const h = k && typeof k.hubId === 'function' ? k.hubId() : null; if (h != null) return h; } catch (_) { /* fall through */ }
    try { return PlanIds.id('location', _hubRec()); } catch (_) { return null; }
  }
  const _hm = (iso) => (_parts(iso) || {}).hm || '—';
  // Pure: the cycle of the board (072 plan_board shape) → what the form shows. hubId = the hub's numeric id or null.
  function _legModel(cyc, side, hubId) {
    const all = (cyc.stops || []).slice().sort((a, b) => a.seq - b.seq);
    const stops = all.filter((s) => s.side === side);
    const isHub = (s) => hubId != null && s.location_id === hubId;
    const blocks = new Map();
    const pieces = new Set();
    let total = 0, totalUnk = 0;   // F1: pieces whose pallets are not known yet are counted apart, never as 0
    for (const s of stops) for (const l of s.legs || []) {
      pieces.add(l.piece_id);
      const vs = l.kind === 'vs_import' || l.kind === 'vs_export';
      const key = vs ? 'vs:' + l.order_id : 'n:' + l.nat_order_id;
      let b = blocks.get(key);
      if (!b) {
        b = { key, vs, order_id: l.order_id, nat_order_id: l.nat_order_id, reference: l.reference || '', client: l.client || '', client_id: l.client_id,
          temps: [], loads: [], drops: [], pallets: 0, palUnk: 0, pieces: [], price: l.price === undefined ? null : l.price,
          // F4 (080): a national leg says price: null when the order has none yet — «λείπει», not «not on the board»
          priceMissing: !vs && Object.prototype.hasOwnProperty.call(l, 'price') && l.price === null,
          pallet_exchange: typeof l.pallet_exchange === 'boolean' ? l.pallet_exchange : null };
        blocks.set(key, b);
      }
      if (l.temperature_c != null && !b.temps.includes(l.temperature_c)) b.temps.push(l.temperature_c);
      if (!b.pieces.includes(l.piece_id)) b.pieces.push(l.piece_id);
      const row = { stop_id: s.stop_id, location: s.location, location_id: s.location_id, day: s.stop_day, from: s.planned_from, to: s.planned_to,
        pallets: l.pallets, piece_id: l.piece_id, hub: isHub(s), order_stop_id: l.order_stop_id === undefined ? null : l.order_stop_id };
      if (l.act === 'load') {
        b.loads.push(row);
        if (l.pallets == null) { b.palUnk++; totalUnk++; } else { b.pallets += l.pallets; total += l.pallets; }
      } else b.drops.push(row);
    }
    const hubStop = stops.find(isHub) || null;
    const end = side === 'ANODOS' ? (stops.filter(isHub).pop() || null) : null;
    const others = all.filter((s) => s.side !== side);
    const vehicle = cyc.trip_type === 'PARTNER' ? (cyc.partner || 'Συνεργάτης') : (cyc.truck || 'χωρίς φορτηγό');
    const first = side === 'KATHODOS' ? (hubStop || stops[0]) : stops[0];
    const bl = [...blocks.values()];
    const loaded = bl.filter((b) => b.pallets > 0 || b.palUnk > 0);
    const seq = stops.slice().sort((a, b) => Date.parse(a.planned_from) - Date.parse(b.planned_from)).map((s) => {
      const legs = s.legs || [];
      const isEnd = !!end && s.stop_id === end.stop_id;
      // the act that counts at this stop: the delivery at the end or where nothing loads, else the loading
      const want = isEnd || !legs.some((x) => x.act === 'load') ? 'unload' : 'load';
      const counted = legs.filter((l) => l.act === want);
      return { stop_id: s.stop_id, when: isEnd ? `ως ${_dow(s.stop_day)} ${_hm(s.planned_to)}` : `${_dow(s.stop_day)} ${_hmw(s.planned_from, s.planned_to)}`,
        place: isHub(s) ? (isEnd ? 'Βέροια · τέλος κύκλου' : 'Βέροια') : s.location,
        what: [...new Set(legs.map((l) => l.reference).filter(Boolean))].join(' · ') + (isEnd ? ' · άφιξη' : legs.some((l) => l.act === 'load') ? ' · φόρτωση' : ' · παράδοση'),
        pallets: counted.reduce((a, l) => a + (l.pallets != null ? l.pallets : 0), 0), unk: counted.filter((l) => l.pallets == null).length };
    });
    // every piece of the whole cycle, both sides: one left = moving it ends the cycle (Figma Δ7 2069:8081)
    const cyclePieces = new Set();
    for (const s of all) for (const l of s.legs || []) cyclePieces.add(l.piece_id);
    return {
      side, stops, blocks: bl, shipments: pieces.size, total, totalUnk, hubStop, end, vehicle, seq, lastLoad: cyclePieces.size === 1,
      plates: cyc.trip_type === 'PARTNER' ? (cyc.partner || '—') : [cyc.truck, cyc.trailer].filter(Boolean).join(' · ') || '—',
      day: first ? first.stop_day : null,
      cap: (loaded.length > 1 ? loaded.map((b) => _palU(b.pallets, b.palUnk)).join(' + ') + ' = ' : '') + `${_palU(total, totalUnk)}/33`,
      head: side === 'KATHODOS'
        ? [['Κατεύθυνση', 'ΚΑΘΟΔΟΣ'], ['Φόρτωση Βέροιας', hubStop ? _dlab(hubStop.stop_day) : '—'],
           ['Παράθυρο Βέροιας', hubStop ? _hmw(hubStop.planned_from, hubStop.planned_to) : '—']]
        : [['Κατεύθυνση', 'ΑΝΟΔΟΣ'], ['Κάθοδος', others.length ? 'ΚΑΘΟΔΟΣ ' + _dlab(others[0].stop_day) : 'Χωρίς κάθοδο'],
           ['Άφιξη Βέροιας', end ? `${_dlab((_parts(end.planned_to) || {}).day)} · ${_hm(end.planned_to)}` : '—']],
    };
  }
  const _tempTxt = (ts) => (ts.length ? ts.slice().sort((a, b) => a - b).map((t) => (t > 0 ? '+' : '') + t).join(' / ') + ' °C' : '—');
  // lucide «lock» at 13px (Figma 2011:9434); the colour is the block's grey-2, set in CSS
  const LOCK = '<svg class="wn5f-lock-i" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  const _lth = (win) => `<div class="wn5f-th ro"><span>Τοποθεσία</span><span>Ημέρα</span><span>${win}</span><span>Παλέτες</span></div>`;
  // A point of a leg is read-only here — its pallets, day and window change in its order's edit form (F30), its truck's
  // stop from «Αλλαγή ώρας ›» (F29), its truck with «Μεταφορά σε…» — drawn in
  // Figma's boxes (2011:9452 / 9520): a VS's place and pallets in the locked grey cell, the rest white.
  function _roRowHTML(r, vs) {
    const ro = vs ? 'wn5f-c vro' : 'wn5f-c';
    return `<div class="wn5f-row ro" data-piece="${r.piece_id}"><span class="${ro}">${_esc(r.hub ? 'Βέροια' : r.location)}</span>`
      + `<span class="wn5f-c">${_esc(_dlab(r.day))}</span>`
      + (WN5L.allDay(r.from, r.to) ? '<span class="wn5f-cwin"><span class="wn5f-c">όλη η ημέρα</span></span>'
        : `<span class="wn5f-cwin"><span class="wn5f-c">${_hm(r.from)}</span><span class="wn5f-dash">–</span><span class="wn5f-c">${_hm(r.to)}</span></span>`)
      + `<span class="${ro}">${_pal(r.pallets)}</span><span></span>`
      + (vs ? `<button type="button" class="wn5f-lnk" data-act="move" data-piece="${r.piece_id}">Μεταφορά σε…</button>` : '<span></span>') + '</div>';
  }
  // The VS block: locked for price, pallets and windows (decision 21); its day and — for an import — its
  // destination after Veroia are the national desk's too, «όποιος μάθει πρώτος» (S-104, S-107), each with its
  // own button: ONE POST per change, never inside the form's «Αποθήκευση» (Ε-4).
  // The 072 board carries no order_stop_id on cycle legs (only on waiting[]/hub[]): while it is missing the
  // destination button stays off and a line says why (principle 1); once the Worker adds it to legs[] the button
  // turns on with no code change. The day needs only order_id, which the legs carry.
  function _vsBlockHTML(f, b) {
    const imp = f.m.side === 'KATHODOS';
    const rows = imp ? b.drops.filter((r) => !r.hub) : b.loads.filter((r) => !r.hub);
    const hubDay = f.m.hubStop ? f.m.hubStop.stop_day : (f.m.end ? f.m.end.stop_day : '');
    const noStop = imp && rows.some((r) => r.order_stop_id == null);
    return `<div class="wn5f-ord wn5f-lock" data-vs="${b.order_id}">`
      + `<div class="wn5f-ord-h">${LOCK}<b>${_esc(b.reference || 'VS')} · ${_esc(b.client)}</b><span class="wn5f-vs-s">· από διεθνή παραγγελία · ${_tempTxt(b.temps)}</span>`
      + `<span class="wn5f-badge">ημέρα · προορισμός · παράθυρο κλειδωμένο</span></div>`
      + `<div class="wn5f-vsday"><label class="wn5f-f"><span>Ημέρα</span><input class="form-input" type="date" data-f="vsday" value="${_esc(hubDay || '')}"></label>`
      + `<button type="button" class="wi4-btn sm" data-act="vs-day" data-order="${b.order_id}">Ορισμός ημέρας</button><span class="wn5f-ok" data-vsok></span></div>`
      + `<div class="wn5f-sec">${imp ? 'ΠΑΡΑΔΟΣΕΙΣ' : 'ΦΟΡΤΩΣΕΙΣ'}</div>` + _lth('Παράθυρο από – έως *')
      + rows.map((r) => {
        if (!imp) return _roRowHTML(r, true);
        // the destination changes only for an import: plan_vs_set_place is «the destination after Veroia» (072:2064)
        const pid = 'wn5v' + (++f.seq);
        const off = r.order_stop_id == null;
        return _roRowHTML(r, true) + `<div class="wn5f-vsplace"><span class="wn5f-sub">Προορισμός μετά τη Βέροια</span>${fhLocSelect(pid, '', 'WN5Form._locDropNoHub')}`
          + `<button type="button" class="wi4-btn sm" data-act="vs-place" data-pid="${pid}" data-osid="${off ? '' : r.order_stop_id}"${off ? ' disabled' : ''}>Αλλαγή προορισμού</button></div>`;
      }).join('')
      + (noStop ? '<div class="wn5f-note">Ο προορισμός αλλάζει εδώ όταν το board φέρνει τη στάση της διεθνούς — ως τότε από τη διεθνή παραγγελία.</div>' : '')
      + `<div class="wn5f-note">${_pal(b.pallets || rows.reduce((a, r) => a + r.pallets, 0))}π · τιμή και τιμολόγηση στη διεθνή παραγγελία · δεν διαγράφεται από εδώ · ημέρα και προορισμός: όποιος μάθει πρώτος — γράφεται και στη διεθνή, ο διεθνών ειδοποιείται</div></div>`;
  }
  function _natBlockHTML(f, b) {
    const id = b.nat_order_id;
    const anodosEnd = f.m.side === 'ANODOS' ? b.drops.filter((r) => r.hub) : [];
    const drops = f.m.side === 'ANODOS' ? b.drops.filter((r) => !r.hub) : b.drops;
    return `<div class="wn5f-ord" data-nat="${id}">`
      + `<div class="wn5f-lf"><div class="wn5f-f"><span>Πελάτης *</span><span class="wn5f-ro">${_esc(b.client || '—')}</span></div>`
      + `<label class="wn5f-f"><span>Τιμή € (χωρίς ΦΠΑ)</span><input class="form-input" data-f="price" inputmode="decimal" value="${b.price == null ? '' : _esc(b.price)}" placeholder="${b.priceMissing ? 'λείπει' : b.price == null ? 'χωρίς αλλαγή' : ''}"></label>`
      + `<label class="wn5f-f"><span>Θερμοκρασία °C</span><input class="form-input" data-f="temp" inputmode="decimal" value="${b.temps.length === 1 ? (b.temps[0] > 0 ? '+' : '') + _esc(b.temps[0]) : ''}"></label>`
      + `<div class="wn5f-f"><span>PE</span>${_peHTML(b.pallet_exchange)}</div></div>`
      + `<div class="wn5f-grid3"><label class="wn5f-f"><span>Αναφορά</span><input class="form-input" data-f="ref" value="${_esc(b.reference)}"></label>`
      + `<label class="wn5f-f"><span>Είδος</span><input class="form-input" data-f="goods"></label><label class="wn5f-f"><span>Σημειώσεις</span><input class="form-input" data-f="notes"></label></div>`
      + (b.priceMissing ? '<div class="wn5f-note">Η παραγγελία δεν έχει ακόμη τιμή — γράψε την εδώ όταν τη μάθεις.</div>'
        : b.price == null ? '<div class="wn5f-note">Η τιμή δεν έρχεται με το board για παραγγελία σε κύκλο — γράψε τιμή μόνο για να την αλλάξεις.</div>' : '')
      + `<div class="wn5f-sec">ΣΗΜΕΙΑ ΦΟΡΤΩΣΗΣ</div>` + _lth('Παράθυρο από – έως *') + b.loads.map((r) => _roRowHTML(r, false)).join('')
      + (drops.length ? `<div class="wn5f-sec">ΣΗΜΕΙΑ ΠΑΡΑΔΟΣΗΣ</div>` + _lth('Παράθυρο από – έως *') + drops.map((r) => _roRowHTML(r, false)).join('') : '')
      // ΑΝΟΔΟΣ → Βέροια (Δ7 2069:8004): one «ως» deadline in a 2px box; it changes from the day panel (Ε-4)
      + (anodosEnd.length ? `<div class="wn5f-sec">ΠΡΟΟΡΙΣΜΟΣ</div>` + _lth('Άφιξη ως *')
        + anodosEnd.map((r) => `<div class="wn5f-row ro"><span class="wn5f-c nro">Βέροια</span><span class="wn5f-c">${_esc(_dlab(r.day))}</span>`
          + `<span class="wn5f-cwin"><span class="wn5f-c until">${_hm(r.to)}</span></span><span class="wn5f-c nro">${_pal(r.pallets)}</span><span></span>`
          + `<button type="button" class="wn5f-lnk" data-act="time">Αλλαγή ώρας ›</button></div>`).join('') : '')
      + `<div class="wn5f-acts"><button type="button" class="wn5f-lnk" data-act="move-order" data-nat="${id}">Μεταφορά σε… (όλη η παραγγελία)</button>`
      // A-7 (Figma audit 28/10): a point of THIS order, in its edit form (077: the new point waits, owner 28/10, and the
      // form then offers the way back to this leg)
      + `<button type="button" class="wn5f-lnk" data-act="add-point" data-k="load" data-nat="${id}">+ σημείο φόρτωσης</button>`
      + `<button type="button" class="wn5f-lnk" data-act="add-point" data-k="drop" data-nat="${id}">+ σημείο παράδοσης</button>`
      + `<button type="button" class="wn5f-card" data-act="card" data-nat="${id}">Άνοιγμα καρτέλας ›</button></div>`
      + `<div class="wn5f-note">#${_esc(b.reference || id)} · ${_palU(b.pallets, b.palUnk)}π${b.priceMissing ? ' · τιμή λείπει' : b.price == null ? '' : ` · ${_esc(_pal(b.price))} €`} · τιμολογείται χωριστά · η διαγραφή γίνεται από την καρτέλα: λίστα παραστατικών + επιβεβαίωση, χωρίς επαναφορά</div></div>`;
  }
  function _legHTML(f) {
    const m = f.m;
    return `<div class="wn5f-head wn5f-lhead" data-side="${m.side}">` + m.head.concat([['Φορτηγό', m.plates]]).map(([k, v]) => `<div class="wn5f-f"><span>${k}</span><span class="wn5f-ro">${_esc(v)}</span></div>`).join('') + `</div>`
      + m.blocks.map((b) => (b.vs ? _vsBlockHTML(f, b) : _natBlockHTML(f, b))).join('')
      // A-7: a new order on this leg — the create form with this cycle and side set, as the «+» → «Νέα παραγγελία»
      + '<div class="wn5f-adds"><button type="button" class="wn5f-add" data-act="leg-add-order">+ παραγγελία</button>'
      // F35 (owner 28/10): an order already waiting ΠΡΟΣ ΑΝΑΘΕΣΗ onto this leg — the «+» of this side, «Από αναμονή»
      // (WN5Act.plus, the one list of waiting loads), never a second list here
      + '<button type="button" class="wn5f-add" data-act="leg-add-wait">+ από αναμονή</button></div>'
      // the summary's right side is the total only (Figma 2011:9569); the per-order sum is the header badge's
      + `<div class="wn5f-sum"><div class="wn5f-sum-h"><b>${m.shipments} ${m.shipments === 1 ? 'αποστολή' : 'αποστολές'} · ${m.shipments === 1 ? 'σκέλος ' + SIDE_GR[m.side] : 'ίδιο σκέλος'} · ${_esc(m.vehicle)}</b><b>${_palU(m.total, m.totalUnk)}/33</b></div>`
      + `<div class="wn5f-sec">ΣΕΙΡΑ ΣΤΑΣΕΩΝ ΚΑΤΑ ΩΡΑ</div><ol class="wn5f-seq">`
      // F29 (live 28/10): every stop's own day and window, from here — the day panel for that one stop (Δ4, its dry run
      // and list), never inside this form's «Αποθήκευση» (Ε-4: one save = one act)
      + m.seq.map((x, i) => `<li data-stop="${x.stop_id}"><span class="wn5f-seq-n">${i + 1}</span><span class="wn5f-seq-w">${_esc(x.when)}</span><span class="wn5f-seq-p">${_esc(x.place)}</span><span class="wn5f-seq-c">${_esc(x.what)}</span><span class="wn5f-seq-q">${_palU(x.pallets, x.unk)}π</span>`
        + `<button type="button" class="wn5f-lnk" data-act="stop-time" data-stop="${x.stop_id}">Αλλαγή ώρας ›</button></li>`).join('')
      + `</ol><div class="wn5f-note">${m.lastLoad
        ? 'Τελευταίο φορτίο → ο κύκλος σβήνεται· με κόστη ή γεμάτη μισθοδοσία πρώτα η λίστα, κενή σβήνεται σιωπηλά.'
        : 'Σε άλλο φορτηγό: «Μεταφορά σε…» — VS ανά παράδοση, εθνική όλη η παραγγελία· η ίδια παραγγελία μετακινείται, δεν σβήνεται, δεν ξαναγράφεται.'}</div></div>`;
  }
  function _legState(f, id) {
    const el = f.el.querySelector(`[data-nat="${id}"]`);
    const v = (k) => el.querySelector(`[data-f="${k}"]`).value;
    const peh = el.querySelector('[data-peh]').dataset.peh;
    return { price: _num(v('price')), temperature_c: _num(v('temp')), reference: v('ref').trim(), goods: v('goods').trim(), notes: v('notes').trim(),
      pallet_exchange: peh === 'yes' ? true : peh === 'no' ? false : null, ships: [] };
  }
  function _legChanged(f) {
    return Object.keys(f.orig).map(Number).filter((id) => {
      const b = _patchBody(f.orig[id], _legState(f, id));
      return !!(b.set || b.shipments);
    });
  }
  function _legRefresh(f) {
    const ch = _legChanged(f);
    f.blocked = ch.length !== 1;
    // a typed value that is not a number is dropped by _patchBody: say it, so a dead «Αποθήκευση» is never silent
    const bad = [];
    for (const id of Object.keys(f.orig)) {
      const st = _legState(f, id);
      if (st.price !== null && !(Number.isFinite(st.price) && st.price > 0)) bad.push(`#${f.orig[id].reference || id} · Τιμή € (χωρίς ΦΠΑ): αριθμός πάνω από 0`);
      if (st.price === null && f.orig[id].price != null) bad.push(`#${f.orig[id].reference || id} · ${PRICE_KEPT}`);
      if (Number.isNaN(st.temperature_c)) bad.push(`#${f.orig[id].reference || id} · Θερμοκρασία °C: αριθμός`);
    }
    if (bad.length) f.blocked = true;
    _lines(f, (ch.length > 1 ? [`Άλλαξαν ${ch.length} παραγγελίες — μία «Αποθήκευση» στέλνει μία: κράτησε τις αλλαγές της μίας, αποθήκευσε, μετά την επόμενη`] : []).concat(bad));
  }
  async function _saveLeg(f) {
    if (f.busy || f.done || f.locked || f.blocked) return;
    const ch = _legChanged(f);
    if (ch.length !== 1) return;
    const id = ch[0];
    const st = _legState(f, id);
    if (st.price !== null && !(Number.isFinite(st.price) && st.price > 0)) { _lines(f, ['Τιμή € (χωρίς ΦΠΑ): αριθμός πάνω από 0']); return; }
    if (Number.isNaN(st.temperature_c)) { _lines(f, ['Θερμοκρασία °C: αριθμός']); return; }
    const body = _patchBody(f.orig[id], st);
    f.busy = true;
    _setSave(f);
    try {
      const ans = await planFetch('PATCH', '/plan/orders/' + id, { body });
      _done(f, ans, null);
      f.el.querySelector('[data-done]').textContent = `Αποθηκεύτηκε · #${f.orig[id].reference || id}`;
    } catch (e) { await _failed(f, e, null); }
    finally { f.busy = false; _setSave(f); }
  }
  // Before «Μεταφορά σε…», «Άνοιγμα καρτέλας ›» or «Αλλαγή ώρας ›» the leg form closes: the board changes after
  // them and an open form would show the old picture.
  // The exits added with F29 / A-7 (a stop's time, + σημείο, + παραγγελία) close it too: a price or a note typed and not
  // saved is said, never lost in silence (code review)
  const LEG_KEEP = ['stop-time', 'add-point', 'leg-add-order', 'leg-add-wait'];
  // the «+» of a cycle's side on the board, where its popover opens (else the row)
  const _plusAnchor = (rt, side) => document.querySelector(`#content .wn5-row[data-rt="${rt}"] .wn5-plus[data-side="${side}"]`) || document.querySelector(`#content .wn5-row[data-rt="${rt}"]`);
  function _legDirty(f) {
    return Object.keys(f.orig).some((id) => {
      const st = _legState(f, id), b = _patchBody(f.orig[id], st);
      return !!(b.set || b.shipments) || Number.isNaN(st.price) || Number.isNaN(st.temperature_c);
    });
  }
  function _legAct(f, a, t) {
    const rt = f.rtId;
    if (LEG_KEEP.includes(a) && !f.done && _legDirty(f)) { _lines(f, ['Αποθήκευσε πρώτα τις αλλαγές της φόρμας (ή «Άκυρο»), μετά συνέχισε']); return; }
    const anchor = () => document.querySelector(`#content .wn5-row[data-rt="${rt}"]`) || document.querySelector('#content .wn5');
    if (a === 'move') { _close(f); WN5Act.move({ piece_ids: [Number(t.dataset.piece)], rt_id: rt }, { side: f.side, entry: 'leg' }); return; }
    if (a === 'move-order') {
      // a national order moves whole (Figma 9294): every piece of it on this cycle, both sides
      const id = Number(t.dataset.nat);
      const ids = [];
      for (const s of f.cyc.stops || []) for (const l of s.legs || []) if (l.nat_order_id === id && !ids.includes(l.piece_id)) ids.push(l.piece_id);
      _close(f);
      WN5Act.move({ piece_ids: ids, rt_id: rt }, { side: f.side, entry: 'leg' });
      return;
    }
    if (a === 'card') { _close(f); WN5Act.orderCard(Number(t.dataset.nat)); return; }
    if (a === 'add-point') {
      const nat = Number(t.dataset.nat);
      _close(f);
      openOrder({ natOrderId: nat, addShip: t.dataset.k, leg: { rtId: rt, side: f.side, code: f.cyc.code || null } });
      return;
    }
    if (a === 'leg-add-order') { _close(f); openOrder({ side: f.side, day: f.m.day || '', rtId: rt }); return; }
    if (a === 'leg-add-wait') { _close(f); WN5Act.plus(rt, f.side, _plusAnchor(rt, f.side)); return; }
    if (a === 'time') { _close(f); WN5Act.datePanel(rt, 'ANODOS', anchor()); return; }
    if (a === 'stop-time') { _close(f); WN5Act.datePanel(rt, f.side, anchor(), { stopId: Number(t.dataset.stop) }); return; }
    if (a === 'vs-day') {
      const box = t.closest('[data-vs]');
      vsDay(Number(t.dataset.order), box.querySelector('[data-f="vsday"]').value);
      return;
    }
    if (a === 'vs-place') {
      const rec = (document.getElementById('lv_' + t.dataset.pid) || {}).value || '';
      if (!rec) {
        // an empty list is not «pick one»: say that the places did not load (principle 1)
        _lines(f, [typeof _fhLocationsArr !== 'undefined' && _fhLocationsArr.length ? 'Προορισμός: διάλεξε τοποθεσία από τη λίστα'
          : 'Οι τοποθεσίες δεν φορτώθηκαν — κλείσε και άνοιξε ξανά τη φόρμα']);
        return;
      }
      let loc;
      try { loc = PlanIds.id('location', rec); }
      catch (e) { WN5Act.strip(_strip(f), e); return; }
      vsPlace(Number(t.dataset.osid), loc);
    }
  }
  // The clicked side stays marked on the board while its form is open (Figma 2011:9305 / 2069:8150: the side's cells
  // as one box). The side is four grid cells, so the mark is one box laid over them, measured once; it dies with
  // the form, or with the row when the board repaints.
  const LEG_CELLS = { KATHODOS: '.wn5-kd, .wn5-fl, .wn5-kto, .wn5-kpal', ANODOS: '.wn5-ad, .wn5-afl, .wn5-ato, .wn5-apal' };
  function _legMark(f, on) {
    if (f.mark && f.mark.parentNode) f.mark.parentNode.removeChild(f.mark);
    f.mark = null;
    const row = on ? document.querySelector(`#content .wn5-row[data-rt="${f.rtId}"]`) : null;
    const cells = row ? [...row.children].filter((c) => c.matches(LEG_CELLS[f.side])) : [];
    if (!cells.length) return;
    const rb = row.getBoundingClientRect(), a = cells[0].getBoundingClientRect(), b = cells[cells.length - 1].getBoundingClientRect();
    const el = document.createElement('span');
    el.className = 'wn5-legsel';
    el.setAttribute('aria-hidden', 'true');
    el.style.left = (a.left - rb.left) + 'px';
    el.style.width = (b.right - a.left) + 'px';
    row.appendChild(el);
    f.mark = el;
  }
  async function openLeg(rtId, side) {
    const board = await _board();
    const cyc = board && (board.cycles || []).find((c) => c.rt_id === rtId);
    if (!cyc || (side !== 'KATHODOS' && side !== 'ANODOS')) {
      if (typeof toast === 'function') toast('Ο κύκλος δεν βρέθηκε στην εβδομάδα που φαίνεται — ανανέωσε', 'warn');
      return false;
    }
    const ids = await PlanIds.load();
    const m = _legModel(cyc, side, _hubId());
    // the VS destination picker (T22) reads the places list; only the order form loaded it before
    if (side === 'KATHODOS' && m.blocks.some((b) => b.vs)) {
      try { await fhLoadLocations(); } catch (e) { _log(e, 'WN5Form.openLeg locations'); }
    }
    const f = { kind: 'leg', rtId, side, cyc, m, seq: 0, busy: false, done: false, locked: false, blocked: true, orig: {},
      onSave: _saveLeg, onRefresh: _legRefresh, onAct: _legAct, onClose: (x) => _legMark(x, false) };
    for (const b of m.blocks) if (!b.vs) f.orig[b.nat_order_id] = { nat_order_id: b.nat_order_id, price: b.price, reference: b.reference,
      temperature_c: b.temps.length === 1 ? b.temps[0] : null, pallet_exchange: b.pallet_exchange, goods: '', notes: '', ships: [] };
    _open(f, `Σκέλος · ${SIDE_GR[side]} ${_esc(m.vehicle)} · ${_esc(m.day ? _dlab(m.day) : '—')}`,
      `· ${m.shipments} ${m.shipments === 1 ? 'αποστολή' : 'αποστολές'}`, _legHTML(f), 'Μία «Αποθήκευση» = μία συναλλαγή.');
    f.el.querySelector('[data-cap]').textContent = m.cap;
    _legMark(f, true);
    if (!ids.ok) WN5Act.strip(_strip(f), ids.err);
    if (_closedNow()) { WN5Act.strip(_strip(f), _closedNow()); f.locked = true; }
    _refresh(f);
    return true;
  }

  // ── VS day / destination (T22) ─────────────────────────────────────────────────────────────────────────────
  // The places list without the hub: Veroia is never a VS destination after Veroia (072 plan_vs_set_place).
  // Same filter rule as fhLocDrop (form-helpers.js: _fhNorm over the label), only the hub left out.
  function _locDropNoHub(id, q) {
    const hub = _hubRec();
    const nq = typeof _fhNorm === 'function' ? _fhNorm(String(q || '').trim()) : String(q || '').trim().toLowerCase();
    const pool = _fhLocationsArr.filter((o) => o.id !== hub && (!nq || (o._n || (o._n = _fhNorm(o.label))).includes(nq))).slice(0, 25);
    fhShowDrop('ls_' + id + '_d', id, pool);
  }
  // The outcome line of a VS change, from the answer: a notice means the international desk was told; none means
  // the base changed nothing there (072:2045 «the same day again … tells nobody»). The screen says it, never guesses.
  function _vsOk(f, ans, withNotice, without, sel) {
    const line = f.el.querySelector(sel);
    if (line) line.textContent = Array.isArray(ans.notice_ids) && ans.notice_ids.length ? withNotice : without;
    if (Array.isArray(ans.warnings) && ans.warnings.length) WN5Act.strip(_strip(f), ans.warnings);
    else _strip(f).innerHTML = '';
    _lines(f, []);
  }
  async function _vsSend(path, body, withNotice, without, where, sel) {
    const f = _f && _f.kind === 'leg' ? _f : null;
    if (f) { if (f.busy) return null; f.busy = true; _setSave(f); }
    try {
      const ans = await planFetch('POST', path, { body });
      if (f) _vsOk(f, ans, withNotice, without, sel);
      WN5.reload(where);
      return ans;
    } catch (e) {
      if (f) await _failed(f, e, null);
      else {
        // vsDay / vsPlace are public: called with no leg form open, the answer still reaches the user — the board's
        // strip with the Worker's words (principle 1). A PlanError was already logged by planFetch when it is not a
        // designed refusal (a 422/409 is never an app error); only a fault of this screen's own code is logged here.
        const host = WN5Act._kit && typeof WN5Act._kit.boardHost === 'function' ? WN5Act._kit.boardHost() : null;
        if (host) WN5Act.strip(host, e);
        if (!(typeof PlanError === 'function' && e instanceof PlanError)) _log(e, 'WN5Form.' + where);
      }
      return null;
    } finally {
      if (f) { f.busy = false; _setSave(f); }
    }
  }
  function vsDay(orderId, day) {
    if (!Number.isSafeInteger(orderId) || !DAY.test(String(day || ''))) {
      if (_f && _f.kind === 'leg') _lines(_f, ['Ημέρα: διάλεξε ημέρα']);
      return Promise.resolve(null);
    }
    return _vsSend('/plan/vs/day', { order_id: orderId, day }, 'Η ημέρα γράφτηκε και στη διεθνή, ο διεθνών ειδοποιήθηκε',
      'Ίδια ημέρα — η διεθνής δεν άλλαξε, καμία ειδοποίηση', 'vs-day', `[data-vs="${orderId}"] [data-vsok]`);
  }
  function vsPlace(orderStopId, locationId) {
    const f = _f && _f.kind === 'leg' ? _f : null;
    if (!Number.isSafeInteger(orderStopId) || !Number.isSafeInteger(locationId)) { if (f) _lines(f, ['Προορισμός: διάλεξε τοποθεσία από τη λίστα']); return Promise.resolve(null); }
    // the hub pasted in from elsewhere: refused here, nothing sent (072 plan_vs_set_place: «location_id (not the hub)»)
    if (locationId === _hubId()) { if (f) _lines(f, ['Η Βέροια δεν είναι προορισμός VS — διάλεξε τον τόπο παράδοσης μετά τη Βέροια']); return Promise.resolve(null); }
    return _vsSend('/plan/vs/place', { order_stop_id: orderStopId, location_id: locationId }, 'Ο προορισμός γράφτηκε και στη διεθνή, ο διεθνών ειδοποιήθηκε',
      'Ίδιος προορισμός — η διεθνής δεν άλλαξε', 'vs-place', `[data-vs]:has([data-osid="${orderStopId}"]) [data-vsok]`);
  }

  window.WN5Form = Object.freeze({ openOrder, openLeg, vsDay, vsPlace, _locDropNoHub, _body, _check, _patchBody, _editFromRead, _findOrders, _iso, _parts, _legModel, _rowWin, _dayParse });
})();
