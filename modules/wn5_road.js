// modules/wn5_road.js — National v5, «Αλλαγή στον δρόμο» (transfer at any point, piece 5; owner 2/11 «ξεκίνα»).
// Figma KO7l2AfucR3HJEDIg1Yptr, page «Μεταφόρτωση 2/11» (2450:7735): entry 2451:7737, window 2452:7735 / 2453:7735,
// preview 2454:7735, states 2457:7735 (docs/national-v5/transfer-figma-2026-11-02.md). One global: WN5Road.
// Behind FEATURES.WN_ROAD (off until the Worker with POST /plan/transfer, PR #239, is deployed): with it off the ✈ and
// right-click menus stay as they are and nothing here runs.
// Rules:
//   - ONE act, POST /plan/transfer (099): «Συνέχεια ›» is its dry run (the preview of frame 4), «Αποθήκευση» its save
//     with ONE request_id per open window (PlanApi.slot), never on a dry run (decision 44).
//   - whole_vehicle is the base's answer, never the screen's guess: every load goes whole to ONE free truck. Then the
//     save is the 072b vehicle change (POST /plan/rt/:id/handover, its own dry run first; owner 2/11, «one entry»).
//   - a point is a catalogue place OR free text (decision 1). Veroia is never offered (transfer_at_hub: loads are split
//     and assigned there on the Veroia board) and neither is 099's place «TRANSFER POINT» (isTransferPointLoc).
//   - each load: its pallets (fewer = the split, decision 3, the rest on its own line) and «Πάει σε»: a truck on the
//     road that day, a free own truck (a new trip), «Νέο φορτίο · φορτηγό αργότερα» (it waits at the point, decision 2,
//     the words of the «Σύνθεση φορτίων» panel), or «μένει στο <truck>» (the default: the load is not sent).
//   - busy (Π2, owner 3/11): the one warning — a chosen truck, its trailer or its driver on another trip the same
//     calendar day, said in amber by name, day and places BEFORE the press; that truck's target carries accept_busy
//     from the first press (one press); a day outside the loaded week is said only. No hours, no stop text.
//   - every refusal is the Worker's message (WN5Act.strip); the screen's own lines carry a code WN5R_* and facts.
//   - nothing at load: listeners exist only while the window is open.
(function () {
  'use strict';
  const K = () => WN5Act._kit;
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
  const SIDE_GR = Object.freeze({ KATHODOS: 'ΚΑΘΟΔΟΣ', ANODOS: 'ΑΝΟΔΟΣ' });
  const BUSY = Object.freeze(['truck_busy', 'driver_busy']);
  const _esc = (s) => K().esc(s);
  const _log = (e, where) => { try { if (typeof logError === 'function') logError(e, where); } catch (_) { /* the screen keeps its own line */ } };
  const _on = () => typeof FEATURES !== 'undefined' && FEATURES.WN_ROAD === true;
  // «1430», «14.30», «9:00» → «14:30» / «09:00» (the handover window's rule)
  const _hm = (v) => { const t = String(v == null ? '' : v).trim(); const m = /^(\d{1,2})[:.]?(\d{2})$/.exec(t); if (!m) return t; const o = `${m[1].padStart(2, '0')}:${m[2]}`; return HM.test(o) ? o : t; };
  const _pal = (n) => (n == null ? '—' : String(Math.round(Number(n) * 10) / 10).replace('.', ','));
  const _num = (v) => { const s = String(v == null ? '' : v).trim().replace(',', '.'); if (!s) return null; const n = Number(s); return Number.isFinite(n) ? n : NaN; };
  // A free-text point is named by its text up to the first comma (owner 2/11, Q1); opened, it is said whole.
  const _short = (t) => String(t || '').split(',')[0].trim() || String(t || '').trim();
  const _err = (code, message, data) => Object.assign(K().clientErr(code, message), { data: data || {} });
  const _split = (r) => r.part != null && r.total != null && r.part !== r.total;
  const _goes = (v) => v !== 'keep' && v !== 'stay';

  // ── pure part (tests/wn5-road.test.js) ──────────────────────────────────────────────────────────────────────
  // The loads A carries on a side: a load leg on A on that side and its unload later on A, in the order A loads them.
  function loadsOf(c, side, hub) {
    const out = [];
    const stops = ((c && c.stops) || []).slice().sort((a, b) => a.seq - b.seq);
    for (const s of stops) {
      if (s.side !== side) continue;
      for (const l of s.legs || []) {
        if (l.act !== 'load' || out.some((o) => o.piece_id === l.piece_id)) continue;
        const drop = stops.find((x) => (x.legs || []).some((y) => y.piece_id === l.piece_id && y.act === 'unload'));
        if (!drop) continue;
        out.push({ piece_id: l.piece_id, pallets: l.pallets == null ? null : Number(l.pallets), kind: l.kind || null, order_id: l.order_id == null ? null : l.order_id,
          reference: l.reference || null, pick: s, drop, toHub: hub != null && drop.location_id === hub });
      }
    }
    return out;
  }
  // The window of the point: «όλη η ημέρα» = 00:00–23:59 (the forms' default); a time is a moment, written as one
  // minute, because 072 refuses planned_to ≤ planned_from and the base names the point by its start (the board's
  // «Λαμία · Τρί 14:30»). No hour is invented: the start is the one typed.
  function windowOf(day, allDay, hm, iso) {
    if (!DAY.test(day || '')) return null;
    if (allDay) return [iso(day, '00:00'), iso(day, '23:59')];
    if (!HM.test(hm || '')) return null;
    const [h, m] = hm.split(':').map(Number);
    if (h === 23 && m === 59) return [iso(day, '23:58'), iso(day, '23:59')];
    const t = h * 60 + m + 1;
    return [iso(day, hm), iso(day, String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'))];
  }
  // The body of POST /plan/transfer from the window's state (st): exactly 099's keys. A load that stays whole on A is
  // not sent; a split (fewer pallets) sends pallets + go + rest; each truck once, in the order first named.
  // dst = { 'rt:<id>' | 'tk:<truckId>': { target, stops } } built by the screen (its stops: the drops on that truck).
  function bodyOf(st, dst) {
    const trucks = [], idx = new Map();
    const goOf = (v) => {
      if (v === 'wait' || v === 'stay') return v;
      if (!idx.has(v)) {
        const d = dst[v];
        const t = { target: Object.assign({}, d.target) };
        if (st.acceptAll) t.target.accept_busy = true;
        if (d.stops && d.stops.length) t.stops = d.stops;
        trucks.push(t);
        idx.set(v, trucks.length - 1);
      }
      return idx.get(v);
    };
    const loads = [];
    for (const r of st.rows) {
      if (r.bad) continue;
      if (!_split(r) && r.go === 'keep') continue;
      const o = { piece_id: r.piece_id };
      if (_split(r)) { o.pallets = r.part; o.go = goOf(r.go === 'keep' ? 'stay' : r.go); o.rest = goOf(r.rest === 'keep' ? 'stay' : r.rest); }
      else o.go = goOf(r.go);
      loads.push(o);
    }
    const body = { rt_id: st.rt_id, point: st.point.location_id != null ? { location_id: st.point.location_id } : { text: st.point.text },
      side: st.side, planned_from: st.win[0], planned_to: st.win[1], reason: st.reason, loads };
    if (st.note) body.note = st.note;
    if (trucks.length) body.trucks = trucks;
    if (st.acceptAll) body.accept_busy = true;
    return body;
  }
  // What keeps «Συνέχεια ›» off, said once in the footer («Λείπει: …»). [] = nothing.
  function lacks(st) {
    const out = [];
    if (!st.point) out.push('σημείο');
    if (!st.win) out.push(st.allDay ? 'ημέρα' : 'ημέρα και ώρα');
    if (!st.reason) out.push('λόγος');
    if (st.rows.some((r) => r.bad)) out.push('παλέτες');
    const ok = st.rows.filter((r) => !r.bad);
    if (!ok.some((r) => (_split(r) ? _goes(r.go) || _goes(r.rest) : r.go !== 'keep'))) out.push('φορτηγό για ένα φορτίο τουλάχιστον');
    return out;
  }

  // ── catalogue ───────────────────────────────────────────────────────────────────────────────────────────────
  // Places to offer: the catalogue without Veroia and without 099's text point; matched with the app's search rule
  // (fhSearchNorm: Greek typed, Latin names found).
  function _places(q, hub) {
    let rows = [];
    try { rows = PlanIds.list('location'); } catch (_) { rows = []; }
    const n = K().norm(q);
    if (!n) return [];
    return rows.filter((x) => x.active && x.id !== hub && !(typeof isTransferPointLoc === 'function' && isTransferPointLoc(x.legacy_id))
      && K().norm(x.label).includes(n)).slice(0, 6);
  }
  const _truckLabel = (c) => (c ? (c.trip_type === 'PARTNER' ? (c.partner || 'Συνεργάτης') : (c.truck || 'χωρίς φορτηγό')) : '—');
  const _who = (c) => (c ? (c.trip_type === 'PARTNER' ? '' : (c.driver || '')) : '');
  // «Πάει σε»: the trucks on the road that day (another trip of the board) and the free own trucks (a new trip);
  // «μένει» and «Νέο φορτίο · φορτηγό αργότερα» are added by _optsHTML. {v, label, group, truckId, rt}
  function _choices(d) {
    const k = K(), day = d.day, out = [];
    if (!DAY.test(day || '')) return out;
    for (const c of k.cycles()) {
      if (c.rt_id === d.rtId || !(c.date_start <= day && day <= c.date_end)) continue;
      out.push({ v: 'rt:' + c.rt_id, group: 'road', rt: c, truckId: c.trip_type === 'OWNED' ? c.truck_id : null, name: _truckLabel(c),
        label: _truckLabel(c) + ' · ' + k.endAt(c, day) });
    }
    let free = [];
    try { free = k.freeTrucks(day, d.cycle.truck_id); } catch (e) { _log(e, 'WN5Road free trucks'); }
    for (const t of free) out.push({ v: 'tk:' + t.id, group: 'free', truckId: t.id, name: t.label, label: t.label + (t.from ? ' · από ' + t.from : ' · ✓ ελεύθερο') });
    return out;
  }
  function _optsHTML(d, cur) {
    const ch = d.choices;
    const opt = (o) => `<option value="${_esc(o.v)}"${o.v === cur ? ' selected' : ''}>${_esc(o.label)}</option>`;
    const road = ch.filter((o) => o.group === 'road'), free = ch.filter((o) => o.group === 'free');
    return opt({ v: 'keep', label: 'μένει στο ' + _truckLabel(d.cycle) })
      + (road.length ? '<optgroup label="ΣΤΟΝ ΔΡΟΜΟ">' + road.map(opt).join('') + '</optgroup>' : '')
      + (free.length ? '<optgroup label="ΕΛΕΥΘΕΡΑ">' + free.map(opt).join('') + '</optgroup>' : '')
      + opt({ v: 'wait', label: 'Νέο φορτίο · φορτηγό αργότερα' });
  }

  // ── the window ──────────────────────────────────────────────────────────────────────────────────────────────
  let _d = null;
  function _close() {
    const d = _d;
    if (!d) return;
    if (d.slot) d.slot.close();
    window.removeEventListener('keydown', d.onKey, true);
    if (d.back.parentNode) d.back.parentNode.removeChild(d.back);
    _d = null;
  }
  const _q = (d, sel) => d.el.querySelector(sel);
  const _strip = (d) => _q(d, '[data-strip]');
  const _placeOf = (d, loc) => (loc === d.hub ? 'Βέροια' : K().placeName(loc));
  const _pointShort = (d) => (d.point ? (d.point.text != null ? _short(d.point.text) : d.point.label) : '…');
  function _reasonOpts() {
    const R = WN5Lab.ROAD_REASON;
    const one = (k) => `<option value="${k}">${_esc(R[k].text)}</option>`;
    const grp = (g, head) => `<optgroup label="${head}">` + Object.keys(R).filter((k) => R[k].group === g).map(one).join('') + '</optgroup>';
    return '<option value="">Διάλεξε…</option>' + grp('unplanned', 'ΑΠΡΟΒΛΕΠΤΟ') + grp('planned', 'ΠΡΟΓΡΑΜΜΑΤΙΣΜΕΝΟ')
      + Object.keys(R).filter((k) => R[k].group === 'other').map(one).join('');
  }
  function _rowHTML(d, ld, i) {
    const from = _placeOf(d, ld.pick.location_id), to = _placeOf(d, ld.drop.location_id);
    const tot = ld.pallets == null ? '' : _pal(ld.pallets);
    const city = K().placeCity(ld.pick.location_id);
    return `<div class="wn5r-ld" data-piece="${ld.piece_id}"><div class="wn5r-row"><div class="wn5r-who"><span class="wn5r-n">${i + 1}</span><span class="wn5r-t"><span class="wi4-l1">${_esc(from)}</span>`
      + `<span class="wi4-l2">${_esc(city || from)} → ${_esc(to)}${/^vs/.test(ld.kind || '') ? ' · VS' : ''}</span></span></div>`
      + `<label class="wn5r-pal"><input class="form-input" data-pal inputmode="decimal" value="${_esc(tot)}" aria-label="Παλέτες"${ld.pallets == null ? ' disabled title="παλέτες άγνωστες: όλο το φορτίο"' : ''}><span class="wn5r-of">/${_esc(tot || '—')}</span></label>`
      + `<span class="wn5r-go"><select class="form-input" data-go aria-label="Πάει σε">${_optsHTML(d, 'keep')}</select><span class="wn5r-hint" data-hint></span></span></div>`
      + `<div class="wn5r-row wn5r-rest" data-rest hidden><span class="wn5r-rl">↳ υπόλοιπο</span><span class="wn5r-rp" data-restpal></span>`
      + `<span class="wn5r-go"><select class="form-input" data-restgo aria-label="Πού πάει το υπόλοιπο">${_optsHTML(d, 'wait')}</select><span class="wn5r-hint" data-resthint></span></span></div>`
      + '<div data-busyrow></div></div>';
  }
  function _loadsHTML(d) {
    if (!d.loads.length) return `<div class="wn5r-none">Κανένα φορτίο στο ${_esc(_truckLabel(d.cycle))} σε αυτή την πλευρά</div>`;
    return `<div class="wn5r-lh"><span class="wn5f-sec">ΦΟΡΤΙΑ ΣΤΟ ${_esc(_truckLabel(d.cycle))}</span><span class="wn5r-sum" data-sum></span></div>`
      + `<div class="wn5r-head"><span></span><span>ΠΑΛ.</span><span class="wn5r-all"><span>ΠΑΕΙ ΣΕ</span><select data-all aria-label="Όλα σε"></select></span></div>`
      + `<div class="wn5r-loads">${d.loads.map((ld, i) => _rowHTML(d, ld, i)).join('')}</div><div data-trucks></div>`;
  }
  function _formHTML(d) {
    const sides = Object.keys(SIDE_GR).filter((s) => loadsOf(d.cycle, s, d.hub).length);
    const tog = sides.length > 1 ? `<span class="wn5r-sides" role="radiogroup">${sides.map((s) => `<button type="button" role="radio" data-side="${s}" aria-checked="${s === d.side}" class="${s === d.side ? 'on' : ''}">${SIDE_GR[s]}</button>`).join('')}</span>` : '';
    return `<div class="wn5r-form" data-form><div class="wn5f-sec wn5r-sec1">ΣΗΜΕΙΟ${tog}</div>`
      + `<div class="wn5r-r1"><label class="wn5f-f wn5r-where"><span>Πού *</span><span class="wn5r-cb"><input class="form-input" data-where autocomplete="off" placeholder="Τόπος ή κείμενο…" role="combobox" aria-expanded="false" aria-autocomplete="list">`
      + '<span class="wn5r-list" data-list role="listbox" hidden></span></span></label>'
      + `<label class="wn5f-f wn5r-day"><span>Ημέρα *</span><span class="wn5f-day"><input class="form-input" type="date" data-day value="${_esc(d.day)}" aria-label="Ημέρα"><span class="wn5f-dayt" aria-hidden="true"></span></span></label>`
      + '<label class="wn5f-f wn5r-hm"><span>Ώρα</span><input class="form-input" data-hm inputmode="numeric" maxlength="5" placeholder="ΗΗ:ΛΛ" autocomplete="off"></label>'
      + '<button type="button" class="wn5r-allday" data-allday aria-pressed="false">όλη η ημέρα</button></div>'
      + `<div class="wn5r-r2"><label class="wn5f-f wn5r-reason"><span>Λόγος *</span><select class="form-input" data-reason>${_reasonOpts()}</select></label>`
      + '<label class="wn5f-f wn5r-note"><span>Σημείωση</span><input class="form-input" data-note placeholder="προαιρετικό"></label></div>'
      + `<div data-loads>${_loadsHTML(d)}</div></div>`;
  }

  // ── reading the window ──────────────────────────────────────────────────────────────────────────────────────
  function _read(d) {
    const k = K();
    const v = (sel) => (_q(d, sel) || {}).value || '';
    const day = v('[data-day]');
    const hm = _hm(v('[data-hm]'));
    const st = { rt_id: d.rtId, side: d.side, point: d.point, day, allDay: d.allDay, hm, reason: v('[data-reason]'), note: v('[data-note]').trim(), acceptAll: !!d.acceptAll };
    st.win = windowOf(day, d.allDay, hm, k.iso);
    st.rows = d.loads.map((ld) => {
      const box = _q(d, `.wn5r-ld[data-piece="${ld.piece_id}"]`);
      const raw = _num(box.querySelector('[data-pal]').value);
      const total = ld.pallets;
      // a part has one decimal at most (099 pallets:one decimal) and is less than the load; the load whole = no split
      const bad = total != null && (raw === null || Number.isNaN(raw) || raw <= 0 || raw > total || Math.round(raw * 10) !== raw * 10);
      return { piece_id: ld.piece_id, total, part: total == null || bad ? total : raw, bad, go: box.querySelector('[data-go]').value || 'keep',
        rest: box.querySelector('[data-restgo]').value || 'wait', ld };
    });
    return st;
  }
  // the trucks a body names: their target (+ accept_busy when the board's overlap is pre-accepted) and the stops where
  // their loads end — A's drops (the hub as a hub stop, with A's window), as every move (KIT.stopsFor)
  function _dests(d, st) {
    const k = K(), out = {}, want = new Map();
    const add = (v, ld) => { if (!_goes(v) || v === 'wait') return; if (!want.has(v)) want.set(v, []); want.get(v).push(ld); };
    for (const r of st.rows) { if (r.bad) continue; add(r.go, r.ld); if (_split(r)) add(r.rest, r.ld); }
    d.busyOf = {};
    for (const [v, lds] of want) {
      const ch = d.choices.find((o) => o.v === v);
      if (!ch) continue;
      const target = ch.rt ? { rt_id: ch.rt.rt_id, side: st.side } : { new_rt: { trip_type: 'OWNED', truck_id: ch.truckId }, side: st.side };
      const needs = lds.map((ld) => ({ loc: ld.drop.location_id, from: ld.drop.planned_from, to: ld.drop.planned_to, hub: ld.toHub, own: true }));
      const r = k.stopsFor(needs, ch.rt || null, st.side, null, null);
      const days = [st.day, lds.map((ld) => k.ymdOf(ld.drop.planned_to)).filter(Boolean).sort().pop() || st.day].sort();
      const bz = ch.truckId != null && DAY.test(st.day || '')
        ? k.busyOf({ trucks: [ch.truckId], trailers: ch.rt ? [ch.rt.trailer_id] : [], drivers: ch.rt ? [ch.rt.driver_id] : [], days, self: ch.rt ? [ch.rt.rt_id] : [], accept: true }) : null;
      if (bz) d.busyOf[v] = bz;
      if (bz && bz.accept) target.accept_busy = true;
      out[v] = { target, stops: r.stops, missing: r.missing };
    }
    return out;
  }

  // ── refresh: everything the window shows follows its state ────────────────────────────────────────────────────
  function _refresh(d) {
    if (d.step !== 'form') return;
    const k = K();
    d.choices = _choices(d);
    // the choices follow the day: a select keeps its value only while that truck is still offered
    d.el.querySelectorAll('[data-go], [data-restgo], [data-all]').forEach((sel) => {
      const cur = sel.value, rest = sel.hasAttribute('data-restgo'), all = sel.hasAttribute('data-all');
      const html = all ? '<option value="">Όλα σε ▾</option>' + _optsHTML(d, '') : _optsHTML(d, cur);
      if (sel.dataset.sig !== html) {
        sel.innerHTML = html;
        sel.dataset.sig = html;
        sel.value = [...sel.options].some((o) => o.value === cur) ? cur : (all ? '' : (rest ? 'wait' : 'keep'));
      }
    });
    const dt = _q(d, '.wn5f-day');
    if (dt) { const v = dt.querySelector('input').value; dt.classList.toggle('has', DAY.test(v)); dt.querySelector('.wn5f-dayt').textContent = DAY.test(v) ? k.dayShort(v) : 'ηη/μμ'; }
    const st = _read(d);
    const since = 'περιμένει στη ' + _pointShort(d) + (DAY.test(st.day || '') ? ' από ' + k.dayShort(st.day) : '');
    for (const r of st.rows) {
      const box = _q(d, `.wn5r-ld[data-piece="${r.piece_id}"]`);
      const line = box.querySelector('[data-rest]');
      line.hidden = r.bad || !_split(r);
      line.querySelector('[data-restpal]').textContent = !line.hidden ? _pal(r.total - r.part) : '';
      box.querySelector('.wn5r-pal').classList.toggle('bad', r.bad);
      box.querySelector('[data-hint]').textContent = r.go === 'wait' ? since : '';
      box.querySelector('[data-resthint]').textContent = !line.hidden && r.rest === 'wait' ? since : '';
    }
    const sum = _q(d, '[data-sum]');
    if (sum) sum.textContent = _pal(d.loads.reduce((a, ld) => a + (ld.pallets || 0), 0)) + 'π';
    const dst = _dests(d, st);
    _busyLines(d, st);
    _truckLines(d, st);
    _builtColumn(d, st);
    const lk = lacks(st);
    if (Object.values(dst).some((x) => x.missing && x.missing.length)) lk.push('ώρες παράδοσης στο άλλο φορτηγό');
    _q(d, '[data-lack]').textContent = lk.length ? 'Λείπει: ' + lk.join(', ') : '';
    _q(d, '.wn5r-where').classList.toggle('bad', !!d.tried && !st.point);
    _q(d, '.wn5r-reason').classList.toggle('bad', !!d.tried && !st.reason);
    d.ready = !lk.length && !d.locked;
    d.st = st;
    d.dst = dst;
    _q(d, '[data-act="next"]').disabled = !d.ready || d.busy;
  }
  // Π2: one amber strip under the first load that goes to a busy truck. Owner 3/11: same day only, so a new hour
  // never clears it — the «Αλλαγή ώρας» button of Figma 2457:7735 α is gone with the hours
  // A host is written only when its words change: a refresh between the press and the release (the time field's
  // «change» on the mousedown that leaves it) would otherwise replace the button under the pointer and lose the click.
  function _busyLines(d, st) {
    // one strip per busy truck (every truck whose overlap is accepted is said), under the first load sent to it
    const said = new Set(), at = new Map();
    for (const r of st.rows) for (const v of [r.go, _split(r) ? r.rest : null]) {
      const bz = v && d.busyOf[v];
      if (!bz || said.has(v)) continue;
      said.add(v);
      at.set(r.piece_id, (at.get(r.piece_id) || '') + `<div class="wn5-strip wn5r-busy" data-kind="warning"><b>ΑΠΑΣΧΟΛΗΜΕΝΟ</b><span>${_esc(bz.text)}</span></div>`);
    }
    for (const ld of d.loads) {
      const host = _q(d, `.wn5r-ld[data-piece="${ld.piece_id}"] [data-busyrow]`);
      const html = at.get(ld.piece_id) || '';
      if (host && host.innerHTML !== html) host.innerHTML = html;
    }
  }
  // «TST-2108 · Τρί 13/10 · 9 → 31/33» (the Ανάθεση truck line, Figma 2414:7975): what each other truck will carry
  function _truckLines(d, st) {
    const host = _q(d, '[data-trucks]');
    if (!host) return;
    const k = K(), by = new Map();
    const put = (v, n) => { if (!_goes(v) || v === 'wait' || n == null) return; by.set(v, (by.get(v) || 0) + n); };
    for (const r of st.rows) { if (r.bad) continue; put(r.go, _split(r) ? r.part : r.total); if (_split(r)) put(r.rest, r.total - r.part); }
    host.innerHTML = [...by.entries()].map(([v, n]) => {
      const ch = d.choices.find((o) => o.v === v);
      if (!ch) return '';
      const before = ch.rt ? k.sidePal(k.row(ch.rt.rt_id), st.side) : 0, after = before + n;
      return `<div class="wn5r-tl"><b>${_esc(ch.name)}${DAY.test(st.day || '') ? ' · ' + _esc(k.dayShort(st.day)) : ''}</b>`
        + `<span class="wn5r-cap">${_esc(_pal(before))} → <span class="${after > 33 ? 'wn5r-over' : ''}">${_esc(_pal(after))}</span>/33</span></div>`;
    }).join('');
  }
  // Parts that go «Νέο φορτίο · φορτηγό αργότερα»: the load being built, read only — the column of the «Σύνθεση
  // φορτίων» panel (coordinator 2/11; Figma 2453:7735). The truck is chosen in the row's «Πάει σε» only.
  function _builtColumn(d, st) {
    const col = _q(d, '[data-built]'), k = K(), parts = [];
    for (const r of st.rows) {
      if (r.bad) continue;
      if (r.go === 'wait') parts.push({ ld: r.ld, n: _split(r) ? r.part : r.total });
      if (_split(r) && r.rest === 'wait') parts.push({ ld: r.ld, n: r.total - r.part });
    }
    col.hidden = !parts.length || d.step !== 'form';
    d.el.classList.toggle('wn5r-wide', !col.hidden);
    if (!parts.length) { col.innerHTML = ''; return; }
    const drops = [];
    for (const p of parts) if (!drops.some((x) => x.location_id === p.ld.drop.location_id)) drops.push(p.ld.drop);
    const n = parts.reduce((a, p) => a + (p.n || 0), 0), day = DAY.test(st.day || '') ? ' · ' + k.dayShort(st.day) : '';
    col.innerHTML = `<div class="wn5f-sec">ΝΕΟ ΦΟΡΤΙΟ · ${SIDE_GR[st.side]}</div>`
      + `<div class="wn5r-bl">Φεύγει από ${_esc(_pointShort(d))}${_esc(day)}</div>`
      + `<ol class="wn5r-bs"><li><b>${_esc(_pointShort(d))}</b> φόρτωση${_esc(day)}</li>`
      + drops.map((s) => `<li><b>${_esc(_placeOf(d, s.location_id))}</b> παράδοση · ${_esc(k.dayShort(k.ymdOf(s.planned_to)))}</li>`).join('') + '</ol>'
      + `<div class="wn5r-bar"><span style="width:${Math.min(100, Math.round(n / 33 * 100))}%"></span></div>`
      + `<div class="wn5r-bn"><b>${_esc(_pal(n))}/33</b> ${_esc(_pal(Math.max(0, 33 - n)))} ελεύθερες</div>`;
  }

  // ── the point's combobox: catalogue places, then the typed text «ως σημείο με κείμενο» ────────────────────────
  function _listShow(d) {
    const inp = _q(d, '[data-where]'), list = _q(d, '[data-list]');
    const q = inp.value.trim();
    d.opts = q ? _places(q, d.hub).map((x) => ({ location_id: x.id, label: x.label })).concat([{ text: q }]) : [];
    d.hi = 0;
    list.innerHTML = d.opts.map((o, i) => `<button type="button" role="option" class="wn5r-opt${i === 0 ? ' on' : ''}" data-opt="${i}">`
      + (o.text != null ? `<span class="wi4-l1">«${_esc(o.text)}»</span><span class="wi4-l2">σημείο με κείμενο</span>` : `<span class="wi4-l1">${_esc(o.label)}</span>`) + '</button>').join('');
    list.hidden = !d.opts.length;
    inp.setAttribute('aria-expanded', String(!list.hidden));
  }
  function _pick(d, i) {
    const o = d.opts && d.opts[i];
    if (!o) return;
    d.point = o.text != null ? { text: o.text } : { location_id: o.location_id, label: o.label };
    const inp = _q(d, '[data-where]');
    inp.value = o.text != null ? o.text : o.label;
    _q(d, '[data-list]').hidden = true;
    inp.setAttribute('aria-expanded', 'false');
    _refresh(d);
  }

  // ── preview (frame 4) ───────────────────────────────────────────────────────────────────────────────────────
  // inside the window the point is said whole (owner 2/11, Q1: «όλο το κείμενο όταν ανοίγει»)
  const _stopName = (d, s) => (s.text ? s.text : (s.location_id === d.hub ? 'Βέροια' : (s.place || K().placeName(s.location_id))));
  function _previewHTML(d, p) {
    const k = K(), st = d.st;
    let out = 0;
    for (const r of st.rows) {
      if (r.bad) continue;
      if (_split(r)) { if (_goes(r.go)) out += r.part; if (_goes(r.rest)) out += r.total - r.part; } else if (r.go !== 'keep') out += r.total || 0;
    }
    // a new trip is not on the board yet: the base creates them in the order of body.trucks and lists them by id, so
    // the k-th trip not on the board is the k-th new truck of the body (owner 31/10: plates, never an RT code)
    const newIds = (d.prev && d.prev.body.trucks || []).filter((t) => t.target.new_rt).map((t) => t.target.new_rt.truck_id);
    const plateOf = (id) => ((d.choices.find((o) => o.group === 'free' && o.truckId === id) || {}).name || 'νέο φορτηγό');
    let nth = 0;
    const rows = (Array.isArray(p.trucks) ? p.trucks : []).map((t) => {
      const c = k.cycle(t.rt_id), mine = t.rt_id === d.rtId;
      const plate = c ? _truckLabel(c) : plateOf(newIds[nth++]);
      const live = (t.stops || []).filter((s) => !s.removed), gone = (t.stops || []).filter((s) => s.removed);
      const chain = live.map((s) => {
        const tx = !!s.transfer_reason || s.transfer_from_stop_id != null;
        const nm = _esc(_stopName(d, s));
        if (!s.new) return nm;
        const when = s.planned_from ? k.dayShort(k.ymdOf(s.planned_from)) + (WN5L.allDay(s.planned_from, s.planned_to) ? '' : ' ' + k.hm(s.planned_from)) : '';
        return `<b>${tx ? '⇄ ' : ''}${nm}</b>${tx && when ? `<span class="wn5r-g"> · ${_esc(when)}</span>` : ''}`;
      }).join('<span class="wn5r-g"> → </span>');
      const sub = (mine ? 'ξεφορτώνει ' + _pal(out) + 'π' : 'φορτώνει') + (gone.length ? ' · ' : '');
      return `<div class="wn5h-erow wn5r-erow${mine ? '' : ' next'}"><span class="wn5h-pl"><b>${_esc(plate)}</b><span>${_esc(c ? _who(c) : 'νέο δρομολόγιο')}</span></span>`
        + `<span class="wn5r-chain"><span>${chain || '—'}</span><span class="wn5r-sub">${_esc(sub)}${gone.map((s) => `<s>${_esc(_stopName(d, s))}</s>`).join(' ')}</span></span></div>`;
    }).join('');
    const since = 'περιμένει στη ' + _pointShort(d) + ' από ' + k.dayShort(st.day) + ' · στο προς ανάθεση';
    const waits = (Array.isArray(p.waiting) ? p.waiting : []).map((w) => `<div class="wn5h-erow wn5r-erow wn5r-wait"><span class="wn5h-pl wn5r-slot"><b>Νέο φορτίο</b><span>φορτηγό αργότερα · ${_esc(_pal(w.pallets))}π</span></span>`
      + `<span class="wn5r-chain"><span>${_esc(_routeOf(d, w.piece_id))}</span><span class="wn5r-sub wn5r-red">${_esc(since)}</span></span></div>`).join('');
    const vs = (Array.isArray(p.vs_day) ? p.vs_day : []).map((x) => `<div class="wn5r-vs"><span class="wn5r-vsl"><b>${_esc(_orderRef(d, x.order_id))} · ημέρα Βέροιας</b><span class="wn5r-g">η ράμπα ακολουθεί</span></span>`
      + `<span><s>${_esc(x.from ? k.dayShort(x.from) : '—')}</s> → <b>${_esc(x.to ? k.dayShort(x.to) : '—')}</b></span></div>`).join('');
    const whole = p.whole_vehicle === true ? `<div class="wn5r-whole">Όλα τα φορτία σε ένα άλλο φορτηγό: γράφεται ως αλλαγή οχήματος.</div>${_driverHTML(d)}` : '';
    return `<div class="wn5f-sec">ΤΙ ΘΑ ΓΙΝΕΙ</div>${whole}<div class="wn5r-rows">${rows}${waits}</div>${vs ? '<div class="wn5f-sec">ΔΙΕΘΝΗΣ</div>' + vs : ''}`;
  }
  // a waiting part: its own load if the base kept its id, else the load it was split from (the part's id is new)
  function _routeOf(d, pieceId) {
    const r = d.st.rows.find((x) => x.piece_id === pieceId) || d.st.rows.find((x) => !x.bad && (x.go === 'wait' || (_split(x) && x.rest === 'wait')));
    return r ? _placeOf(d, r.ld.pick.location_id) + ' → ' + _placeOf(d, r.ld.drop.location_id) : '—';
  }
  function _orderRef(d, orderId) {
    const r = d.st.rows.find((x) => x.ld.order_id === orderId && x.ld.reference);
    return r ? r.ld.reference : '#' + orderId;
  }
  // whole_vehicle → the 072b change needs its driver: the same one goes on by default (said, never hidden)
  function _driverHTML(d) {
    let rows = [];
    try { rows = PlanIds.list('driver').filter((x) => x.active); } catch (_) { rows = []; }
    const same = d.cycle.driver ? 'ίδιος οδηγός (' + d.cycle.driver + ')' : 'ίδιος οδηγός';
    return `<label class="wn5f-f wn5r-drv"><span>Οδηγός</span><select class="form-input" data-drv><option value="same">${_esc(same)}</option>`
      + rows.map((x) => `<option value="${x.id}">${_esc(x.label)}</option>`).join('') + '</select></label>';
  }
  // The 072b body of a whole-vehicle change (plan_seg_change's keys): the point as its note; a 098-only reason
  // (meeting / partner_handover) goes as the reason's note, because 072b's list refuses it (seg_reason_list).
  function handoverBody(st, truckId, driver, accept) {
    const b = { at: st.win[0], place_note: st.point.text != null ? st.point.text : st.point.label };
    const inList = Object.prototype.hasOwnProperty.call(WN5Lab.REASON, st.reason);
    if (inList) b.reason = st.reason;
    const note = [inList ? '' : ((WN5Lab.ROAD_REASON[st.reason] || {}).text || ''), st.note].filter(Boolean).join(' · ');
    if (note) b.reason_note = note;
    b.vehicle = { trip_type: 'OWNED', truck_id: truckId };
    if (driver === 'same' || driver == null) b.same_driver = true; else b.vehicle.driver_id = driver;
    if (accept) b.accept_busy = true;
    return b;
  }

  // ── the steps ───────────────────────────────────────────────────────────────────────────────────────────────
  function _setStep(d, step) {
    d.step = step;
    const form = step === 'form';
    _q(d, '[data-form]').hidden = !form;
    _q(d, '[data-preview]').hidden = form;
    for (const [a, on] of [['next', form], ['cancel', form], ['back', !form], ['save', !form]]) _q(d, `[data-act="${a}"]`).hidden = !on;
    _q(d, '[data-lack]').hidden = !form;
    if (form) { d.prev = null; WN5Act.strip(_strip(d), null); _refresh(d); }
    else { _q(d, '[data-built]').hidden = true; d.el.classList.remove('wn5r-wide'); }
  }
  function _failure(d, e) {
    if (typeof PlanError === 'undefined' || !(e instanceof PlanError)) { _log(e, 'WN5Road'); WN5Act.strip(_strip(d), _err('WN5R_failed', 'Δεν έγινε: ' + String((e && e.message) || e), {})); return; }
    WN5Act.strip(_strip(d), e);
    if (e.kind === PlanApi.KIND.CLOSED) { WN5.markClosed(e); d.locked = true; }
    if (e.kind === PlanApi.KIND.LEAK || e.kind === PlanApi.KIND.UNKNOWN) d.locked = true;
    if (d.locked && d.step === 'preview') { for (const a of ['back', 'save']) _q(d, `[data-act="${a}"]`).hidden = true; _q(d, '[data-act="close"]').hidden = false; }
  }
  // a busy truck the board could not name (or another save took it since): the explicit yes, for THIS body only
  function _offerAccept(d, code) {
    if (!BUSY.includes(code) || d.acceptAll) return;
    const s = _strip(d) && _strip(d).querySelector('.wn5-strip');
    if (s) WN5Act.acceptBtn(s, () => { _setStep(d, 'form'); d.acceptAll = true; _next(d); });
  }
  async function _next(d) {
    _refresh(d);
    d.tried = true;
    if (!d.ready || d.busy) { _refresh(d); return; }
    const body = bodyOf(d.st, d.dst);
    d.busy = true;
    _q(d, '[data-act="next"]').disabled = true;
    try {
      const ans = await planFetch('POST', '/plan/transfer', { body, dry: true });
      if (_d !== d) return;
      const p = (ans && ans.preview) || {};
      _setStep(d, 'preview');
      d.prev = { body, preview: p, hand: null };
      _q(d, '[data-preview]').innerHTML = _previewHTML(d, p);
      if (p.conflict) {
        WN5Act.strip(_strip(d), _err(p.conflict.code || 'WN5R_conflict', p.conflict.message || '(' + (p.conflict.code || 'σύγκρουση') + ')', p.conflict));
        _offerAccept(d, p.conflict.code);
      } else {
        const pw = WN5Act.formWarnings(p.warnings);   // owner 3/11: no stop text, no x/33 line (the truck lines say it)
        if (pw.length) WN5Act.strip(_strip(d), pw);
        if (p.whole_vehicle === true) await _handDry(d);
      }
    } catch (e) {
      if (_d !== d) return;
      _failure(d, e);
      _offerAccept(d, e && e.code);
    } finally {
      d.busy = false;
      if (_d === d) { if (d.step === 'form') _refresh(d); else _saveState(d); }
    }
  }
  // whole_vehicle: the 072b change's own dry run, for the ONE truck the body names (a new trip of a free truck)
  function _handBody(d) {
    const t = d.prev.body.trucks && d.prev.body.trucks[0];
    const truckId = t && t.target && t.target.new_rt ? t.target.new_rt.truck_id : null;
    const sel = _q(d, '[data-drv]');
    const drv = sel && sel.value !== 'same' ? Number(sel.value) : 'same';
    return truckId == null ? null : handoverBody(d.st, truckId, drv, !!(t.target.accept_busy || d.acceptAll));
  }
  async function _handDry(d) {
    d.prev.hand = null;
    const hb = _handBody(d);
    if (!hb) { WN5Act.strip(_strip(d), _err('WN5R_whole_no_truck', 'Η βάση είπε «όλο το φορτηγό», αλλά το φορτηγό δεν βρέθηκε — ανανέωσε', { trucks: d.prev.body.trucks || [] })); return; }
    try {
      const ans = await planFetch('POST', `/plan/rt/${d.rtId}/handover`, { body: hb, dry: true });
      if (_d !== d) return;
      const c = ans && ans.preview && ans.preview.conflict;
      if (c) { WN5Act.strip(_strip(d), _err(c.code || 'WN5R_conflict', c.message || '(' + c.code + ')', c)); _offerAccept(d, c.code); return; }
      d.prev.hand = { body: hb, token: ans && ans.needs_confirm === true ? ans.confirm_token : null };
    } catch (e) { if (_d === d) { _failure(d, e); _offerAccept(d, e && e.code); } }
  }
  function _saveState(d) {
    const p = d.prev && d.prev.preview;
    const ok = !!p && !p.conflict && !d.locked && !d.done && !d.busy && (p.whole_vehicle !== true || !!d.prev.hand);
    const b = _q(d, '[data-act="save"]');
    b.hidden = d.step !== 'preview' || d.done || !!(p && p.conflict);
    b.disabled = !ok;
  }
  async function _save(d) {
    const p = d.prev && d.prev.preview;
    if (d.busy || d.done || d.locked || !p || p.conflict) return;
    const whole = p.whole_vehicle === true;
    if (whole && !d.prev.hand) return;
    d.busy = true;
    _saveState(d);
    try {
      const ans = whole
        ? await planFetch('POST', `/plan/rt/${d.rtId}/handover`, { body: d.prev.hand.token ? Object.assign({}, d.prev.hand.body, { confirm_token: d.prev.hand.token }) : d.prev.hand.body, requestId: d.slot.id })
        : await planFetch('POST', '/plan/transfer', { body: d.prev.body, requestId: d.slot.id });
      d.slot.confirm();
      _done(d, (whole ? 'Η αλλαγή οχήματος γράφτηκε' : 'Η αλλαγή στον δρόμο γράφτηκε') + (ans && ans.replayed ? ' · το πρώτο πάτημα είχε ήδη αποθηκευτεί' : ''), ans && ans.warnings, whole ? 'handover' : 'save');
    } catch (e) {
      _failure(d, e);
      _offerAccept(d, e && e.code);
    } finally {
      d.busy = false;
      if (!d.done) _saveState(d);
    }
  }
  function _done(d, line, warnings, reason) {
    d.done = true;
    const el = _q(d, '[data-done]');
    el.hidden = false;
    el.textContent = line;
    const ws = WN5Act.formWarnings(warnings);
    WN5Act.strip(_strip(d), ws.length ? ws : null);
    for (const a of ['save', 'back']) _q(d, `[data-act="${a}"]`).hidden = true;
    const c = _q(d, '[data-act="close"]');
    c.hidden = false;
    c.focus();
    const rt = d.rtId;
    // a reason of SAVE_RELOADS: a read that fails after a confirmed save says the rows are old (F11, principle 1)
    Promise.resolve(WN5.reload(reason)).then((fresh) => { if (fresh && rt && typeof WN5.focusRow === 'function') WN5.focusRow('rt:' + rt); });
  }

  // ── open ────────────────────────────────────────────────────────────────────────────────────────────────────
  // opts: { stopId } — the right-click «Αλλαγή στον δρόμο από εδώ…»: its side, its day, its loads first
  async function open(rtId, opts) {
    if (!_on()) return false;
    const k = K();
    const c = k.cycle(rtId);
    if (!c) { WN5Act.strip(k.boardHost(), _err('WN5R_trip_gone', 'Το φορτηγό δεν είναι πια στο board — ανανέωσε', { rt_id: rtId })); return false; }
    const ids = await PlanIds.load();
    try { WN5Act.closeAll(); } catch (_) { /* one v5 window at a time */ }
    _close();
    const hub = k.hubId();
    const from = opts && opts.stopId ? (c.stops || []).find((s) => s.stop_id === opts.stopId) || null : null;
    const sides = Object.keys(SIDE_GR).filter((s) => loadsOf(c, s, hub).length);
    const side = from && sides.includes(from.side) ? from.side : (sides[0] || 'KATHODOS');
    const today = k.ymdOf(new Date().toISOString());
    const day = from ? (from.stop_day || k.ymdOf(from.planned_from)) : (c.date_start <= today && today <= c.date_end ? today : c.date_start);
    const back = document.createElement('div');
    back.className = 'wi4-dlg-back wn5r-back';
    back.setAttribute('data-wn5-overlay', 'road');   // the board's cleanup removes it when the page leaves
    const box = document.createElement('div');
    box.className = 'wi4-dlg wn5f wn5r';
    box.setAttribute('role', 'dialog');               // core/ui.js: ←/→ do not move the week under it
    box.setAttribute('aria-modal', 'true');
    box.dataset.wn5 = 'road';
    back.appendChild(box);
    const d = { el: box, back, rtId, cycle: c, hub, side, day, point: null, allDay: false, step: 'form', busy: false, slot: PlanApi.slot(), choices: [], busyOf: {} };
    d.loads = loadsOf(c, side, hub);
    if (from) {
      const here = new Set((from.legs || []).map((l) => l.piece_id));
      d.loads.sort((a, b) => (here.has(b.piece_id) ? 1 : 0) - (here.has(a.piece_id) ? 1 : 0));
    }
    d.choices = _choices(d);
    const head = [_truckLabel(c), _who(c)].filter(Boolean).join(' · ') + ' · ' + k.dayShort(c.date_start) + (c.date_end !== c.date_start ? ' → ' + k.dayShort(c.date_end) : '');
    box.innerHTML = `<div class="wi4-dlg-hd wn5f-hd"><span class="wi4-dlg-t">Αλλαγή στον δρόμο</span><span class="wn5f-sub">${_esc(head)}</span><span class="wn5r-side" data-sidecap>${SIDE_GR[side]}</span>`
      + '<button type="button" class="wi4-dlg-x" data-act="close-x" aria-label="Κλείσιμο">×</button></div>'
      + `<div class="wn5f-body wn5r-body"><div class="wn5r-main">${_formHTML(d)}<div class="wn5r-prev" data-preview hidden></div><div data-strip></div><div class="wn5f-done" data-done hidden></div></div>`
      + '<div class="wn5r-built" data-built hidden></div></div>'
      + '<div class="wi4-dlg-ft wn5f-ft"><span class="wn5r-lack" data-lack></span>'
      + '<button type="button" class="wi4-btn" data-act="cancel">Άκυρο</button><button type="button" class="wi4-btn" data-act="back" hidden>‹ Πίσω</button>'
      + '<button type="button" class="wi4-btn pri" data-act="next" disabled>Συνέχεια ›</button><button type="button" class="wi4-btn pri" data-act="save" hidden disabled>Αποθήκευση</button>'
      + '<button type="button" class="wi4-btn" data-act="close" hidden>Κλείσιμο</button></div>';
    document.body.appendChild(back);
    _d = d;
    d.onKey = (ev) => {
      if (!back.isConnected) { _close(); return; }
      const list = _q(d, '[data-list]');
      if (ev.target && ev.target.matches && ev.target.matches('[data-where]') && list && !list.hidden && d.opts && d.opts.length) {
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
          ev.preventDefault();
          d.hi = (d.hi + (ev.key === 'ArrowDown' ? 1 : -1) + d.opts.length) % d.opts.length;
          list.querySelectorAll('[data-opt]').forEach((b, i) => b.classList.toggle('on', i === d.hi));
          return;
        }
        if (ev.key === 'Enter') { ev.preventDefault(); _pick(d, d.hi); return; }
        if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); list.hidden = true; return; }
      }
      if (ev.key === 'Escape' && !d.busy) { ev.preventDefault(); ev.stopPropagation(); _close(); }
    };
    window.addEventListener('keydown', d.onKey, true);
    if (!ids.ok) { WN5Act.strip(_strip(d), ids.err); d.locked = true; }
    box.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-act],[data-opt],[data-side],[data-allday]');
      if (!t || !box.contains(t)) return;
      if (t.hasAttribute('data-opt')) { _pick(d, Number(t.dataset.opt)); return; }
      if (t.hasAttribute('data-allday')) {
        d.allDay = !d.allDay;
        t.setAttribute('aria-pressed', String(d.allDay));
        t.classList.toggle('on', d.allDay);
        _q(d, '[data-hm]').disabled = d.allDay;
        _refresh(d);
        return;
      }
      if (t.dataset.side) {
        if (t.dataset.side === d.side) return;
        d.side = t.dataset.side;
        d.loads = loadsOf(c, d.side, hub);
        _q(d, '[data-loads]').innerHTML = _loadsHTML(d);
        box.querySelectorAll('[data-side]').forEach((b) => { const on = b.dataset.side === d.side; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
        _q(d, '[data-sidecap]').textContent = SIDE_GR[d.side];
        _refresh(d);
        return;
      }
      const a = t.dataset.act;
      if (a === 'cancel' || a === 'close' || a === 'close-x') { if (!d.busy) _close(); return; }
      if (a === 'next' && !t.disabled) { _next(d); return; }
      if (a === 'back') { _setStep(d, 'form'); return; }
      if (a === 'save' && !t.disabled) { _save(d); return; }
    });
    box.addEventListener('input', (ev) => {
      if (ev.target.matches('[data-where]')) { d.point = null; _listShow(d); }
      if (d.step === 'form') { d.acceptAll = false; _refresh(d); }
    });
    box.addEventListener('change', (ev) => {
      if (ev.target.matches('[data-all]')) {
        const v = ev.target.value;
        if (v) box.querySelectorAll('[data-go]').forEach((s) => { if ([...s.options].some((o) => o.value === v)) s.value = v; });
        ev.target.value = '';
      }
      if (ev.target.matches('[data-drv]')) { if (d.step === 'preview' && d.prev) (async () => { await _handDry(d); _saveState(d); })(); return; }
      if (d.step === 'form') { d.acceptAll = false; _refresh(d); }
    });
    box.addEventListener('focusout', (ev) => {
      if (ev.target.matches('[data-hm]') && ev.target.value) { ev.target.value = _hm(ev.target.value); _refresh(d); }
      if (ev.target.matches('[data-where]')) setTimeout(() => { if (_d === d && !_q(d, '.wn5r-cb').contains(document.activeElement)) _q(d, '[data-list]').hidden = true; }, 150);
    });
    _refresh(d);
    _q(d, '[data-where]').focus();
    return true;
  }

  window.WN5Road = Object.freeze({ open, on: _on, loadsOf, windowOf, bodyOf, lacks, handoverBody, _close });
})();
