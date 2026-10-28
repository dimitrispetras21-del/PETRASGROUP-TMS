// National v5 F4α — the driver sheet per cycle (A4) and the same as a WhatsApp text (Figma KO7l2AfucR3HJEDIg1Yptr
// 2011:10998, Δ10; per segment = T27, H5 2128:7735). One global: WN5Sheet. Read only.
// Rules (Δ10, spec §L): no price, no partner rate, no amount — the sheet leaves the building; Veroia only as «Αποθήκη
// Βέροιας», our own warehouse for the driver (the hub is never shown to a client); per stop: address, phone,
// window from–to, pallets, temperature, pallet return, reference (a VS: the international's, legs[].reference);
// every unknown is «—», never an empty cell. The pure core (lines / text / html) runs in node tests; print() reads
// the board and the catalogues (PlanIds, Ε-2) and opens the print window; nothing happens at load.
(function () {
  'use strict';
  const SIDE_GR = Object.freeze({ KATHODOS: 'ΚΑΘΟΔΟΣ', ANODOS: 'ΑΝΟΔΟΣ' });
  const SEG_GR = Object.freeze({ initial: 'ΑΡΧΙΚΟ', intermediate: 'ΕΝΔΙΑΜΕΣΟ', final: 'ΤΕΛΙΚΟ' });
  // The print window loads no style.css: these tokens' values travel with it, so the A4 keeps one colour source.
  // The greys are the Weekly's (Figma 2011:10999 draws #344054 / #5b6b7f / #98a2b3, not --text-mid).
  const TOKENS = ['--surface-dark', '--surface-card', '--accent', '--accent-text', '--text-dim', '--border', '--wi4-grey-1', '--wi4-grey-2', '--wi4-grey-3',
    '--wn5-seg-initial', '--wn5-seg-intermediate', '--wn5-seg-final'];   // H5 2128:7981: the segment line under the band
  // The print shell (core/utils.js _printWeekShell) loads DM Sans 400/500 only: the A4's 600/700 and the plates'
  // DM Mono come from here, the app's own families (app.html), or the browser would fake the bold and drop the mono.
  const FONTS = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@500&display=swap';
  const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const _log = (e, where) => { try { if (typeof logError === 'function') logError(e, where); } catch (_) { /* the sheet's own failure stays visible */ } };
  const _parts = (iso) => (typeof WN5Form !== 'undefined' ? WN5Form._parts(iso) : null);
  const _dlab = (day) => (typeof WI4 !== 'undefined' && WI4.dayLabel ? WI4.dayLabel(day) : String(day || ''));
  const _dow = (day) => _dlab(day).split(' ')[0];
  const _hm = (iso) => (_parts(iso) || {}).hm || '—';
  // F1 (owner 28/10): a stop entered without a window is its whole day; the driver reads «όλη η ημέρα», never an hour
  // nobody agreed. The rule is WN5L.allDay (one rule, core/wn5-logic.js); without it the hours are printed as they are.
  const _hmWin = (a, b) => (typeof WN5L !== 'undefined' && WN5L.allDay(a, b) ? 'όλη η ημέρα' : `${_hm(a)}–${_hm(b)}`);
  const _pal = (n) => String(Math.round((Number(n) || 0) * 10) / 10).replace('.', ',');
  // F1/F4 (080): the driver reads «;» for pallets not known yet and «12+;» for a sum with such pieces — never 0
  const _palU = (n, unk) => WN5L.palText(n, unk);   // one rule: core/wn5-logic.js, loaded before this file
  const _unk = (legs) => legs.filter((l) => l.pallets == null).length;
  const _temp = (ts, sp) => (ts.length ? ts.slice().sort((a, b) => a - b).map((t) => (t > 0 ? '+' : '') + t).join(sp ? ' / ' : '/') + (sp ? ' °C' : '°C') : '—');
  const _dash = (v) => (v == null || String(v).trim() === '' ? '—' : String(v));

  // The stops of one side, by seq (the order of the cycle).
  function _partStops(cycle, side) {
    return (cycle.stops || []).filter((s) => s.side === side).sort((a, b) => a.seq - b.seq);
  }
  // Ε-12 (T28, F3): the pallet return per stop, from legs[].pallet_exchange when the board brings it. At a delivery
  // the driver takes the empties back («παίρνεις n»), at a loading he gives them («δίνεις n»). An absent key is
  // «not known» = «—», never «no exchange» (trap 2: absence is not a value).
  function _pe(legs, loading) {
    const known = legs.filter((l) => typeof l.pallet_exchange === 'boolean');
    if (!known.length) return '—';
    const pe = known.filter((l) => l.pallet_exchange);
    const n = pe.reduce((a, l) => a + (Number(l.pallets) || 0), 0), u = _unk(pe);
    return n || u ? `${loading ? 'δίνεις' : 'παίρνεις'} ${_palU(n, u)}` : '—';
  }
  function _stopLine(s, side, P, n) {
    const legs = s.legs || [];
    const loads = legs.filter((l) => l.act === 'load');
    const unloads = legs.filter((l) => l.act !== 'load');
    const hub = P.hubId != null && s.location_id === P.hubId;
    const end = hub && side === 'ANODOS' && !loads.length;
    const use = loads.length ? loads : unloads;
    const place = P.byId[s.location_id] || null;
    const temps = [...new Set(use.map((l) => l.temperature_c).filter((t) => t !== null && t !== undefined))];
    const clients = [...new Set(use.map((l) => l.client).filter(Boolean))];
    return {
      t: 'stop', n, side, stop_id: s.stop_id, location_id: s.location_id, hub, end,
      act: loads.length ? 'ΦΟΡΤΩΣΗ' : end ? 'ΕΚΦΟΡΤΩΣΗ' : 'ΠΑΡΑΔΟΣΗ',
      name: hub ? 'Αποθήκη Βέροιας' + (end ? ' · τέλος κύκλου' : '') : (clients.join(' · ') || _dash(s.location)),
      address: _dash(place && place.address), city: (place && place.city) || '', phone: _dash(place && place.phone),
      window: end ? `ως ${_dow(s.stop_day)} ${_hm(s.planned_to)}` : `${_dow(s.stop_day)} ${_hmWin(s.planned_from, s.planned_to)}`,
      pallets: use.reduce((a, l) => a + (Number(l.pallets) || 0), 0), palUnk: _unk(use),
      // Figma 2011:11036 «3 παραγγελίες» after the badge of the Veroia loading: the distinct orders loaded there
      orders: new Set(use.map((l) => (l.order_id != null ? 'i' + l.order_id : l.nat_order_id != null ? 'n' + l.nat_order_id : null)).filter(Boolean)).size,
      temp: _temp(temps, true), tempWa: _temp(temps, false),
      pe: hub ? '—' : _pe(use, loads.length > 0),   // Veroia is our own warehouse: no return there
      refs: _dash([...new Set(use.map((l) => l.reference).filter(Boolean))].join(' · ')),
    };
  }
  // 072b (T27, H5): the plan of ONE segment's sheet — its stops are those of its stop_ids (H-9: the segment of a
  // stop's arrival executes it), and a handover line where the load is taken over (in) or handed over (out), with
  // what is on board at that moment: loads minus deliveries of the stops of the segments before (stop_ids only).
  function _segPlan(cycle, segmentId, P) {
    if (segmentId === undefined || segmentId === null) return null;
    const segs = (cycle.segments || []).slice();
    const i = segs.findIndex((g) => g.segment_id === segmentId);
    // never a sheet with the wrong stops: an unknown segment fails loudly (print() logs and says it)
    if (i < 0) throw new Error(`segment ${segmentId} is not a segment of cycle ${cycle.rt_id}`);
    const bySeq = (cycle.stops || []).slice().sort((a, b) => a.seq - b.seq);
    const onBoard = (upto) => {
      const ids = new Set(segs.slice(0, upto + 1).flatMap((g) => g.stop_ids || []));
      const pieces = new Map();
      for (const s of bySeq) if (ids.has(s.stop_id)) for (const l of s.legs || []) { if (l.act === 'load') pieces.set(l.piece_id, l); else pieces.delete(l.piece_id); }
      const legs = [...pieces.values()];
      return { pallets: legs.reduce((a, l) => a + (Number(l.pallets) || 0), 0), palUnk: _unk(legs),
        temp: _temp([...new Set(legs.map((l) => l.temperature_c).filter((t) => t !== null && t !== undefined))], true),
        refs: _dash([...new Set(legs.map((l) => l.reference).filter(Boolean))].join(' · ')) };
    };
    const sideOf = (ids, last) => {
      const st = bySeq.filter((s) => ids.includes(s.stop_id));
      const s = last ? st[st.length - 1] : st[0];
      return s ? s.side : null;
    };
    const who = (g) => ({ vehicle: g.trip_type === 'PARTNER' ? _dash(g.partner) : _dash(g.truck), driver: g.trip_type === 'PARTNER' ? _dash(g.partner) : _dash(g.driver),
      phone: _dash(P.drivers && g.driver_id != null && P.drivers[g.driver_id] ? P.drivers[g.driver_id].phone : null) });
    const hand = (dir, change, other, upto, side) => {
      const p = _parts(change.from_at) || {};
      const b = onBoard(upto);
      return { t: 'hand', dir, side, reason: typeof WN5Lab !== 'undefined' ? WN5Lab.reasonLine(change.reason).text : _dash(change.reason),
        place: _dash(change.place_note), when: `${_dow(p.day)} ${p.hm || '—'}`, hm: p.hm || '—', other: who(other), pallets: b.pallets, palUnk: b.palUnk, temp: b.temp, refs: b.refs };
    };
    const seg = segs[i];
    const hands = [];
    if (i > 0) hands.push(hand('in', seg, segs[i - 1], i - 1, sideOf(seg.stop_ids || [], false) || 'KATHODOS'));
    if (i < segs.length - 1) hands.push(hand('out', segs[i + 1], segs[i + 1], i, sideOf(seg.stop_ids || [], true) || 'KATHODOS'));
    const changes = hands.map((h) => `${h.place} · ${_dlab((_parts((h.dir === 'in' ? seg : segs[i + 1]).from_at) || {}).day)} · ${h.hm}`);
    return { seg, stopIds: new Set(seg.stop_ids || []), hands, changeText: changes.join(' → ') };
  }
  // part: 'KATHODOS' | 'ANODOS' | 'ALL'. places: { byId: {<location_id>: {name, address, city, phone}}, hubId,
  // drivers?: {<driver_id>: {phone}} }. segmentId (072b): the sheet of one segment (T27); without it = the cycle.
  function lines(cycle, places, part, segmentId) {
    const P = { byId: (places && places.byId) || {}, hubId: places && places.hubId != null ? places.hubId : null, drivers: (places && places.drivers) || null };
    const SG = _segPlan(cycle, segmentId, P);
    const veh = SG ? SG.seg : cycle;
    const partner = veh.trip_type === 'PARTNER';
    const kStops = _partStops(cycle, 'KATHODOS');
    const vStop = kStops.find((s) => P.hubId != null && s.location_id === P.hubId && (s.legs || []).some((l) => l.act === 'load'));
    // the segment keys only on a segment sheet: without one the head is T23's, key for key (R-59)
    const out = [Object.assign({ t: 'head', partner: partner ? _dash(veh.partner) : null, driver: partner ? null : _dash(veh.driver),
      truck: partner ? null : _dash(veh.truck), trailer: partner ? null : _dash(veh.trailer),
      veroia: vStop ? `${_dlab(vStop.stop_day)} · ${_hmWin(vStop.planned_from, vStop.planned_to)}` : '—' },
    SG ? { segment: SEG_GR[SG.seg.label] || '—', segLabel: SG.seg.label || null, change: SG.changeText || '—' } : {})];
    let n = 0;
    let firstPallets = null, firstUnk = 0;
    for (const side of part === 'ALL' ? ['KATHODOS', 'ANODOS'] : [part]) {
      const stops = _partStops(cycle, side).filter((s) => !SG || SG.stopIds.has(s.stop_id));
      const hands = SG ? SG.hands.filter((h) => h.side === side) : [];
      if (!stops.length && !hands.length) continue;
      const ls = stops.map((s) => _stopLine(s, side, P, ++n));
      // the heading names what the driver does at the stops that are not Veroia (Figma: «3 παραδόσεις», «3 φορτώσεις»)
      const own = ls.filter((l) => !l.hub);
      const count = own.length;
      const noun = own.length && own.every((l) => l.act === 'ΦΟΡΤΩΣΗ') ? (count === 1 ? 'φόρτωση' : 'φορτώσεις')
        : own.length && own.every((l) => l.act === 'ΠΑΡΑΔΟΣΗ') ? (count === 1 ? 'παράδοση' : 'παραδόσεις') : (count === 1 ? 'στάση' : 'στάσεις');
      const sum = (load) => stops.reduce((a, s) => a + (s.legs || []).filter((l) => (l.act === 'load') === load).reduce((b, l) => b + (Number(l.pallets) || 0), 0), 0);
      const unk = (load) => stops.reduce((a, s) => a + _unk((s.legs || []).filter((l) => (l.act === 'load') === load)), 0);
      // what is loaded on this side, or what is delivered when nothing is; a segment that loads nothing here counts
      // what it took over (H5: ΤΕΛΙΚΟ «ΚΑΘΟΔΟΣ · 1 παράδοση · 18 παλέτες», checklist «(18)»)
      const loadsHere = sum(true) || unk(true), dropsHere = sum(false) || unk(false);
      // a segment that only takes over: the biggest hand-over, with its own unknowns (F1, code review xhigh)
      const big = hands.reduce((a, h) => (!a || (h.pallets || 0) + (h.palUnk || 0) > (a.pallets || 0) + (a.palUnk || 0) ? h : a), null);
      const pallets = loadsHere ? sum(true) : dropsHere ? sum(false) : big ? big.pallets : 0;
      const palUnk = loadsHere ? unk(true) : dropsHere ? unk(false) : big ? big.palUnk || 0 : 0;
      if (firstPallets === null) { firstPallets = pallets; firstUnk = palUnk; }
      out.push({ t: 'side', side, title: SIDE_GR[side], count, noun, pallets, palUnk, fromHub: !!ls[0] && ls[0].hub && ls[0].act === 'ΦΟΡΤΩΣΗ' });
      out.push(...hands.filter((h) => h.dir === 'in'), ...ls, ...hands.filter((h) => h.dir === 'out'));
    }
    out.push({ t: 'check', pallets: firstPallets || 0, palUnk: firstUnk || 0 });
    return out;
  }
  // T27: a segment's section can hold no stop of its own but Veroia's (ΑΡΧΙΚΟ = the hub loading) or none at all
  // (a middle segment, only its handovers): never «0 στάσεις», the count is said only when there is one
  const _what = (l) => (l.count ? `${l.count} ${l.noun}` : '');
  const _street = (s) => String(s.address === '—' ? '' : s.address).split(',')[0].trim();
  // The WhatsApp text, line by line as Figma 2011:10998 («*» = bold in WhatsApp).
  function text(ls, meta) {
    const m = meta || {};
    const h = ls.find((l) => l.t === 'head') || {};
    const out = [h.partner ? `*${h.partner}*` : `*${[h.truck, h.trailer, h.driver].filter((x) => x && x !== '—').join(' · ')}*`,
      [m.week, m.cycleNo ? 'κύκλος ' + m.cycleNo : ''].filter(Boolean).join(' · ')];
    // H5 2146:7738: the handover lines go first — where, from whom (or to whom), his phone when the catalogue has it
    out.unshift(...ls.filter((l) => l.t === 'hand').flatMap((x) => [
      `⇄ ${x.dir === 'in' ? 'παραλαβή από' : 'παράδοση στο'} ${x.other.vehicle} · ${x.place} ${x.when}`,
      `${x.dir === 'in' ? 'παραδίδει ο' : 'παραλαμβάνει ο'} ${x.other.driver}${x.other.phone === '—' ? '' : ' · Τηλ. ' + x.other.phone}`]));
    for (const l of ls) {
      if (l.t === 'side') {
        out.push('', [`*${l.title}*`, l.fromHub ? 'φόρτωση Βέροια' : _what(l), `${_palU(l.pallets, l.palUnk)}π`].filter(Boolean).join(' · '));
      } else if (l.t === 'stop') {
        const tel = l.phone === '—' ? '' : ` · Τηλ. ${l.phone}`;
        if (l.hub) {
          out.push(`${l.n}) ${l.name} · ${l.window} · ${_palU(l.pallets, l.palUnk)}π`);
          out.push(`   ${_street(l) || '—'}${tel}`);
          out.push(`   ${l.refs}`);
        } else {
          const where = [_street(l), l.city].filter(Boolean).join(', ');
          out.push(`${l.n}) ${l.name}${where ? ' · ' + where : ''}${tel}`);
          out.push('   ' + [l.window, `${_palU(l.pallets, l.palUnk)}π`, l.tempWa === '—' ? '' : l.tempWa, l.refs === '—' ? '' : l.refs, l.pe === '—' ? '' : l.pe + 'π'].filter(Boolean).join(' · '));
        }
      }
    }
    out.push('', 'Χάρτης ανά στάση: στον σύνδεσμο της εφαρμογής');
    return out.join('\n');
  }
  // The A4 (Figma 2011:10999, 794 × 1123). One table per section — 2 columns (the number circle · the stop card),
  // and its section row spans exactly those 2 (a colspan wider than the colgroup adds phantom columns, S4 15/9).
  // Figma draws no column header row: none here either.
  function _pair(k, v, cls) { return `<span class="s-p"><span class="s-pk">${k}</span><b${cls ? ` class="${cls}"` : ''}>${_esc(v)}</b></span>`; }
  function _adr(l) {
    // «street, postcode city» as Figma; the catalogue keeps the city apart — added unless the address already has it
    const a = l.address === '—' ? '—' : l.address + (l.city && !l.address.includes(l.city) ? ' ' + l.city : '');
    return `${_esc(a)}  ·  Τηλ. <b>${_esc(l.phone)}</b>`;
  }
  function html(ls, meta, cssVars) {
    const m = meta || {};
    const h = ls.find((l) => l.t === 'head') || {};
    const chk = ls.find((l) => l.t === 'check') || { pallets: 0 };
    const band = (h.partner ? [['ΣΥΝΕΡΓΑΤΗΣ', h.partner]] : [['ΟΔΗΓΟΣ', h.driver], ['ΦΟΡΤΗΓΟ', h.truck, 1], ['ΡΥΜΟΥΛΚΑ', h.trailer, 1]])
      .concat(h.segment ? [['ΤΜΗΜΑ', h.segment], ['ΣΗΜΕΙΟ ΑΛΛΑΓΗΣ', h.change]] : [['ΚΥΚΛΟΣ', _dash(m.cycleNo)], ['ΦΟΡΤΩΣΗ ΒΕΡΟΙΑ', h.veroia]]);
    // circle 20 + 8 to the card (H5 2128:7767, approved 25/10 over the 10 of 2011:11030): one column for every row
    const COLS = '<colgroup><col style="width:28px"><col></colgroup>';
    let body = '';
    let open = false;
    for (const l of ls) {
      if (l.t === 'side') {
        if (open) body += '</tbody></table>';
        body += `<table class="s-t">${COLS}<tbody><tr><td colspan="2"><div class="s-sec"><span>${[_esc(l.title), l.count ? _what(l) : l.fromHub ? 'φόρτωση Βέροια' : '', `${_palU(l.pallets, l.palUnk)} παλέτες`].filter(Boolean).join(' · ')}</span><i></i></div></td></tr>`;
        open = true;
      } else if (l.t === 'hand') {
        // H5 2128:7793/8017: the stop row's shape (circle · card, the 2 columns of COLS), an outlined ⇄ circle and
        // badge, the reason in the orders' slot, no number, no pallet return; never a row of extra cells (S4 15/9)
        const vb = l.dir === 'in' ? 'παραλαβή από' : 'παράδοση στο';
        body += `<tr class="s-hand" data-side="${l.side}" data-dir="${l.dir}"><td><span class="s-n s-hn">⇄</span></td><td><div class="s-card">`
          + `<div class="s-bdg"><span class="s-act s-ho">ΑΛΛΑΓΗ ΟΧΗΜΑΤΟΣ</span><span class="s-cnt">${_esc(l.reason)}</span></div>`
          + `<div class="s-name">${vb} ${_esc(l.other.vehicle)} · ${_esc(l.place)} ${_esc(l.hm)}</div>`
          + `<div class="s-adr">${l.dir === 'in' ? 'παραδίδει ο' : 'παραλαμβάνει ο'} ${_esc(l.other.driver)}  ·  Τηλ. <b>${_esc(l.other.phone)}</b></div>`
          + `<div class="s-meta">${_pair('Ώρα', l.when)}${_pair('Παλέτες', _palU(l.pallets, l.palUnk))}${_pair('Θερμ.', l.temp, 's-temp')}${_pair('Αναφορά', l.refs)}</div></div></td></tr>`;
      } else if (l.t === 'stop') {
        const ld = l.act === 'ΦΟΡΤΩΣΗ' ? ' s-ld' : '';
        const nOrd = l.hub && l.act === 'ΦΟΡΤΩΣΗ' && l.orders ? `<span class="s-cnt">${l.orders} ${l.orders === 1 ? 'παραγγελία' : 'παραγγελίες'}</span>` : '';
        body += `<tr class="s-stop" data-side="${l.side}"><td><span class="s-n${ld}">${l.n}</span></td><td><div class="s-card">`
          + `<div class="s-bdg"><span class="s-act${ld}">${l.act}</span>${nOrd}</div>`
          + `<div class="s-name">${_esc(l.name)}</div><div class="s-adr">${_adr(l)}</div>`
          + `<div class="s-meta">${_pair(l.end ? 'Άφιξη' : 'Παράθυρο', l.window)}${_pair('Παλέτες', _palU(l.pallets, l.palUnk))}${_pair('Θερμ.', l.temp, 's-temp')}`
          + `${_pair('Επιστροφή παλετών', l.pe)}${_pair('Αναφορά', l.refs)}</div></div></td></tr>`;
      }
    }
    if (open) body += '</tbody></table>';
    // `.s *` inherits: the shell's `*{color:…}` would otherwise paint every text without its own rule.
    // media="none" until it loads: Chrome stops the parser at a matching stylesheet (<link> or @import) inside <body>
    // until it arrives, so a slow or blocked font server would print an empty page (the shell prints after 500 ms).
    // Late fonts only mean a fallback face on paper, never a missing stop.
    return `<link rel="stylesheet" href="${FONTS}" media="none" onload="this.media='all'"><style>:root{${cssVars || ''}}
      body{padding:0 !important;margin:0}
      @media print{@page{size:A4;margin:0}}
      /* the whole A4 (2011:10999, 1123 high): the signature box ends 32px over the page edge. 297mm still prints ONE
         page (Chrome PDF of this window, 28/10); a page that could not take it would also spill 296mm. */
      .s,.s *{box-sizing:border-box;color:inherit;font-family:inherit}
      .s{width:794px;min-height:297mm;margin:0 auto;padding:36px 40px 32px;display:flex;flex-direction:column;gap:10px;
        background:var(--surface-card);color:var(--surface-dark);font-family:'DM Sans',sans-serif;line-height:normal}
      .s-hd{display:flex;align-items:flex-start;justify-content:space-between}
      .s-brand{display:flex;flex-direction:column;gap:2px;white-space:nowrap}
      .s-brand b{font:700 20px 'Syne',sans-serif}
      .s-tag{font-size:7px;letter-spacing:1.5px;color:var(--wi4-grey-3)}.s-wh{font-size:9px;color:var(--wi4-grey-1)}
      .s-mt{display:flex;flex-direction:column;gap:3px;align-items:flex-end;white-space:nowrap}
      .s-kick{font-size:7.5px;font-weight:600;letter-spacing:1px;color:var(--wi4-grey-3)}
      .s-mt b{font:700 18px 'Syne',sans-serif}.s-iss{font-size:8.5px;color:var(--wi4-grey-2)}
      .s-rule{height:2px;background:var(--surface-dark)}
      .s-band{display:flex;align-items:center;gap:28px;padding:12px 16px;border-radius:8px;background:var(--surface-dark);white-space:nowrap}
      .s-band div{display:flex;flex-direction:column;align-items:flex-start;gap:2px}
      .s-band span{font-size:7.5px;font-weight:600;letter-spacing:1px;color:var(--text-dim)}
      .s-band b{font-size:12px;font-weight:700;color:var(--surface-card)}.s-band b.s-pl{font-family:'DM Mono',monospace;font-weight:500}
      .s-t{width:100%;table-layout:fixed;border-collapse:collapse}
      .s-t td{padding:0;vertical-align:top}.s-t tr.s-stop td,.s-t tr.s-hand td{padding-top:10px}
      .s-segl{height:3px;background:var(--wn5-seg-initial)}.s-segl[data-label="intermediate"]{background:var(--wn5-seg-intermediate)}
      .s-segl[data-label="final"]{background:var(--wn5-seg-final)}
      .s-sec{display:flex;align-items:center;gap:8px;padding:6px 0 2px;font-size:9px;font-weight:700;letter-spacing:1px;white-space:nowrap}
      .s-sec i{flex:1;height:1px;background:var(--border)}
      .s-n{display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:10px;background:var(--accent);font-size:10px;font-weight:700;color:var(--surface-card)}
      .s-card{display:flex;flex-direction:column;align-items:flex-start;gap:3px;padding:8px 10px;border:1px solid var(--border);border-radius:6px}
      .s-bdg{display:flex;align-items:center;gap:6px}
      .s-act{display:inline-flex;align-items:center;height:16px;padding:0 6px;border-radius:3px;background:var(--accent);font-size:8px;font-weight:700;letter-spacing:.5px;color:var(--surface-card)}
      .s-n.s-ld,.s-act.s-ld{background:var(--surface-dark)}
      .s-n.s-hn{background:var(--surface-card);border:1.5px solid var(--surface-dark);color:var(--surface-dark)}
      .s-act.s-ho{background:var(--surface-card);border:1px solid var(--surface-dark);color:var(--surface-dark)}
      .s-cnt{font-size:8.5px;color:var(--wi4-grey-2)}
      .s-name{font-size:12px;font-weight:700}
      .s-adr{font-size:9px;line-height:11px;white-space:pre;color:var(--wi4-grey-2)}.s-adr b{font-weight:700;color:var(--surface-dark)}
      .s-meta{display:flex;align-items:center;gap:14px;white-space:nowrap}
      .s-p{display:flex;align-items:center;gap:4px}.s-pk{font-size:8.5px;color:var(--wi4-grey-2)}
      .s-p b{font-size:10px;font-weight:700}.s-p b.s-temp{color:var(--accent-text)}
      .s-chk{display:flex;align-items:center;gap:14px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-size:8.5px;white-space:nowrap}
      .s-chk b{font-size:8px;font-weight:700;letter-spacing:1px}
      .s-sp{flex:1}
      .s-sig{display:flex;border:1px solid var(--surface-dark);border-radius:6px;overflow:hidden}
      .s-sig div{flex:1;display:flex;flex-direction:column;gap:2px;padding:10px 12px 26px}
      .s-sig b{font-size:9px;font-weight:700}.s-sig span{font-size:7px;letter-spacing:1px;color:var(--wi4-grey-3)}.s-sig small{font-size:7.5px;color:var(--wi4-grey-3)}
      </style><div class="s">`
      + `<div class="s-hd"><div class="s-brand"><b>PETRAS GROUP</b><span class="s-tag">INTERNATIONAL ROAD TRANSPORT SERVICES</span><span class="s-wh">Αποθήκη Βέροιας</span></div>`
      + `<div class="s-mt"><span class="s-kick">ΦΥΛΛΟ ΟΔΗΓΟΥ · ΕΘΝΙΚΟ</span><b>${_esc([m.week, m.cycleNo ? 'Κύκλος ' + m.cycleNo : ''].filter(Boolean).join(' · ') || '—')}</b><span class="s-iss">Έκδοση ${_esc(m.issued || '—')}</span></div></div>`
      + '<div class="s-rule"></div>'
      + `<div class="s-band">${band.map(([k, v, pl]) => `<div><span>${k}</span><b${pl ? ' class="s-pl"' : ''}>${_esc(_dash(v))}</b></div>`).join('')}</div>`
      + (h.segment ? `<div class="s-segl" data-label="${_esc(h.segLabel || '')}"></div>` : '')
      + body
      + `<div class="s-chk"><b>ΠΡΙΝ ΤΗΝ ΑΝΑΧΩΡΗΣΗ</b><span>☐ Θερμογράφος σε λειτουργία</span><span>☐ Ρυμούλκα καθαρή / προψυγμένη</span>`
      + `<span>☐ Παλέτες μετρημένες (${_palU(chk.pallets, chk.palUnk)})</span><span>☐ CMR υπογεγραμμένα</span></div>`
      + '<div class="s-sp"></div>'
      + '<div class="s-sig"><div><b>PETRAS GROUP</b><span>ΚΙΝΗΣΗ · ΠΑΡΑΔΟΣΗ ΦΥΛΛΟΥ</span><small>Υπογραφή & ημερομηνία</small></div>'
      + `<div><b>${_esc(h.partner || h.driver || '—')}</b><span>ΟΔΗΓΟΣ · ΠΑΡΑΛΑΒΗ</span><small>Υπογραφή & ημερομηνία</small></div></div></div>`;
  }

  // ── the browser side ───────────────────────────────────────────────────────────────────────────────────────
  let _last = null;   // the last sheet built: whatsapp() answers from it, never from a second read
  function _tokens() {
    try {
      const cs = getComputedStyle(document.documentElement);
      return TOKENS.map((t) => { const v = cs.getPropertyValue(t).trim(); return v ? `${t}:${v};` : ''; }).join('');
    } catch (e) { _log(e, 'WN5Sheet tokens'); return ''; }
  }
  function _issued() {
    // the moment of printing: the sheet's own stamp, never part of a /plan body
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let who = '';
    try { const u = JSON.parse(localStorage.getItem('tms_user') || '{}'); who = String(u.name || '').split(/\s+/).filter(Boolean).map((w) => w.charAt(0) + '.').join(''); } catch (_) { who = ''; }
    return `${_dlab(day)}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}${who ? ' · ' + who : ''}`;
  }
  async function _ctx(rtId) {
    const ids = await PlanIds.load();
    if (!ids.ok) {
      if (typeof toast === 'function') toast('Οι κατάλογοι δεν είναι διαθέσιμοι ακόμη — το φύλλο θέλει διευθύνσεις και τηλέφωνα', 'danger');
      return null;
    }
    let hubId = null;
    try { hubId = PlanIds.id('location', F.VEROIA_LOC); }
    catch (e) {
      // without the hub's number the sheet would print Veroia under its catalogue name (Δ10): it does not print
      if (typeof toast === 'function') toast('Η Βέροια λείπει από τους καταλόγους — το φύλλο δεν τυπώθηκε', 'danger');
      _log(e, 'WN5Sheet hub');
      return null;
    }
    let board = null;
    try { board = await WN5.findAfterReuse((b) => b); } catch (e) { _log(e, 'WN5Sheet board'); }
    const cycle = board && (board.cycles || []).find((c) => c.rt_id === rtId);
    if (!cycle) { if (typeof toast === 'function') toast('Ο κύκλος δεν βρέθηκε στην εβδομάδα που φαίνεται — ανανέωσε', 'warn'); return null; }
    const byId = {};
    for (const s of cycle.stops || []) { const p = PlanIds.place(s.location_id); if (p) byId[s.location_id] = p; }
    const nums = WN5L.cycleNumbers(board.cycles || []);
    const cn = nums && typeof nums.get === 'function' ? nums.get(rtId) : null;
    // the board's rule (owner 22/10): one cycle of the truck in the week is «κύκλος 1», never «1/1» — paper = screen
    const wk = TmsWeek.numOf(new Date(board.week + 'T12:00:00'));
    return { cycle, places: { byId, hubId }, meta: { week: wk ? 'W' + wk : '', cycleNo: cn ? (cn.m > 1 ? `${cn.n}/${cn.m}` : '1') : '', issued: _issued() } };
  }
  async function _copy(txt) {
    try {
      await navigator.clipboard.writeText(txt);
      if (typeof toast === 'function') toast('Αντιγράφηκε το μήνυμα WhatsApp', 'success');
      return true;
    } catch (e) {
      window.prompt('Μήνυμα WhatsApp (Ctrl+C):', txt);   // a refused clipboard is never a silent nothing (copyPlates rule)
      return false;
    }
  }
  // Called from inline onclick and menu lines, which do not await it: it never rejects. A failure is logged and said
  // (principle 1), never an unhandled rejection that leaves the click doing nothing.
  async function print(rtId, part, segmentId) {
    const p = part === 'KATHODOS' || part === 'ANODOS' ? part : 'ALL';
    try {
      const ctx = await _ctx(rtId);
      if (!ctx) return false;
      const ls = lines(ctx.cycle, ctx.places, p, segmentId);
      _last = { rtId, part: p, segmentId, lines: ls, meta: ctx.meta };   // whatsapp(rtId, part) answers for the last sheet built
      if (typeof _printWeekShell === 'function') _printWeekShell(`Φύλλο οδηγού · ${ctx.cycle.code || 'RT-' + rtId}`, html(ls, ctx.meta, _tokens()));
      await _copy(text(ls, ctx.meta));
      return true;
    } catch (e) {
      _log(e, 'WN5Sheet print');
      if (typeof toast === 'function') toast('Το φύλλο οδηγού δεν βγήκε: ' + String(e && e.message || e), 'danger');
      return false;
    }
  }
  function whatsapp(rtId, part) {
    const p = part === 'KATHODOS' || part === 'ANODOS' ? part : 'ALL';
    if (!_last || _last.rtId !== rtId || _last.part !== p) return '';
    return text(_last.lines, _last.meta);
  }

  window.WN5Sheet = Object.freeze({ print, whatsapp, lines, text, html });
})();
