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
//  4. «Σε φορτηγό ▾» is the Δ1 window of wn5_actions.js (one component for two uses, S-115).
//  5. Colours only through classes of assets/style.css (critics unit weekly_natl_v5: hex 0).
//  6. The hub[] of the live 072 has no destination or windows (Ε-26) and no for_split (Ε-41): the rows say «—»
//     where a value did not come, never a guess; the Δ1 window says the destination is missing (T12).
(function () {
  'use strict';
  const K = () => WN5Act._kit;
  const _live = () => typeof WN5 !== 'undefined' && WN5.active();
  const DOW_UP = ['ΚΥΡ', 'ΔΕΥ', 'ΤΡΙ', 'ΤΕΤ', 'ΠΕΜ', 'ΠΑΡ', 'ΣΑΒ'];       // typed in capitals (no text-transform)
  // the closed line's chevron is drawn (Figma 2011:7930 icon/right), its colour from CSS through currentColor
  const CHEV = '<svg class="wn5-hub-chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 9L7.5 6L4.5 3" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let _open = false;                    // survives a re-read: after «Σπάσε» the panel comes back open

  const _num = (n) => (typeof n === 'number' && isFinite(n) ? n : 0);
  const _sumP = (list) => list.reduce((s, x) => s + _num(x.pallets), 0);
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
  function _hubDay(model) {
    const k = K();
    const hub = model.hub;
    let days = (hub.split || []).map((h) => (k.item(h.pieceId) || {}).nat_ready_day).filter(Boolean);
    if (!days.length) days = (hub.stock || []).map((h) => (h.overdue ? hub.day : h.leave_by)).filter(Boolean);
    let d = days.sort()[0] || hub.day || null;
    if (d && model.week) { const last = k.addDays(model.week, 6); if (d < model.week) d = model.week; else if (d > last) d = last; }
    return d;
  }
  // the cycles of the hub's day that load at Veroia (their KATHODOS has a Veroia stop)
  function _trucks(day) {
    const k = K();
    return k.dayRows(day).filter((r) => r.kath && r.kath.veroia).map((r) => {
      const c = k.cycle(r.rtId);
      return c ? { rtId: r.rtId, c, r, pal: k.sidePal(r, 'KATHODOS'), win: k.veroiaOf(r, 'KATHODOS') } : null;
    }).filter(Boolean);
  }
  // the delivery place, by name, only when the board sent it (Ε-26) and the catalogue has it; else nothing
  function _placeOf(raw) {
    if (raw.nat_to_location_id == null || typeof PlanIds === 'undefined') return '';
    const p = PlanIds.place(raw.nat_to_location_id);
    return p && p.name ? p.name : '';
  }
  function _itemHTML(h, isStock, day) {
    const k = K();
    const raw = k.item(h.pieceId) || {};
    const pid = k.id(h.pieceId);
    // WN5L's shape check rejects a bad id before paint; if one still slips through, the dropped row is logged (principle 1)
    if (!pid) { k.log(new Error('wn5: hub item without a valid piece id ' + JSON.stringify(h.pieceId)), 'WN5Hub item'); return ''; }
    // «παρ. Τρί 07:00–09:00»; without the window (072 hub[], Ε-26) «παρ. —», never a guess
    const win = 'παρ. ' + (raw.deliver_from ? _wd(k.ymdOf(raw.deliver_from)) + ' ' + k.hm(raw.deliver_from) + '–' + k.hm(raw.deliver_to) : '—');
    const sub = isStock
      ? '<span class="' + (h.overdue ? 'wn5-late' : 'wn5-leave') + '">' + k.esc(_stockLine(h, raw, day)) + '</span>'
      : '<span>' + k.esc((raw.reference || '—') + (raw.for_split === true ? ' · από ✈ «Σπάσιμο»' : '')) + '</span>';
    const split = isStock ? '' : '<button type="button" class="wi4-btn sm wn5-hub-b wn5-split-b" data-hub="split" onclick="event.stopPropagation();WN5Hub.split(' + pid + ', this)">Σπάσε…</button>';
    return '<div class="wn5-hub-it" data-piece="' + pid + '"><span class="wn5-hub-c1"><b>' + k.esc(h.client || '—') + '</b><span>' + k.esc(_placeOf(raw)) + '</span></span>'
      + '<span class="wn5-hub-c2"><b>' + k.esc(win) + '</b>' + sub + '</span><span class="wn5-hub-sp"></span><span class="wn5-hub-p">' + k.esc(k.pal(h.pallets)) + 'π</span>'
      + '<span class="wn5-hub-a">' + split + '<button type="button" class="wi4-btn sm wn5-hub-b" data-hub="truck" onclick="event.stopPropagation();WN5Hub._truck(' + pid + ')">Σε φορτηγό ▾</button></span></div>';
  }
  function shelfHTML(model) {
    const k = typeof WN5Act !== 'undefined' ? K() : null;
    const hub = model && model.hub;
    if (!k || !hub || hub.empty || (!(hub.split || []).length && !(hub.stock || []).length)) return '';   // empty = hidden
    const split = hub.split || [], stock = hub.stock || [];
    const day = _hubDay(model);
    const trucks = day ? _trucks(day) : [];
    // the summary drops a part that is zero (Δ11 header: «· απόθεμα 17π», no «για μοίρασμα»)
    const sum = [split.length ? split.length + ' για μοίρασμα · ' + k.pal(_sumP(split)) + 'π' : null,
      stock.length ? 'απόθεμα ' + k.pal(_sumP(stock)) + 'π' : null].filter(Boolean).join(' · ');
    const dayTxt = day ? k.dayShort(day) : '—';
    if (!_open) {
      // the closed line names what waits to be split (Figma 2011:7934), not the stock
      const names = split.slice(0, 3).map((h) => (h.client || '—') + ' ' + k.pal(h.pallets) + 'π').join(' · ');
      return '<div id="wn5-hub" class="wn5-hub"><button type="button" class="wn5-hub-t" data-hub="open" onclick="WN5Hub.open()">' + CHEV + '<span class="wn5-hub-n">ΒΕΡΟΙΑ</span></button>'
        + '<span class="wn5-hub-s">· ' + k.esc(dayTxt + (sum ? ' · ' + sum : '')) + '</span>'
        + (names ? '<span class="wn5-hub-names">· ' + k.esc(names) + '</span>' : '')
        + '<span class="wn5-hub-sp"></span>'
        + '<button type="button" class="wi4-link wn5-hub-o" data-hub="open" onclick="WN5Hub.open()">Άνοιγμα ▸</button></div>';
    }
    // «3 φορτηγά φορτώνουν 16:00–20:00»: the earliest start and the latest end of the day's Veroia windows
    const wins = trucks.map((t) => t.win).filter(Boolean).map((w) => w.split('–'));
    const span = wins.length ? ' ' + wins.map((w) => w[0]).sort()[0] + '–' + wins.map((w) => w[1]).sort().reverse()[0] : '';
    const load = trucks.length ? trucks.length + (trucks.length === 1 ? ' φορτηγό φορτώνει' : ' φορτηγά φορτώνουν') + span : '';
    const rest = [sum, load].filter(Boolean).join(' · ');
    let left = '';
    if (split.length) left += '<div class="wn5-grp-h wn5-hub-gh">ΓΙΑ ΜΟΙΡΑΣΜΑ · ' + split.length + ' · ' + k.esc(k.pal(_sumP(split))) + 'π</div>' + split.map((h) => _itemHTML(h, false, day)).join('');
    if (stock.length) left += '<div class="wn5-grp-h wn5-hub-gh">ΑΠΟΘΕΜΑ · ' + stock.length + ' · ' + k.esc(k.pal(_sumP(stock))) + 'π</div>' + stock.map((h) => _itemHTML(h, true, day)).join('');
    const dd = day ? DOW_UP[k.dow(day)] + ' ' + k.dm(day) : '—';
    let right = '<div class="wn5-grp-h wn5-hub-gh">ΦΟΡΤΗΓΑ ' + k.esc(dd) + ' · χωρητικότητα</div>';
    if (!trucks.length) right += '<p class="wn5-none wn5-hub-none">κανένα φορτηγό δεν φορτώνει στη Βέροια αυτή την ημέρα</p>';
    for (const t of trucks) {
      const free = 33 - t.pal;
      // over 33 is a warning, never a refusal (Ε-17): the overflow in amber instead of the free places
      // the box names the vehicle and its driver only (Figma 2011:8786): the board tile's «· κύκλος n» is not repeated
      // here. A one-segment own tile's driver is the cycle's (WN5L builds that segment from the cycle); a multi-segment
      // tile already carries no «κύκλος» (Σ5) and keeps its own line.
      const tx = k.cycText(t.c, t.r);
      if (tx.cls === 'own' && !(t.r && t.r.tiles && t.r.tiles.length > 1)) tx.l2 = t.c.driver || 'χωρίς οδηγό';
      right += '<div class="wn5-hub-tr" data-line="cap">' + k.boxHTML(tx) + '<span class="wn5-hub-chip">' + k.esc(t.win || 'όλη μέρα') + '</span>'
        + '<span class="wn5-hub-sp"></span><span class="wn5-hub-x33' + (free < 0 ? ' over' : '') + '">' + k.esc(k.pal(t.pal)) + '/33</span>'
        + '<span class="wn5-hub-free' + (free < 0 ? ' over' : '') + '">· ' + (free >= 0 ? k.esc(k.pal(free)) + ' ελεύθερες' : 'υπέρβαση ' + k.esc(k.pal(-free))) + '</span></div>';
    }
    return '<div id="wn5-hub" class="wn5-hub open"><div id="wn5-hub-panel" class="wn5-hub-panel" role="region" aria-label="Πίνακας Βέροιας">'
      + '<div class="wn5-hub-hd"><span class="wn5-hub-g2" aria-hidden="true">▾</span><span class="wn5-hub-n">ΒΕΡΟΙΑ</span><span class="wn5-hub-d">· ' + k.esc(dayTxt) + '</span>'
      + (rest ? '<span class="wn5-hub-s2">· ' + k.esc(rest) + '</span>' : '') + '<span class="wn5-hub-sp"></span>'
      + '<button type="button" class="wi4-btn sm wn5-hub-x" data-hub="close" onclick="WN5Hub.close()">Κλείσιμο</button></div>'
      + '<div class="wn5-hub-g"><div class="wn5-hub-l">' + left + '</div><div class="wn5-hub-r">' + right + '</div></div></div></div>';
  }
  function _redraw() {
    const el = document.getElementById('wn5-hub');
    const st = WN5.state();
    if (el && st && st.model) el.outerHTML = shelfHTML(st.model);
  }
  function open() { if (!_live()) return; _open = true; _redraw(); }
  function close() { if (!_live()) return; _open = false; _redraw(); }

  function _truck(pieceId) {
    if (!_live()) return null;
    const k = K();
    const st = WN5.state();
    const day = st && st.model && st.model.hub ? _hubDay(st.model) : null;
    return WN5Act.assign({ pieces: [{ piece_id: k.id(pieceId) }] }, { entry: 'hub', day, side: 'KATHODOS' });
  }

  // ═══ «Σπάσε…» (Figma 2011:8822): parts that add up, one POST with a request_id ═══
  const _valid = (s) => { const n = Number(String(s == null ? '' : s).trim().replace(',', '.')); return Number.isFinite(n) && n > 0 && Math.round(n * 10) === n * 10 ? n : null; };
  function _splitBody(st) {
    return { piece_id: st.pieceId, parts: st.parts.map((p) => {
      const o = { pallets: _valid(p.pal) };
      if (p.rt) { o.target = { rt_id: p.rt, side: 'KATHODOS' }; o.stops = p.stops; }
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
    const hubSt = WN5.state();
    const day = hubSt && hubSt.model && hubSt.model.hub ? _hubDay(hubSt.model) : it.nat_ready_day;
    const hubId = k.hubId();
    // the snapshot (rule 4): the piece, its needs, the day's Veroia cycles with their delivery stops
    const st = { pieceId: pid, total: it.pallets, item: k.copy(it), needs: k.needs(it, false, hubId),
      trucks: _trucks(day).map((t) => ({ rtId: t.rtId, cyc: k.copy(t.c), label: k.cycText(t.c, t.r).l1.split(' · ')[0] + (t.win ? ' · ' + t.win : ''), pal: t.pal,
        sideStops: k.copy((t.c.stops || []).filter((s) => s.side === 'KATHODOS' && s.location_id !== hubId)) })),
      parts: [{ t: '', rt: null, pal: '', stops: null }, { t: 'stay', rt: null, pal: '', stops: null }],
      slot: PlanApi.slot() };
    // a popover over the panel, under its «Σπάσε…» (Figma 2011:8744: drawn floating over the board), no «×»
    const d = k.dlg('split', 'Σπάσε · ' + (it.client || '—') + ' · ' + k.pal(it.pallets) + 'π', { pop: true, anchor: anchor && anchor.getBoundingClientRect ? anchor : null, onClose: () => st.slot.close() });
    d.ft.innerHTML = '<button type="button" class="wi4-btn" data-act="cancel">Άκυρο</button><button type="button" class="wi4-btn pri" data-act="save">Σπάσε</button>';
    const sumHTML = () => {
      const ns = st.parts.map((p) => _valid(p.pal));
      const s = ns.reduce((a, n) => a + (n || 0), 0);
      const okSum = Math.round(s * 10) === Math.round(st.total * 10) && ns.every((n) => n !== null);
      return '<span class="wn5-sum' + (okSum ? ' ok' : '') + '">' + k.esc(ns.map((n) => (n === null ? '—' : k.pal(n))).join(' + ') + ' = ' + k.pal(s) + (okSum ? ' ✓' : ' · πρέπει ' + k.pal(st.total))) + '</span>';
    };
    // what a part does: on a truck «before → after/33 · μπαίνει kη» (Figma 2011:8832); staying, the deadline only
    // when the piece already has one — the base writes it at the save (nat_due_day − 1), the screen never guesses it
    const badgeHTML = (p) => {
      const tr = p.rt ? st.trucks.find((t) => t.rtId === p.rt) : null;
      if (tr) {
        const after = tr.pal + (_valid(p.pal) || 0);
        let rank = null;
        try { if (typeof WN5L !== 'undefined' && st.item.deliver_from) rank = WN5L.stopRank(tr.sideStops, st.item.deliver_from); } catch (e) { k.log(e, 'WN5Hub split stopRank'); }
        return '<span class="wn5-cap' + (after > 33 ? ' over' : '') + '">' + k.esc(k.pal(tr.pal) + ' → ' + k.pal(after) + '/33' + (after > 33 ? ' · υπέρβαση ' + k.pal(after - 33) : '') + (rank > 0 ? ' · μπαίνει ' + rank + 'η' : '')) + '</span>'
          + (p.stops ? '' : ' <span class="wn5-miss">λείπει ο προορισμός από τη βάση</span>');
      }
      if (p.t !== 'stay') return '';
      return st.item.leave_by
        ? '<span class="wn5-part-u">φεύγει ως</span><span class="wn5-part-d">' + k.esc(k.dayShort(st.item.leave_by) + ' 22:00') + '</span>'
        : '<span class="wn5-part-u">μένει απόθεμα · η προθεσμία γράφεται με την αποθήκευση</span>';
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
      // a part on a truck needs its stops on that cycle: the Veroia stop and the delivery (072 plan_h_put per part)
      const tr = p.rt ? st.trucks.find((t) => t.rtId === p.rt) : null;
      const r = tr ? k.stopsFor(st.needs, tr.cyc, 'KATHODOS', null) : null;
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

  window.WN5Hub = { shelfHTML, open, close, split, _truck };
})();
