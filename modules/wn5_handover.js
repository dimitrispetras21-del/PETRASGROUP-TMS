// National v5 F4α — the vehicle handover screens (gated 072b). Figma KO7l2AfucR3HJEDIg1Yptr section 2120:7735:
// H6 cycle card 2129:7735, H2 change 2122:7735, H3 2123:7735, H7 errors 2130:7735, H4 removal 2125:7735 and the
// clear of a cycle with segments 2147:7746 (T26). One global: WN5Hand.
// Rules (handover spec §4-§7, 072b plan §Interfaces, decision 44):
//   - change = POST /plan/rt/:id/handover: a dry run first (the preview of the segments, warnings, conflict), then
//     the execution with ONE request_id per open form (PlanApi.slot) — never on the dry run (required except on it);
//   - fix = PATCH /plan/segments/:id {set, dry_run?}: only what changed, no request_id;
//   - reasons = WN5Lab.REASON (H-19); «Άλλο» needs its note (seg_other_note): the save stays off without it;
//   - «Πού» (place_note) is required by plan_seg_change whatever the reason (bad_input without it) — Figma H2 marks
//     it required only with «Άλλο»; the screen follows the base;
//   - every refusal is error.message (H7 texts are the Worker's, principle 3); writes_closed → the preview strip
//     and a disabled save, the dry run stays open (H7 tile 4, Ε-6);
//   - in lists the segment mark is a straight line (R-55): the slant lives on the board tiles only;
//   - NO change history in the cycle card, for any role (Ε-11 «γ», owner 26/10): it stays where it is today, in the
//     Audit Trail (owner and management). So the H6 «ΙΣΤΟΡΙΚΟ ΑΛΛΑΓΩΝ» block is not built, and nothing here reads
//     the audit route;
//   - no role guard (owner 10/10): every button is there, the Worker answers 403 where PLAN_PERMS says so;
//   - nothing at load: listeners and the preview timer exist only while a dialog is open.
(function () {
  'use strict';
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
  const SEG_GR = Object.freeze({ initial: 'ΑΡΧΙΚΟ', intermediate: 'ΕΝΔΙΑΜΕΣΟ', final: 'ΤΕΛΙΚΟ' });
  const OTHER_NOTE = 'Με «Άλλο» η σημείωση είναι υποχρεωτική';
  const RATE_BAD = 'Κόμιστρο €: αριθμός 0 ή πάνω';
  const _rateBad = (r) => r !== null && r !== undefined && !(Number.isFinite(r) && r >= 0);
  // H7 (2130:7745, 2130:7809): the refused field gets the red border. Codes only, the text stays the Worker's.
  const FIELD_OF = Object.freeze({ truck_busy: 'wn5h-truck', driver_busy: 'wn5h-driver', payroll_locked: 'wn5h-driver', seg_time: 'wn5h-day' });
  // the board ✈ glyph (Figma icon/send 2147:7735), drawn in the button's own colour
  const SEND_ICON = '<svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M11.9167 1.08333L5.95833 7.04167M5.95833 7.04167L1.08333 4.875L11.9167 1.08333L8.125 11.9167L5.95833 7.04167Z" stroke="currentColor" stroke-width="1.08333" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const _log = (e, where) => { try { if (typeof logError === 'function') logError(e, where); } catch (_) { /* keep the screen's own line */ } };
  const _iso = (d, h) => (typeof WN5Form !== 'undefined' ? WN5Form._iso(d, h) : null);
  const _parts = (iso) => (typeof WN5Form !== 'undefined' ? WN5Form._parts(iso) : null);
  const _dlab = (day) => (typeof WI4 !== 'undefined' ? WI4.dayLabel(day) : day);
  const _dow = (day) => _dlab(day).split(' ')[0];
  const _when = (iso) => { const p = _parts(iso); return p ? `${_dow(p.day)} ${p.hm}` : '—'; };
  const _whenD = (iso) => { const p = _parts(iso); return p ? `${_dlab(p.day)} ${p.hm}` : '—'; };
  // Upper-case Greek heads are typed without tonos (Figma «ΑΠΟ ΤΡΙ 14:30», never «ΤΡΊ»).
  const _upper = (s) => String(s).toUpperCase().normalize('NFD').replace(/́/g, '').normalize('NFC');
  const _num = (v) => { const s = String(v == null ? '' : v).trim().replace(',', '.'); if (!s) return null; const n = Number(s); return Number.isFinite(n) ? n : NaN; };
  // A time typed in the 72px field (Figma 2122:7753): the native time input is 12-hour in el-GR and cut at that
  // width, so it is a text field like the order form's; «1430», «14.30», «9:00» → «14:30» / «09:00».
  const _hm = (v) => { const t = String(v == null ? '' : v).trim(); const m = /^(\d{1,2})[:.]?(\d{2})$/.exec(t); if (!m) return t; const o = `${m[1].padStart(2, '0')}:${m[2]}`; return HM.test(o) ? o : t; };
  const _reasonText = (code) => (code ? WN5Lab.reasonLine(code).text : '');

  // ── pure part (tests/wn5-handover.test.js) ─────────────────────────────────────────────────────────────────
  function _changeProblems(st) {
    const out = [];
    if (!st.at) out.push('Πότε *: ημέρα και ώρα');
    if (!st.place_note) out.push('Πού *: γράψε το σημείο της αλλαγής');
    if (!st.reason) out.push('Λόγος *: διάλεξε λόγο');
    else if (WN5Lab.REASON[st.reason] && WN5Lab.REASON[st.reason].noteRequired && !st.reason_note) out.push(OTHER_NOTE);
    if (st.own) {
      if (!Number.isSafeInteger(st.truck_id)) out.push('Φορτηγό *: διάλεξε φορτηγό');
      if (!st.same_driver && !Number.isSafeInteger(st.driver_id)) out.push('Οδηγός *: διάλεξε οδηγό');
    } else {
      if (!Number.isSafeInteger(st.partner_id)) out.push('Συνεργάτης *: διάλεξε συνεργάτη');
      if (_rateBad(st.partner_rate)) out.push(RATE_BAD);
    }
    return out;
  }
  // Exactly plan_seg_change's keys (072b: rt_id from the path, request_id and dry_run added by planFetch).
  function _changeBody(st) {
    const body = { at: st.at, place_note: st.place_note, reason: st.reason };
    if (st.reason_note) body.reason_note = st.reason_note;
    if (st.own) {
      const v = { trip_type: 'OWNED', truck_id: st.truck_id };
      if (st.trailer_id !== null && st.trailer_id !== undefined) v.trailer_id = st.trailer_id;
      if (!st.same_driver) v.driver_id = st.driver_id;   // same_driver with a driver_id = bad_input (072b)
      body.vehicle = v;
      if (st.same_driver) body.same_driver = true;
    } else {
      const v = { trip_type: 'PARTNER', partner_id: st.partner_id };
      if (st.partner_rate !== null && st.partner_rate !== undefined) v.partner_rate = st.partner_rate;
      body.vehicle = v;
    }
    return body;
  }
  // plan_seg_fix set: only the keys whose value changed (072b set keys).
  function _fixSet(orig, st) {
    const set = {};
    for (const k of ['at', 'place_note', 'reason', 'reason_note', 'trip_type', 'truck_id', 'trailer_id', 'driver_id', 'partner_id', 'partner_rate']) {
      if (!(k in st)) continue;
      const a = k === 'at' ? (orig.from_at ? Date.parse(orig.from_at) : null) : (orig[k] === undefined ? null : orig[k]);
      const b = k === 'at' ? (st.at ? Date.parse(st.at) : null) : st[k];
      if (b !== a && !(b === '' && a === null)) set[k] = st[k] === '' ? null : st[k];
    }
    return set;
  }
  // The preview's foot (Figma 2122:7832): one payroll line per driver of the cycle, the same driver twice is one line
  // (R-41, 073 live). Display only: the lines themselves are the base's; partners have none.
  function _payrollLine(segs) {
    const seen = new Set(), names = [];
    for (const g of segs || []) {
      if (g.trip_type === 'PARTNER') continue;
      const k = g.driver_id != null ? 'id:' + g.driver_id : g.driver ? 'name:' + g.driver : null;
      if (!k || seen.has(k)) continue;
      seen.add(k);
      names.push(g.driver || '#' + g.driver_id);
    }
    return names.length ? `Μισθοδοσία: ${names.length} ${names.length === 1 ? 'γραμμή' : 'γραμμές'} (${names.join(', ')})` : '';
  }
  // «ελεύθερο ως …» under the picked truck / driver (Figma 2122:7781, 2122:7795): what the board's week knows of that
  // vehicle after the change time — the start of its next use in another cycle, capped at this cycle's end (the new
  // segment runs to it). The lookups carry no availability; the week's cycles do. null = no time yet, or already in use
  // at that time: then the dry run's truck_busy / driver_busy says it, in the Worker's words, not a guess here.
  function _freeUntil(board, rtId, key, id, at, endAt) {
    if (!Number.isSafeInteger(id) || !at || !endAt) return null;
    const t = Date.parse(at);
    let until = Date.parse(endAt), iso = endAt;
    if (!(t < until)) return null;
    for (const c of (board && board.cycles) || []) {
      if (c.rt_id === rtId) continue;
      let segs;
      try { segs = WN5L.segmentsOf(c).segments; } catch (_) { continue; }   // a bad shape is the board's own line
      for (const g of segs) {
        if (g[key] !== id) continue;
        const fromIso = g.from_at || c.start_at, a = Date.parse(fromIso), b = Date.parse(g.to_at || c.end_at);
        if (a <= t && t < b) return null;
        if (a > t && a < until) { until = a; iso = fromIso; }
      }
    }
    return iso;
  }
  // The hub as the board names it: the catalogue's id (PlanIds.hub) when loaded, else the one WN5L reads from the
  // week's VS legs — the same rule as weekly_natl_v5.js + WN5L.model, so the card and the board never disagree on
  // «Βέροια» (fidelity T25: PlanIds.hub() alone is null until GET /plan/lookups exists).
  function _hubOf(board) {
    try { const h = PlanIds.hub(); if (h != null) return h; } catch (_) { /* no catalogue: the board decides */ }
    try { return WN5L.hubFromBoard(board); } catch (_) { return null; }
  }

  // ── dialogs (the .wn5f shell of the order / leg forms: 60px head, 64px foot) ──────────────────────────────
  let _d = null;
  function _open(kind, title, sub, html, foot, saveLabel) {
    _close();
    try { if (typeof WN5Act !== 'undefined') WN5Act.closeAll(); } catch (_) { /* one v5 window at a time */ }
    const back = document.createElement('div');
    back.className = 'wi4-dlg-back wn5h-back';
    // the board's cleanup removes every body-level v5 overlay by this mark when the page leaves (weekly_natl_v5.js)
    back.setAttribute('data-wn5-overlay', 'handover');
    const box = document.createElement('div');
    box.className = 'wi4-dlg wn5f wn5h wn5h-' + kind;
    box.setAttribute('role', 'dialog');   // core/ui.js _WK_OVERLAYS: ←/→ do not move the week under it
    box.setAttribute('aria-modal', 'true');
    box.dataset.wn5 = kind;
    // H7 tile 4: the strip sits above the preview, so a body that has a preview carries its own strip host
    const ownStrip = /data-strip/.test(html);
    box.innerHTML = `<div class="wi4-dlg-hd wn5f-hd"><span class="wi4-dlg-t">${title}</span><span class="wn5f-sub">${sub}</span>`
      + `<button type="button" class="wi4-dlg-x" data-act="cancel" aria-label="Κλείσιμο">×</button></div>`
      + `<div class="wn5f-body">${html}</div><div class="wn5f-msg" data-err></div>${ownStrip ? '' : '<div data-strip></div>'}<div class="wn5f-done" data-done hidden></div>`
      + (saveLabel === null ? '' : `<div class="wi4-dlg-ft wn5f-ft"><span class="wn5f-ft-note">${foot}</span><button type="button" class="wi4-btn" data-act="cancel">Άκυρο</button>`
        + `<button type="button" class="wi4-btn pri" data-act="save" disabled>${saveLabel}</button></div>`);
    back.appendChild(box);
    document.body.appendChild(back);
    const d = { kind, el: box, back, busy: false, timer: null, slot: null };
    d.onKey = (ev) => {
      if (!back.isConnected) { _close(); return; }   // the board left and took the overlay
      if (ev.key === 'Escape' && !d.busy) { ev.preventDefault(); ev.stopPropagation(); _close(); }
    };
    window.addEventListener('keydown', d.onKey, true);
    _d = d;
    return d;
  }
  function _close() {
    const d = _d;
    if (!d) return;
    if (d.timer) clearTimeout(d.timer);
    if (d.slot) d.slot.close();
    window.removeEventListener('keydown', d.onKey, true);
    if (d.back.parentNode) d.back.parentNode.removeChild(d.back);
    _d = null;
  }
  const _strip = (d) => d.el.querySelector('[data-strip]');
  const _lines = (d, ls) => { d.el.querySelector('[data-err]').innerHTML = ls.map((l) => `<div>${_esc(l)}</div>`).join(''); };
  // The «Άλλο» line sits under the note field, which turns red (Figma 2122:7868), not in the form's line box.
  function _otherNote(d, on) {
    const f = d.el.querySelector('[data-note]');
    if (!f) return;
    f.classList.toggle('bad', on);
    f.querySelector('[data-ferr]').textContent = on ? OTHER_NOTE : '';
    f.querySelector('[data-notel]').textContent = on ? 'Σημείωση *' : 'Σημείωση';
  }
  // Lines that must outlive the next refresh (a conflict of the preview, «not deployed»): kept per body key.
  const _kept = (d, key) => (d.prev && d.prev.key === key && d.prev.conflict ? [d.prev.conflict.message || '(' + (d.prev.conflict.code || 'σύγκρουση') + ')'] : [])
    .concat(d.note && d.note.key === key ? d.note.lines : []);
  function _dayText(d) {
    d.el.querySelectorAll('.wn5f-day').forEach((w) => {
      const v = w.querySelector('input').value, t = w.querySelector('.wn5f-dayt'), has = DAY.test(v);
      w.classList.toggle('has', has);
      t.textContent = has ? _dlab(v) : 'ηη/μμ';
    });
  }
  const _unmark = (d) => d.el.querySelectorAll('.wn5f-f.bad:not([data-note])').forEach((f) => f.classList.remove('bad'));
  async function _board() { try { return await WN5.findAfterReuse((b) => b); } catch (e) { _log(e, 'WN5Hand board'); return null; } }
  const _list = (kind) => { try { return PlanIds.list(kind).filter((x) => x.active !== false); } catch (_) { return []; } };
  // The fix form opens on the segment's own vehicle: when that id is not in the active list (an inactive vehicle, or
  // the catalogue did not load) it is still offered, selected, under the board's own label. Otherwise the select
  // reads '' and _fixSet would send the key as null — a place-only fix silently unassigning the trailer (review T25).
  const _opts = (kind, cur, empty, curLabel) => {
    const rows = _list(kind);
    const keep = Number.isSafeInteger(cur) && !rows.some((x) => x.id === cur)
      ? `<option value="${cur}" selected>${_esc(curLabel || '#' + cur)}</option>` : '';
    return (empty ? `<option value="">${empty}</option>` : '<option value=""></option>') + keep
      + rows.map((x) => `<option value="${x.id}"${x.id === cur ? ' selected' : ''}>${_esc(x.label)}</option>`).join('');
  };
  const _plate = (g) => (g.trip_type === 'PARTNER' ? (g.partner || 'Συνεργάτης') : [g.truck, g.trailer].filter(Boolean).join(' · ') || 'χωρίς φορτηγό');
  const _line2 = (g) => (g.trip_type === 'PARTNER' ? (g.partner_rate == null ? 'κόμιστρο λείπει' : String(g.partner_rate).replace('.', ',') + ' €') : (g.driver || '—'));
  // Stops of a segment: the name in Medium ink, « · city» in grey (Figma 2129:7761); the city once per run of the
  // same city, never when the name already says it; the hub reads «Βέροια» as on the board.
  function _stopsHTML(g, cycle, hub) {
    let prev = null;
    const parts = (g.stop_ids || []).map((id) => (cycle.stops || []).find((s) => s.stop_id === id)).filter(Boolean).map((s) => {
      if (hub !== null && s.location_id === hub) { prev = null; return '<b>Βέροια</b>'; }
      const pl = (() => { try { return PlanIds.place(s.location_id); } catch (_) { return null; } })();
      const city = pl && pl.city ? String(pl.city) : '';
      const show = city && city !== prev && !String(s.location || '').toLowerCase().includes(city.toLowerCase());
      prev = city || prev;
      return `<b>${_esc(s.location || '—')}</b>${show ? `<span> · ${_esc(city)}</span>` : ''}`;
    });
    return parts.length ? parts.join('<span> · </span>') : '<span>—</span>';
  }
  function _segRowHTML(g, cycle, withButtons, first, hub) {
    const par = g.trip_type === 'PARTNER';
    return `<div class="wn5h-seg" data-seg="${g.segment_id}" data-label="${g.label || ''}"><span class="wn5h-line"></span>`
      + `<b class="wn5h-lab">${SEG_GR[g.label] || ''}</b>`
      + `<span class="wn5h-vc"><span class="wn5h-chip${par ? ' par' : ''}"><b class="wn5h-pl">${_esc(_plate(g))}</b><span class="wn5h-dr">${_esc(_line2(g))}</span></span></span>`
      + `<span class="wn5h-win">${_when(g.from_at)} → ${_when(g.to_at)}</span><span class="wn5h-stops">${_stopsHTML(g, cycle, hub)}</span><span class="wn5h-sp"></span>`
      + (withButtons ? `<span class="wn5h-btns"><button type="button" class="wn5h-link" data-act="fix" data-seg="${g.segment_id}">Διόρθωση</button>`
        + (first ? '' : `<button type="button" class="wn5h-link wn5h-rm" data-act="remove" data-seg="${g.segment_id}">Αφαίρεση</button>`) + '</span>' : '')
      + '</div>';
  }

  // ── H6 cycle card ──────────────────────────────────────────────────────────────────────────────────────────
  async function cycleCard(rtId) {
    const board = await _board();
    const c = board && (board.cycles || []).find((x) => x.rt_id === rtId);
    if (!c) { if (typeof toast === 'function') toast('Ο κύκλος δεν βρέθηκε στην εβδομάδα που φαίνεται — ανανέωσε', 'warn'); return false; }
    await PlanIds.load();
    const segs = WN5L.segmentsOf(c).segments;
    const pallets = (c.stops || []).reduce((a, s) => a + (s.legs || []).filter((l) => l.act === 'load').reduce((b, l) => b + (Number(l.pallets) || 0), 0), 0);
    const sheets = segs.length;
    const hub = _hubOf(board);
    const d = _open('cycle', `Κύκλος ${_esc(c.code || 'RT-' + rtId)}`,
      `· ${_whenD(c.start_at)} → ${_whenD(c.end_at)} · ${segs.length} ${segs.length === 1 ? 'τμήμα' : 'τμήματα'} · ${String(pallets).replace('.', ',')}π`,
      `<div class="wn5h-acts"><button type="button" class="wi4-btn wn5h-pri" data-act="change">Αλλαγή οχήματος</button>`
      + `<button type="button" class="wi4-btn wn5h-out" data-act="sheets">${SEND_ICON}Φύλλα οδηγών (${sheets})</button>`
      + `<button type="button" class="wi4-btn wn5h-out wn5h-danger" data-act="clear">Καθαρισμός ανάθεσης</button></div><div class="wn5h-sheets" data-sheets hidden></div>`
      + `<div class="wn5f-sec">ΤΜΗΜΑΤΑ</div>${segs.map((g, i) => _segRowHTML(g, c, true, i === 0, hub)).join('')}`, '', null);
    d.rtId = rtId;
    d.cycle = c;
    d.el.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-act]');
      if (!t || !d.el.contains(t)) return;
      const a = t.dataset.act;
      if (a === 'cancel') return _close();
      if (a === 'change') { _close(); change(rtId); return; }
      if (a === 'fix') { _close(); fix(Number(t.dataset.seg)); return; }
      if (a === 'remove') { _close(); remove(Number(t.dataset.seg)); return; }
      // one segment: exactly today (✈ → the Δ5 clear); two or more: the same shared clear as the H6 dialog, which
      // names the segments that go before anything is written (Figma 2147:7746, decision 12)
      if (a === 'clear') { _close(); WN5Act.clear(rtId, segs.length > 1 ? { segs: segs.map((g) => SEG_GR[g.label] || '—') } : undefined); return; }
      if (a === 'sheets') {
        // one sheet per segment (H5, T27): every driver sees only his own stops
        const box = d.el.querySelector('[data-sheets]');
        box.hidden = !box.hidden;
        box.innerHTML = segs.map((g) => `<button type="button" class="wi4-btn sm" data-act="sheet" data-seg="${g.segment_id}">${SEG_GR[g.label] || 'Φύλλο'} · ${_esc(_plate(g))}</button>`).join('');
        return;
      }
      if (a === 'sheet') WN5Sheet.print(rtId, 'ALL', segs.length > 1 ? Number(t.dataset.seg) : undefined);
    });
    return true;
  }
  // ── H2 / H3 change ─────────────────────────────────────────────────────────────────────────────────────────
  function _reasonOptions(cur) {
    const R = WN5Lab.REASON;
    const grp = (g, head) => `<optgroup label="${head}">` + Object.keys(R).filter((k) => R[k].group === g).map((k) => `<option value="${k}"${k === cur ? ' selected' : ''}>${_esc(R[k].text)}</option>`).join('') + '</optgroup>';
    return '<option value=""></option>' + grp('unplanned', 'ΑΠΡΟΒΛΕΠΤΟ') + grp('planned', 'ΠΡΟΓΡΑΜΜΑΤΙΣΜΕΝΟ') + Object.keys(R).filter((k) => R[k].group === 'other').map((k) => `<option value="${k}"${k === cur ? ' selected' : ''}>${_esc(R[k].text)}</option>`).join('');
  }
  // Πότε * · Πού * · Λόγος * · Σημείωση (Figma 2122:7745 + the 072b reason_note the plan adds)
  function _whenRowHTML(p, place, reason, note) {
    return `<div class="wn5h-row1">`
      + `<label class="wn5f-f wn5h-when"><span>Πότε *</span><span class="wn5h-wwin"><span class="wn5f-day"><input class="form-input" type="date" id="wn5h-day" value="${_esc(p.day)}" aria-label="Ημέρα"><span class="wn5f-dayt" aria-hidden="true"></span></span>`
      + `<input class="form-input wn5h-hm" type="text" id="wn5h-hm" inputmode="numeric" maxlength="5" placeholder="ΗΗ:ΛΛ" autocomplete="off" value="${_esc(p.hm)}" aria-label="Ώρα"></span></label>`
      + `<label class="wn5f-f wn5h-place"><span>Πού *</span><input class="form-input" id="wn5h-place" placeholder="σημείωση" value="${_esc(place)}"></label>`
      + `<label class="wn5f-f wn5h-reason"><span>Λόγος *</span><select class="form-input" id="wn5h-reason">${_reasonOptions(reason)}</select></label>`
      + `<label class="wn5f-f wn5h-note" data-note><span data-notel>Σημείωση</span><input class="form-input" id="wn5h-note" value="${_esc(note)}"><span class="wn5h-ferr" data-ferr></span></label></div>`;
  }
  function _readChange(d) {
    const v = (id) => (d.el.querySelector('#' + id) || {}).value || '';
    const num = (id) => { const x = v(id); return x ? Number(x) : null; };
    const hm = _hm(v('wn5h-hm'));
    return { at: DAY.test(v('wn5h-day')) && HM.test(hm) ? _iso(v('wn5h-day'), hm) : null, place_note: v('wn5h-place').trim(), reason: v('wn5h-reason'),
      reason_note: v('wn5h-note').trim(), own: d.own, truck_id: num('wn5h-truck'), trailer_id: num('wn5h-trailer'), driver_id: num('wn5h-driver'),
      same_driver: !!(d.el.querySelector('#wn5h-same') || {}).checked, partner_id: num('wn5h-partner'), partner_rate: _num(v('wn5h-rate')) };
  }
  // Figma 2122:7800: «Μετά την αλλαγή · n τμήματα», borderless white rows on the grey block, a ⇄ line between two
  // segments «<place> · <day hh:mm> · <reason>» (the next segment's start).
  function _previewHTML(prev, cycle, hub) {
    const segs = prev.segments || [];
    const pay = _payrollLine(segs);
    return `<div class="wn5h-prev"><div class="wn5h-prev-h"><b>Μετά την αλλαγή · ${segs.length} ${segs.length === 1 ? 'τμήμα' : 'τμήματα'}</b><span>φορτία και στάσεις δεν αλλάζουν</span></div>`
      + segs.map((g, i) => (i ? `<div class="wn5h-hx"><b>⇄</b><span>${_esc([g.place_note, _when(g.from_at), _reasonText(g.reason)].filter(Boolean).join(' · '))}</span></div>` : '')
        + _segRowHTML(g, cycle, false, false, hub)).join('') + (pay ? `<div class="wn5h-pay">${_esc(pay)}</div>` : '') + '</div>';
  }
  // The preview describes ONE body: once the form no longer says that body (invalid, another reason, another mode)
  // its rows go too, or the screen would show a change nobody is asking for (fidelity T25).
  function _dropPreview(d) {
    d.prev = null;
    const p = d.el.querySelector('[data-preview]');
    if (p && p.firstChild) p.innerHTML = '';
  }
  function _setSave(d, on) { const b = d.el.querySelector('[data-act="save"]'); if (b) b.disabled = !on; }
  function _changeRefresh(d) {
    d.el.querySelectorAll('[data-own]').forEach((x) => { x.hidden = !d.own; });
    d.el.querySelectorAll('[data-par]').forEach((x) => { x.hidden = d.own; });
    _sameDriver(d);
    _dayText(d);
    const st = _readChange(d);
    _hints(d, st);
    const probs = _changeProblems(st);
    const key = probs.length ? null : JSON.stringify(_changeBody(st));
    if (!d.prev || d.prev.key !== key) _dropPreview(d);   // any change after the dry run drops its preview
    _otherNote(d, probs.includes(OTHER_NOTE));
    // the «required» lines stay quiet (the save is off); the «Άλλο» line sits under its field; the rest say themselves
    _lines(d, probs.filter((l) => l !== OTHER_NOTE && !/^(Πότε|Πού|Λόγος|Φορτηγό|Οδηγός|Συνεργάτης) \*/.test(l)).concat(_kept(d, key)));
    _setSave(d, !!key && !!d.prev && !d.prev.conflict && !d.locked && !d.busy && !d.done);
    if (d.timer) clearTimeout(d.timer);
    // a dry run that failed is not re-sent by itself for the same body (no automatic retry of /plan, decision 44)
    if (key && (!d.prev || d.prev.key !== key) && key !== d.failedKey) d.timer = setTimeout(() => _preview(d, key), 400);
    const from = d.el.querySelector('[data-from]');
    if (from) from.textContent = st.at ? `ΝΕΟ ΟΧΗΜΑ · ΑΠΟ ${_upper(_when(st.at))}` : 'ΝΕΟ ΟΧΗΜΑ';
    if (d.locked) d.el.querySelectorAll('.wn5f-ft [data-act="cancel"]').forEach((b) => { b.textContent = 'Κλείσιμο'; b.classList.add('wn5h-close'); });   // H7 tile 4
  }
  // «ίδιος οδηγός» ON: the disabled driver control shows the driver who keeps driving (Figma 2143:7768), not the
  // last pick; OFF gives the pick back. The body never sends driver_id with same_driver (072b), so this is display.
  function _sameDriver(d) {
    const drv = d.el.querySelector('#wn5h-driver');
    if (!drv) return;
    const on = !!(d.el.querySelector('#wn5h-same') || {}).checked;
    if (on !== !!d.sameOn) {
      d.sameOn = on;
      const id = d.now && d.now.driver_id;
      if (on) {
        d.drvBack = drv.value;
        if (Number.isSafeInteger(id) && ![...drv.options].some((o) => o.value === String(id))) {
          const o = document.createElement('option');
          o.value = String(id);
          o.textContent = d.now.driver || '#' + id;
          o.dataset.same = '1';
          drv.appendChild(o);
        }
        drv.value = Number.isSafeInteger(id) ? String(id) : '';
      } else {
        drv.value = d.drvBack || '';
        drv.querySelectorAll('option[data-same]').forEach((o) => o.remove());
      }
    }
    drv.disabled = on;
  }
  function _hints(d, st) {
    const set = (k, txt) => { const h = d.el.querySelector(`[data-hint="${k}"]`); if (h) h.textContent = txt; };
    const end = d.cycle && d.cycle.end_at;
    const tr = d.own && st.at ? _freeUntil(d.board, d.rtId, 'truck_id', st.truck_id, st.at, end) : null;
    const dr = d.own && st.at && !st.same_driver ? _freeUntil(d.board, d.rtId, 'driver_id', st.driver_id, st.at, end) : null;
    set('truck', tr ? 'ελεύθερο ως ' + _when(tr) : '');
    set('driver', dr ? 'ελεύθερος ως ' + _when(dr) : '');
  }
  async function _preview(d, key) {
    if (_d !== d) return;
    const body = JSON.parse(key);
    try {
      const ans = await planFetch('POST', `/plan/rt/${d.rtId}/handover`, { body, dry: true });
      if (_d !== d || JSON.stringify(_changeBody(_readChange(d))) !== key) return;   // the form moved on: this preview is stale
      const p = ans.preview || {};
      d.prev = { key, conflict: p.conflict || null };
      d.el.querySelector('[data-preview]').innerHTML = p.segments ? _previewHTML(p, d.cycle, d.hub) : '';
      if (Array.isArray(p.warnings) && p.warnings.length) WN5Act.strip(_strip(d), p.warnings); else if (!d.locked) WN5Act.strip(_strip(d), null);
    } catch (e) {
      if (_d !== d) return;
      d.failedKey = key;
      _failure(d, e, key);
    }
    _changeRefresh(d);
  }
  function _failure(d, e, key) {
    if (typeof PlanError === 'undefined' || !(e instanceof PlanError)) { _log(e, 'WN5Hand'); d.note = { key, lines: ['Δεν αποθηκεύτηκε: ' + String(e && e.message || e)] }; return; }
    WN5Act.strip(_strip(d), e);
    const K = PlanApi.KIND;
    if (e.kind === K.CLOSED) { WN5.markClosed(e); d.locked = true; }   // H7 tile 4: preview stays, the save waits for day L
    if (e.kind === K.LEAK) d.locked = true;
    if (e.kind === K.CLIENT && e.code === 'no_route') d.note = { key, lines: ['Η αλλαγή οχήματος δεν έχει ανέβει ακόμη (072b)'] };
    const f = FIELD_OF[e.code] && d.el.querySelector('#' + FIELD_OF[e.code]);
    if (f && f.closest('.wn5f-f')) f.closest('.wn5f-f').classList.add('bad');
  }
  async function _changeSave(d) {
    if (d.busy || d.done || d.locked || !d.prev || d.prev.conflict) return;
    const body = JSON.parse(d.prev.key);
    d.busy = true;
    _setSave(d, false);
    try {
      const ans = await planFetch('POST', `/plan/rt/${d.rtId}/handover`, { body, requestId: d.slot.id });
      d.slot.confirm();
      _done(d, `Η αλλαγή οχήματος γράφτηκε · τμήμα #${(ans.ids && ans.ids.segment_id) || '—'}${ans.replayed ? ' · το πρώτο πάτημα είχε ήδη αποθηκευτεί' : ''}`, ans.warnings);
    } catch (e) {
      if (typeof PlanError !== 'undefined' && e instanceof PlanError && e.kind === PlanApi.KIND.REUSED) {
        // the first press created the segment: find it on a fresh board before saying so
        const found = await WN5.findAfterReuse((b) => {
          const c = (b.cycles || []).find((x) => x.rt_id === d.rtId);
          return c && (c.segments || []).find((g) => Date.parse(g.from_at) === Date.parse(body.at)) || null;
        });
        if (found) { d.slot.confirm(); _done(d, `Η αλλαγή οχήματος γράφτηκε · τμήμα #${found.segment_id} · βρέθηκε στο Εβδομαδιαίο`, []); return; }
        d.locked = true;
      }
      _failure(d, e, d.prev && d.prev.key);
    } finally {
      d.busy = false;
      if (!d.done) _changeRefresh(d);
    }
  }
  function _done(d, line, warnings) {
    d.done = true;
    const el = d.el.querySelector('[data-done]');
    el.hidden = false;
    el.textContent = line;
    if (Array.isArray(warnings) && warnings.length) WN5Act.strip(_strip(d), warnings); else WN5Act.strip(_strip(d), null);
    const s = d.el.querySelector('[data-act="save"]');
    if (s) s.hidden = true;
    d.el.querySelectorAll('.wn5f-ft [data-act="cancel"]').forEach((b) => { b.textContent = 'Κλείσιμο'; b.classList.add('wn5h-close'); });
    WN5.reload('handover');
  }
  function _vehFields(own, sel) {
    // Figma 2122:7774: Φορτηγό * 170 · Ρυμούλκα 130 · Οδηγός * 180 (plates in DM Mono); partner 150 + rate 96
    return own
      ? `<label class="wn5f-f wn5h-truck wn5h-mono"><span>Φορτηγό *</span><select class="form-input" id="wn5h-truck" data-fh-search>${_opts('truck', sel.truck_id, '', sel.truck)}</select><span class="wn5h-hint" data-hint="truck"></span></label>`
        + `<label class="wn5f-f wn5h-trailer wn5h-mono"><span>Ρυμούλκα</span><select class="form-input" id="wn5h-trailer" data-fh-search>${_opts('trailer', sel.trailer_id, '—', sel.trailer)}</select></label>`
        + `<label class="wn5f-f wn5h-driver"><span>Οδηγός *</span><select class="form-input" id="wn5h-driver" data-fh-search>${_opts('driver', sel.driver_id, '', sel.driver)}</select><span class="wn5h-hint" data-hint="driver"></span></label>`
      : `<label class="wn5f-f wn5h-partner"><span>Συνεργάτης *</span><select class="form-input" id="wn5h-partner" data-fh-search>${_opts('partner', sel.partner_id, '', sel.partner)}</select></label>`
        + `<label class="wn5f-f wn5h-rate"><span>Κόμιστρο €</span><input class="form-input" id="wn5h-rate" inputmode="decimal" value="${sel.partner_rate == null ? '' : _esc(sel.partner_rate)}"></label>`;
  }
  async function change(rtId) {
    const board = await _board();
    const c = board && (board.cycles || []).find((x) => x.rt_id === rtId);
    if (!c) { if (typeof toast === 'function') toast('Ο κύκλος δεν βρέθηκε στην εβδομάδα που φαίνεται — ανανέωσε', 'warn'); return false; }
    const ids = await PlanIds.load();
    const segs = WN5L.segmentsOf(c).segments;
    const now = segs[segs.length - 1] || {};
    const html = _whenRowHTML({ day: '', hm: '' }, '', '', '')
      + `<div class="wn5f-sec" data-from>ΝΕΟ ΟΧΗΜΑ</div><div class="wn5h-tog" role="radiogroup">`
      + `<button type="button" class="on" role="radio" aria-checked="true" data-vmode="own">Δικό μας</button><button type="button" role="radio" aria-checked="false" data-vmode="partner">Συνεργάτης</button></div>`
      + `<div class="wn5h-vrow" data-own>${_vehFields(true, {})}`
      + `<label class="wn5h-same"><input type="checkbox" role="switch" class="wn5h-sw" id="wn5h-same"${now.driver ? '' : ' disabled'}><span>ίδιος οδηγός (${_esc(now.driver || '—')})</span></label></div>`
      + `<div class="wn5h-vrow wn5h-prow" data-par hidden>${_vehFields(false, {})}</div>`
      + `<div data-strip></div><div data-preview></div>`;
    // head: the current vehicle (truck only, or the partner) · driver · the cycle window (Figma 2122:7739)
    const cur = now.trip_type === 'PARTNER' ? (now.partner || 'Συνεργάτης') : (now.truck || 'χωρίς φορτηγό');
    const d = _open('handover', `Αλλαγή οχήματος · ${_esc(c.code || 'RT-' + rtId)}`, `· ${[cur, now.driver].filter(Boolean).map(_esc).join(' · ')} · ${_whenD(c.start_at)} → ${_whenD(c.end_at)}`,
      html, '', 'Αλλαγή οχήματος');
    d.rtId = rtId;
    d.cycle = c;
    d.board = board;
    d.now = now;
    d.hub = _hubOf(board);
    d.own = true;
    d.slot = PlanApi.slot();   // ONE id for the execution of this open form, never on its dry runs
    if (typeof fhSelectSearchIn === 'function') fhSelectSearchIn(d.el);   // the vehicle-dropdown rule (13/10)
    if (!ids.ok) { WN5Act.strip(_strip(d), ids.err); d.locked = true; }
    d.el.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-act],[data-vmode]');
      if (!t || !d.el.contains(t)) return;
      if (t.dataset.vmode) {
        d.own = t.dataset.vmode === 'own';
        d.el.querySelectorAll('[data-vmode]').forEach((x) => { x.classList.toggle('on', x === t); x.setAttribute('aria-checked', String(x === t)); });
        _unmark(d);
        _changeRefresh(d);
        return;
      }
      if (t.dataset.act === 'cancel') { if (!d.busy) _close(); return; }
      if (t.dataset.act === 'save' && !t.disabled) _changeSave(d);
    });
    const edit = () => { _unmark(d); _changeRefresh(d); };
    d.el.addEventListener('input', edit);
    d.el.addEventListener('change', edit);
    d.el.addEventListener('focusout', (ev) => { if (ev.target && ev.target.id === 'wn5h-hm' && ev.target.value) ev.target.value = _hm(ev.target.value); });
    _changeRefresh(d);
    return true;
  }

  // ── fix ────────────────────────────────────────────────────────────────────────────────────────────────────
  async function fix(segmentId) {
    const board = await _board();
    let c = null, g = null, i = -1;
    for (const x of (board && board.cycles) || []) { const s = WN5L.segmentsOf(x).segments; const k = s.findIndex((y) => y.segment_id === segmentId); if (k >= 0) { c = x; g = s[k]; i = k; break; } }
    if (!g) { if (typeof toast === 'function') toast('Το τμήμα δεν βρέθηκε στην εβδομάδα που φαίνεται — ανανέωσε', 'warn'); return false; }
    const ids = await PlanIds.load();
    const first = i === 0;
    const p = _parts(g.from_at) || { day: '', hm: '' };
    // the first segment starts with the cycle: no time, point or reason of its own (Figma 2130:7809)
    const html = (first ? '' : _whenRowHTML(p, g.place_note || '', g.reason, g.reason_note || ''))
      + `<div class="wn5h-vrow${g.trip_type === 'PARTNER' ? ' wn5h-prow' : ''}">${_vehFields(g.trip_type !== 'PARTNER', g)}</div>`
      + `<div data-strip></div><div data-preview></div>`;
    const d = _open('fix', `Διόρθωση τμήματος ${SEG_GR[g.label] || ''} · ${_esc(c.code || 'RT-' + c.rt_id)}`, `· ${_when(g.from_at)} → ${_when(g.to_at)}`, html, '', 'Αποθήκευση');
    d.cycle = c;
    d.hub = _hubOf(board);
    if (typeof fhSelectSearchIn === 'function') fhSelectSearchIn(d.el);
    if (!ids.ok) { WN5Act.strip(_strip(d), ids.err); d.locked = true; }   // as change(): no catalogue, no save
    const read = () => {
      const v = (id) => (d.el.querySelector('#' + id) || {}).value;
      const st = {};
      if (!first) {
        const hm = _hm(v('wn5h-hm') || '');
        st.at = DAY.test(v('wn5h-day') || '') && HM.test(hm) ? _iso(v('wn5h-day'), hm) : null;
        st.place_note = (v('wn5h-place') || '').trim(); st.reason = v('wn5h-reason') || ''; st.reason_note = (v('wn5h-note') || '').trim();
      }
      for (const [k, id] of [['truck_id', 'wn5h-truck'], ['trailer_id', 'wn5h-trailer'], ['driver_id', 'wn5h-driver'], ['partner_id', 'wn5h-partner']]) if (v(id) !== undefined) st[k] = v(id) ? Number(v(id)) : null;
      if (v('wn5h-rate') !== undefined) st.partner_rate = _num(v('wn5h-rate'));
      return st;
    };
    const refresh = () => {
      _dayText(d);
      const st = read();
      const probs = first ? [] : _changeProblems(Object.assign({ own: true, truck_id: 0, driver_id: 0 }, st)).filter((l) => !/^(Φορτηγό|Οδηγός|Συνεργάτης)/.test(l));
      // own:true above skips the rate rule, and the first segment skips every rule: «abc» would be NaN, which
      // _fixSet counts as a change and JSON sends as null — one press wiping the partner's rate (review T25)
      if (_rateBad(st.partner_rate)) probs.push(RATE_BAD);
      const rf = d.el.querySelector('.wn5h-rate');
      if (rf) rf.classList.toggle('bad', probs.includes(RATE_BAD));
      const set = probs.length ? {} : _fixSet(g, st);
      const key = Object.keys(set).length ? JSON.stringify({ set }) : null;
      if (!d.prev || d.prev.key !== key) _dropPreview(d);
      _otherNote(d, probs.includes(OTHER_NOTE));
      _lines(d, probs.filter((l) => l !== OTHER_NOTE && !/^(Πότε|Πού|Λόγος) \*/.test(l)).concat(_kept(d, key)));
      _setSave(d, !!key && !!d.prev && !d.prev.conflict && !d.locked && !d.busy && !d.done);
      if (d.locked) d.el.querySelectorAll('.wn5f-ft [data-act="cancel"]').forEach((b) => { b.textContent = 'Κλείσιμο'; b.classList.add('wn5h-close'); });
      if (d.timer) clearTimeout(d.timer);
      if (key && !d.prev && key !== d.failedKey) d.timer = setTimeout(async () => {
        try {
          const ans = await planFetch('PATCH', `/plan/segments/${segmentId}`, { body: JSON.parse(key), dry: true });
          if (_d !== d) return;
          d.prev = { key, conflict: (ans.preview && ans.preview.conflict) || null };
          d.el.querySelector('[data-preview]').innerHTML = ans.preview && ans.preview.segments ? _previewHTML(ans.preview, c, d.hub) : '';
        } catch (e) { if (_d !== d) return; d.failedKey = key; _failure(d, e, key); }
        refresh();
      }, 400);
    };
    d.el.addEventListener('click', async (ev) => {
      const t = ev.target.closest('[data-act]');
      if (!t || !d.el.contains(t)) return;
      if (t.dataset.act === 'cancel') { if (!d.busy) _close(); return; }
      if (t.dataset.act !== 'save' || t.disabled || !d.prev) return;
      d.busy = true;
      _setSave(d, false);
      try {
        const ans = await planFetch('PATCH', `/plan/segments/${segmentId}`, { body: JSON.parse(d.prev.key) });   // no request_id: a fix creates nothing
        _done(d, 'Η διόρθωση γράφτηκε', ans.warnings);
      } catch (e) { _failure(d, e, d.prev && d.prev.key); }
      finally { d.busy = false; if (!d.done) refresh(); }
    });
    const edit = () => { _unmark(d); refresh(); };
    d.el.addEventListener('input', edit);
    d.el.addEventListener('change', edit);
    d.el.addEventListener('focusout', (ev) => { if (ev.target && ev.target.id === 'wn5h-hm' && ev.target.value) ev.target.value = _hm(ev.target.value); });
    refresh();
    return true;
  }

  // ── H4 removal ─────────────────────────────────────────────────────────────────────────────────────────────
  // POST /plan/segments/:id/remove: owner + dispatcher (PLAN_PERMS of 072b; the button is there for everyone and
  // the Worker's 403 speaks). The preview's conflict (the previous vehicle is busy again) refuses BEFORE any list,
  // so it is read with one dry run of our own; only then the shared two-step (list, token, 428, stale_confirm).
  // No request_id: a second press by the same user is the base's replayed:true (H-15), the same success.
  const _who = (g) => (g.trip_type === 'PARTNER' ? (g.partner || 'Συνεργάτης') : [g.truck, g.driver].filter(Boolean).join(' · ') || 'χωρίς όχημα');
  // «Τι θα γίνει» of H4 (Figma 2125:7749-7768), built from the board the screen holds: the segment goes, the previous
  // vehicle runs again to the removed segment's end, then what the base listed. The payroll row is Figma's «η μισθοδοσία
  // του <οδηγού> σβήνεται» with the name as the base holds it: every driver name is in Latin script (82/82, 28/10), which
  // Greek does not decline («του Nikos …»); a made-up Greek genitive could misname him.
  function _removeWhat(g, prev, list) {
    const rows = [`${SEG_GR[g.label] || 'Τμήμα'} (${_who(g)}) → αφαιρείται`];
    if (prev) rows.push(`${_who(prev)} → ξανά ως ${_when(g.to_at)}`);
    if (list.some((x) => x && x.kind === 'payroll_amount')) rows.push(`η μισθοδοσία του ${g.driver || 'οδηγού'} σβήνεται`);
    const costs = (WN5Act._kit && typeof WN5Act._kit.costRows === 'function') ? WN5Act._kit.costRows(list, false) : [];
    return rows.concat(costs, ['φορτία και στάσεις δεν αλλάζουν']);
  }
  async function remove(segmentId) {
    const board = await _board();
    let c = null, g = null, i = -1, segs = [];
    for (const x of (board && board.cycles) || []) { const s = WN5L.segmentsOf(x).segments; const k = s.findIndex((y) => y.segment_id === segmentId); if (k >= 0) { c = x; g = s[k]; i = k; segs = s; break; } }
    if (!g) { if (typeof toast === 'function') toast('Το τμήμα δεν βρέθηκε στην εβδομάδα που φαίνεται — ανανέωσε', 'warn'); return null; }
    const path = `/plan/segments/${segmentId}/remove`;
    const title = `Αφαίρεση αλλαγής · ${c.code || 'RT-' + c.rt_id} · ${g.place_note || '—'} ${_when(g.from_at)};`;
    // A refusal before any list (a failed dry run, a preview conflict) has nothing to confirm: the H4 shell (600 wide,
    // Figma 2125:7738) with one «Κλείσιμο» where H4 has Άκυρο — the frame has no «×» (style.css hides it); Esc too.
    // Without this listener the shell had no working exit but Esc (whole-frame pass, T26 ledger line).
    const refuse = (html) => {
      const d = _open('remove', _esc(title), '', html, '', null);
      d.el.insertAdjacentHTML('beforeend', '<div class="wi4-dlg-ft wn5f-ft"><button type="button" class="wi4-btn" data-act="cancel">Κλείσιμο</button></div>');
      d.el.addEventListener('click', (ev) => { if (ev.target.closest('[data-act="cancel"]') && !d.busy) _close(); });
      return d;
    };
    let dry;
    try { dry = await planFetch('POST', path, { body: {}, dry: true }); }
    catch (e) {
      _failure(refuse(''), e);
      return null;
    }
    const conflict = dry && dry.preview && dry.preview.conflict;
    if (conflict) {
      const d = refuse('<div class="wn5f-note">Η αφαίρεση δεν γίνεται: το προηγούμενο όχημα δεν είναι ελεύθερο ως το τέλος του τμήματος.</div>');
      // the H7 strip like every other refusal of the handover (2130:7735): «ΔΕΝ ΑΠΟΘΗΚΕΥΤΗΚΕ · <the Worker's message>»
      WN5Act.strip(_strip(d), { kind: 'refusal', code: conflict.code, message: conflict.message });
      return null;
    }
    const prev = i > 0 ? segs[i - 1] : null;
    const ans = await WN5Act.twoStep({ method: 'POST', path, body: {}, kind: 'remove', title, verb: 'Αφαίρεση', danger: true, note: true,
      what: (list) => _removeWhat(g, prev, list) });
    if (ans) {
      if (typeof toast === 'function') toast(`Η αλλαγή οχήματος αφαιρέθηκε · ${c.code || 'RT-' + c.rt_id}${ans.replayed ? ' · το πρώτο πάτημα είχε ήδη αποθηκευτεί' : ''}`, 'success');
      WN5.reload('segment-removed');
    }
    return ans;
  }

  window.WN5Hand = Object.freeze({ cycleCard, change, fix, remove, _changeBody, _changeProblems, _fixSet, _payrollLine, _freeUntil });
})();
