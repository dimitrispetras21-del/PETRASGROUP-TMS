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
  // The print window loads no style.css: these tokens' values travel with it, so the A4 keeps one colour source.
  // The greys are the Weekly's (Figma 2011:10999 draws #344054 / #5b6b7f / #98a2b3, not --text-mid).
  const TOKENS = ['--surface-dark', '--surface-card', '--accent', '--accent-text', '--text-dim', '--border', '--wi4-grey-1', '--wi4-grey-2', '--wi4-grey-3'];
  // The print shell (core/utils.js _printWeekShell) loads DM Sans 400/500 only: the A4's 600/700 and the plates'
  // DM Mono come from here, the app's own families (app.html), or the browser would fake the bold and drop the mono.
  const FONTS = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@500&display=swap';
  const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const _log = (e, where) => { try { if (typeof logError === 'function') logError(e, where); } catch (_) { /* the sheet's own failure stays visible */ } };
  const _parts = (iso) => (typeof WN5Form !== 'undefined' ? WN5Form._parts(iso) : null);
  const _dlab = (day) => (typeof WI4 !== 'undefined' && WI4.dayLabel ? WI4.dayLabel(day) : String(day || ''));
  const _dow = (day) => _dlab(day).split(' ')[0];
  const _hm = (iso) => (_parts(iso) || {}).hm || '—';
  const _pal = (n) => String(Math.round((Number(n) || 0) * 10) / 10).replace('.', ',');
  const _temp = (ts, sp) => (ts.length ? ts.slice().sort((a, b) => a - b).map((t) => (t > 0 ? '+' : '') + t).join(sp ? ' / ' : '/') + (sp ? ' °C' : '°C') : '—');
  const _dash = (v) => (v == null || String(v).trim() === '' ? '—' : String(v));

  // The stops of one side, by seq (the order of the cycle).
  function _partStops(cycle, side) {
    return (cycle.stops || []).filter((s) => s.side === side).sort((a, b) => a.seq - b.seq);
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
      window: end ? `ως ${_dow(s.stop_day)} ${_hm(s.planned_to)}` : `${_dow(s.stop_day)} ${_hm(s.planned_from)}–${_hm(s.planned_to)}`,
      pallets: use.reduce((a, l) => a + (Number(l.pallets) || 0), 0),
      // Figma 2011:11036 «3 παραγγελίες» after the badge of the Veroia loading: the distinct orders loaded there
      orders: new Set(use.map((l) => (l.order_id != null ? 'i' + l.order_id : l.nat_order_id != null ? 'n' + l.nat_order_id : null)).filter(Boolean)).size,
      temp: _temp(temps, true), tempWa: _temp(temps, false),
      pe: '—',   // Ε-12: the board carries no pallet return per stop yet (T28, F3)
      refs: _dash([...new Set(use.map((l) => l.reference).filter(Boolean))].join(' · ')),
    };
  }
  // part: 'KATHODOS' | 'ANODOS' | 'ALL'. places: { byId: {<location_id>: {name, address, city, phone}}, hubId }.
  function lines(cycle, places, part) {
    const P = { byId: (places && places.byId) || {}, hubId: places && places.hubId != null ? places.hubId : null };
    const partner = cycle.trip_type === 'PARTNER';
    const kStops = _partStops(cycle, 'KATHODOS');
    const vStop = kStops.find((s) => P.hubId != null && s.location_id === P.hubId && (s.legs || []).some((l) => l.act === 'load'));
    const out = [{ t: 'head', partner: partner ? _dash(cycle.partner) : null, driver: partner ? null : _dash(cycle.driver),
      truck: partner ? null : _dash(cycle.truck), trailer: partner ? null : _dash(cycle.trailer),
      veroia: vStop ? `${_dlab(vStop.stop_day)} · ${_hm(vStop.planned_from)}–${_hm(vStop.planned_to)}` : '—' }];
    let n = 0;
    let firstPallets = null;
    for (const side of part === 'ALL' ? ['KATHODOS', 'ANODOS'] : [part]) {
      const stops = _partStops(cycle, side);
      if (!stops.length) continue;
      const ls = stops.map((s) => _stopLine(s, side, P, ++n));
      // the heading names what the driver does at the stops that are not Veroia (Figma: «3 παραδόσεις», «3 φορτώσεις»)
      const own = ls.filter((l) => !l.hub);
      const count = own.length;
      const noun = own.length && own.every((l) => l.act === 'ΦΟΡΤΩΣΗ') ? (count === 1 ? 'φόρτωση' : 'φορτώσεις')
        : own.length && own.every((l) => l.act === 'ΠΑΡΑΔΟΣΗ') ? (count === 1 ? 'παράδοση' : 'παραδόσεις') : (count === 1 ? 'στάση' : 'στάσεις');
      const sum = (load) => stops.reduce((a, s) => a + (s.legs || []).filter((l) => (l.act === 'load') === load).reduce((b, l) => b + (Number(l.pallets) || 0), 0), 0);
      const pallets = sum(true) || sum(false);   // what is loaded on this side, or what is delivered when nothing is
      if (firstPallets === null) firstPallets = pallets;
      out.push({ t: 'side', side, title: SIDE_GR[side], count, noun, pallets, fromHub: !!ls[0].hub && ls[0].act === 'ΦΟΡΤΩΣΗ' });
      out.push(...ls);
    }
    out.push({ t: 'check', pallets: firstPallets || 0 });
    return out;
  }
  const _street = (s) => String(s.address === '—' ? '' : s.address).split(',')[0].trim();
  // The WhatsApp text, line by line as Figma 2011:10998 («*» = bold in WhatsApp).
  function text(ls, meta) {
    const m = meta || {};
    const h = ls.find((l) => l.t === 'head') || {};
    const out = [h.partner ? `*${h.partner}*` : `*${[h.truck, h.trailer, h.driver].filter((x) => x && x !== '—').join(' · ')}*`,
      [m.week, m.cycleNo ? 'κύκλος ' + m.cycleNo : ''].filter(Boolean).join(' · ')];
    for (const l of ls) {
      if (l.t === 'side') {
        out.push('', `*${l.title}* · ${l.fromHub ? 'φόρτωση Βέροια' : `${l.count} ${l.noun}`} · ${_pal(l.pallets)}π`);
      } else if (l.t === 'stop') {
        const tel = l.phone === '—' ? '' : ` · Τηλ. ${l.phone}`;
        if (l.hub) {
          out.push(`${l.n}) ${l.name} · ${l.window} · ${_pal(l.pallets)}π`);
          out.push(`   ${_street(l) || '—'}${tel}`);
          out.push(`   ${l.refs}`);
        } else {
          const where = [_street(l), l.city].filter(Boolean).join(', ');
          out.push(`${l.n}) ${l.name}${where ? ' · ' + where : ''}${tel}`);
          out.push('   ' + [l.window, `${_pal(l.pallets)}π`, l.tempWa === '—' ? '' : l.tempWa, l.refs === '—' ? '' : l.refs, l.pe === '—' ? '' : l.pe + 'π'].filter(Boolean).join(' · '));
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
      .concat([['ΚΥΚΛΟΣ', _dash(m.cycleNo)], ['ΦΟΡΤΩΣΗ ΒΕΡΟΙΑ', h.veroia]]);
    const COLS = '<colgroup><col style="width:30px"><col></colgroup>';
    let body = '';
    let open = false;
    for (const l of ls) {
      if (l.t === 'side') {
        if (open) body += '</tbody></table>';
        body += `<table class="s-t">${COLS}<tbody><tr><td colspan="2"><div class="s-sec"><span>${_esc(l.title)} · ${l.count} ${_esc(l.noun)} · ${_pal(l.pallets)} παλέτες</span><i></i></div></td></tr>`;
        open = true;
      } else if (l.t === 'stop') {
        const ld = l.act === 'ΦΟΡΤΩΣΗ' ? ' s-ld' : '';
        const nOrd = l.hub && l.act === 'ΦΟΡΤΩΣΗ' && l.orders ? `<span class="s-cnt">${l.orders} ${l.orders === 1 ? 'παραγγελία' : 'παραγγελίες'}</span>` : '';
        body += `<tr class="s-stop" data-side="${l.side}"><td><span class="s-n${ld}">${l.n}</span></td><td><div class="s-card">`
          + `<div class="s-bdg"><span class="s-act${ld}">${l.act}</span>${nOrd}</div>`
          + `<div class="s-name">${_esc(l.name)}</div><div class="s-adr">${_adr(l)}</div>`
          + `<div class="s-meta">${_pair(l.end ? 'Άφιξη' : 'Παράθυρο', l.window)}${_pair('Παλέτες', _pal(l.pallets))}${_pair('Θερμ.', l.temp, 's-temp')}`
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
      .s,.s *{box-sizing:border-box;color:inherit;font-family:inherit}
      .s{width:794px;min-height:296mm;margin:0 auto;padding:36px 40px 32px;display:flex;flex-direction:column;gap:10px;
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
      .s-t td{padding:0;vertical-align:top}.s-t tr.s-stop td{padding-top:10px}
      .s-sec{display:flex;align-items:center;gap:8px;padding:6px 0 2px;font-size:9px;font-weight:700;letter-spacing:1px;white-space:nowrap}
      .s-sec i{flex:1;height:1px;background:var(--border)}
      .s-n{display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:10px;background:var(--accent);font-size:10px;font-weight:700;color:var(--surface-card)}
      .s-card{display:flex;flex-direction:column;align-items:flex-start;gap:3px;padding:8px 10px;border:1px solid var(--border);border-radius:6px}
      .s-bdg{display:flex;align-items:center;gap:6px}
      .s-act{display:inline-flex;align-items:center;height:16px;padding:0 6px;border-radius:3px;background:var(--accent);font-size:8px;font-weight:700;letter-spacing:.5px;color:var(--surface-card)}
      .s-n.s-ld,.s-act.s-ld{background:var(--surface-dark)}
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
      + body
      + `<div class="s-chk"><b>ΠΡΙΝ ΤΗΝ ΑΝΑΧΩΡΗΣΗ</b><span>☐ Θερμογράφος σε λειτουργία</span><span>☐ Ρυμούλκα καθαρή / προψυγμένη</span>`
      + `<span>☐ Παλέτες μετρημένες (${_pal(chk.pallets)})</span><span>☐ CMR υπογεγραμμένα</span></div>`
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
  async function print(rtId, part) {
    const p = part === 'KATHODOS' || part === 'ANODOS' ? part : 'ALL';
    try {
      const ctx = await _ctx(rtId);
      if (!ctx) return false;
      const ls = lines(ctx.cycle, ctx.places, p);
      _last = { rtId, part: p, lines: ls, meta: ctx.meta };
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
