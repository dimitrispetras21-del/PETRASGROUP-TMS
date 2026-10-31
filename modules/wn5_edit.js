// modules/wn5_edit.js — National v5 board, pack 2 (owner 31/10: «χαλαρώνουμε τους κανόνες, πρώτα η κατασκευή»),
// behind FEATURES.WN_V5. One global: WN5Edit.
//
//  1. Delete from the board: a right-click on a point (or on a ΠΡΟΣ ΑΝΑΘΕΣΗ row) opens «Διαγραφή σημείου» /
//     «Διαγραφή παραγγελίας». No separate «Ακύρωση» (owner 31/10). A day that passed is allowed: the base lists the
//     executed stop and the user confirms it (a correction); the trace is the audit_log rows of the acts it uses.
//  2. Drag a point: onto another truck's row = «Μεταφορά» of the loads of that stop to that truck (POST /plan/move,
//     one confirmation); onto another day's head = the one-stop day panel with that day set. A drop never writes
//     by itself: the base's list and warnings are said first, a refusal is kept only where the base keeps it.
//  3. A new point of an order that rides goes on the same truck and side, after its last stop (putNew, called by the
//     edit form after its save). When it cannot, the point waits and the reason is said.
//
// Rules (as modules/wn5_actions.js): nothing at load; listeners only on the board root WN5Act.bind() hands over (it
// dies with the root) and on the menu / dialogs while open. Every /plan call goes through planFetch. The words of a
// refusal are the Worker's; the screen's own refusals and warnings carry a stable code WN5E_* and their facts
// (data), so a later assistant can explain them without the screen carrying prose (owner 31/10).
(function () {
  'use strict';
  const K = () => WN5Act._kit;
  const _live = () => typeof WN5 !== 'undefined' && WN5.active();
  const _err = (code, message, data) => Object.assign(K().clientErr(code, message), { data: data || {} });
  const _palT = (n, unk) => (typeof WN5L !== 'undefined' ? WN5L.palText(n, unk) : String(n));
  // «TST-2104 · Driver Test 01», a partner's name, else «—»: the truck as the office names it (no RT code, owner 31/10)
  const _truck = (c) => (c ? (c.trip_type === 'PARTNER' ? (c.partner || '—') : ([c.truck, c.driver].filter(Boolean).join(' · ') || '—')) : '—');
  const _place = (s, hub) => (s ? (s.location_id === hub ? 'Βέροια' : (s.location || '—')) : '—');
  const _hashRef = (ref) => (ref.charAt(0) === '#' ? ref : '#' + ref);
  // a waiting load's point: «from → to» by the catalogue (the board names ids only, Ε-2); «—» for a place it lacks
  const _pname = (id, hub) => (id == null ? '—' : id === hub ? 'Βέροια' : ((typeof PlanIds !== 'undefined' && PlanIds.place(id)) || {}).name || '—');
  const _route = (it, hub) => _pname(it.at_hub ? hub : it.position_location_id, hub) + ' → ' + _pname(it.nat_to_location_id, hub);

  // ═══ What a point is: a stop of a cycle on the loaded board, or a ΠΡΟΣ ΑΝΑΘΕΣΗ row ═══
  function _ctxOf(el) {
    const k = K();
    const row = el && el.closest ? el.closest('.wn5-row') : null;
    if (!row) return null;
    const rtId = k.id(row.dataset.rt);
    if (rtId) {
      const pt = el.closest('.wn5-pt[data-stop]');
      const stopId = pt ? k.id(pt.dataset.stop) : null;
      const c = stopId ? k.cycle(rtId) : null;
      const s = c ? (c.stops || []).find((x) => x.stop_id === stopId) || null : null;
      if (!s) return null;
      return { row, rtId, stopId, c, s, legs: (s.legs || []).filter((l) => l.act === 'load' || l.act === 'unload') };
    }
    const pid = k.id(row.dataset.piece);
    const it = pid ? k.item(pid) : null;
    return it ? { row, pieceId: pid, it } : null;
  }
  // the national orders of a point, in the board's order: {no, ref, client, pieces}
  function _ordersOf(ctx) {
    const by = new Map();
    const add = (no, ref, client, pid) => {
      const o = by.get(no) || { no, ref: ref || '#' + no, client: client || null, pieces: [] };
      if (pid != null && !o.pieces.includes(pid)) o.pieces.push(pid);
      by.set(no, o);
    };
    if (ctx.legs) { for (const l of ctx.legs) if (l.nat_order_id != null) add(l.nat_order_id, l.reference, l.client, l.piece_id); }
    else if (ctx.it.nat_order_id != null) add(ctx.it.nat_order_id, ctx.it.reference, ctx.it.client, ctx.it.piece_id);
    return [...by.values()];
  }
  const _piecesAt = (ctx) => [...new Set((ctx.legs || []).map((l) => l.piece_id))];

  // ═══ 1 · the right-click menu of a point (the ✈ menu's look and its close rules: id wn5-menu) ═══
  function _closeMenu() { const m = document.getElementById('wn5-menu'); if (m) m.remove(); }
  function _menu(ev, ctx) {
    const k = K();
    const hub = k.hubId();
    const ords = _ordersOf(ctx);
    const items = [];
    const pcs = _piecesAt(ctx);
    if (ctx.s && pcs.length) items.push({ id: 'move', label: 'Μεταφορά σε άλλο φορτηγό…', run: () => WN5Act.move({ rt_id: ctx.rtId, piece_ids: pcs }) });
    const many = ords.length > 1;
    for (const o of ords) items.push({ id: 'del-pt:' + o.no, label: 'Διαγραφή σημείου' + (many ? ' · ' + o.ref : ''), danger: true, run: () => deletePoint(ctx, o.no) });
    for (const o of ords) items.push({ id: 'del-ord:' + o.no, label: 'Διαγραφή παραγγελίας' + (many ? ' · ' + o.ref : ''), danger: true,
      run: () => WN5Act.deleteOrder(o.no, { ref: _hashRef(o.ref), client: o.client }) });
    if (!items.length) return false;   // nothing of this file to do: the browser's own menu stays
    _closeMenu();
    const head = ctx.s ? _place(ctx.s, hub) + ' · ' + k.dayShort(ctx.s.stop_day || k.ymdOf(ctx.s.planned_to)) : (ords[0] ? ords[0].ref : '—');
    const sub = ctx.s ? _truck(ctx.c) : 'ΠΡΟΣ ΑΝΑΘΕΣΗ';
    const el = document.createElement('div');
    el.id = 'wn5-menu';
    el.className = 'wn5-menu';
    el.setAttribute('role', 'menu');
    el.setAttribute('data-wn5-overlay', 'menu');
    el.setAttribute('data-wn5e', 'point');
    let sep = false;
    el.innerHTML = '<div class="wn5-m-hd"><span class="wi4-l1">' + k.esc(head) + '</span><span class="wi4-l2">' + k.esc(sub) + '</span></div>'
      + items.map((it, i) => {
        // one separator before the first red line, when something comes before it (as the ✈ menu's «Καθαρισμός»)
        const h = (it.danger && !sep && i > 0 ? '<div class="wn5-m-sep" role="separator"></div>' : '')
          + '<button type="button" role="menuitem" class="wn5-m-i' + (it.danger ? ' danger' : '') + '" data-item="' + k.esc(it.id) + '"><span class="wi4-l1">' + k.esc(it.label) + '</span></button>';
        if (it.danger) sep = true;
        return h;
      }).join('');
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-item]');
      if (!b) return;
      const it = items.find((x) => x.id === b.getAttribute('data-item'));
      _closeMenu();
      if (it && _live()) { try { it.run(); } catch (err) { k.log(err, 'WN5Edit menu ' + it.id); } }
    });
    el.style.left = Math.max(8, Math.min(ev.clientX, window.innerWidth - el.offsetWidth - 8)) + 'px';
    el.style.top = Math.max(8, Math.min(ev.clientY, window.innerHeight - el.offsetHeight - 8)) + 'px';
    const first = el.querySelector('[role="menuitem"]');
    if (first) first.focus();
    return true;
  }

  // ═══ 1 · «Διαγραφή σημείου» ═══
  // A point = the shipments of the order that load (its loading stop) or unload (its delivery) at that place. Their
  // removal is 077's (PATCH /plan/orders/:id, shipments[].remove, a request_id): the base removes only a point that
  // does not ride (piece_busy), so a riding one first leaves its truck (POST /plan/move → wait, the dry run's list and
  // its token: an executed stop is said there and confirmed, owner 31/10 «διόρθωση»). Two acts, two audit rows; if the
  // second is refused the point is on the board under ΠΡΟΣ ΑΝΑΘΕΣΗ, said with WN5E_point_half — never lost unseen.
  // The point that is all of the order's points is the order: the order's own delete (POST /plan/delete).
  async function deletePoint(ctx, no) {
    const k = K();
    const host = k.boardHost();
    let ans;
    try { ans = await planFetch('GET', '/plan/orders/' + no); } catch (e) { WN5Act.strip(host, e); return null; }
    const ships = ans && Array.isArray(ans.shipments) ? ans.shipments : [];
    const o = _ordersOf(ctx).find((x) => x.no === no) || { ref: '#' + no, client: null, pieces: [] };
    const ref = _hashRef(o.ref);
    let mine;
    if (ctx.s) {
      const loc = ctx.s.location_id;
      const acts = new Set(ctx.legs.filter((l) => l.nat_order_id === no).map((l) => l.act));
      mine = ships.filter((s) => (acts.has('load') && s.origin_location_id === loc) || (acts.has('unload') && s.dest_location_id === loc));
    } else mine = ships.filter((s) => s.shipment_id === ctx.it.shipment_id);
    const facts = { nat_order_id: no, stop_id: ctx.stopId || null, rt_id: ctx.rtId || null, shipment_ids: mine.map((s) => s.shipment_id) };
    if (!mine.length) { WN5Act.strip(host, _err('WN5E_point_unknown', 'Το σημείο δεν βρέθηκε στην παραγγελία ' + ref + ' — ανανέωσε', facts)); return null; }
    if (mine.length >= ships.length) return WN5Act.deleteOrder(no, { ref, client: o.client });
    const hub = k.hubId();
    const place = ctx.s ? _place(ctx.s, hub) : _route(ctx.it, hub);
    const pal = mine.reduce((a, s) => a + (s.pallets == null ? 0 : Number(s.pallets)), 0), unk = mine.filter((s) => s.pallets == null).length;
    const line = 'σβήνεται το σημείο ' + place + ' · ' + ref + ' · ' + _palT(pal, unk) + 'π';
    const body = { shipments: mine.map((s) => ({ shipment_id: s.shipment_id, remove: true })) };
    const riding = ctx.s ? o.pieces : [];
    const okText = 'Σβήστηκε το σημείο ' + place + ' · ' + ref;
    if (!riding.length) {
      // a waiting point: one act, one confirmation
      const slot = PlanApi.slot();
      const d = k.dlg('delete', 'Διαγραφή σημείου ' + place + ';', { ask: true, onClose: () => slot.close() });
      d.body.innerHTML = '<div class="wn5-cons-h">Τι θα γίνει</div><ul class="wn5-cons"><li data-row="what">' + k.esc(line) + '</li></ul>';
      d.ft.innerHTML = '<button type="button" class="wi4-btn" data-act="cancel">Άκυρο</button><button type="button" class="wi4-btn pri wn5-danger" data-act="confirm">Διαγραφή</button>';
      d.dlg.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-act]');
        if (!b || b.disabled || !_live()) return;
        if (b.dataset.act === 'cancel') { if (!d.busy) k.close(d); }
        else if (b.dataset.act === 'confirm') k.send(d, { method: 'PATCH', path: '/plan/orders/' + no, body, requestId: slot.id }, okText, { slot });
      });
      k.gate(d);
      const c = d.dlg.querySelector('[data-act="confirm"]');
      if (c && !c.disabled) c.focus();
      return d;
    }
    const r = k.row(ctx.rtId), side = ctx.s.side;
    const before = k.sidePal(r, side), bu = k.sideUnk(r, side);
    // what leaves the side: the load legs of these pieces on the cycle (a delivery point has its unload here only)
    const legPal = (ctx.c.stops || []).flatMap((x) => x.legs || []).filter((l) => l.act === 'load' && riding.includes(l.piece_id))
      .reduce((a, l) => a + (l.pallets == null ? 0 : Number(l.pallets)), 0);
    const out = await WN5Act.twoStep({ method: 'POST', path: '/plan/move', body: { from: { rt_id: ctx.rtId, piece_ids: riding }, target: { wait: true } },
      kind: 'delete', danger: true, verb: 'Διαγραφή', ask: true, title: 'Διαγραφή σημείου ' + place + ';', host,
      what: () => [line, _truck(ctx.c) + ' · ' + _palT(before, bu) + ' → ' + _palT(Math.max(0, before - legPal), bu) + '/33'] });
    if (!out) return null;
    const slot = PlanApi.slot();
    try {
      const r2 = await planFetch('PATCH', '/plan/orders/' + no, { body, requestId: slot.id });
      slot.close();
      await k.afterSave(r2, okText, {});
      return r2;
    } catch (e) {
      slot.close();
      if (e && e._sessionGone) return null;
      if (typeof WN5 !== 'undefined') await WN5.reload('save');
      WN5Act.strip(k.boardHost(), _err('WN5E_point_half', 'Το σημείο ' + place + ' · ' + ref + ' βγήκε από το φορτηγό αλλά δεν σβήστηκε (' + String((e && e.message) || e) + ') — είναι στα ΠΡΟΣ ΑΝΑΘΕΣΗ: δεξί κλικ εκεί → «Διαγραφή σημείου»',
        Object.assign({ cause: e && e.code }, facts)));
      return null;
    }
  }

  // ═══ 2 · drag of a point ═══
  const DRAG = { src: null, over: null };   // survives a repaint of the root (as F32's DRAG)
  function _mark(el) {
    if (DRAG.over === el) return;
    if (DRAG.over) DRAG.over.classList.remove('wn5-drop');
    DRAG.over = el;
    if (el) el.classList.add('wn5-drop');
  }
  // where a drop lands: another cycle row = another truck; a day's head (or an empty day) = another day, same truck
  function _target(ev) {
    const t = ev.target && ev.target.closest ? ev.target : null;
    if (!t || !DRAG.src) return null;
    const row = t.closest('.wn5-row[data-rt]');
    if (row) return Number(row.dataset.rt) !== DRAG.src.rtId ? { kind: 'truck', el: row, rtId: K().id(row.dataset.rt) } : null;
    const day = t.closest('.wn5-day[data-date]');
    if (!day || day.dataset.date === DRAG.src.day) return null;
    if (!t.closest('.wn5-dayh') && !day.classList.contains('empty')) return null;
    return { kind: 'day', el: day.querySelector('.wn5-dayh') || day, day: day.dataset.date };
  }
  async function moveTo(src, dstRtId) {
    const k = K();
    const c = k.cycle(src.rtId), dst = k.cycle(dstRtId);
    const s = c ? (c.stops || []).find((x) => x.stop_id === src.stopId) : null;
    const host = k.boardHost();
    const facts = { rt_id: src.rtId, stop_id: src.stopId, to_rt_id: dstRtId };
    if (!s || !dst) { WN5Act.strip(host, _err('WN5E_drag_gone', 'Το σημείο ή το φορτηγό δεν είναι πια στο board — ανανέωσε', facts)); return null; }
    const pcs = [...new Set((s.legs || []).filter((l) => l.act === 'load' || l.act === 'unload').map((l) => l.piece_id))];
    if (!pcs.length) return null;
    const hub = k.hubId();
    const mp = k.moveParts(c, pcs, hub);
    const side = s.side;
    const r = k.stopsFor(mp.needs, dst, side, null, null);
    // a place or a Veroia window the board cannot give: the «Μεταφορά σε…» list asks for it
    if (r.missing.length) return WN5Act.move({ rt_id: src.rtId, piece_ids: pcs });
    const place = _place(s, hub);
    const pal = mp.items.reduce((a, x) => a + (x.pallets == null ? 0 : Number(x.pallets)), 0), unk = mp.items.filter((x) => x.pallets == null).length;
    const dr = k.row(dstRtId), before = k.sidePal(dr, side), bu = k.sideUnk(dr, side);
    const out = await WN5Act.twoStep({ method: 'POST', path: '/plan/move', body: { from: { rt_id: src.rtId, piece_ids: pcs }, target: { rt_id: dstRtId, side }, stops: r.stops },
      kind: 'move', verb: 'Μεταφορά', ask: true, title: 'Μεταφορά · ' + place + ' · ' + _palT(pal, unk) + 'π', host,
      what: () => [_truck(c) + ' → ' + _truck(dst), _truck(dst) + ' · ' + _palT(before, bu) + ' → ' + _palT(before + pal, bu + unk) + '/33' + (before + pal > 33 ? ' · υπέρβαση' : '')] });
    if (out) await k.afterSave(out, 'Μεταφέρθηκε: ' + place + ' → ' + _truck(dst), { intl: true });
    return out;
  }
  function dayTo(src, day, anchor) {
    const c = K().cycle(src.rtId);
    const s = c ? (c.stops || []).find((x) => x.stop_id === src.stopId) : null;
    if (!s) { WN5Act.strip(K().boardHost(), _err('WN5E_drag_gone', 'Το σημείο δεν είναι πια στο board — ανανέωσε', { rt_id: src.rtId, stop_id: src.stopId, day })); return null; }
    return WN5Act.datePanel(src.rtId, s.side, anchor, { stopId: src.stopId, day });
  }

  // ═══ The board root (called by WN5Act.bind on every paint) ═══
  function bind(root) {
    if (!root || root._wn5eBound) return;
    root._wn5eBound = true;
    root.addEventListener('contextmenu', (ev) => {
      if (!_live()) return;
      const t = ev.target && ev.target.closest ? ev.target : null;
      // a point of a cycle row, or anywhere on a ΠΡΟΣ ΑΝΑΘΕΣΗ row; never inside a field or a button
      if (!t || t.closest('input, textarea, select, button')) return;
      const hit = t.closest('.wn5-row[data-rt] .wn5-pt[data-stop]') || t.closest('.wn5-row[data-piece]');
      const ctx = hit ? _ctxOf(hit) : null;
      if (ctx && _menu(ev, ctx)) ev.preventDefault();
    });
    // a point becomes draggable on the press that may start a drag, so the board's HTML stays as it is painted
    root.addEventListener('mousedown', (ev) => {
      if (ev.button !== 0 || !_live()) return;
      const pt = ev.target && ev.target.closest ? ev.target.closest('.wn5-row[data-rt] .wn5-pt[data-stop]') : null;
      if (pt && !pt.classList.contains('wn5-end')) pt.setAttribute('draggable', 'true');
    });
    root.addEventListener('dragstart', (ev) => {
      const pt = ev.target && ev.target.closest ? ev.target.closest('.wn5-row[data-rt] .wn5-pt[data-stop][draggable="true"]') : null;
      if (!pt || !_live()) return;
      const k = K();
      const rtId = k.id(pt.closest('.wn5-row').dataset.rt), stopId = k.id(pt.dataset.stop);
      const c = rtId ? k.cycle(rtId) : null;
      const s = c && stopId ? (c.stops || []).find((x) => x.stop_id === stopId) : null;
      if (!s) return;
      DRAG.src = { rtId, stopId, day: s.stop_day || k.ymdOf(s.planned_to) };
      try { ev.dataTransfer.setData('text/plain', 'wn5-stop:' + stopId); ev.dataTransfer.effectAllowed = 'move'; } catch (_) { /* the drop reads DRAG */ }
    });
    root.addEventListener('dragover', (ev) => {
      if (!DRAG.src) return;
      const tg = _target(ev);
      _mark(tg ? tg.el : null);
      if (tg) { ev.preventDefault(); try { ev.dataTransfer.dropEffect = 'move'; } catch (_) { /* cosmetic */ } }
    });
    root.addEventListener('dragleave', (ev) => { if (DRAG.over && !DRAG.over.contains(ev.relatedTarget)) _mark(null); });
    root.addEventListener('dragend', () => { DRAG.src = null; _mark(null); });
    root.addEventListener('drop', (ev) => {
      const src = DRAG.src, tg = src ? _target(ev) : null;
      DRAG.src = null; _mark(null);
      if (!src || !tg || !_live()) return;
      ev.preventDefault();
      try {
        if (tg.kind === 'truck') moveTo(src, tg.rtId).catch((e) => K().log(e, 'WN5Edit move'));
        else dayTo(src, tg.day, document.querySelector('#content .wn5-row[data-rt="' + src.rtId + '"]') || tg.el);
      } catch (e) { K().log(e, 'WN5Edit drop'); }
    });
  }

  // ═══ 3 · a new point goes on the same truck ═══
  // After the edit form saved new points (077 new_shipment_ids) and the board was read again: their pieces wait; the
  // truck is the leg the form came from (A-7), else the ONE cycle of the loaded week that carries this order on the
  // pieces' side. Two cycles, none, or another week: the point waits (null) and the form says so, as before.
  // «After its last stop» (owner 31/10): a new place with no window of its own (whole day) on the day of the side's
  // last stop starts when that stop ends — inside the day the client gave, so no hour of the client is invented; a
  // point with its own window keeps it, and the base orders it by time.
  async function putNew(p) {
    const k = K();
    const b = k.state().board;
    const ids = new Set((p.shipmentIds || []).map(Number));
    if (!b || !ids.size) return null;
    const items = [...(b.waiting || []).map((x) => Object.assign({ at_hub: false }, x)), ...(b.hub || []).map((x) => Object.assign({ at_hub: true }, x))]
      .filter((x) => ids.has(Number(x.shipment_id)) && x.nat_order_id === p.natOrderId);
    if (!items.length) return null;
    const hub = k.hubId();
    const sides = [...new Set(items.map((it) => k.sideFor(it)))];
    if (sides.length !== 1) return null;
    const side = sides[0];
    let rtId = null;
    if (p.leg && k.id(p.leg.rtId) && (p.leg.side || side) === side) rtId = k.id(p.leg.rtId);
    else {
      const on = new Set();
      for (const c of k.cycles()) for (const s of c.stops || []) if (s.side === side && (s.legs || []).some((l) => l.nat_order_id === p.natOrderId)) on.add(c.rt_id);
      if (on.size !== 1) return null;
      rtId = [...on][0];
    }
    const c = k.cycle(rtId);
    if (!c) return null;
    const facts = { nat_order_id: p.natOrderId, shipment_ids: [...ids], rt_id: rtId, side };
    const r = k.stopsFor(items.flatMap((it) => k.needs(it, false, hub)), c, side, null, (n) => k.dayWin(n));
    if (r.missing.length) {
      WN5Act.strip(p.host || k.boardHost(), _err('WN5E_new_point_waits', 'Το νέο σημείο έμεινε ΠΡΟΣ ΑΝΑΘΕΣΗ: λείπει ' + (r.missing.includes('hub') ? 'το παράθυρο Βέροιας' : r.missing.includes('place') ? 'ο τόπος' : 'το παράθυρο') + ' — βάλ\' το με το «+» του φορτηγού', Object.assign({ missing: r.missing }, facts)));
      return { ok: false };
    }
    const last = (c.stops || []).filter((s) => s.side === side).sort((a, b2) => a.seq - b2.seq).pop();
    if (last && last.planned_to) {
      for (const st of r.stops) {
        if (st.stop_id != null || !WN5L.allDay(st.planned_from, st.planned_to)) continue;
        if (k.ymdOf(st.planned_from) === k.ymdOf(last.planned_to) && Date.parse(last.planned_to) > Date.parse(st.planned_from) && Date.parse(last.planned_to) < Date.parse(st.planned_to)) {
          st.planned_from = last.planned_to;
        }
      }
    }
    let out;
    try {
      out = await planFetch('POST', '/plan/legs', { body: { pieces: items.map((it) => ({ piece_id: it.piece_id })), target: { rt_id: rtId, side }, stops: r.stops } });
    } catch (e) {
      if (e && e._sessionGone) return { ok: false };
      WN5Act.strip(p.host || k.boardHost(), _err('WN5E_new_point_waits', 'Το νέο σημείο έμεινε ΠΡΟΣ ΑΝΑΘΕΣΗ: ' + String((e && e.message) || e), Object.assign({ cause: e && e.code }, facts)));
      return { ok: false };
    }
    if (typeof WN5 !== 'undefined') await WN5.reload('save');
    if (out && Array.isArray(out.warnings) && out.warnings.length) WN5Act.strip(k.boardHost(), out.warnings);
    return { ok: true, text: (items.length === 1 ? 'νέο σημείο στο ' : items.length + ' νέα σημεία στο ') + _truck(c), out };
  }

  window.WN5Edit = { bind, deletePoint, moveTo, dayTo, putNew };
})();
