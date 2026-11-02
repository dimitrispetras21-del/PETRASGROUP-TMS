// modules/wn5_compose.js — National v5: «Σύνθεση φορτίων» (owner 2/11, «Ναι, πάμε»), a DRAFT for the owner's
// approval, behind localStorage tms_wn5_compose = '1' (this browser only; never on by default). It replaces the
// Veroia board's drawing while on (WN5Hub.shelfHTML hands over), nothing else.
//
// Why (owner 2/11): the Veroia board REBUILDS loads — it takes pieces and makes NEW loads, most often before anyone
// knows the truck. So the first move is «Νέο φορτίο» WITHOUT a truck (083 new_rt.later): the load goes to the
// Weekly as ΠΡΟΣ ΑΝΑΘΕΣΗ and gets its truck there. A truck now is optional (the day's trucks, or the one form).
// Two sides: ΚΑΘΟΔΟΣ = what stands at the point (VS imports to split by destination, stock); ΑΝΟΔΟΣ = groupage
// pickups in the South to bring to the point. The point is a parameter (pt): today Veroia, tomorrow any transfer
// point (transfer-any-point reuses this panel) — nothing below names Veroia except the words of the screen.
//
// Rules (as wn5_veroia.js): nothing at load; inline handlers start with the WN5.active() guard; one write, POST
// /plan/legs (plan_put_pieces), the request built by the assignment engine (WN5Assign.forChoice: one rule for both);
// a refusal stays in the panel with the Worker's words; colours only through classes of assets/style.css.
(function () {
  'use strict';
  const K = () => WN5Act._kit;
  const _live = () => typeof WN5 !== 'undefined' && WN5.active();
  const CAP = 33;
  const SIDE_GR = { KATHODOS: 'ΚΑΘΟΔΟΣ', ANODOS: 'ΑΝΟΔΟΣ' };
  function on() { try { return localStorage.getItem('tms_wn5_compose') === '1'; } catch (_) { return false; } }
  // memory only: survives a re-read of the board; a piece no longer on the board leaves the selection
  const S = { open: false, side: 'KATHODOS', sel: { KATHODOS: [], ANODOS: [] }, day: { KATHODOS: null, ANODOS: null }, choice: { KATHODOS: null, ANODOS: null }, trucks: false, busy: false };

  // ═══ the pieces of each side, for a point pt ═══
  // ΚΑΘΟΔΟΣ: at the point and waiting to leave it (at the hub: the board's hub[] split + stock, P-11 kept: a VS not
  // sent here is a ΠΡΟΣ ΑΝΑΘΕΣΗ row of the Weekly and is only counted); ΑΝΟΔΟΣ: waiting elsewhere, its side ΑΝΟΔΟΣ
  function _rows(model, pt, side) {
    const k = K(), hub = k.hubId(), st = WN5.state(), board = (st && st.board) || {};
    if (side === 'KATHODOS') {
      if (pt === hub) return [...(model.hub.split || []), ...(model.hub.stock || [])].map((h) => ({ pid: h.pieceId, h, raw: k.item(h.pieceId) || {} }));
      return (board.waiting || []).filter((w) => w.position_location_id === pt && WN5L.waitSide(w, hub) === 'KATHODOS').map((w) => ({ pid: w.piece_id, h: w, raw: w }));
    }
    return (board.waiting || []).filter((w) => w.position_location_id !== pt && WN5L.waitSide(w, hub) === 'ANODOS').map((w) => ({ pid: w.piece_id, h: w, raw: w }));
  }
  // VS imports at the point never sent to this panel (P-11): counted on the line, never listed twice
  function _unsent(model) {
    const st = WN5.state(), ids = new Set((model.hub.split || []).map((h) => h.pieceId));
    return ((st && st.board && st.board.hub) || []).filter((h) => h.is_stock !== true && !ids.has(h.piece_id) && h.kind === 'vs_import').length;
  }
  // a row's day: ΚΑΘΟΔΟΣ its day at the point (a VS's cross-dock, stock its leave day), ΑΝΟΔΟΣ its pickup day
  function _dayOf(r, side) {
    const k = K();
    if (side === 'ANODOS') return r.raw.nat_ready_day || k.ymdOf(r.raw.load_from) || null;
    if (r.raw.is_stock) return r.h.leave_by || null;
    const vh = k.vsHubDay(r.raw);
    return (vh && vh.day) || r.raw.nat_ready_day || r.raw.nat_due_day || null;
  }
  const _late = (r, today) => r.h.overdue === true || !!(r.raw.nat_due_day && today && r.raw.nat_due_day < today);
  const _tempOf = (raw) => (raw.temperature_c == null || !isFinite(Number(raw.temperature_c)) ? '' : String(Number(raw.temperature_c)).replace('.', ',') + ' °C');
  const _place = (id) => { const k = K(); if (id == null) return '—'; const n = typeof PlanIds !== 'undefined' && PlanIds.place(id); return (n && n.name) || k.placeName(id) || '—'; };
  const _pal = (r) => (r.h.pallets != null ? r.h.pallets : r.raw.pallets);
  // the client and the temperature most rows share: said once in the column head, a row names them only when it differs
  function _common(rows) {
    const mode = (xs) => { const c = new Map(); for (const x of xs) if (x) c.set(x, (c.get(x) || 0) + 1); let b = null; for (const [x, n] of c) if (!b || n > b[1]) b = [x, n]; return b && b[1] > 1 ? b[0] : null; };
    return { client: mode(rows.map((r) => r.raw.client || r.h.client)), temp: mode(rows.map((r) => _tempOf(r.raw))) };
  }
  // ΑΝΟΔΟΣ: a piece whose end is past the point goes there to be cross-docked (to_hub: true); one whose end IS the
  // point simply ends there. Said on its row («→ Thessaloniki μέσω Βέροιας»), never decided silently.
  const _via = (raw, pt) => raw.nat_to_location_id != null && raw.nat_to_location_id !== pt;

  function _rowHTML(r, side, pt, today, com) {
    const k = K(), raw = r.raw, pid = k.id(r.pid);
    if (!pid) { k.log(new Error('wn5: compose row without a valid piece id ' + JSON.stringify(r.pid)), 'WN5Compose row'); return ''; }
    const on = S.sel[side].includes(pid), late = _late(r, today);
    const loc = side === 'KATHODOS' ? raw.nat_to_location_id : raw.position_location_id;
    const name = _place(loc), city = loc != null ? k.placeCity(loc) : '';
    const cl = raw.client || r.h.client;
    const who = cl && cl !== com.client ? cl : '';
    const to = side === 'ANODOS' ? (_via(raw, pt) ? '→ ' + (k.placeCity(raw.nat_to_location_id) || _place(raw.nat_to_location_id)) + ' μέσω Βέροιας' : '→ Βέροια') : '';
    const sub = [who, to].filter(Boolean).join(' · ');
    const when = side === 'ANODOS'
      ? (raw.load_from ? k.dayShort(k.ymdOf(raw.load_from)) + ' ' + k.hmw(raw.load_from, raw.load_to) : k.dayShort(raw.nat_ready_day))
      : raw.is_stock ? (r.h.leave_by ? 'φεύγει ως ' + k.dayShort(r.h.leave_by) : 'απόθεμα')
        : raw.deliver_from ? k.dayShort(k.ymdOf(raw.deliver_from)) + ' ' + k.hmw(raw.deliver_from, raw.deliver_to) : (raw.nat_due_day ? k.dayShort(raw.nat_due_day) : '—');
    const t0 = _tempOf(raw), tmp = t0 && t0 !== com.temp ? t0 : '';
    const more = side === 'KATHODOS' && !raw.is_stock && pt === k.hubId()
      ? '<button type="button" class="wi4-btn sm wn5-hub-b wn5-hub-more" data-hub="more" aria-label="Περισσότερα" onclick="event.stopPropagation();WN5Hub.more(' + pid + ', this)">⋯</button>' : '';
    return '<div class="wn5-hub-it wn5-cr' + (on ? ' on' : '') + (late ? ' late' : '') + '" data-piece="' + pid + '">'
      + '<input type="checkbox" class="wn5-hub-ck" aria-label="Στο νέο φορτίο"' + (on ? ' checked' : '') + ' onclick="event.stopPropagation();WN5Compose.tick(' + pid + ', this.checked)">'
      + '<span class="wn5-cr-a"><b>' + k.esc(name) + (city && city !== name ? '<i> · ' + k.esc(city) + '</i>' : '') + '</b>' + (sub ? '<span>' + k.esc(sub) + '</span>' : '') + '</span>'
      + '<span class="wn5-cr-w"><span>' + k.esc(when) + '</span>' + (late ? '<em>' + (raw.is_stock ? 'έπρεπε να φύγει' : 'αργό') + '</em>' : '') + '</span>'
      + '<span class="wn5-hub-sp"></span>' + (tmp ? '<span class="wn5-cr-t">' + k.esc(tmp) + '</span>' : '')
      + '<span class="wn5-hub-p">' + k.esc(k.pal(_pal(r))) + 'π</span>'
      // the row's own moves: on the row the mouse is on, or a ticked one (owner 2/11: less on screen)
      + '<span class="wn5-hub-a wn5-cr-acts"><button type="button" class="wi4-btn sm wn5-hub-b" data-cmp="truck" onclick="event.stopPropagation();WN5Compose.truck(' + pid + ', this)">Σε φορτηγό ▾</button>' + more + '</span></div>';
  }

  // ═══ the load being built ═══
  const _pt = () => K().hubId();
  const _pieces = (side, pt) => S.sel[side].map((id) => { const it = K().item(id) || {}; return side === 'ANODOS' && _via(it, pt) ? { piece_id: id, to_hub: true } : { piece_id: id }; });
  function _defDay(model, side) {
    const k = K(), today = model.today || null, all = _rows(model, _pt(), side);
    const ds = S.sel[side].map((id) => { const r = all.find((x) => x.pid === id); return r ? _dayOf(r, side) : null; }).filter(Boolean).sort();
    // ΚΑΘΟΔΟΣ leaves the point on its earliest day, never before today; ΑΝΟΔΟΣ arrives the day of its last pickup
    let d = (side === 'ANODOS' ? ds[ds.length - 1] : ds[0]) || today || model.week;
    if (side === 'KATHODOS' && today && d < today) d = today;
    if (model.week) { const last = k.addDays(model.week, 6); if (d < model.week) d = model.week; else if (d > last) d = last; }
    return d;
  }
  const _ctx = (side) => ({ day: S.day[side], side, hub: { day: S.day[side], from: '00:00', to: '23:59' } });
  const _plan = (side, pt) => (S.sel[side].length && S.day[side] ? WN5Assign.forChoice(_pieces(side, pt), _ctx(side), S.choice[side] || { who: 'later' }) : null);
  // the stops in the order the base gives them (072 plan_h_reseq: by start), each with what happens there
  function _stops(req, side, pt) {
    const k = K();
    if (!req || req.missing || !req.body) return [];
    const cyc = req.body.target && req.body.target.rt_id != null ? k.cycle(req.body.target.rt_id) : null;
    const mine = (req.body.stops || []).map((s) => {
      const ex = s.stop_id != null && cyc ? (cyc.stops || []).find((x) => x.stop_id === s.stop_id) : null;
      return ex ? { loc: ex.location_id, from: ex.planned_from, to: ex.planned_to } : { loc: s.location_id, from: s.planned_from, to: s.planned_to };
    });
    const loads = new Set(S.sel[side].map((id) => { const it = k.item(id) || {}; return it.at_hub ? pt : it.position_location_id; }));
    return mine.sort((a, b) => Date.parse(a.from) - Date.parse(b.from)).map((s) => ({
      name: s.loc === pt ? 'Βέροια' : (k.placeCity(s.loc) || _place(s.loc)), act: loads.has(s.loc) ? 'φόρτωση' : 'παράδοση',
      day: k.dayShort(k.ymdOf(s.from)), win: WN5L.allDay(s.from, s.to) ? '' : k.hmw(s.from, s.to) }));
  }
  function _temps(side) {
    const ts = [...new Set(S.sel[side].map((id) => (K().item(id) || {}).temperature_c).filter((t) => t != null && isFinite(Number(t))).map(Number))].sort((a, b) => a - b);
    return ts.length ? { txt: (ts.length > 1 ? ts[0] + '–' + ts[ts.length - 1] : String(ts[0])).replace(/\./g, ',') + ' °C', mixed: ts[ts.length - 1] - ts[0] >= 2 } : null;
  }
  // the trucks that load at the point that day (ΚΑΘΟΔΟΣ at the hub: the model's Veroia stop of the day)
  function _dayTrucks(day, side, pt) {
    const k = K();
    if (side !== 'KATHODOS' || pt !== k.hubId() || !day) return [];
    return k.dayRows(day).filter((r) => r.kath && r.kath.veroia).map((r) => {
      const c = k.cycle(r.rtId);
      return c && c.trip_type !== 'PARTNER' && c.truck_id != null ? { c, r, pal: k.sidePal(r, 'KATHODOS'), unk: k.sideUnk(r, 'KATHODOS'), win: k.veroiaOf(r, 'KATHODOS') } : null;
    }).filter(Boolean);
  }
  function _buildHTML(model, side, pt) {
    const k = K(), sel = S.sel[side];
    let h = '<div class="wn5-nf wn5-cb"><div class="wn5-nf-hd"><span class="wn5-nf-t">ΝΕΟ ΦΟΡΤΙΟ · ' + SIDE_GR[side] + '</span><span class="wn5-hub-sp"></span>'
      + (sel.length ? '<button type="button" class="wi4-link wn5-cb-clr" onclick="WN5Compose.reset()">Καθαρισμός</button>' : '') + '</div>';
    if (!sel.length) return h + '<p class="wn5-cb-empty">Τσέκαρε φορτία αριστερά. Το νέο φορτίο πάει στο Weekly ως «προς ανάθεση»· το φορτηγό δίνεται εκεί ή εδώ.</p></div>';
    if (!S.day[side]) S.day[side] = _defDay(model, side);
    const items = sel.map((id) => k.item(id)).filter(Boolean);
    const pal = k.sum(items.map((x) => x.pallets)), unk = items.filter((x) => x.pallets == null).length;
    const p = _plan(side, pt), ln = p && p.line;
    const after = ln ? Number(String(ln.after).replace(',', '.').replace(/\+.*$/, '')) : pal;
    const wk = model.week, days = wk ? [0, 1, 2, 3, 4, 5, 6].map((i) => k.addDays(wk, i)) : [S.day[side]];
    h += '<div class="wn5-nf-row"><span class="wn5-nf-l">' + (side === 'KATHODOS' ? 'Φεύγει από Βέροια' : 'Φτάνει στη Βέροια') + '</span><select class="wn5-nf-day" onchange="WN5Compose.setDay(this.value)">'
      + days.map((d) => '<option value="' + d + '"' + (d === S.day[side] ? ' selected' : '') + '>' + k.esc(k.dayShort(d)) + '</option>').join('') + '</select></div>';
    // the stops, in road order
    const st = p && p.req ? _stops(p.req, side, pt) : [];
    if (st.length) h += '<ol class="wn5-cb-stops">' + st.map((s) => '<li><b>' + k.esc(s.name) + '</b><span>' + k.esc(s.act + ' · ' + s.day + (s.win ? ' ' + s.win : '')) + '</span></li>').join('') + '</ol>';
    // pallets against 33: a bar, amber over (a warning, never a refusal: 072 over_33); °C only when mixed
    const pct = Math.max(0, Math.min(100, Math.round((after / CAP) * 100)));
    const tp = _temps(side);
    h += '<div class="wn5-cb-cap' + (after > CAP ? ' over' : '') + '"><span class="wn5-cb-bar"><i style="width:' + pct + '%"></i></span><b>' + k.esc((ln ? ln.after : WN5L.palText(pal, unk)) + '/33') + '</b>'
      + '<span>' + k.esc(after <= CAP ? k.pal(CAP - after) + ' ελεύθερες' : 'υπέρβαση ' + k.pal(after - CAP)) + '</span>'
      + (tp && tp.mixed ? '<span class="wn5-cb-mix">' + k.esc(tp.txt + ' μικτές') + '</span>' : '') + '</div>';
    // the truck: none by default; the day's trucks for whoever wants one now; or the one form (own or partner)
    const ch = S.choice[side];
    if (ch && ch.who !== 'later' && p && p.label) {
      h += '<div class="wn5-cb-tr"><span>Φορτηγό</span><b class="wn5a-mono">' + k.esc(p.label) + '</b>'
        // the truck stops at the point another day: the load goes to THAT stop (decision 6) — said, never silent
        + (ln && ln.other ? '<span class="wn5-soft">' + k.esc('φορτώνει ' + ln.other + ', όχι ' + k.dayShort(S.day[side])) + '</span>' : '')
        + '<span class="wn5-hub-sp"></span><button type="button" class="wi4-link" onclick="WN5Compose.noTruck()">χωρίς φορτηγό</button></div>';
    }
    const tr = _dayTrucks(S.day[side], side, pt);
    h += '<div class="wn5-cb-more">' + (side === 'KATHODOS' ? '<button type="button" class="wi4-link" data-cmp="trucks" onclick="WN5Compose.toggleTrucks()">' + (S.trucks ? '▾' : '▸') + ' Φορτηγά της ημέρας' + (tr.length ? ' · ' + tr.length : '') + '</button>' : '')
      + '<button type="button" class="wi4-link" data-cmp="pick" onclick="WN5Compose.pick(this)">Φορτηγό ή συνεργάτης…</button></div>';
    if (S.trucks && side === 'KATHODOS') {
      h += tr.length ? tr.map((t) => '<button type="button" class="wn5-cb-card" data-rt="' + t.c.rt_id + '" onclick="WN5Compose.useTruck(' + t.c.rt_id + ')"><b class="wn5a-mono">' + k.esc(k.cycText(t.c, t.r).l1.split(' · ')[0]) + '</b><span>'
        + k.esc((t.win || '') + ' · ' + WN5L.palText(t.pal, t.unk) + '/33') + '</span><span class="wn5-hub-sp"></span><span class="wn5-cb-free">' + k.esc(t.pal < CAP ? k.pal(CAP - t.pal) + ' ελεύθερες' : 'γεμάτο') + '</span></button>').join('')
        : '<p class="wn5-cb-empty">' + k.esc('Κανένα φορτηγό δεν φορτώνει στη Βέροια ' + k.dayShort(S.day[side])) + '</p>';
    }
    const words = !p ? [] : p.err ? [p.err.message] : (p.problems ? p.problems.words.slice() : []);
    if (p && p.req && p.req.missing && !words.length) words.push('ημέρα ή τόπος');
    const can = !!(p && p.req && !p.req.missing && !words.length && !S.busy && !k.closedErr());
    const soft = !words.length && p && p.busy ? p.busy.text : '';
    const to = ch && ch.who !== 'later' && p && p.label ? ' → ' + p.label : ' → προς ανάθεση';
    h += '<div class="wn5-nf-msg" data-cmsg></div><div class="wn5-nf-ft"><span class="wn5a-miss' + (soft ? ' wn5-soft' : '') + '" data-cwhy>' + k.esc(words.length ? 'Λείπει: ' + words.join(', ') : soft) + '</span>'
      + '<button type="button" class="wi4-btn pri" data-act="cmp-create"' + (can ? '' : ' disabled') + ' onclick="WN5Compose.create()">' + k.esc('Δημιουργία φορτίου · ' + WN5L.palText(pal, unk) + 'π' + to) + '</button></div></div>';
    return h;
  }

  // ═══ the panel ═══
  function html(model) {
    const k = K(), pt = _pt(), today = model.today || null;
    const rows = { KATHODOS: _rows(model, pt, 'KATHODOS'), ANODOS: _rows(model, pt, 'ANODOS') };
    for (const sd of ['KATHODOS', 'ANODOS']) {
      const ids = new Set(rows[sd].map((r) => r.pid));
      S.sel[sd] = S.sel[sd].filter((id) => ids.has(id));
      if (!S.sel[sd].length) { S.day[sd] = null; S.choice[sd] = null; }
    }
    const unsent = _unsent(model);
    const n = { KATHODOS: rows.KATHODOS.length, ANODOS: rows.ANODOS.length };
    if (!n.KATHODOS && !n.ANODOS && !unsent) return '';
    const pal = (rs) => WN5L.palText(k.sum(rs.map(_pal)), rs.filter((r) => _pal(r) == null).length);
    const late = rows.KATHODOS.filter((r) => _late(r, today)).length + rows.ANODOS.filter((r) => _late(r, today)).length;
    const sum = [n.KATHODOS ? 'ΚΑΘΟΔΟΣ ' + n.KATHODOS + ' στη Βέροια · ' + pal(rows.KATHODOS) + 'π' : null,
      n.ANODOS ? 'ΑΝΟΔΟΣ ' + n.ANODOS + ' προς Βέροια · ' + pal(rows.ANODOS) + 'π' : null,
      unsent ? unsent + ' ακόμη στο Weekly' : null].filter(Boolean).join(' · ');
    const lateTxt = late ? '<span class="wn5-cmp-late">' + late + (late === 1 ? ' αργό' : ' αργά') + '</span>' : '';
    if (!S.open) {
      return '<div id="wn5-hub" class="wn5-hub wn5-cmp"><button type="button" class="wn5-hub-t" data-cmp="open" onclick="WN5Compose.open()">'
        + '<svg class="wn5-hub-chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 9L7.5 6L4.5 3" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        + '<span class="wn5-hub-n">ΣΥΝΘΕΣΗ ΦΟΡΤΙΩΝ</span></button><span class="wn5-hub-s">· ' + k.esc(sum) + '</span>' + lateTxt + '<span class="wn5-hub-sp"></span>'
        + '<button type="button" class="wi4-link wn5-hub-o" data-cmp="open" onclick="WN5Compose.open()">Άνοιγμα ▸</button></div>';
    }
    const side = S.side, rs = rows[side], com = _common(rs);
    const by = new Map();
    for (const r of rs) { const d = (r.raw.is_stock ? '~stock' : _dayOf(r, side)) || '—'; if (!by.has(d)) by.set(d, []); by.get(d).push(r); }
    const groups = [...by.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    let left = '<div class="wn5-cr-cols"><span class="wn5-cr-c0" title="τσέκαρε για νέο φορτίο">νέο</span><span class="wn5-cr-c1">' + (side === 'KATHODOS' ? 'ΠΑΡΑΛΗΠΤΗΣ' : 'ΦΟΡΤΩΣΗ')
      + (com.client ? ' · ' + k.esc(com.client) : '') + (com.temp ? ' · ' + k.esc(com.temp) : '') + '</span><span class="wn5-cr-c2">' + (side === 'KATHODOS' ? 'ΠΑΡΑΔΟΣΗ' : 'ΗΜΕΡΑ') + '</span><span class="wn5-hub-sp"></span><span>ΠΑΛ.</span></div>';
    left += groups.map(([d, list]) => {
      const lt = list.filter((r) => _late(r, today)).length;
      const head = d === '~stock' ? 'Απόθεμα' : d === '—' ? '—' : k.dayShort(d);
      return '<div class="wn5-hub-gh wn5-cr-gh">' + k.esc(head + ' · ' + list.length + ' · ' + pal(list) + 'π') + (lt ? '<em>' + (lt === list.length ? 'αργά' : lt + ' αργά') + '</em>' : '') + '</div>'
        + list.map((r) => _rowHTML(r, side, pt, today, com)).join('');
    }).join('') || '<p class="wn5-cb-empty wn5-cr-none">' + (side === 'KATHODOS' ? 'Τίποτα στη Βέροια για φόρτωση.' : 'Καμία φόρτωση ΑΝΟΔΟΥ σε αναμονή.') + '</p>';
    const tab = (sd) => '<button type="button" class="wn5-cmp-tab' + (sd === side ? ' on' : '') + '" data-side="' + sd + '" onclick="WN5Compose.setSide(\'' + sd + '\')">' + SIDE_GR[sd] + ' · ' + n[sd] + '</button>';
    return '<div id="wn5-hub" class="wn5-hub wn5-cmp open"><div id="wn5-hub-panel" class="wn5-hub-panel v2" role="region" aria-label="Σύνθεση φορτίων">'
      + '<div class="wn5-hub-hd"><span class="wn5-hub-g2" aria-hidden="true">▾</span><span class="wn5-hub-n">ΣΥΝΘΕΣΗ ΦΟΡΤΙΩΝ</span>' + tab('KATHODOS') + tab('ANODOS')
      + (unsent ? '<span class="wn5-hub-s2">· ' + k.esc(unsent + ' ακόμη στο Weekly') + '</span>' : '') + lateTxt + '<span class="wn5-hub-sp"></span>'
      + '<button type="button" class="wi4-btn sm wn5-hub-x" data-cmp="close" onclick="WN5Compose.close()">Κλείσιμο</button></div>'
      + '<div class="wn5-hub-g"><div class="wn5-hub-l">' + left + '</div><div class="wn5-hub-r">' + _buildHTML(model, side, pt) + '</div></div></div></div>';
  }
  function _redraw() {
    const el = document.getElementById('wn5-hub'), st = WN5.state();
    if (!el || !st || !st.model) return;
    const l = el.querySelector('.wn5-hub-l'), top = l ? l.scrollTop : 0;
    el.outerHTML = html(st.model) || '<div id="wn5-hub" hidden></div>';
    const nl = document.querySelector('#wn5-hub .wn5-hub-l');
    if (nl) nl.scrollTop = top;
  }

  // ═══ actions (every one starts with the WN5.active() guard) ═══
  function open() { if (!_live()) return; S.open = true; _redraw(); }
  function close() { if (!_live()) return; S.open = false; _redraw(); }
  function setSide(sd) { if (!_live() || !SIDE_GR[sd]) return; S.side = sd; _redraw(); }
  function tick(pid, onv) {
    if (!_live()) return;
    const id = K().id(pid), sd = S.side;
    if (!id) return;
    S.sel[sd] = S.sel[sd].filter((x) => x !== id);
    if (onv) S.sel[sd].push(id);
    if (!S.sel[sd].length) { S.day[sd] = null; S.choice[sd] = null; }
    _redraw();
  }
  function setDay(v) { if (!_live() || !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return; S.day[S.side] = v; _redraw(); }
  function reset() { if (!_live()) return; const sd = S.side; S.sel[sd] = []; S.day[sd] = null; S.choice[sd] = null; _redraw(); }
  function toggleTrucks() { if (!_live()) return; S.trucks = !S.trucks; _redraw(); }
  function noTruck() { if (!_live()) return; S.choice[S.side] = null; _redraw(); }
  // a card of the day's trucks: that truck, its trailer and driver; the engine joins its load there (decision 6)
  function useTruck(rtId) {
    if (!_live()) return;
    const c = K().cycle(K().id(rtId));
    if (!c) return;
    S.choice[S.side] = { who: 'own', truck: c.truck_id, trailer: c.trailer_id || null, driver: c.driver_id || null };
    _redraw();
  }
  function pick() {
    if (!_live() || !S.sel[S.side].length || typeof WN5Assign === 'undefined') return;
    const sd = S.side;
    WN5Assign.pick(_pieces(sd, _pt()), Object.assign(_ctx(sd), { anchor: null, choice: S.choice[sd] })).then((choice) => { if (choice) { S.choice[sd] = choice; _redraw(); } });
  }
  // a row's own «Σε φορτηγό ▾»: the one assignment form, for that piece alone, on its day and side
  function truck(pid, anchor) {
    if (!_live()) return null;
    const id = K().id(pid), sd = S.side, st = WN5.state();
    if (sd === 'KATHODOS' && typeof WN5Hub !== 'undefined') return WN5Hub._truck(id, anchor);
    const r = st && st.model ? _rows(st.model, _pt(), sd).find((x) => x.pid === id) : null;
    return WN5Act.assign({ pieces: [{ piece_id: id }] }, { entry: 'hub', day: r ? _dayOf(r, sd) : null, side: sd, anchor: anchor || null });
  }
  // «Δημιουργία φορτίου»: ONE POST /plan/legs, no truck by default (083 new_rt.later); an overlap shown in the footer
  // goes with accept_busy (Π2); a refusal stays in the panel with the Worker's words, the next press is the user's
  async function create() {
    if (!_live() || S.busy) return;
    const k = K(), sd = S.side, pt = _pt();
    const p = _plan(sd, pt);
    if (!p || !p.req || p.req.missing || (p.problems && p.problems.words.length)) return;
    if (k.closedErr()) { WN5Act.strip(document.querySelector('#wn5-hub [data-cmsg]'), k.closedErr()); return; }
    const shown = (document.querySelector('#wn5-hub [data-cwhy]') || {}).textContent || '';
    const req = k.busySend(p.req, p.busy, shown);
    S.busy = true;
    const btn = document.querySelector('#wn5-hub [data-act="cmp-create"]');
    if (btn) btn.disabled = true;
    let out;
    try { out = await planFetch(req.method, req.path, { body: req.body }); }
    catch (e) {
      S.busy = false;
      if (e && e._sessionGone) return;
      _redraw();
      WN5Act.strip(document.querySelector('#wn5-hub [data-cmsg]'), e);
      return;
    }
    S.busy = false;
    const later = !(S.choice[sd] && S.choice[sd].who !== 'later');
    S.sel[sd] = []; S.day[sd] = null; S.choice[sd] = null;
    await k.afterSave(out, later ? 'Δημιουργήθηκε το φορτίο · προς ανάθεση στο Weekly' : 'Δημιουργήθηκε το φορτίο', { intl: true });
  }

  window.WN5Compose = Object.freeze({ on, html, open, close, setSide, tick, setDay, reset, toggleTrucks, noTruck, useTruck, pick, truck, create });
})();
