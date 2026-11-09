// modules/wn5_compose.js — National v5: «Σύνθεση φορτίων» on the SHARED draft loads of the base (102 + Worker #239,
// owner 2/11 «Ναι, ξεκίνα»), behind featureOn('WN_COMPOSE') (config.js: 'pilot' = the owner alone, 3/11; then true) or a
// browser with localStorage tms_wn5_compose = '1'. It replaces the Veroia board's drawing while on (WN5Hub.shelfHTML hands over), and
// gives the Weekly its «σε πρόχειρο» mark (markHTML, owner Ε1). Design: docs/national-v5/compose-drafts-design-2026-11-02.md.
//
// Why (owner 2/11): the Veroia board REBUILDS loads from parts, most often before anyone knows the truck. The user
// keeps 3–5 drafts open at once, moves parts between them, builds one over days (often for a day 3–4 days ahead) and
// creates them in one go. So a draft lives in the base (GET /plan/drafts), seen by everyone from every PC; it is not a
// trip — nothing reaches the Weekly as a load until «Δημιουργία» (POST /plan/drafts/:id/realize, one transaction).
// Two sides: ΚΑΘΟΔΟΣ = what stands at the point; ΑΝΟΔΟΣ = pickups elsewhere coming to it. Owner Ε2: an ΑΝΟΔΟΣ part
// whose end is past the point goes DIRECT to its end — never to_hub (the base refuses one: bad_input).
// The point is a parameter (pt): today Veroia, tomorrow any transfer point — nothing below names Veroia except the
// words of the screen.
//
// Rules (as wn5_veroia.js): nothing at load; inline handlers start with the WN5.active() guard; every write sends the
// version it read (102 draft_stale otherwise, never a silent overwrite) and is followed by a fresh read; the realize
// request is built by the assignment engine (WN5Assign.forChoice: one rule for both); a refusal is said with its
// Worker words and its code, never silence (principle 1); colours only through classes of assets/style.css.
(function () {
  'use strict';
  const K = () => WN5Act._kit;
  const _live = () => typeof WN5 !== 'undefined' && WN5.active();
  const CAP = 33;
  const SIDE_GR = { KATHODOS: 'ΚΑΘΟΔΟΣ', ANODOS: 'ΑΝΟΔΟΣ' };
  // 102 v_plan_draft_piece_state: the four states that block «Δημιουργία» until the part is taken out
  const BLOCK_GR = { dead: 'σβήστηκε', split: 'σπάστηκε', assigned: 'ανατέθηκε αλλού', moved: 'άλλαξε θέση' };
  function on() {
    if (typeof featureOn === 'function' && featureOn('WN_COMPOSE')) return true;
    try { return localStorage.getItem('tms_wn5_compose') === '1'; } catch (_) { return false; }
  }

  // rd: the last GET /plan/drafts (every point: the panel filters its own, the Weekly marks need all, Ε1). board: the
  // board object it was read for — a new board read (every save, ↻, another week) reads the drafts again.
  // sel: ticked rows of the left list (not in any draft). slots: one request_id per creation (create per side,
  // realize per draft), kept until a confirmed 200 (core/plan-api.js slot rule). Memory only.
  const S = { open: false, side: 'KATHODOS', sel: { KATHODOS: [], ANODOS: [] }, busy: false,
    rd: { st: 'idle', drafts: [], today: null, err: null, board: null, failAt: 0, set: new Set() },
    msg: null, res: null, tools: null, hist: {}, del: null, drag: null, slots: new Map() };
  let _rseq = 0;

  // ═══ the drafts read ═══
  // Kicked from the paint (html / markHTML), once per board object; a failed read waits 60 s or the user's
  // «Ξαναδιάβασε» (decision 44: no automatic retry storm, one app_errors row per try).
  function _kick() {
    const st = typeof WN5 !== 'undefined' ? WN5.state() : null, b = st && st.board;
    if (!b || S.rd.board === b || S.rd.st === 'loading') return;
    if (S.rd.st === 'err' && Date.now() - S.rd.failAt < 60000) return;
    _read();
  }
  async function _read() {
    const seq = ++_rseq, st = WN5.state(), b = st && st.board;
    S.rd.board = b; S.rd.st = 'loading';
    let ans = null, err = null;
    try { ans = await planFetch('GET', '/plan/drafts'); } catch (e) { err = e; }
    if (seq !== _rseq) return;                      // a newer read owns the panel
    if (err && err._sessionGone) { S.rd.st = 'idle'; return; }
    if (!err && (!ans || !Array.isArray(ans.drafts))) {
      err = K().clientErr('bad_answer', 'Η απάντηση των πρόχειρων δεν διαβάζεται — ενημέρωσε τον Δημήτρη');
      K().log(new Error('wn5: GET /plan/drafts answered without drafts[]'), 'WN5Compose read');
    }
    if (err) S.rd = { st: 'err', drafts: [], today: null, err, board: b, failAt: Date.now(), set: new Set() };
    else {
      const ds = ans.drafts.filter((d) => d && K().id(d.draft_id));
      S.rd = { st: 'ok', drafts: ds, today: ans.today || null, err: null, board: b, failAt: 0, set: new Set(ds.flatMap((d) => (d.pieces || []).map((p) => p.piece_id))) };
    }
    S.hist = {};                                     // a history open before this read is older than it: asked again
    _fill();
    _redraw();
  }
  const _ok = () => S.rd.st === 'ok';
  const _find = (id) => S.rd.drafts.find((d) => d.draft_id === id) || null;
  // the parts of every live draft, every point (one live draft per part: 102 plan_draft_pieces_one)
  const _inSet = () => S.rd.set;

  // ═══ Ε1 (owner 2/11): a part in a draft stays a ΠΡΟΣ ΑΝΑΘΕΣΗ row of the Weekly, with a small grey «σε πρόχειρο» ═══
  // Drawn hidden and filled in place when the read lands (_fill): the drafts read never repaints the board, so a menu
  // or popover open meanwhile stays (the rule of 092's VS marks). The board (072 plan_board) does not change.
  function markHTML(pieceIds) {
    if (!on()) return '';
    const ids = (pieceIds || []).map(Number).filter((x) => Number.isSafeInteger(x) && x > 0);
    if (!ids.length) return '';
    _kick();
    const set = _inSet(), hit = _ok() && ids.some((x) => set.has(x));
    return '<span class="wn5-indraft" data-indraft="' + ids.join(',') + '"' + (hit ? '' : ' hidden') + ' title="Σε πρόχειρο φορτίο της «Σύνθεσης φορτίων»">σε πρόχειρο</span>';
  }
  function _fill() {
    const set = _inSet();
    for (const el of document.querySelectorAll('#content .wn5-indraft[data-indraft]')) {
      el.hidden = !(_ok() && String(el.dataset.indraft).split(',').some((x) => set.has(Number(x))));
    }
  }

  // ═══ the left list: parts waiting on each side for a point pt, not in any draft ═══
  // ΚΑΘΟΔΟΣ: at the point and waiting to leave it (at the hub: the board's hub[] split + stock, P-11 kept: a VS not
  // sent here is a ΠΡΟΣ ΑΝΑΘΕΣΗ row of the Weekly and is only counted); ΑΝΟΔΟΣ: waiting elsewhere, its side ΑΝΟΔΟΣ
  function _rows(model, pt, side) {
    const k = K(), hub = k.hubId(), st = WN5.state(), board = (st && st.board) || {}, inD = _inSet();
    let rs;
    if (side === 'KATHODOS') {
      rs = pt === hub ? [...(model.hub.split || []), ...(model.hub.stock || [])].map((h) => ({ pid: h.pieceId, h, raw: k.item(h.pieceId) || {} }))
        : (board.waiting || []).filter((w) => w.position_location_id === pt && WN5L.waitSide(w, hub) === 'KATHODOS').map((w) => ({ pid: w.piece_id, h: w, raw: w }));
    } else {
      rs = (board.waiting || []).filter((w) => w.position_location_id !== pt && WN5L.waitSide(w, hub) === 'ANODOS').map((w) => ({ pid: w.piece_id, h: w, raw: w }));
    }
    return rs.filter((r) => !inD.has(r.pid));
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
  const _city = (id) => (id == null ? '—' : K().placeCity(id) || _place(id));
  const _pal = (r) => (r.h.pallets != null ? r.h.pallets : r.raw.pallets);
  // the client and the temperature most rows share: said once in the column head, a row names them only when it differs
  function _common(rows) {
    const mode = (xs) => { const c = new Map(); for (const x of xs) if (x) c.set(x, (c.get(x) || 0) + 1); let b = null; for (const [x, n] of c) if (!b || n > b[1]) b = [x, n]; return b && b[1] > 1 ? b[0] : null; };
    return { client: mode(rows.map((r) => r.raw.client || r.h.client)), temp: mode(rows.map((r) => _tempOf(r.raw))) };
  }
  // ΑΝΟΔΟΣ (Ε2): the end of the part, said on its row — the point, or past it, and then the truck goes there direct
  const _toTxt = (raw, pt) => (raw.nat_to_location_id == null || raw.nat_to_location_id === pt ? '→ Βέροια' : '→ ' + _city(raw.nat_to_location_id));

  function _rowHTML(r, side, pt, today, com) {
    const k = K(), raw = r.raw, pid = k.id(r.pid);
    if (!pid) { k.log(new Error('wn5: compose row without a valid piece id ' + JSON.stringify(r.pid)), 'WN5Compose row'); return ''; }
    const onv = S.sel[side].includes(pid), late = _late(r, today);
    const loc = side === 'KATHODOS' ? raw.nat_to_location_id : raw.position_location_id;
    const name = _place(loc), city = loc != null ? k.placeCity(loc) : '';
    const cl = raw.client || r.h.client;
    const sub = [cl && cl !== com.client ? cl : '', side === 'ANODOS' ? _toTxt(raw, pt) : ''].filter(Boolean).join(' · ');
    const when = side === 'ANODOS'
      ? (raw.load_from ? k.dayShort(k.ymdOf(raw.load_from)) + ' ' + k.hmw(raw.load_from, raw.load_to) : k.dayShort(raw.nat_ready_day))
      : raw.is_stock ? (r.h.leave_by ? 'φεύγει ως ' + k.dayShort(r.h.leave_by) : 'απόθεμα')
        : raw.deliver_from ? k.dayShort(k.ymdOf(raw.deliver_from)) + ' ' + k.hmw(raw.deliver_from, raw.deliver_to) : (raw.nat_due_day ? k.dayShort(raw.nat_due_day) : '—');
    const t0 = _tempOf(raw), tmp = t0 && t0 !== com.temp ? t0 : '';
    const more = side === 'KATHODOS' && !raw.is_stock && pt === k.hubId()
      ? '<button type="button" class="wi4-btn sm wn5-hub-b wn5-hub-more" data-hub="more" aria-label="Περισσότερα" onclick="event.stopPropagation();WN5Hub.more(' + pid + ', this)">⋯</button>' : '';
    return '<div class="wn5-hub-it wn5-cr' + (onv ? ' on' : '') + (late ? ' late' : '') + '" data-piece="' + pid + '" draggable="true" ondragstart="WN5Compose.drag(event, ' + pid + ', 0)" ondragend="WN5Compose.dragEnd()">'
      + '<input type="checkbox" class="wn5-hub-ck" aria-label="Στο πρόχειρο φορτίο"' + (onv ? ' checked' : '') + ' onclick="event.stopPropagation();WN5Compose.tick(' + pid + ', this.checked)">'
      + '<span class="wn5-cr-a"><b>' + k.esc(name) + (city && city !== name ? '<i> · ' + k.esc(city) + '</i>' : '') + '</b>' + (sub ? '<span>' + k.esc(sub) + '</span>' : '') + '</span>'
      + '<span class="wn5-cr-w"><span>' + k.esc(when) + '</span>' + (late ? '<em>' + (raw.is_stock ? 'έπρεπε να φύγει' : 'αργό') + '</em>' : '') + '</span>'
      + '<span class="wn5-hub-sp"></span>' + (tmp ? '<span class="wn5-cr-t">' + k.esc(tmp) + '</span>' : '')
      + '<span class="wn5-hub-p">' + k.esc(k.pal(_pal(r))) + 'π</span>'
      // the row's own moves: on the row the mouse is on, or a ticked one (owner 2/11: less on screen)
      + '<span class="wn5-hub-a wn5-cr-acts"><button type="button" class="wi4-btn sm wn5-hub-b" data-cmp="truck" onclick="event.stopPropagation();WN5Compose.truck(' + pid + ', this)">Σε φορτηγό ▾</button>' + more + '</span></div>';
  }

  // ═══ a draft: its number, its engine request, its card ═══
  const _pt = () => K().hubId();
  const _drafts = (side) => S.rd.drafts.filter((d) => d.side === side && d.point_location_id === _pt());
  // «Φορτίο N»: the place of the draft on its side, in the read's order (day, id): the same for everyone who reads
  function _label(d) { const i = _drafts(d.side).indexOf(d); return i >= 0 ? 'Φορτίο ' + (i + 1) : 'Το πρόχειρο'; }
  // the vehicle INTENT of the draft (never an assignment: 102 keeps no busy check) as the engine's choice
  function _choiceOf(d) {
    if (d.partner_id != null) return { who: 'partner', partner: d.partner_id, rateTxt: '' };   // the rate is given on the Weekly
    if (d.truck_id != null) return { who: 'own', truck: d.truck_id, trailer: d.trailer_id || null, driver: d.driver_id || null };
    return { who: 'later' };
  }
  // the draft's day at the point and its window (none = the whole day, 093)
  const _ctxOf = (d) => ({ day: d.day, side: d.side, hub: { day: d.day, from: d.win_from || '00:00', to: d.win_to || '23:59' } });
  // A draft may be for a day beyond the loaded week: its parts are then not in the board's waiting[] (072 plan_board
  // reads up to the week's Friday), and the engine reads parts from the board (WN5Act kit item). The read gives each
  // part NOW in the shape of waiting[] (102 plan_h_draft_json), so the missing ones stand in the board for the one
  // synchronous call and leave in the same tick — never kept, never seen by a paint.
  function _withParts(d, fn) {
    const k = K(), st = k.state(), b = st && st.board;
    const add = b && Array.isArray(b.waiting) ? (d.pieces || []).filter((p) => p.piece && !k.item(p.piece_id)).map((p) => Object.assign({}, p.piece)) : [];
    if (!add.length) return fn();
    b.waiting.push(...add);
    try { return fn(); } finally { for (const x of add) { const i = b.waiting.indexOf(x); if (i >= 0) b.waiting.splice(i, 1); } }
  }
  // the realize request of a draft, or null while a part blocks or nothing is in it. Whole parts, no to_hub (Ε2): the
  // base refuses anything else (102 plan_draft_realize).
  let _memo = null;                                // html(): one engine call per draft per drawing
  function _plan(d) {
    if (_memo && _memo.has(d)) return _memo.get(d);
    const p = _plan0(d);
    if (_memo) _memo.set(d, p);
    return p;
  }
  function _plan0(d) {
    const ps = d.pieces || [];
    if (!ps.length || ps.some((p) => p.blocking || !p.piece) || typeof WN5Assign === 'undefined') return null;
    return _withParts(d, () => WN5Assign.forChoice(ps.map((p) => ({ piece_id: p.piece_id })), _ctxOf(d), _choiceOf(d)));
  }
  const _planOk = (p) => !!(p && p.req && !p.req.missing && !p.err && !(p.problems && p.problems.words.length));
  // the stops in the order the base gives them (072 plan_h_reseq: by start), each with what happens there
  function _stops(req, d) {
    const k = K(), pt = d.point_location_id;
    if (!req || req.missing || !req.body) return [];
    const loads = new Set((d.pieces || []).map((p) => (p.piece && p.piece.at_hub ? pt : p.piece && p.piece.position_location_id)));
    return (req.body.stops || []).map((s) => ({ loc: s.location_id, from: s.planned_from, to: s.planned_to }))
      .sort((a, b) => Date.parse(a.from) - Date.parse(b.from)).map((s) => ({
        name: s.loc === pt ? 'Βέροια' : _city(s.loc), act: loads.has(s.loc) ? 'φόρτωση' : 'παράδοση',
        day: k.dayShort(k.ymdOf(s.from)), win: WN5L.allDay(s.from, s.to) ? '' : k.hmw(s.from, s.to) }));
  }
  function _temps(d) {
    const ts = [...new Set((d.pieces || []).map((p) => p.piece && p.piece.temperature_c).filter((t) => t != null && isFinite(Number(t))).map(Number))].sort((a, b) => a - b);
    return ts.length ? { txt: (ts.length > 1 ? ts[0] + '–' + ts[ts.length - 1] : String(ts[0])).replace(/\./g, ',') + ' °C', mixed: ts[ts.length - 1] - ts[0] >= 2 } : null;
  }
  const _at = (ts) => { const k = K(); return ts ? k.dayShort(k.ymdOf(ts)) + ' ' + k.hm(ts) : ''; };
  function _name(kind, id) {
    if (id == null || typeof PlanIds === 'undefined') return '';
    try { const x = PlanIds.list(kind).find((v) => v.id === id); return x ? x.label : '#' + id; } catch (_) { return '#' + id; }
  }
  // the amber words of a part that changed at its source (102 changed[]): what it was in the snap → what it is now
  function _changeWords(p) {
    const k = K(), s = p.snap || {}, n = p.piece || {}, out = [];
    const day = (x) => (x ? k.dayShort(x) : '—');
    for (const f of p.changed || []) {
      if (f === 'pallets') out.push(k.pal(s.pallets) + ' → ' + k.pal(n.pallets) + ' παλέτες');
      else if (f === 'nat_due_day') out.push('παράδοση ' + day(s.nat_due_day) + ' → ' + day(n.nat_due_day));
      else if (f === 'nat_ready_day') out.push('φόρτωση ' + day(s.nat_ready_day) + ' → ' + day(n.nat_ready_day));
      else if (f === 'nat_to_location_id') out.push('τόπος παράδοσης ' + _city(s.nat_to_location_id) + ' → ' + _city(n.nat_to_location_id));
      else if (f === 'client_id') out.push('πελάτης ' + (_name('client', s.client_id) || '—') + ' → ' + (n.client || _name('client', n.client_id) || '—'));
      else out.push(String(f));                     // a field the screen does not know yet: said by its name, never dropped
    }
    return out;
  }

  function _partHTML(d, p, others) {
    const k = K(), n = p.piece || {}, s = p.snap || {}, pid = k.id(p.piece_id), id = d.draft_id;
    if (!pid) return '';
    // a dead part has no piece NOW: it is named by its snap
    const loc = d.side === 'KATHODOS' ? (p.piece ? n.nat_to_location_id : s.nat_to_location_id) : (p.piece ? n.position_location_id : s.position_location_id);
    const sub = [n.client || _name('client', s.client_id), n.reference, d.side === 'ANODOS' && p.piece ? _toTxt(n, d.point_location_id) : ''].filter(Boolean).join(' · ');
    const chg = !p.blocking ? _changeWords(p) : [];
    const cls = p.blocking ? ' blk' : chg.length ? ' chg' : '';
    let mark = '';
    if (p.blocking) mark = '<em class="wn5-cd-blk">' + k.esc((BLOCK_GR[p.state] || String(p.state || '')) + ' — βγάλ’ το για να γίνει φορτίο') + '</em>';
    else if (chg.length) {
      mark = '<em class="wn5-cd-chg">' + k.esc(chg.join(' · ')) + '</em>'
        + '<button type="button" class="wi4-link wn5-cd-ok" data-cd="ack" onclick="WN5Compose.ack(' + id + ', ' + pid + ')">Εντάξει</button>';
    }
    const mv = others.length ? '<select class="wn5-cd-mv" aria-label="Μετακίνηση σε άλλο πρόχειρο" onchange="WN5Compose.moveTo(' + id + ', ' + pid + ', this.value)"><option value="">→</option>'
      + others.map((o) => '<option value="' + o.draft_id + '">' + k.esc('→ ' + _label(o)) + '</option>').join('') + '</select>' : '';
    const pal = p.piece ? n.pallets : s.pallets;
    return '<div class="wn5-cd-p' + cls + '" data-piece="' + pid + '" draggable="true" ondragstart="WN5Compose.drag(event, ' + pid + ', ' + id + ')" ondragend="WN5Compose.dragEnd()">'
      + '<span class="wn5-cd-a"><b>' + k.esc(_place(loc)) + '</b>' + (sub ? '<span>' + k.esc(sub) + '</span>' : '') + mark + '</span>'
      + '<span class="wn5-hub-sp"></span><span class="wn5-hub-p">' + k.esc(k.pal(pal)) + 'π</span>'
      + '<span class="wn5-cd-acts">' + mv + '<button type="button" class="wi4-btn sm wn5-hub-b" data-cd="remove" aria-label="Αφαίρεση από το πρόχειρο" title="Αφαίρεση (πίσω στη λίστα)" onclick="WN5Compose.remove(' + id + ', ' + pid + ')">×</button></span></div>';
  }
  function _msgHTML(m) {
    if (!m) return '';
    const k = K();
    return '<div class="wn5-cmp-msg' + (m.kind === 'stale' ? ' stale' : '') + '" role="status" data-cmsg>' + k.esc(m.text)
      + (m.code ? ' <span class="wn5-cmp-code">' + k.esc(m.code) + '</span>' : '') + '</div>';
  }
  function _histHTML(id) {
    const k = K(), h = S.hist[id];
    if (!h) return '';
    if (h.loading) return '<div class="wn5-cd-hist"><span>Ιστορικό…</span></div>';
    if (h.err) return '<div class="wn5-cd-hist">' + _msgHTML(_words(h.err)) + '</div>';
    const word = (r) => {
      const a = r.after || {}, b = r.before || {};
      if (r.table === 'plan_drafts') {
        if (r.action === 'create') return 'νέο πρόχειρο · ' + k.dayShort(a.day);
        if (a.realized_at && !b.realized_at) return 'έγινε φορτίο';
        if (a.deleted_at && !b.deleted_at) return 'διαγραφή';
        const ch = [];
        if (a.day !== b.day) ch.push('ημέρα ' + k.dayShort(b.day) + ' → ' + k.dayShort(a.day));
        if (a.win_from !== b.win_from || a.win_to !== b.win_to) ch.push('ώρες');
        if (a.truck_id !== b.truck_id || a.partner_id !== b.partner_id || a.driver_id !== b.driver_id || a.trailer_id !== b.trailer_id) ch.push('φορτηγό');
        return ch.length ? ch.join(' · ') : 'αλλαγή φορτίων';
      }
      const what = '#' + (a.piece_id != null ? a.piece_id : b.piece_id);
      if (r.action === 'create') return '+ φορτίο ' + what;
      if (a.removed_reason) return '− φορτίο ' + what + ' (' + ({ manual: 'αφαίρεση', moved: 'μετακίνηση', realized: 'έγινε φορτίο', draft_deleted: 'διαγραφή πρόχειρου' }[a.removed_reason] || a.removed_reason) + ')';
      return 'Εντάξει σε αλλαγή ' + what;
    };
    const rows = (h.rows || []).map((r) => '<li><span>' + k.esc(_at(r.at)) + '</span><b>' + k.esc(r.actor || '—') + '</b><span>' + k.esc(word(r)) + '</span></li>');
    return '<div class="wn5-cd-hist"><ol>' + (rows.join('') || '<li><span>καμία γραμμή</span></li>') + '</ol></div>';
  }
  function _cardHTML(d, side, sel) {
    const k = K(), id = k.id(d.draft_id), ps = d.pieces || [];
    if (!id) return '';
    const others = _drafts(side).filter((o) => o !== d);
    const p = _plan(d), okp = _planOk(p);
    const pal = k.sum(ps.map((x) => (x.piece ? x.piece.pallets : null))), unk = ps.filter((x) => !x.piece || x.piece.pallets == null).length;
    const win = d.win_from && d.win_to ? d.win_from + '–' + d.win_to : 'όλη η ημέρα';
    const who = (d.created_by || '—') + (d.version > 1 && d.updated_by ? ' · αλλαγή: ' + d.updated_by + ' ' + _at(d.updated_at) : '');
    let h = '<div class="wn5-cd" data-draft="' + id + '" ondragover="WN5Compose.over(event)" ondrop="WN5Compose.drop(event, ' + id + ')">'
      + '<div class="wn5-cd-hd"><b class="wn5-cd-n">' + k.esc(_label(d)) + '</b>'
      + '<input type="date" class="wn5-cd-day" aria-label="' + (side === 'KATHODOS' ? 'Φεύγει από Βέροια' : 'Φτάνει στη Βέροια') + '" value="' + k.esc(d.day) + '" onchange="WN5Compose.setDay(' + id + ', this.value)">'
      + '<span class="wn5-cd-win">' + k.esc(win) + '</span>'
      // Ε4 (owner 2/11): «παλιό» only once its own day has passed (the base's old, Athens), amber, never auto-deleted
      + (d.old ? '<span class="wn5-cd-old" title="Η ημέρα του πρόχειρου πέρασε — δεν σβήνεται μόνο του">παλιό</span>' : '')
      + '<span class="wn5-hub-sp"></span><span class="wn5-cd-who">' + k.esc(who) + '</span>'
      + '<button type="button" class="wi4-btn sm wn5-hub-b" data-cd="tools" aria-label="Περισσότερα του πρόχειρου" onclick="WN5Compose.tools(' + id + ')">⋯</button></div>';
    if (S.tools === id) {
      const veh = d.truck_id != null || d.partner_id != null;
      h += '<div class="wn5-cd-tools"><span class="wn5-cd-tl">Ώρες</span>'
        + '<input class="wi-pop-inp wn5a-hm" data-cw="from" inputmode="numeric" placeholder="ΩΩ:ΛΛ" value="' + k.esc(d.win_from || '') + '" aria-label="Από">'
        + '<input class="wi-pop-inp wn5a-hm" data-cw="to" inputmode="numeric" placeholder="ΩΩ:ΛΛ" value="' + k.esc(d.win_to || '') + '" aria-label="Έως">'
        + '<button type="button" class="wi4-link" data-cd="win" onclick="WN5Compose.setWin(' + id + ', false)">Αποθήκευση ωρών</button>'
        + '<button type="button" class="wi4-link" data-cd="allday" onclick="WN5Compose.setWin(' + id + ', true)">Όλη η ημέρα</button>'
        + '<span class="wn5-hub-sp"></span>'
        + '<button type="button" class="wi4-link" data-cd="hist" onclick="WN5Compose.history(' + id + ')">Ιστορικό</button>'
        + (veh ? '<button type="button" class="wi4-link" data-cd="noveh" onclick="WN5Compose.noTruck(' + id + ')">χωρίς φορτηγό</button>' : '')
        + '<button type="button" class="wi4-link" data-cd="pick"' + (ps.length ? '' : ' disabled') + ' onclick="WN5Compose.pick(' + id + ', this)">Φορτηγό ή συνεργάτης…</button>'
        // Ε3 (owner 2/11): every role that writes on the Weekly deletes a draft — soft, with a trace; a second press
        + '<button type="button" class="wi4-link wn5-cd-del" data-cd="delete" onclick="WN5Compose.del(' + id + ')">' + (S.del === id ? 'Σίγουρα; Διαγραφή' : 'Διαγραφή') + '</button></div>';
      h += _histHTML(id);
    }
    h += ps.length ? '<div class="wn5-cd-ps">' + ps.map((x) => _partHTML(d, x, others)).join('') + '</div>'
      : '<p class="wn5-cb-empty">Άδειο: σύρε ή τσέκαρε φορτία αριστερά.</p>';
    if (sel.length) h += '<button type="button" class="wi4-link wn5-cd-add" data-cd="add" onclick="WN5Compose.addTo(' + id + ')">' + k.esc('+ ' + sel.length + ' τσεκαρισμένα εδώ') + '</button>';
    const st = okp ? _stops(p.req, d) : [];
    if (st.length) h += '<ol class="wn5-cb-stops">' + st.map((s) => '<li><b>' + k.esc(s.name) + '</b><span>' + k.esc(s.act + ' · ' + s.day + (s.win ? ' ' + s.win : '')) + '</span></li>').join('') + '</ol>';
    // pallets against 33: a bar, amber over (a warning, never a refusal: 072 over_33); °C only when mixed
    const pct = Math.max(0, Math.min(100, Math.round((pal / CAP) * 100))), tp = _temps(d);
    if (ps.length) {
      h += '<div class="wn5-cb-cap' + (pal > CAP ? ' over' : '') + '"><span class="wn5-cb-bar"><i style="width:' + pct + '%"></i></span><b>' + k.esc(WN5L.palText(pal, unk) + '/33') + '</b>'
        + '<span>' + k.esc(pal <= CAP ? k.pal(CAP - pal) + ' ελεύθερες' : 'υπέρβαση ' + k.pal(pal - CAP)) + '</span>'
        + (tp && tp.mixed ? '<span class="wn5-cb-mix">' + k.esc(tp.txt + ' μικτές') + '</span>' : '') + '</div>';
    }
    const blk = ps.filter((x) => x.blocking).length;
    const words = !ps.length ? ['φορτία'] : blk ? [blk + (blk === 1 ? ' φορτίο να βγει' : ' φορτία να βγουν')]
      : p && p.err ? [p.err.message] : p && p.problems ? p.problems.words.slice() : [];
    if (p && p.req && p.req.missing && !words.length) words.push('ημέρα ή τόπος');
    const soft = !words.length && p ? (p.soft || (p.busy ? p.busy.text : '')) : '';   // + «χωρίς οδηγό» (item 5, 8/11)
    const to = p && p.label ? ' → ' + p.label : ' → προς ανάθεση';
    const can = okp && d.ready === true && !S.busy && !k.closedErr();
    h += (S.msg && S.msg.id === id ? _msgHTML(S.msg) : '')
      + '<div class="wn5-nf-ft"><span class="wn5a-miss' + (soft ? ' wn5-soft' : '') + '" data-cwhy="' + id + '">' + k.esc(words.length ? 'Λείπει: ' + words.join(', ') : soft) + '</span>'
      + '<button type="button" class="wi4-btn pri" data-cd="realize"' + (can ? '' : ' disabled') + ' onclick="WN5Compose.realize(' + id + ')">' + k.esc('Δημιουργία · ' + WN5L.palText(pal, unk) + 'π' + to) + '</button></div></div>';
    return h;
  }
  // a draft «Δημιουργία όλων» counts: ready in the base (no blocking mark) AND a complete request here
  const _ready = (d) => d.ready === true && _planOk(_plan(d));

  function _rightHTML(model, side) {
    const k = K(), sel = S.sel[side];
    let h = '<div class="wn5-nf wn5-cb"><div class="wn5-nf-hd"><span class="wn5-nf-t">ΠΡΟΧΕΙΡΑ ΦΟΡΤΙΑ · ' + SIDE_GR[side] + '</span><span class="wn5-hub-sp"></span>'
      + (sel.length ? '<button type="button" class="wi4-link wn5-cb-clr" onclick="WN5Compose.reset()">Καθαρισμός</button>' : '')
      + '<button type="button" class="wi4-btn sm" data-cmp="new"' + (S.busy || !_ok() ? ' disabled' : '') + ' ondragover="WN5Compose.over(event)" ondrop="WN5Compose.drop(event, 0)" onclick="WN5Compose.create()">'
      + k.esc(sel.length ? '+ φορτίο με ' + sel.length : '+ φορτίο') + '</button></div>';
    if (S.rd.st === 'err') {
      const e = S.rd.err || {};
      return h + _msgHTML({ text: 'Τα πρόχειρα δεν διαβάστηκαν: ' + String(e.message || ''), code: e.code })
        + '<button type="button" class="wi4-link" data-cmp="reread" onclick="WN5Compose.reread()">Ξαναδιάβασε</button></div>';
    }
    if (!_ok()) return h + '<p class="wn5-cb-empty">Τα πρόχειρα διαβάζονται…</p></div>';
    // the drafts of the panel are those of its point: with no point known, «κανένα πρόχειρο» would be a lie
    if (_pt() == null) return h + _msgHTML({ text: 'Η Βέροια δεν είναι γνωστή ακόμη (ο κατάλογος δεν φορτώθηκε) — τα πρόχειρα δεν δείχνονται· ανανέωσε', code: 'hub_unknown' }) + '</div>';
    const ds = _drafts(side);
    if (S.msg && (S.msg.id == null || !ds.some((d) => d.draft_id === S.msg.id))) h += _msgHTML(S.msg);
    h += ds.length ? ds.map((d) => _cardHTML(d, side, sel)).join('')
      : '<p class="wn5-cb-empty">Κανένα πρόχειρο. Τσέκαρε φορτία αριστερά και πάτα «+ φορτίο». Τα πρόχειρα είναι κοινά: τα βλέπουν όλοι, από κάθε υπολογιστή.</p>';
    if (S.res) {
      // a draft that stayed is named by its number NOW (the numbers move once the others became loads), with its day
      h += '<ul class="wn5-cmp-res">' + S.res.map((r) => {
        const d = !r.ok && _find(r.id), lbl = d ? _label(d) : r.label;
        return '<li class="' + (r.ok ? 'ok' : 'no') + '">' + k.esc((r.ok ? '✓ ' : '✗ ') + lbl + ' · ' + k.dayShort(r.day) + r.rest)
          + (r.code ? ' <span class="wn5-cmp-code">' + k.esc(r.code) + '</span>' : '') + '</li>';
      }).join('') + '</ul>';
    }
    const n = ds.filter(_ready).length, no = ds.length - n;
    if (ds.length) {
      h += '<div class="wn5-nf-ft wn5-cmp-all"><span class="wn5a-miss">' + k.esc(no ? no + (no === 1 ? ' όχι έτοιμο' : ' όχι έτοιμα') : '') + '</span>'
        + '<button type="button" class="wi4-btn pri" data-cmp="all"' + (n && !S.busy && !k.closedErr() ? '' : ' disabled') + ' onclick="WN5Compose.realizeAll()">'
        + k.esc('Δημιουργία όλων (' + n + (n === 1 ? ' έτοιμο)' : ' έτοιμα)')) + '</button></div>';
    }
    return h + '</div>';
  }

  // ═══ the panel ═══
  function html(model) {
    _memo = new Map();
    try { return _html(model); } finally { _memo = null; }
  }
  function _html(model) {
    _kick();
    const k = K(), pt = _pt(), today = model.today || null;
    const rows = { KATHODOS: _rows(model, pt, 'KATHODOS'), ANODOS: _rows(model, pt, 'ANODOS') };
    for (const sd of ['KATHODOS', 'ANODOS']) { const ids = new Set(rows[sd].map((r) => r.pid)); S.sel[sd] = S.sel[sd].filter((id) => ids.has(id)); }
    const unsent = _unsent(model);
    const n = { KATHODOS: rows.KATHODOS.length, ANODOS: rows.ANODOS.length };
    const nd = { KATHODOS: _drafts('KATHODOS').length, ANODOS: _drafts('ANODOS').length };
    // nothing yet: a hidden place for the panel, so the drafts read that lands later can draw it (_redraw)
    if (!n.KATHODOS && !n.ANODOS && !unsent && !nd.KATHODOS && !nd.ANODOS && S.rd.st !== 'err') return '<div id="wn5-hub" hidden></div>';
    const pal = (rs) => WN5L.palText(k.sum(rs.map(_pal)), rs.filter((r) => _pal(r) == null).length);
    const late = rows.KATHODOS.filter((r) => _late(r, today)).length + rows.ANODOS.filter((r) => _late(r, today)).length;
    const sum = [n.KATHODOS ? 'ΚΑΘΟΔΟΣ ' + n.KATHODOS + ' στη Βέροια · ' + pal(rows.KATHODOS) + 'π' : null,
      n.ANODOS ? 'ΑΝΟΔΟΣ ' + n.ANODOS + ' προς Βέροια · ' + pal(rows.ANODOS) + 'π' : null,
      nd.KATHODOS + nd.ANODOS ? (nd.KATHODOS + nd.ANODOS) + ' πρόχειρα' : null,
      unsent ? unsent + ' ακόμη στο Weekly' : null].filter(Boolean).join(' · ');
    const lateTxt = late ? '<span class="wn5-cmp-late">' + late + (late === 1 ? ' αργό' : ' αργά') + '</span>' : '';
    if (!S.open) {
      return '<div id="wn5-hub" class="wn5-hub wn5-cmp"><button type="button" class="wn5-hub-t" data-cmp="open" onclick="WN5Compose.open()">'
        + '<svg class="wn5-hub-chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 9L7.5 6L4.5 3" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        + '<span class="wn5-hub-n">ΣΥΝΘΕΣΗ ΦΟΡΤΙΩΝ</span></button><span class="wn5-hub-s">· ' + k.esc(sum || 'τα πρόχειρα δεν διαβάστηκαν') + '</span>' + lateTxt + '<span class="wn5-hub-sp"></span>'
        + '<button type="button" class="wi4-link wn5-hub-o" data-cmp="open" onclick="WN5Compose.open()">Άνοιγμα ▸</button></div>';
    }
    const side = S.side, rs = rows[side], com = _common(rs);
    const by = new Map();
    for (const r of rs) { const d = (r.raw.is_stock ? '~stock' : _dayOf(r, side)) || '—'; if (!by.has(d)) by.set(d, []); by.get(d).push(r); }
    const groups = [...by.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    let left = '<div class="wn5-cr-cols"><span class="wn5-cr-c0" title="τσέκαρε για πρόχειρο φορτίο">✓</span><span class="wn5-cr-c1">' + (side === 'KATHODOS' ? 'ΠΑΡΑΛΗΠΤΗΣ' : 'ΦΟΡΤΩΣΗ')
      + (com.client ? ' · ' + k.esc(com.client) : '') + (com.temp ? ' · ' + k.esc(com.temp) : '') + '</span><span class="wn5-cr-c2">' + (side === 'KATHODOS' ? 'ΠΑΡΑΔΟΣΗ' : 'ΗΜΕΡΑ') + '</span><span class="wn5-hub-sp"></span><span>ΠΑΛ.</span></div>';
    left += groups.map(([d, list]) => {
      const lt = list.filter((r) => _late(r, today)).length;
      const head = d === '~stock' ? 'Απόθεμα' : d === '—' ? '—' : k.dayShort(d);
      return '<div class="wn5-hub-gh wn5-cr-gh">' + k.esc(head + ' · ' + list.length + ' · ' + pal(list) + 'π') + (lt ? '<em>' + (lt === list.length ? 'αργά' : lt + ' αργά') + '</em>' : '') + '</div>'
        + list.map((r) => _rowHTML(r, side, pt, today, com)).join('');
    }).join('') || '<p class="wn5-cb-empty wn5-cr-none">' + (side === 'KATHODOS' ? 'Τίποτα στη Βέροια για φόρτωση εκτός πρόχειρων.' : 'Καμία φόρτωση ΑΝΟΔΟΥ σε αναμονή εκτός πρόχειρων.') + '</p>';
    const tab = (sd) => '<button type="button" class="wn5-cmp-tab' + (sd === side ? ' on' : '') + '" data-side="' + sd + '" onclick="WN5Compose.setSide(\'' + sd + '\')">' + SIDE_GR[sd] + ' · ' + n[sd]
      + (nd[sd] ? ' · ' + nd[sd] + ' πρόχ.' : '') + '</button>';
    return '<div id="wn5-hub" class="wn5-hub wn5-cmp open"><div id="wn5-hub-panel" class="wn5-hub-panel v2" role="region" aria-label="Σύνθεση φορτίων">'
      + '<div class="wn5-hub-hd"><span class="wn5-hub-g2" aria-hidden="true">▾</span><span class="wn5-hub-n">ΣΥΝΘΕΣΗ ΦΟΡΤΙΩΝ</span>' + tab('KATHODOS') + tab('ANODOS')
      + (unsent ? '<span class="wn5-hub-s2">· ' + k.esc(unsent + ' ακόμη στο Weekly') + '</span>' : '') + lateTxt + '<span class="wn5-hub-sp"></span>'
      + '<button type="button" class="wi4-btn sm wn5-hub-x" data-cmp="close" onclick="WN5Compose.close()">Κλείσιμο</button></div>'
      // dropping a part of a card on the list takes it out of its draft (back to the list)
      + '<div class="wn5-hub-g"><div class="wn5-hub-l" ondragover="WN5Compose.over(event)" ondrop="WN5Compose.drop(event, -1)">' + left + '</div><div class="wn5-hub-r">' + _rightHTML(model, side) + '</div></div></div></div>';
  }
  function _redraw() {
    const el = document.getElementById('wn5-hub'), st = WN5.state();
    if (!el || !st || !st.model) return;
    const l = el.querySelector('.wn5-hub-l'), r = el.querySelector('.wn5-hub-r'), lt = l ? l.scrollTop : 0, rt = r ? r.scrollTop : 0;
    el.outerHTML = html(st.model) || '<div id="wn5-hub" hidden></div>';
    const nl = document.querySelector('#wn5-hub .wn5-hub-l'), nr = document.querySelector('#wn5-hub .wn5-hub-r');
    if (nl) nl.scrollTop = lt;
    if (nr) nr.scrollTop = rt;
  }

  // ═══ the words of a refusal: the Worker's text and its code, never silence (principle 1) ═══
  // draft_stale: the name and the time come from the fresh read (the refusal carries ASCII only, 072 plan_h_raise).
  function _words(e, label, d0) {
    const code = String((e && e.code) || '');
    if (code === 'draft_stale') {
      const now = d0 ? _find(d0.draft_id) : null;
      const who = now && now.updated_by ? ' (' + now.updated_by + (now.updated_at ? ', ' + _at(now.updated_at) : '') + ')' : '';
      return { kind: 'stale', code, text: (label || 'Το πρόχειρο') + ' άλλαξε από άλλον' + who + ' — ξαναφόρτωσε: η σελίδα το διάβασε ξανά, τίποτα δεν γράφτηκε' };
    }
    let text = String((e && e.message) || '') || '(' + (code || 'χωρίς κωδικό') + ')';
    // piece_in_draft «<piece>:<draft>[:same|:race]»: the draft is named in words («είναι ήδη στο Φορτίο 3»). The pair
    // comes as error.detail from the Worker of 8/11, or - from an older Worker, e.g. after a rollback - in brackets at
    // the end of the message; there it leaves the text: the DB's raw detail is never shown (owner 8/11, no codes).
    if (code === 'piece_in_draft') {
      const tail = /\s*\((\d+:(?:\d+|race)(?::same)?)\)\s*$/;
      const old = tail.exec(text);
      if (old) text = text.replace(tail, '');
      const pair = /^\d+:(\d+)/.exec((e && typeof e.detail === 'string' && e.detail) || (old ? old[1] : ''));
      const other = pair ? _find(Number(pair[1])) : null;
      if (other) text = 'Είναι ήδη στο ' + _label(other) + (other.side !== S.side ? ' (' + SIDE_GR[other.side] + ')' : '') + ' · ' + text;
    }
    return { kind: (e && e.kind) || 'refusal', code, text };
  }

  // ═══ one write of a draft (every one starts with the WN5.active() guard, via its caller) ═══
  // The version it read goes in the body; after the answer — a 200 or a refusal — the drafts are read again, so what
  // is on screen is the base's (someone else may have written meanwhile). A creation carries its slot's request_id:
  // the same id after a lost answer (the base replays it), a new one only after a confirmed 200.
  async function _write(d, method, path, body, slotKey) {
    if (!_live()) return null;
    // another write is on its way: the control the user just changed goes back to what the base holds (never shown as saved)
    if (S.busy) { _redraw(); return null; }
    const k = K();
    if (k.closedErr()) { S.msg = Object.assign({ id: d ? d.draft_id : null }, _words(k.closedErr())); _redraw(); return null; }
    const slot = slotKey ? (S.slots.get(slotKey) || S.slots.set(slotKey, PlanApi.slot()).get(slotKey)) : null;
    const label = d ? _label(d) : null;
    S.busy = true; S.msg = null; S.res = null; S.del = null;
    _redraw();
    let out = null, err = null;
    try { out = await planFetch(method, path, slot ? { body, requestId: slot.id } : { body }); } catch (e) { err = e; }
    S.busy = false;
    if (err && err._sessionGone) { _redraw(); return null; }
    if (!err && slot) { slot.close(); S.slots.delete(slotKey); }
    await _read();
    if (err) { S.msg = Object.assign({ id: d ? d.draft_id : null }, _words(err, label, d)); _redraw(); }
    return err ? null : out;
  }
  const _draftOf = (id) => _find(K().id(id));

  // ═══ actions ═══
  function open() { if (!_live()) return; S.open = true; _redraw(); }
  function close() { if (!_live()) return; S.open = false; _redraw(); }
  function setSide(sd) { if (!_live() || !SIDE_GR[sd]) return; S.side = sd; S.msg = null; S.res = null; S.tools = null; _redraw(); }
  function tick(pid, onv) {
    if (!_live()) return;
    const id = K().id(pid), sd = S.side;
    if (!id) return;
    S.sel[sd] = S.sel[sd].filter((x) => x !== id);
    if (onv) S.sel[sd].push(id);
    _redraw();
  }
  function reset() { if (!_live()) return; S.sel[S.side] = []; _redraw(); }
  function reread() { if (!_live()) return; _read(); }
  function tools(id) { if (!_live()) return; const i = K().id(id); S.tools = S.tools === i ? null : i; S.del = null; _redraw(); }
  // the default day of a new draft: ΚΑΘΟΔΟΣ leaves the point on the earliest day of its parts, never before today;
  // ΑΝΟΔΟΣ arrives the day of its last pickup. Any day, beyond the week too (owner 2/11: built 3–4 days ahead).
  function _defDay(model, side, ids) {
    const today = model.today || S.rd.today || null, all = _rows(model, _pt(), side);
    const ds = ids.map((id) => { const r = all.find((x) => x.pid === id); return r ? _dayOf(r, side) : null; }).filter(Boolean).sort();
    let d = (side === 'ANODOS' ? ds[ds.length - 1] : ds[0]) || today || model.week;
    if (side === 'KATHODOS' && today && d < today) d = today;
    return d;
  }
  // «+ φορτίο»: a new draft on the side, with the ticked parts (or empty)
  async function create(ids) {
    // the drafts must be read first: a part already in a draft is not on the list only after that read
    if (!_live() || !_ok() || _pt() == null) return;
    const st = WN5.state(), sd = S.side, sel = Array.isArray(ids) ? ids : S.sel[sd].slice();
    if (!st || !st.model) return;
    const body = { side: sd, point_location_id: _pt(), day: _defDay(st.model, sd, sel) };
    if (sel.length) body.pieces = sel.map((id) => ({ piece_id: id }));
    const out = await _write(null, 'POST', '/plan/drafts', body, 'new:' + sd);
    if (out) { S.sel[sd] = S.sel[sd].filter((x) => !sel.includes(x)); _redraw(); }
  }
  async function _pieces(id, key, ids) {
    const d = _draftOf(id);
    if (!_live() || !d || !ids.length) return null;
    return _write(d, 'POST', '/plan/drafts/' + d.draft_id + '/pieces', { version: d.version, [key]: key === 'add' ? ids.map((x) => ({ piece_id: x })) : ids });
  }
  async function addTo(id, ids) {
    if (!_live()) return;
    const sd = S.side, sel = Array.isArray(ids) ? ids : S.sel[sd].slice();
    const out = await _pieces(id, 'add', sel);
    if (out) { S.sel[sd] = S.sel[sd].filter((x) => !sel.includes(x)); _redraw(); }
  }
  function remove(id, pid) { if (!_live()) return; const p = K().id(pid); if (p) _pieces(id, 'remove', [p]); }
  // «Εντάξει» on an amber change: the snap is renewed to the part as it is now, with a trace (102); a blocking mark
  // has no «Εντάξει» (the base refuses: draft_not_ready) — the part is taken out instead
  function ack(id, pid) { if (!_live()) return; const p = K().id(pid); if (p) _pieces(id, 'ack', [p]); }
  // a part to another draft of the same side: ONE call with both versions (102 plan_draft_move)
  function moveTo(fromId, pid, toId) {
    if (!_live()) return;
    const a = _draftOf(fromId), b = _draftOf(toId), p = K().id(pid);
    if (!a || !b || !p || a === b) { _redraw(); return; }
    _write(a, 'POST', '/plan/drafts/move', { piece_ids: [p], from: { draft_id: a.draft_id, version: a.version }, to: { draft_id: b.draft_id, version: b.version } });
  }
  function setDay(id, v) {
    const d = _draftOf(id);
    if (!_live() || !d) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v)) || v === d.day) { _redraw(); return; }
    // a date input fires change at each typed digit of the year (0002, 0020, 0202, 2026): a year far from today is a
    // day still being typed — nothing is sent and the input is left alone until it is a real day
    const y = Number(String(S.rd.today || K().state().board.week || v).slice(0, 4));
    if (Math.abs(Number(v.slice(0, 4)) - y) > 1) return;
    _write(d, 'PATCH', '/plan/drafts/' + d.draft_id, { version: d.version, day: v });
  }
  function setWin(id, all) {
    const d = _draftOf(id), k = K();
    if (!_live() || !d) return;
    if (all) { _write(d, 'PATCH', '/plan/drafts/' + d.draft_id, { version: d.version, win: null }); return; }
    const box = document.querySelector('#wn5-hub .wn5-cd[data-draft="' + d.draft_id + '"]');
    const f = k.hhmm(box && (box.querySelector('[data-cw="from"]') || {}).value), t = k.hhmm(box && (box.querySelector('[data-cw="to"]') || {}).value);
    if (!f || !t || f === t) { S.msg = { id: d.draft_id, kind: 'client', text: 'Γράψε ώρες από–έως (ΩΩ:ΛΛ, διαφορετικές) ή πάτα «Όλη η ημέρα»', code: '' }; _redraw(); return; }
    _write(d, 'PATCH', '/plan/drafts/' + d.draft_id, { version: d.version, win: { from: f, to: t } });
  }
  function noTruck(id) { const d = _draftOf(id); if (!_live() || !d) return; _write(d, 'PATCH', '/plan/drafts/' + d.draft_id, { version: d.version, vehicle: null }); }
  // the vehicle INTENT through the one assignment form (pick mode: it writes nothing); only the ids chosen are sent
  function pick(id, anchor) {
    const d = _draftOf(id);
    if (!_live() || !d || typeof WN5Assign === 'undefined') return;
    const ps = (d.pieces || []).filter((p) => p.piece).map((p) => ({ piece_id: p.piece_id }));
    if (!ps.length) return;
    // the form snapshots its parts when it opens (WN5Assign build, synchronous): the stand-in parts are needed only then
    const wait = _withParts(d, () => WN5Assign.pick(ps, Object.assign(_ctxOf(d), { anchor: anchor || null, choice: _choiceOf(d) })));
    Promise.resolve(wait).then((c) => {
      const now = _draftOf(id);
      if (!c || !now || !_live()) return;
      const v = c.who === 'partner' ? { partner_id: c.partner } : c.who === 'own' ? Object.assign({ truck_id: c.truck }, c.trailer ? { trailer_id: c.trailer } : {}, c.driver ? { driver_id: c.driver } : {}) : null;
      _write(now, 'PATCH', '/plan/drafts/' + now.draft_id, { version: now.version, vehicle: v }).then((out) => {
        // 102 keeps the vehicle INTENT only: a partner's rate typed in the form is not kept — said, never dropped silently
        if (out && c.who === 'partner' && String(c.rateTxt || '').trim()) {
          S.msg = { id: now.draft_id, kind: 'stale', code: '', text: 'Το κόμιστρο (' + c.rateTxt + ' €) δεν κρατιέται στο πρόχειρο — γράψ’ το στο Weekly μετά τη «Δημιουργία»' };
          _redraw();
        }
      });
    });
  }
  async function history(id) {
    const d = _draftOf(id);
    if (!_live() || !d) return;
    if (S.hist[d.draft_id] && !S.hist[d.draft_id].loading) { delete S.hist[d.draft_id]; _redraw(); return; }
    S.hist[d.draft_id] = { loading: true };
    _redraw();
    try { const a = await planFetch('GET', '/plan/drafts/' + d.draft_id + '/history'); S.hist[d.draft_id] = { rows: (a && a.rows) || [] }; }
    catch (e) { if (e && e._sessionGone) { delete S.hist[d.draft_id]; return; } S.hist[d.draft_id] = { err: e }; }
    _redraw();
  }
  function del(id) {
    const d = _draftOf(id);
    if (!_live() || !d) return;
    if (S.del !== d.draft_id) { S.del = d.draft_id; _redraw(); return; }
    _write(d, 'POST', '/plan/drafts/' + d.draft_id + '/delete', { version: d.version });
  }

  // ═══ «Δημιουργία» / «Δημιουργία όλων (N)»: ONE realize per draft, in order, each with its own request_id ═══
  // 102 plan_draft_realize = 072's core of POST /plan/legs on the parts as they are NOW + the draft closed, one
  // transaction: a refusal leaves the draft a draft, and one refusal never stops the others. Each load says how it went.
  async function _realizeList(list) {
    if (!_live() || S.busy) return;
    const k = K();
    if (k.closedErr()) { S.msg = Object.assign({ id: null }, _words(k.closedErr())); _redraw(); return; }
    // the request of every draft as the screen shows it NOW (its labels, its overlap words), before anything is sent
    const jobs = list.map((d) => {
      const p = _plan(d), shown = (document.querySelector('#wn5-hub [data-cwhy="' + d.draft_id + '"]') || {}).textContent || '';
      return { d, label: _label(d), p, req: _planOk(p) ? k.busySend(p.req, p.busy, shown) : null };
    });
    S.busy = true; S.msg = null; S.res = null; S.del = null;
    _redraw();
    const res = [], ws = [], nids = [];
    for (const j of jobs) {
      const r0 = { id: j.d.draft_id, label: j.label, day: j.d.day };
      if (!j.req) { res.push(Object.assign(r0, { ok: false, rest: ': δεν είναι έτοιμο — μένει πρόχειρο' })); continue; }
      const key = 'real:' + j.d.draft_id, slot = S.slots.get(key) || S.slots.set(key, PlanApi.slot()).get(key);
      try {
        const out = await planFetch('POST', '/plan/drafts/' + j.d.draft_id + '/realize', { body: { version: j.d.version, legs: j.req.body }, requestId: slot.id });
        slot.close(); S.slots.delete(key);
        ws.push(...((out && out.warnings) || [])); nids.push(...((out && out.notice_ids) || []));
        res.push(Object.assign(r0, { ok: true, rest: j.p.label ? ' → ' + j.p.label : ' → προς ανάθεση' }));
      } catch (e) {
        if (e && e._sessionGone) { S.busy = false; _redraw(); return; }
        const w = _words(e, j.label, null);
        res.push(Object.assign(r0, { ok: false, code: w.code, rest: ': ' + (w.kind === 'stale' ? 'άλλαξε από άλλον' : w.text) + ' — μένει πρόχειρο' }));
      }
    }
    S.busy = false;
    const n = res.filter((r) => r.ok).length;
    // the new loads are ΠΡΟΣ ΑΝΑΘΕΣΗ rows of the Weekly: the board is read again (afterSave), then the drafts
    if (n) await k.afterSave({ warnings: ws, notice_ids: nids }, n === 1 ? 'Δημιουργήθηκε 1 φορτίο' : 'Δημιουργήθηκαν ' + n + ' φορτία', { intl: true });
    await _read();
    S.res = res;
    _redraw();
  }
  function realize(id) { const d = _draftOf(id); if (!_live() || !d) return; _realizeList([d]); }
  function realizeAll() { if (!_live()) return; _realizeList(_drafts(S.side).filter(_ready)); }

  // ═══ drag: a row of the list onto a card (add) or onto «+ φορτίο» (a new draft), a part of a card onto another card
  // (move) or onto the list (back to the list) ═══
  function drag(ev, pid, from) {
    if (!_live()) return;
    S.drag = { pid: K().id(pid), from: K().id(from) };
    try { ev.dataTransfer.setData('text/plain', String(pid)); ev.dataTransfer.effectAllowed = 'move'; } catch (_) { /* no dataTransfer: the click path stays */ }
  }
  // a drag let go outside any target leaves nothing behind for a later drop (of text, a file) to act on
  function dragEnd() { S.drag = null; }
  function over(ev) { if (S.drag && _live()) ev.preventDefault(); }
  function drop(ev, to) {
    if (!_live() || !S.drag) return;
    ev.preventDefault();
    ev.stopPropagation();
    const g = S.drag, t = Number(to);
    S.drag = null;
    if (!g.pid) return;
    if (!g.from) { if (t === 0) create([g.pid]); else if (t > 0) addTo(t, [g.pid]); return; }
    if (t === -1) remove(g.from, g.pid);
    else if (t > 0 && t !== g.from) moveTo(g.from, g.pid, t);
  }
  // a row's own «Σε φορτηγό ▾»: the one assignment form, for that part alone, on its day and side
  function truck(pid, anchor) {
    if (!_live()) return null;
    const id = K().id(pid), sd = S.side, st = WN5.state();
    if (sd === 'KATHODOS' && typeof WN5Hub !== 'undefined') return WN5Hub._truck(id, anchor);
    const r = st && st.model ? _rows(st.model, _pt(), sd).find((x) => x.pid === id) : null;
    return WN5Act.assign({ pieces: [{ piece_id: id }] }, { entry: 'hub', day: r ? _dayOf(r, sd) : null, side: sd, anchor: anchor || null });
  }

  window.WN5Compose = Object.freeze({ on, html, markHTML, open, close, setSide, tick, reset, reread, tools, create, addTo, remove, ack, moveTo,
    setDay, setWin, noTruck, pick, history, del, realize, realizeAll, drag, dragEnd, over, drop, truck });
})();
