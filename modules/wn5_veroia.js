// modules/wn5_veroia.js — National v5 (F4α, T19): the Veroia board (Figma 2011:8744, Δ11 2069:8356), behind
// FEATURES.WN_V5. The ONLY place a delivery is split (S-111).
//
// Rules:
//  1. Nothing at load: this file only defines window.WN5Hub. Its buttons are inline handlers of the markup it
//     returns to WN5.paint() (the v4 pattern), each starting with the WN5.active() guard.
//  2. Data = Model.hub of core/wn5-logic.js (plan_board.hub[], v_hub_bucket 071:470) and, for ids and windows,
//     the board JSON (WN5.state). Days are the base's (leave_by, overdue: decision 18); the word «22:00» is the
//     screen's (S-113). An overdue stock line is red and never dimmed (S-93).
//  3. «Σπάσε…» is one of the three creations with a request_id (decision 44): one PlanApi.slot per open window,
//     memory only, the same id on every press until a confirmed 200; request_reused is checked on the board.
//  4. «Σε φορτηγό ▾» and the truck of «Νέο φορτίο» are the assignment form of wn5_assign.js (one component, S-115;
//     owner 31/10: the same form as the Weekly International).
//  5. Colours only through classes of assets/style.css (critics unit weekly_natl_v5: hex 0).
//  6. A value that did not come is «—», never a guess; a delivery with no window shows its day («παρ. Τρί 13/10»,
//     owner 31/10). «Νέο φορτίο» writes once, POST /plan/legs, with no request_id (as «Σε φορτηγό ▾», 072).
(function () {
  'use strict';
  const K = () => WN5Act._kit;
  const _live = () => typeof WN5 !== 'undefined' && WN5.active();
  const DOW_UP = ['ΚΥΡ', 'ΔΕΥ', 'ΤΡΙ', 'ΤΕΤ', 'ΠΕΜ', 'ΠΑΡ', 'ΣΑΒ'];       // typed in capitals (no text-transform)
  // the closed line's chevron is drawn (Figma 2011:7930 icon/right), its colour from CSS through currentColor
  const CHEV = '<svg class="wn5-hub-chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 9L7.5 6L4.5 3" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let _open = false;                    // survives a re-read: after «Σπάσε» the panel comes back open

  const _wd = (ymd) => K().dayShort(ymd).split(' ')[0];                  // «Τρί» (Figma: the weekday, no date, in a row)
  // «φεύγει ως [Τετ] 22:00»: the day is left out when it is the panel's own day (Figma 2011:7745 Theta Berries)
  const _leaveWord = (ymd, day) => (ymd === day ? '' : _wd(ymd) + ' ') + '22:00';
  // the line under the window of a stock row: on time «4π · φεύγει ως Τετ 22:00» (orange); overdue starts with the
  // reference, «N-T014 · έπρεπε να φύγει Κυρ 22:00 · καθυστέρηση» (red, Δ11 2069:8397)
  function _stockLine(h, raw, day) {
    const k = K();
    if (!h.leave_by) return k.pal(h.pallets) + 'π';
    if (h.overdue) return (raw.reference ? raw.reference + ' · ' : '') + 'έπρεπε να φύγει ' + _wd(h.leave_by) + ' 22:00 · καθυστέρηση';
    return k.pal(h.pallets) + 'π · φεύγει ως ' + _leaveWord(h.leave_by, day);
  }
  // The panel's day = the day its pieces load at Veroia, by the base's days (decision 18): the earliest nat_ready_day of
  // what waits to be split; with nothing to split, the earliest leave_by of the stock — an overdue one leaves on the
  // model's hub day (today in the week). The model's hub.day alone is today: on a Tuesday it would list Tuesday's
  // trucks for a delivery that loads on Monday (rig veroia, Figma 2011:8748 «Δευ 12/10» vs Δ11 2069:8360 «Τρί 13/10»).
  // Clamped to the loaded week, the only days whose cycles the board has.
  // a stock line's day: its leave_by, or the model's hub day (today) once overdue — the panel's and «Σε φορτηγό ▾»'s
  const _stockDay = (h, hub) => (h.overdue ? hub && hub.day : h.leave_by) || null;
  function _hubDay(model) {
    const k = K();
    const hub = model.hub;
    let days = (hub.split || []).map((h) => (k.item(h.pieceId) || {}).nat_ready_day).filter(Boolean);
    if (!days.length) days = (hub.stock || []).map((h) => _stockDay(h, hub)).filter(Boolean);
    let d = days.sort()[0] || hub.day || null;
    if (d && model.week) { const last = k.addDays(model.week, 6); if (d < model.week) d = model.week; else if (d > last) d = last; }
    return d;
  }
  // the cycles of the hub's day that load at Veroia (their KATHODOS has a Veroia stop)
  function _trucks(day) {
    const k = K();
    return k.dayRows(day).filter((r) => r.kath && r.kath.veroia).map((r) => {
      const c = k.cycle(r.rtId);
      return c ? { rtId: r.rtId, c, r, pal: k.sidePal(r, 'KATHODOS'), unk: k.sideUnk(r, 'KATHODOS'), win: k.veroiaOf(r, 'KATHODOS') } : null;
    }).filter(Boolean);
  }
  // the delivery place, by name, only when the board sent it (Ε-26) and the catalogue has it; else «—» (rule 6), as the
  // window column's «παρ. —»: an empty line would read as a place nobody needs
  function _placeOf(raw) {
    if (raw.nat_to_location_id == null || typeof PlanIds === 'undefined') return '—';
    const p = PlanIds.place(raw.nat_to_location_id);
    return p && p.name ? p.name : '—';
  }
  // ═══ Veroia board v2 (owner 28/10 answers 4, 10; Figma 2383:7736, 2396:8024; owner 31/10 «εστίαση στη δημιουργία
  // νέων φορτίων»): the list by day, the oldest on top, a late day red; «Σε φορτηγό ▾» on the row, «Σπάσε…» in «⋯»;
  // «Νέο φορτίο» on the right builds ONE load — the ticked rows, other loadings of the same truck, the Veroia day and
  // window — with the truck chosen in the assignment form (WN5Assign.pick), and writes it once (POST /plan/legs).
  // «Φορτηγό αργότερα» (083, owner 31/10): the load is made with no vehicle (new_rt.later) and shows «ΠΡΟΣ ΑΝΑΘΕΣΗ» on
  // its day; its truck is given later from that row. «← Weekly» / «→ Βέροια»: 087 (P-11, below).
  // The new load's state survives a re-read of the board (memory only); a row no longer on the board leaves it.
  const _nf = { sel: [], extra: [], day: null, win: { all: true, from: '', to: '' }, choice: null, now: null, busy: false, adding: false };
  // a piece's Veroia day: a VS's cross-dock (vsHubDay), stock its leave day, a national at Veroia its ready day
  function _rowDay(h, hub) {
    const k = K(), raw = k.item(h.pieceId) || {};
    if (raw.is_stock) return _stockDay(h, hub);
    const vh = k.vsHubDay(raw);
    return (vh && vh.day) || raw.nat_ready_day || h.nat_due_day || null;
  }
  const _late = (h, today) => h.overdue === true || !!(h.nat_due_day && today && h.nat_due_day < today);
  // «παρ. Τρί 07:00–09:00»; without a window the delivery day «παρ. Τρί 13/10» (owner 31/10, instead of «παρ. —»)
  function _parText(raw, h) {
    const k = K();
    if (raw.deliver_from) return 'παρ. ' + _wd(k.ymdOf(raw.deliver_from)) + ' ' + k.hmw(raw.deliver_from, raw.deliver_to);
    const due = raw.nat_due_day || h.nat_due_day;
    return 'παρ. ' + (due ? k.dayShort(due) : '—');
  }
  const _tempOf = (raw) => (raw.temperature_c == null || !isFinite(Number(raw.temperature_c)) ? '' : String(Number(raw.temperature_c)).replace('.', ',') + ' °C');
  function _itemHTML(h, isStock, day) {
    const k = K();
    const raw = k.item(h.pieceId) || {};
    const pid = k.id(h.pieceId);
    // WN5L's shape check rejects a bad id before paint; if one still slips through, the dropped row is logged (principle 1)
    if (!pid) { k.log(new Error('wn5: hub item without a valid piece id ' + JSON.stringify(h.pieceId)), 'WN5Hub item'); return ''; }
    const on = _nf.sel.includes(pid);
    const sub = isStock
      ? '<span class="' + (h.overdue ? 'wn5-late' : 'wn5-leave') + '">' + k.esc(_stockLine(h, raw, day)) + '</span>'
      : '<span>' + k.esc((raw.reference || '—') + (raw.for_split === true ? ' · από ✈' : '')) + '</span>';
    const tmp = _tempOf(raw);
    return '<div class="wn5-hub-it' + (on ? ' on' : '') + '" data-piece="' + pid + '">'
      + '<input type="checkbox" class="wn5-hub-ck" aria-label="Στο νέο φορτίο"' + (on ? ' checked' : '') + ' onclick="event.stopPropagation();WN5Hub.tick(' + pid + ', this.checked)">'
      + '<span class="wn5-hub-c1"><b>' + k.esc(h.client || '—') + '</b><span>' + k.esc(_placeOf(raw)) + '</span></span>'
      + '<span class="wn5-hub-c2"><b>' + k.esc(_parText(raw, h)) + '</b>' + sub + '</span><span class="wn5-hub-sp"></span>'
      + (tmp ? '<span class="wn5-hub-chip">' + k.esc(tmp) + '</span>' : '')
      + '<span class="wn5-hub-p">' + k.esc(k.pal(h.pallets)) + 'π</span>'
      // ✈ of a national order (live F23, 28/10): its card — dates, delete — as on its ΠΡΟΣ ΑΝΑΘΕΣΗ row; none for a VS
      + '<span class="wn5-hub-a">' + WN5.orderCardBtn(raw.nat_order_id)
      + '<button type="button" class="wi4-btn sm wn5-hub-b" data-hub="truck" onclick="event.stopPropagation();WN5Hub._truck(' + pid + ', this)">Σε φορτηγό ▾</button>'
      + (isStock ? '' : '<button type="button" class="wi4-btn sm wn5-hub-b wn5-hub-more" data-hub="more" aria-label="Περισσότερα" onclick="event.stopPropagation();WN5Hub.more(' + pid + ', this)">⋯</button>')
      + '</span></div>';
  }
  // the days of the list, the oldest first; stock last, as its own group (Figma 2383:7736)
  function _groups(model) {
    const hub = model.hub;
    const by = new Map();
    for (const h of hub.split || []) { const d = _rowDay(h, hub) || '—'; if (!by.has(d)) by.set(d, []); by.get(d).push(h); }
    return [...by.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  }
  function _groupHead(day, list, today) {
    const k = K();
    const late = list.filter((h) => _late(h, today));
    const due = late.map((h) => h.nat_due_day).filter(Boolean).sort()[0];
    const dd = day === '—' ? '—' : DOW_UP[k.dow(day)] + ' ' + k.dm(day);
    return '<div class="wn5-grp-h wn5-hub-gh">' + k.esc(dd + (day === today ? ' · σήμερα' : '') + ' · ' + list.length + ' · ' + WN5L.palText(k.sum(list.map((h) => h.pallets)), list.filter((h) => h.pallets == null).length) + 'π')
      + (late.length ? '<span class="wn5-hub-late">' + k.esc('αργό' + (due ? ' · παράδοση ' + k.dayShort(due) : '')) + '</span>' : '') + '</div>';
  }
  // ═══ «Νέο φορτίο» ═══
  const _pieces = () => [..._nf.sel, ..._nf.extra].map((id) => ({ piece_id: id }));
  const _hubCtx = () => ({ day: _nf.day, side: 'KATHODOS', hub: { day: _nf.day, from: _nf.win.all ? '00:00' : _nf.win.from, to: _nf.win.all ? '23:59' : _nf.win.to } });
  // the request and the line of the chosen truck, from the same form engine as «Ανάθεση» (one rule for both)
  const _plan = () => (_nf.choice && _nf.day && _pieces().length ? WN5Assign.forChoice(_pieces(), _hubCtx(), _nf.choice) : null);
  // the default Veroia day: the earliest ticked row's, never before today (a late row leaves today at the earliest)
  function _defaultDay(model) {
    const k = K(), hub = model.hub;
    const ds = _nf.sel.map((id) => { const h = [...(hub.split || []), ...(hub.stock || [])].find((x) => x.pieceId === id); return h ? _rowDay(h, hub) : null; }).filter(Boolean).sort();
    let d = ds[0] || hub.day || model.week;
    if (model.today && d < model.today) d = model.today;
    if (model.week) { const last = k.addDays(model.week, 6); if (d < model.week) d = model.week; else if (d > last) d = last; }
    return d;
  }
  // the order the base will give the stops (072 plan_h_reseq: by start), the request's own stops
  function _orderLine(req) {
    const k = K();
    if (!req || req.missing || !req.body) return '';
    const cyc = req.body.target && req.body.target.rt_id != null ? k.cycle(req.body.target.rt_id) : null;
    const hub = k.hubId();
    const all = (req.body.stops || []).map((s) => {
      const ex = s.stop_id != null && cyc ? (cyc.stops || []).find((x) => x.stop_id === s.stop_id) : null;
      return ex ? { loc: ex.location_id, from: ex.planned_from, to: ex.planned_to } : { loc: s.location_id, from: s.planned_from, to: s.planned_to };
    }).concat(cyc ? (cyc.stops || []).filter((x) => x.side === 'KATHODOS' && !(req.body.stops || []).some((s) => s.stop_id === x.stop_id)).map((x) => ({ loc: x.location_id, from: x.planned_from, to: x.planned_to })) : [])
      .sort((a, b) => Date.parse(a.from) - Date.parse(b.from));
    const loads = new Set(_pieces().map((p) => (k.item(p.piece_id) || {}).at_hub ? hub : (k.item(p.piece_id) || {}).position_location_id));
    return all.map((s, i) => (i + 1) + ' ' + (s.loc === hub ? 'Βέροια' : k.placeCity(s.loc) || k.placeName(s.loc)) + (loads.has(s.loc) ? ' φόρτωση ' + k.hmw(s.from, s.to) : '')).join(' → ');
  }
  // the temperatures of the load: one value ✓; a spread of 2 °C or more is the base's mixed_temp warning (072), amber
  function _temps() {
    const ts = [...new Set(_pieces().map((p) => (K().item(p.piece_id) || {}).temperature_c).filter((t) => t != null && isFinite(Number(t))).map(Number))].sort((a, b) => a - b);
    if (!ts.length) return null;
    const txt = (ts.length > 1 ? ts[0] + '–' + ts[ts.length - 1] : String(ts[0])).replace(/\./g, ',') + ' °C';
    return { txt, warn: ts[ts.length - 1] - ts[0] >= 2 };
  }
  function _nfHTML(model) {
    const k = K();
    const items = _nf.sel.map((id) => k.item(id)).filter(Boolean), extra = _nf.extra.map((id) => k.item(id)).filter(Boolean);
    const all = items.concat(extra);
    const pal = k.sum(all.map((x) => x.pallets)), unk = all.filter((x) => x.pallets == null).length;
    let h = '<div class="wn5-nf"><div class="wn5-nf-hd"><span class="wn5-nf-t">ΝΕΟ ΦΟΡΤΙΟ</span><span class="wn5-hub-sp"></span>'
      + (all.length ? '<span class="wn5-nf-n">' + k.esc(all.length + (all.length === 1 ? ' επιλεγμένο' : ' επιλεγμένα') + ' · ' + WN5L.palText(pal, unk) + 'π') + '</span>' : '') + '</div>';
    if (!items.length) return h + '<p class="wn5-none wn5-nf-empty">—</p></div>';
    const wk = model.week;
    const days = wk ? [0, 1, 2, 3, 4, 5, 6].map((i) => k.addDays(wk, i)) : [_nf.day];
    h += '<div class="wn5-nf-row"><span class="wn5-nf-l">Ημέρα φόρτωσης Βέροιας</span><select class="wn5-nf-day" onchange="WN5Hub.nfDay(this.value)">'
      + days.map((d) => '<option value="' + d + '"' + (d === _nf.day ? ' selected' : '') + '>' + k.esc(k.dayShort(d)) + '</option>').join('') + '</select>'
      + '<span class="wn5-nf-l">Παράθυρο</span>'
      + (_nf.win.all
        ? '<button type="button" class="wn5a-all on" onclick="WN5Hub.nfWin(true)">όλη η ημέρα</button><button type="button" class="wn5a-hrs" onclick="WN5Hub.nfWin(false)">ώρες…</button>'
        : '<input class="wi-pop-inp wn5a-hm" data-nfhm="from" inputmode="numeric" maxlength="5" placeholder="ΗΗ:ΛΛ" value="' + k.esc(_nf.win.from) + '" onchange="WN5Hub.nfHm(\'from\', this.value)" aria-label="από">'
          + '<span class="wn5a-dash">–</span><input class="wi-pop-inp wn5a-hm" data-nfhm="to" inputmode="numeric" maxlength="5" placeholder="ΗΗ:ΛΛ" value="' + k.esc(_nf.win.to) + '" onchange="WN5Hub.nfHm(\'to\', this.value)" aria-label="έως">'
          + '<button type="button" class="wn5a-all" onclick="WN5Hub.nfWin(true)">όλη η ημέρα</button>')
      + '</div>';
    // a delivery due before the Veroia day leaves late: said, never refused (the user decides)
    const lateDue = items.map((x) => x.nat_due_day).filter((d) => d && _nf.day && d < _nf.day).sort();
    if (lateDue.length) h += '<div class="wn5-nf-note">' + k.esc(lateDue.length + (lateDue.length === 1 ? ' παράδοση είναι για ' : ' παραδόσεις είναι για ') + k.dayShort(lateDue[0]) + ' · θα φύγ' + (lateDue.length === 1 ? 'ει' : 'ουν') + ' αργά') + '</div>';
    const line = (x, place) => '<div class="wn5-nf-it"><b>' + k.esc(x.client || '—') + '</b><span>' + k.esc(place + ' · ' + (x.reference || '—')) + '</span><span class="wn5-hub-sp"></span>'
      + '<span class="wn5-hub-p">' + k.esc(k.pal(x.pallets)) + 'π</span><button type="button" class="wi4-link wn5-nf-x" aria-label="Αφαίρεση" onclick="WN5Hub.nfDrop(' + x.piece_id + ')">×</button></div>';
    h += '<div class="wn5-nf-sec">ΠΑΡΑΔΟΣΕΙΣ ΑΠΟ ΒΕΡΟΙΑ · ' + items.length + '</div>' + items.map((x) => line(x, _placeOf(x))).join('');
    h += '<div class="wn5-nf-sec">ΑΛΛΕΣ ΦΟΡΤΩΣΕΙΣ ΣΤΟ ΙΔΙΟ ΦΟΡΤΗΓΟ' + (extra.length ? ' · ' + extra.length : '') + '</div>'
      + extra.map((x) => line(x, (k.placeCity(x.position_location_id) || k.placeName(x.position_location_id)) + ' → ' + _placeOf(x) + ' · φόρτωση ' + (x.load_from ? k.hmw(x.load_from, x.load_to) : k.dayShort(x.nat_ready_day)))).join('')
      + '<button type="button" class="wi4-link wn5-nf-add" onclick="WN5Hub.nfAddOpen(this)">+ φόρτωση από αναμονή</button>';
    const p = _plan();
    const ln = p && p.line;
    if (p && p.req && !p.req.missing) {
      const tp = _temps();
      const free = 33 - (ln ? Number(String(ln.after).replace(',', '.').replace(/\+.*$/, '')) : pal);
      h += '<div class="wn5-nf-order"><div>' + k.esc('Σειρά: ' + _orderLine(p.req)) + '</div><div><b class="' + (ln && ln.over ? 'over' : 'ok') + '">' + k.esc((ln ? ln.after : WN5L.palText(pal, unk)) + '/33' + (isFinite(free) && free >= 0 ? ' · ' + k.pal(free) + ' ελεύθερες' : '')) + '</b>'
        + (tp ? ' <span class="' + (tp.warn ? 'warn' : 'ok') + '">' + k.esc(tp.txt + (tp.warn ? '' : ' ✓')) + '</span>' : '') + '</div></div>';
    }
    const later = !!(_nf.choice && _nf.choice.who === 'later');
    h += '<div class="wn5-nf-sec">ΦΟΡΤΗΓΟ</div><span class="wn5a-opts wn5-nf-when" role="group">'
      + '<button type="button" class="wn5a-opt' + (later ? '' : ' on') + '" data-act="nf-now" onclick="WN5Hub.nfLater(false)">Με φορτηγό τώρα</button>'
      + '<button type="button" class="wn5a-opt' + (later ? ' on' : '') + '" data-act="nf-later" onclick="WN5Hub.nfLater(true)">Φορτηγό αργότερα</button></span>';
    if (!later && p && p.label) {
      h += '<div class="wn5-nf-truck"><span class="wn5-nf-tb"><b class="' + (_nf.choice.who === 'own' ? 'wn5a-mono' : '') + '">' + k.esc(p.label) + '</b>' + (p.sub ? '<span>' + k.esc(p.sub) + '</span>' : '') + '</span>'
        + '<span class="wn5-nf-av">' + k.esc(ln ? ln.txt.split(' · ').slice(1).join(' · ') : '') + '</span>'
        // the truck already stops at Veroia another day: the load goes to that stop (decision 6), not the day above
        + (ln && ln.other ? '<span class="wn5a-note">' + k.esc(ln.other) + '</span>' : '') + '<span class="wn5-hub-sp"></span>'
        + (ln ? '<span class="wn5a-cap' + (ln.over ? ' over' : '') + '">' + k.esc(ln.before + ' → ' + ln.after + '/33') + '</span>' : '')
        + '<button type="button" class="wi4-link wn5-nf-ch" onclick="WN5Hub.nfPick(this)">Αλλαγή ▾</button></div>';
    } else if (!later) h += '<button type="button" class="wi4-btn sm wn5-nf-pick" onclick="WN5Hub.nfPick(this)">Φορτηγό ή συνεργάτης ▾</button>';
    const words = !p ? (_nf.choice ? [] : ['φορτηγό']) : p.err ? [p.err.message] : (p.problems ? p.problems.words : []);
    if (p && p.req && p.req.missing) words.push('παράθυρο Βέροιας');
    const can = !!(p && p.req && !p.req.missing && !words.length && !_nf.busy && !k.closedErr());
    h += '<div class="wn5-nf-msg" data-nfmsg></div><div class="wn5-nf-ft"><span class="wn5a-miss">' + k.esc(p && p.err ? p.err.message : words.length ? 'Λείπει: ' + words.join(', ') : '') + '</span>'
      + '<button type="button" class="wi4-btn" onclick="WN5Hub.nfReset()">Άκυρο</button>'
      + '<button type="button" class="wi4-btn pri wn5-nf-go" data-act="nf-create"' + (can ? '' : ' disabled') + ' onclick="WN5Hub.nfCreate()">'
      + k.esc('Δημιουργία φορτίου · ' + WN5L.palText(pal, unk) + 'π' + (p && p.label ? ' → ' + p.label : '')) + '</button></div></div>';
    return h;
  }
  function shelfHTML(model) {
    const k = typeof WN5Act !== 'undefined' ? K() : null;
    const hub = model && model.hub;
    if (!k || !hub || hub.empty || (!(hub.split || []).length && !(hub.stock || []).length)) return '';   // empty = hidden
    const split = hub.split || [], stock = hub.stock || [];
    // a ticked row no longer on the board (taken, split, deleted elsewhere) leaves the new load
    const onBoard = new Set([...split, ...stock].map((h) => h.pieceId));
    _nf.sel = _nf.sel.filter((id) => onBoard.has(id));
    _nf.extra = _nf.extra.filter((id) => !!k.item(id) && !k.item(id).at_hub);
    if (!_nf.sel.length) { _nf.extra = []; _nf.choice = null; _nf.now = null; _nf.day = null; }
    const day = _hubDay(model);
    const today = model.today || null;
    // F1/F4 (080): «12+;» — the known pallets and the pieces whose pallets are not known yet, never added as 0; the
    // model counts both (hub.pallets), the panel only says them
    const P = hub.pallets || {};
    const palS = WN5L.palText(P.split, P.splitUnknown), palK = WN5L.palText(P.stock, P.stockUnknown);
    // the summary drops a part that is zero (Δ11 header: «· απόθεμα 17π», no «για μοίρασμα»)
    const sum = [split.length ? split.length + ' για μοίρασμα · ' + palS + 'π' : null,
      stock.length ? 'απόθεμα ' + palK + 'π' : null].filter(Boolean).join(' · ');
    const late = split.filter((h) => _late(h, today)).length + stock.filter((h) => h.overdue === true).length;
    const lateChip = late ? '<span class="wn5-hub-late">' + late + (late === 1 ? ' αργό' : ' αργά') + '</span>' : '';
    const dayTxt = (hub.day ? k.dayShort(hub.day) : '—') + (hub.day && hub.day === today ? ' · σήμερα' : '');
    if (!_open) {
      // the closed line names the delivery places of what waits (owner 28/10 answer 10: places, never clients), each
      // its own span: CSS hides a name that does not fit whole, never cuts it (DESIGN.md #6)
      const places = [...new Set(split.map((h) => _placeOf(k.item(h.pieceId) || {})).filter((x) => x !== '—'))];
      const names = places.slice(0, 4).map((p) => '<span>· ' + k.esc(p) + '</span>').join('');
      return '<div id="wn5-hub" class="wn5-hub"><button type="button" class="wn5-hub-t" data-hub="open" onclick="WN5Hub.open()">' + CHEV + '<span class="wn5-hub-n">ΒΕΡΟΙΑ</span></button>'
        + '<span class="wn5-hub-s">· ' + k.esc(dayTxt + (sum ? ' · ' + sum : '')) + '</span>' + lateChip
        + (names ? '<span class="wn5-hub-names">' + names + '</span>' : '')
        + '<span class="wn5-hub-sp"></span>'
        + '<button type="button" class="wi4-link wn5-hub-o" data-hub="open" onclick="WN5Hub.open()">Άνοιγμα ▸</button></div>';
    }
    if (_nf.sel.length && !_nf.day) _nf.day = _defaultDay(model);
    let left = _groups(model).map(([d, list]) => _groupHead(d, list, today) + list.map((h) => _itemHTML(h, false, day)).join('')).join('');
    if (stock.length) left += '<div class="wn5-grp-h wn5-hub-gh">ΑΠΟΘΕΜΑ · ' + stock.length + ' · ' + k.esc(palK) + 'π</div>' + stock.map((h) => _itemHTML(h, true, day)).join('');
    return '<div id="wn5-hub" class="wn5-hub open"><div id="wn5-hub-panel" class="wn5-hub-panel v2" role="region" aria-label="Πίνακας Βέροιας">'
      + '<div class="wn5-hub-hd"><span class="wn5-hub-g2" aria-hidden="true">▾</span><span class="wn5-hub-n">ΒΕΡΟΙΑ</span><span class="wn5-hub-d">· ' + k.esc(dayTxt) + '</span>'
      + (sum ? '<span class="wn5-hub-s2">· ' + k.esc(sum) + '</span>' : '') + lateChip + '<span class="wn5-hub-sp"></span>'
      + '<button type="button" class="wi4-btn sm wn5-hub-x" data-hub="close" onclick="WN5Hub.close()">Κλείσιμο</button></div>'
      + '<div class="wn5-hub-g"><div class="wn5-hub-l">' + left + '</div><div class="wn5-hub-r">' + _nfHTML(model) + '</div></div></div></div>';
  }
  function _redraw() {
    const el = document.getElementById('wn5-hub');
    const st = WN5.state();
    if (el && st && st.model) el.outerHTML = shelfHTML(st.model);
  }
  function open() { if (!_live()) return; _open = true; _redraw(); }
  function close() { if (!_live()) return; _open = false; _redraw(); }

  // ═══ v2 actions (every one starts with the WN5.active() guard) ═══
  function tick(pieceId, on) {
    if (!_live()) return;
    const id = K().id(pieceId);
    if (!id) return;
    _nf.sel = _nf.sel.filter((x) => x !== id);
    if (on) _nf.sel.push(id);
    _redraw();
  }
  function nfDay(v) { if (!_live() || !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return; _nf.day = v; _redraw(); }
  function nfWin(all) { if (!_live()) return; _nf.win = all ? { all: true, from: '', to: '' } : { all: false, from: _nf.win.from || '', to: _nf.win.to || '' }; _redraw(); }
  function nfHm(which, v) {
    if (!_live()) return;
    const hm = K().hhmm(v);
    _nf.win[which === 'to' ? 'to' : 'from'] = hm || String(v || '');
    _redraw();
  }
  function nfDrop(pieceId) {
    if (!_live()) return;
    const id = K().id(pieceId);
    _nf.sel = _nf.sel.filter((x) => x !== id);
    _nf.extra = _nf.extra.filter((x) => x !== id);
    _redraw();
  }
  function nfReset() { if (!_live()) return; _nf.sel = []; _nf.extra = []; _nf.choice = null; _nf.now = null; _nf.day = null; _nf.win = { all: true, from: '', to: '' }; _redraw(); }
  // «Με φορτηγό τώρα | Φορτηγό αργότερα»: the truck picked before is kept for when «τώρα» comes back
  function nfLater(on) {
    if (!_live()) return;
    const later = !!(_nf.choice && _nf.choice.who === 'later');
    if (on === later) return;   // a press on the option already chosen changes nothing (code review: «τώρα» twice lost the truck)
    if (on) { _nf.now = _nf.choice; _nf.choice = { who: 'later' }; }
    else { _nf.choice = _nf.now; _nf.now = null; }
    _redraw();
  }
  // the small lists of the panel (the «⋯» of a row, «+ φόρτωση από αναμονή»): one at a time, gone on any outside press
  let _pop = null;
  function _popClose() { if (_pop) { document.removeEventListener('mousedown', _pop.out, true); window.removeEventListener('keydown', _pop.key, true); _pop.el.remove(); _pop = null; } }
  function _popOpen(anchor, html, onPick) {
    _popClose();
    const el = document.createElement('div');
    el.className = 'wn5-hub-pop';
    el.setAttribute('role', 'menu');
    el.innerHTML = html;
    document.body.appendChild(el);
    const r = anchor.getBoundingClientRect();
    el.style.top = (r.bottom + 4) + 'px';
    el.style.left = Math.max(8, Math.min(r.right - el.offsetWidth, window.innerWidth - el.offsetWidth - 8)) + 'px';
    const out = (ev) => { if (!el.contains(ev.target)) _popClose(); };
    const key = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); _popClose(); } };
    el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-v]'); if (b) { const v = b.dataset.v; _popClose(); onPick(v); } });
    document.addEventListener('mousedown', out, true);
    window.addEventListener('keydown', key, true);
    _pop = { el, out, key };
  }
  // «⋯» of a row: «Σπάσε…», and «← Weekly» for a piece that was SENT here (for_split): one sent back to the Weekly
  // leaves the panel (P-11). A piece a truck unloaded here (inbound) has no mark to clear: it stays.
  function more(pieceId, anchor) {
    if (!_live()) return;
    const k = K(), id = k.id(pieceId);
    if (!id || !anchor) return;
    const raw = k.item(id) || {};
    _popOpen(anchor, '<button type="button" class="wn5-hub-pi" data-v="split">Σπάσε…</button>'
      + (raw.for_split === true ? '<button type="button" class="wn5-hub-pi" data-v="weekly">← Weekly</button>' : ''),
      (v) => { if (v === 'split') split(id, anchor); else if (v === 'weekly') _hubMark([id], false); });
  }
  // ═══ P-11 (087, owner 28/10, answer 1 of the Veroia panel, PR #167): a piece is in ONE place ═══
  // A VS import starts only as a ΠΡΟΣ ΑΝΑΘΕΣΗ row; its ✈ sends it to this panel (hub: true) and it leaves the Weekly;
  // «← Weekly» brings it back (hub: false). One mark in the base, shipment_pieces.for_split_at (the board's
  // hub[].for_split): POST /plan/move with target {hub}. Nothing moves, so no dry run and no list.
  async function _hubMark(pieceIds, hub) {
    const k = K();
    const ids = (pieceIds || []).map((x) => k.id(x)).filter(Boolean);
    if (!ids.length) return;
    if (k.closedErr()) { WN5Act.strip(k.boardHost(), k.closedErr()); return; }
    let out;
    try {
      out = await planFetch('POST', '/plan/move', { body: { from: { piece_ids: ids }, target: { hub } } });
    } catch (e) {
      if (e && e._sessionGone) return;
      WN5Act.strip(k.boardHost(), e);
      return;
    }
    if (hub) _open = true;                // the panel comes back open, the piece in it
    await k.afterSave(out, hub ? 'Στάλθηκε στη Βέροια' : 'Επέστρεψε στο Weekly');
  }
  // ✈ of a ΠΡΟΣ ΑΝΑΘΕΣΗ VS row standing at Veroia: one line, «Στον Πίνακα Βέροιας»
  function toPanel(pieceIds, anchor) {
    if (!_live() || !anchor) return;
    const ids = String(pieceIds || '').split(',').map((x) => K().id(x)).filter(Boolean);
    if (!ids.length) return;
    _popOpen(anchor, '<button type="button" class="wn5-hub-pi" data-v="hub">Στον Πίνακα Βέροιας</button>', (v) => { if (v === 'hub') _hubMark(ids, true); });
  }
  // «+ φόρτωση από αναμονή»: a ΚΑΘΟΔΟΣ load that waits elsewhere, loaded on the same truck before Veroia
  function nfAddOpen(anchor) {
    if (!_live()) return;
    const k = K();
    const st = WN5.state();
    const hub = k.hubId();
    const cand = ((st && st.board && st.board.waiting) || []).filter((w) => !_nf.extra.includes(w.piece_id) && w.position_location_id !== hub && WN5L.waitSide(w, hub) === 'KATHODOS');
    const html = cand.length ? cand.map((w) => '<button type="button" class="wn5-hub-pi" data-v="' + w.piece_id + '"><b>' + k.esc(w.client || '—') + '</b><span>'
      + k.esc((k.placeCity(w.position_location_id) || k.placeName(w.position_location_id)) + ' → ' + _placeOf(w) + ' · ' + k.dayShort(w.nat_ready_day) + ' · ' + k.pal(w.pallets) + 'π') + '</span></button>').join('')
      : '<div class="wn5-hub-pe">—</div>';
    _popOpen(anchor, html, (v) => { const id = k.id(v); if (id && !_nf.extra.includes(id)) { _nf.extra.push(id); _redraw(); } });
  }
  // «Αλλαγή ▾» / «Φορτηγό ή συνεργάτης ▾»: the assignment form, in its pick mode (it writes nothing)
  function nfPick(anchor) {
    if (!_live() || !_nf.sel.length || typeof WN5Assign === 'undefined') return;
    WN5Assign.pick(_pieces(), Object.assign(_hubCtx(), { anchor: null, choice: _nf.choice })).then((choice) => {
      if (choice) { _nf.choice = choice; _redraw(); }
    });
  }
  // «Δημιουργία φορτίου»: ONE POST /plan/legs with every piece, the target from the truck, the stops (plan_put_pieces);
  // a refusal stays in the panel with the Worker's words, the next press is the user's (decision 44)
  async function nfCreate() {
    if (!_live() || _nf.busy) return;
    const k = K();
    const p = _plan();
    if (!p || !p.req || p.req.missing || (p.problems && p.problems.words.length)) return;
    if (k.closedErr()) { WN5Act.strip(document.querySelector('#wn5-hub [data-nfmsg]'), k.closedErr()); return; }
    _nf.busy = true;
    const btn = document.querySelector('#wn5-hub [data-act="nf-create"]');
    if (btn) btn.disabled = true;
    let out;
    try {
      out = await planFetch(p.req.method, p.req.path, { body: p.req.body });
    } catch (e) {
      _nf.busy = false;
      if (e && e._sessionGone) return;
      _redraw();
      WN5Act.strip(document.querySelector('#wn5-hub [data-nfmsg]'), e);
      return;
    }
    _nf.busy = false;
    _nf.sel = []; _nf.extra = []; _nf.choice = null; _nf.now = null; _nf.day = null; _nf.win = { all: true, from: '', to: '' };
    await k.afterSave(out, 'Δημιουργήθηκε το φορτίο', { intl: true });
  }

  function _truck(pieceId, anchor) {
    if (!_live()) return null;
    const k = K();
    const st = WN5.state();
    // F27 (owner 28/10, study §3.5): Δ1 opens on the PIECE's Veroia day (nat_ready_day: the day it loads at the hub),
    // its cycles and its Veroia window on that day — the panel's day is the earliest of every piece, and handed a piece
    // ready on Wednesday to Sunday's trucks. The piece's day is a VS's cross-dock day (WN5Act._kit.vsHubDay, as Δ1 writes it);
    // stock has the day this panel gives stock (_stockDay; its nat_ready_day is its parent's); a national at Veroia has
    // no Veroia day on the board (its nat_ready_day is its supplier's, code review r3), so the panel's day, as before.
    const it = k.item(k.id(pieceId));
    const hub = st && st.model && st.model.hub;
    const vh = it ? k.vsHubDay(it) : null;
    // a stock piece's day from the panel's own stock entry (hub.stock: overdue, leave_by), the line the user pressed —
    // one reading of it for the panel and for Δ1 (code review of PR 171)
    const se = it && it.is_stock && hub ? (hub.stock || []).find((h) => h.pieceId === it.piece_id) : null;
    const own = it ? (it.is_stock ? _stockDay(se || it, hub) : vh ? vh.day : null) : null;
    const day = own || (hub ? _hubDay(st.model) : null);
    return WN5Act.assign({ pieces: [{ piece_id: k.id(pieceId) }] }, { entry: 'hub', day, side: 'KATHODOS', anchor: anchor || null });
  }

  // ═══ «Σπάσε…» (Figma 2011:8822): parts that add up, one POST with a request_id ═══
  const _valid = (s) => { const n = Number(String(s == null ? '' : s).trim().replace(',', '.')); return Number.isFinite(n) && n > 0 && Math.round(n * 10) === n * 10 ? n : null; };
  function _splitBody(st) {
    return { piece_id: st.pieceId, parts: st.parts.map((p) => {
      const o = { pallets: _valid(p.pal) };
      if (p.rt) { o.target = { rt_id: p.rt, side: 'KATHODOS' }; o.stops = p.stops; }
      // B-26 (088): a part that stays leaves by the day shown, ALWAYS sent: the shown day is the written day, and the
      // base's default (nat_due_day − 1) is never re-decided here (principle 3). Needs 088 live: before it, bad_input.
      else if (p.t === 'stay' && p.day) o.leave_by = p.day;
      return o;
    }) };
  }
  function _partsOk(st) {
    if (st.parts.length < 2) return false;
    let sum = 0;
    for (const p of st.parts) {
      const n = _valid(p.pal);
      if (n === null || !p.t || (p.rt && !p.stops)) return false;
      sum += n;
    }
    return Math.round(sum * 10) === Math.round(st.total * 10);   // parts_sum (072:900), checked before the button lights
  }
  function split(pieceId, anchor) {
    if (!_live()) return null;
    const k = K();
    const pid = k.id(pieceId);
    const it = pid ? k.item(pid) : null;
    if (!it || !it.at_hub) { WN5Act.strip(k.boardHost(), k.clientErr('piece_missing', 'Η παράδοση δεν είναι πια στη Βέροια — ανανέωσε')); return null; }
    // F1 (080): a piece whose pallets are not known yet does not split (the base refuses it: parts_sum … pallets
    // unknown) — said here, before a dialog whose sum could never close
    if (it.pallets == null) { WN5Act.strip(k.boardHost(), k.clientErr('pallets_unknown', 'Οι παλέτες του φορτίου δεν είναι γνωστές — γράψε τες πρώτα στην παραγγελία (Καρτέλα → Επεξεργασία), μετά σπάσε')); return null; }
    const hubSt = WN5.state();
    const day = hubSt && hubSt.model && hubSt.model.hub ? _hubDay(hubSt.model) : it.nat_ready_day;
    const hubId = k.hubId();
    // the snapshot (rule 4): the piece, its needs, the day's Veroia cycles with their delivery stops
    const st = { pieceId: pid, total: it.pallets, item: k.copy(it), needs: k.needs(it, false, hubId),
      trucks: _trucks(day).map((t) => ({ rtId: t.rtId, cyc: k.copy(t.c), label: k.cycText(t.c, t.r).l1.split(' · ')[0] + (t.win ? ' · ' + t.win : ''), pal: t.pal, unk: t.unk || 0,
        sideStops: k.copy((t.c.stops || []).filter((s) => s.side === 'KATHODOS' && s.location_id !== hubId)) })),
      parts: [{ t: '', rt: null, pal: '', stops: null }, { t: 'stay', rt: null, pal: '', stops: null }],
      slot: PlanApi.slot() };
    // B-26 (Figma 2011:8744): the day a part that stays leaves by, shown and changeable before the save, prefilled
    // with the base's own: the evening before the national day (decision 18). Never the piece's leave_by: stock has
    // no «⋯» (it is not split here), and a piece sent back to Veroia after riding still holds its old stock day.
    st.defDay = it.nat_due_day ? k.addDays(it.nat_due_day, -1) : null;
    st.parts[1].day = st.defDay;
    // a popover over the panel, under its «Σπάσε…» (Figma 2011:8744: drawn floating over the board), no «×»
    // Figma 2011:8822: the popover ends at the row's buttons and opens to their left, over the lists it splits, so the
    // ΦΟΡΤΗΓΑ capacity column beside them stays in view (whole-frame r4: opened rightwards it covered «27/33 · 6 ελεύθερες»)
    const a = anchor && anchor.getBoundingClientRect ? anchor : null;
    const d = k.dlg('split', 'Σπάσε · ' + (it.client || '—') + ' · ' + k.pal(it.pallets) + 'π', { pop: true, anchor: a, end: a && a.closest ? a.closest('.wn5-hub-a') : null, onClose: () => st.slot.close() });
    d.ft.innerHTML = '<button type="button" class="wi4-btn" data-act="cancel">Άκυρο</button><button type="button" class="wi4-btn pri" data-act="save">Σπάσε</button>';
    const sumHTML = () => {
      const ns = st.parts.map((p) => _valid(p.pal));
      const s = ns.reduce((a, n) => a + (n || 0), 0);
      const okSum = Math.round(s * 10) === Math.round(st.total * 10) && ns.every((n) => n !== null);
      return '<span class="wn5-sum' + (okSum ? ' ok' : '') + '">' + k.esc(ns.map((n) => (n === null ? '—' : k.pal(n))).join(' + ') + ' = ' + k.pal(s) + (okSum ? ' ✓' : ' · πρέπει ' + k.pal(st.total))) + '</span>';
    };
    // what a part does: on a truck «before → after/33 · μπαίνει kη» (Figma 2011:8832); staying, the day it leaves by
    const badgeHTML = (p) => {
      const tr = p.rt ? st.trucks.find((t) => t.rtId === p.rt) : null;
      if (tr) {
        const after = tr.pal + (_valid(p.pal) || 0);
        let rank = null;
        try { if (typeof WN5L !== 'undefined' && st.item.deliver_from) rank = WN5L.stopRank(tr.sideStops, st.item.deliver_from); } catch (e) { k.log(e, 'WN5Hub split stopRank'); }
        return '<span class="wn5-cap' + (after > 33 ? ' over' : '') + '">' + k.esc(WN5L.palText(tr.pal, tr.unk) + ' → ' + WN5L.palText(after, tr.unk) + '/33' + (after > 33 ? ' · υπέρβαση ' + k.pal(after - 33) : '') + (rank > 0 ? ' · μπαίνει ' + rank + 'η' : '')) + '</span>'
          + (p.stops ? (st.needs.some((n) => n.role === 'drop' && !n.hub && !(n.from && n.to) && n.day) ? ' <span class="wn5-part-u">παράδοση ' + k.esc(k.dayShort(st.needs.find((n) => n.role === 'drop').day)) + ' όλη η ημέρα</span>' : '')
            : ' <span class="wn5-miss">λείπει ο προορισμός από τη βάση</span>');
      }
      if (p.t !== 'stay') return '';
      if (!p.day) return '<span class="wn5-part-u">μένει απόθεμα</span>';
      // relaxed rules (owner 31/10): a day gone or after the delivery is allowed, said before the save. «Today» is the
      // Athens day, the one the base's overdue reads (071 v_piece_state), whatever the machine's clock zone.
      const today = WN5L.athensDay(new Date().toISOString()) || '';
      const warn = today && p.day < today ? 'έχει περάσει · θα φαίνεται σε καθυστέρηση'
        : st.defDay && p.day > st.defDay ? 'μετά την παράδοση ' + k.dayShort(st.item.nat_due_day) : '';
      return '<span class="wn5-part-u">φεύγει ως</span><span class="wn5-part-d wn5-lb">'
        + '<button type="button" class="wn5-lb-b" data-act="lb" data-n="-1" data-i="' + st.parts.indexOf(p) + '" aria-label="Μία ημέρα νωρίτερα">‹</button>'
        + '<span>' + k.esc(k.dayShort(p.day) + ' 22:00') + '</span>'
        + '<button type="button" class="wn5-lb-b" data-act="lb" data-n="1" data-i="' + st.parts.indexOf(p) + '" aria-label="Μία ημέρα αργότερα">›</button></span>'
        + (warn ? ' <span class="wn5-miss">' + k.esc(warn) + '</span>' : '');
    };
    const partHTML = (p, i) => {
      const opts = '<option value="">— διάλεξε —</option><option value="stay"' + (p.t === 'stay' ? ' selected' : '') + '>μένει στη Βέροια</option>'
        + st.trucks.map((t) => '<option value="rt:' + t.rtId + '"' + (p.t === 'rt:' + t.rtId ? ' selected' : '') + '>' + k.esc(t.label) + '</option>').join('');
      return '<div class="wn5-part" data-i="' + i + '"><select data-part-target data-i="' + i + '" aria-label="Πού πάει το μέρος ' + (i + 1) + '">' + opts + '</select>'
        + '<input class="wn5-hm wn5-part-p" data-part-pal data-i="' + i + '" inputmode="decimal" aria-label="Παλέτες του μέρους ' + (i + 1) + '" value="' + k.esc(p.pal) + '"><span class="wn5-part-u">παλέτες</span>'
        + '<span class="wn5-hub-sp"></span><span class="wn5-pbadge" data-i="' + i + '">' + badgeHTML(p) + '</span></div>';
    };
    const draw = () => {
      d.body.innerHTML = '<p class="wn5-split-i">Πού πάει κάθε μέρος· το άθροισμα πρέπει να είναι ' + k.esc(k.pal(st.total)) + '.</p>'
        + st.parts.map(partHTML).join('') + '<div class="wn5-split-f"><button type="button" class="wi4-link" data-act="more">+ ακόμη ένα μέρος</button><span class="wn5-hub-sp"></span>' + sumHTML() + '</div>';
      d.refresh();
    };
    // a keystroke redraws the sum and the badges, never the inputs (focus and caret stay)
    d.refresh = () => {
      const b = d.dlg.querySelector('[data-act="save"]');
      if (b) b.disabled = d.locked || d.busy || !_partsOk(st);
      const s = d.body.querySelector('.wn5-sum');
      if (s) s.outerHTML = sumHTML();
      for (const el of d.body.querySelectorAll('.wn5-pbadge')) { const p = st.parts[Number(el.dataset.i)]; if (p) el.innerHTML = badgeHTML(p); }
    };
    d.dlg.addEventListener('change', (ev) => {
      const el = ev.target;
      if (!el.matches('[data-part-target]')) return;
      const p = st.parts[Number(el.dataset.i)];
      p.t = el.value;
      p.rt = /^rt:/.test(el.value) ? k.id(el.value.slice(3)) : null;
      if (p.t === 'stay' && !p.day) p.day = st.defDay;
      // a part on a truck needs its stops on that cycle: the Veroia stop and the delivery (072 plan_h_put per part)
      const tr = p.rt ? st.trucks.find((t) => t.rtId === p.rt) : null;
      // B1: a delivery with no window of its own (a VS bridge) goes on its day, whole day — the badge says it
      const r = tr ? k.stopsFor(st.needs, tr.cyc, 'KATHODOS', null, (n) => k.dayWin(n)) : null;
      p.stops = r && !r.missing.length ? r.stops : null;
      draw();
    });
    d.dlg.addEventListener('input', (ev) => {
      const el = ev.target;
      if (!el.matches('[data-part-pal]')) return;
      st.parts[Number(el.dataset.i)].pal = el.value;
      d.refresh();
    });
    d.dlg.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-act]');
      if (!b || b.disabled || !_live()) return;
      if (b.dataset.act === 'cancel') { if (!d.busy) k.close(d); }
      else if (b.dataset.act === 'more') { st.parts.push({ t: '', rt: null, pal: '', stops: null }); draw(); }
      else if (b.dataset.act === 'lb') {
        const p = st.parts[Number(b.dataset.i)];
        // not while a press is on its way: its bytes are the request (rule 3, decision 44)
        if (p && p.day && !d.busy) {
          p.day = k.addDays(p.day, Number(b.dataset.n));
          d.refresh();
          // refresh rewrote the badge: the same arrow again, so a keyboard user keeps stepping
          const again = d.body.querySelector('[data-act="lb"][data-i="' + b.dataset.i + '"][data-n="' + b.dataset.n + '"]');
          if (again) again.focus();
        }
      }
      else if (b.dataset.act === 'save' && _partsOk(st)) {
        k.send(d, { method: 'POST', path: '/plan/pieces/split', body: _splitBody(st), requestId: st.slot.id }, 'Αποθηκεύτηκε το σπάσιμο', {
          slot: st.slot, intl: true,
          // request_reused: saved by the first press — the piece is no longer on the board's lists (it split)
          onReused: (b2) => (!(b2 && ((b2.hub || []).some((h) => h.piece_id === pid) || (b2.waiting || []).some((w) => w.piece_id === pid))) ? { piece_id: pid } : null),
        });
      }
    });
    _open = true;                       // the panel comes back open after the re-read of a save
    draw();
    k.place(d);
    k.gate(d);
    return d;
  }

  window.WN5Hub = { shelfHTML, open, close, split, _truck, tick, more, toPanel, nfDay, nfWin, nfHm, nfDrop, nfReset, nfLater, nfAddOpen, nfPick, nfCreate };
})();
