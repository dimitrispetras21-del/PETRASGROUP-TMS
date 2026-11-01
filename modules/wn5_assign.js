// modules/wn5_assign.js — National v5: the assignment form = the Weekly International form (owner 28/10 + 31/10,
// Figma KO7l2AfucR3HJEDIg1Yptr section 2394:7793, docs/national-v5/assign-intl-form-2026-10-28.md). It replaces the
// Δ1 candidate list for «Ανάθεση» (the red box of a row, ΕΠΟΜΕΝΑ, ✈ of a cycle, «Σε φορτηγό ▾» of the Veroia board)
// and is the truck picker of the Veroia board's «Νέο φορτίο». «Μεταφορά σε…» keeps the Δ1 list (wn5_actions.js).
//
// Rules (owner 31/10, binding):
//  1. No tabs. The user picks WHO executes (own truck + trailer + driver, or a partner) and saves. Join an existing
//     cycle or start a new one is decided here, from the vehicle, and said in ONE line («ΚΖΗ 2108 · Δευ 12/10 ·
//     12 → 24/33»). Never the word «κύκλος», never an RT code, never an explanatory subline: labels and values only.
//  2. Over 33 = the number red, never a refusal and never «Λείπει» (F31).
//  3. A missing field is red beside the field and named in «Λείπει: …» beside the save (#160). A name typed but not
//     picked from the list stays in its field, red, «διάλεξε από τη λίστα» — never silently dropped (F39).
//  4. «Ημέρα και παράθυρο»: every stop the request creates, prefilled «όλη η ημέρα» (B1); hours only when known. A VS
//     uses its own Veroia day (VsDates, #171), a national to Veroia its own day (#175): KIT.needs / hubDayOf.
//  5. A VS goes whole by default (plan_put_group); «μόνο αυτές οι παλέτες» sends that piece alone (F42).
//  6. The partner rate (089, P-7, owner 31/10 + 1/11): a partner truck whose trip has a ΚΑΘΟΔΟΣ AND an ΑΝΟΔΟΣ shows
//     two fields, «Κόμιστρο ΚΑΘΟΔΟΥ €» and «Κόμιστρο ΑΝΟΔΟΥ €», in the form of its vehicle (✈ / «Ανάθεση» of the
//     trip). The base keeps the WHOLE fee (partner_rate, what the P&L reads) and the ΑΝΟΔΟΥ part
//     (segment.partner_rate_anodos); the ΚΑΘΟΔΟΥ is the difference. An empty ΑΝΟΔΟΥ is saved as «λείπει» (NULL),
//     never 0. One side = one field, as before. A new load has one side, so one field. The partner's «Πινακίδες»
//     are not drawn: v5 has no column for them.
//  7. Every write goes through WN5Act._kit.send (one planFetch per press, the Worker's words in the strip, a reload
//     after a 200). The pick mode («Νέο φορτίο») writes nothing: it hands the choice back.
//  8. Nothing at load: listeners live with the open form only. Colours only through classes (hex 0 in this file).
(function () {
  'use strict';
  const K = () => WN5Act._kit;
  const _live = () => typeof WN5 !== 'undefined' && WN5.active();
  const SIDE_GR = Object.freeze({ KATHODOS: 'ΚΑΘΟΔΟΣ', ANODOS: 'ΑΝΟΔΟΣ' });
  const FIELDS = Object.freeze({
    tk: { kind: 'truck', key: 'truck', lbl: 'Φορτηγό', ph: 'Πινακίδα…', free: '✓ ελεύθερο', mono: true },
    tl: { kind: 'trailer', key: 'trailer', lbl: 'Ρυμούλκα', ph: 'Πινακίδα…', free: '✓ ελεύθερη', mono: true },
    dr: { kind: 'driver', key: 'driver', lbl: 'Οδηγός', ph: 'Όνομα…', free: '✓ ελεύθερος', mono: false },
    pt: { kind: 'partner', key: 'partner', lbl: 'Εταιρεία', ph: 'Εταιρεία…', free: '', mono: false },
  });
  const PICK = 'διάλεξε από τη λίστα';
  const HOURS = 'γράψε ώρες ή «όλη η ημέρα»';
  // the 561/2006 note at the foot of the driver list, as the International popover has it
  const DRV_NOTE = '561/2006: επιστροφή Χ → επόμενη αναχώρηση Χ+2';
  // PlanIds.list maps and sorts the whole catalogue on each call: read once per form (build() empties it), never per
  // option or keystroke (code review high)
  let _lists = {};
  const _list = (kind) => (_lists[kind] || (_lists[kind] = typeof PlanIds === 'undefined' ? [] : PlanIds.list(kind)));

  // ═══ the state of one form, snapshotted at open (rule 4 of wn5_actions.js: two presses send the same bytes) ═══
  // src: {group} | {pieces} | null (null = the vehicle of the cycle ctx.rtId). ctx: {day, side, focus (the piece the
  // user pressed, for «μόνο αυτό»), rtId, hub ({day, from, to}: the Veroia stop fixed by the Veroia board), choice}.
  function build(src, ctx) {
    const k = K();
    ctx = ctx || {};
    _lists = {};
    const vehicle = !src || (!src.group && !src.pieces);
    const st = { mode: vehicle ? 'vehicle' : (ctx.pick ? 'pick' : 'legs'), side: ctx.side === 'ANODOS' ? 'ANODOS' : 'KATHODOS', day: ctx.day || null,
      group: null, pieces: null, items: [], needs: [], pallets: 0, palUnk: 0, focus: k.id(ctx.focus), only: false,
      who: null, truck: null, trailer: null, driver: null, partner: null, rateTxt: '', typed: { tk: '', tl: '', dr: '', pt: '' },
      split: false, rate2Txt: '', rate0: '', rate20: '', an0: null, fee0: null, total: null, rateSide: null,
      win: {}, opt: null, sugg: {}, rtId: k.id(ctx.rtId), cur: null, hub: ctx.hub ? k.copy(ctx.hub) : null, week: null, cycles: [], sidePal: {}, ref: '', err: null };
    const b = k.state().board || {};
    st.week = b.week || null;
    // the form snapshots (two presses, the same bytes); forChoice is re-read at each redraw and copies nothing
    st.cycles = ctx.live ? k.cycles() : k.copy(k.cycles());
    if (vehicle) {
      const c = st.cycles.find((x) => x.rt_id === st.rtId);
      if (!c) { st.err = k.clientErr('rt_missing', 'Δεν είναι στον πίνακα που φορτώθηκε — ανανέωσε'); return st; }
      st.cur = c;
      const r = k.row(c.rt_id);
      st.day = st.day || (r && r.dayKey) || c.date_start;
      if (c.trip_type === 'PARTNER' && c.partner_id != null) { st.who = 'partner'; st.partner = c.partner_id; st.rateTxt = c.partner_rate == null ? '' : String(c.partner_rate); }
      else if (c.truck_id != null) { st.who = 'own'; st.truck = c.truck_id; st.trailer = c.trailer_id || null; st.driver = c.driver_id || null; }
      _splitOf(st, c);
    } else {
      const list = src.group ? k.groupItems(src.group) : (src.pieces || []).map((p) => k.item(p.piece_id)).filter(Boolean);
      if (!list.length) { st.err = k.clientErr('piece_missing', 'Η παράδοση δεν είναι πια στον πίνακα — ανανέωσε'); return st; }
      st.items = k.copy(list);
      st.group = src.group ? k.copy(src.group) : null;
      st.pieces = src.pieces ? k.copy(src.pieces) : null;
      st.day = st.day || st.items[0].nat_ready_day || null;
      if (!ctx.side) st.side = k.sideFor(st.items[0]);
      const i0 = st.items[0];
      st.ref = i0.reference || (i0.nat_order_id != null ? '#' + i0.nat_order_id : i0.order_id != null ? '#' + i0.order_id : '—');
      if (ctx.choice) Object.assign(st, k.copy(ctx.choice));
      _needsOf(st);
      // F12 (live 28/10): the Veroia window the order already has (its shipment's window at the hub, on the pieces'
      // Veroia day) fills the row, still the user's to change — never asked again, never replaced by «όλη η ημέρα»
      const hd = k.hubDayOf(st.needs, st.day);
      const hw = !st.hub && !st.win.hub && st.needs.find((n) => n.hub && !n.own && n.from && n.to && k.ymdOf(n.from) === hd);
      if (hw) st.win.hub = { all: false, from: k.hm(hw.from), to: k.hm(hw.to) };
    }
    if (!st.day) st.err = k.clientErr('day_missing', 'Η ημέρα της ανάθεσης δεν είναι γνωστή — ανανέωσε');
    for (const c of st.cycles) { const r = k.row(c.rt_id); st.sidePal[c.rt_id] = { pal: k.sidePal(r, st.side), unk: k.sideUnk(r, st.side) }; }
    return st;
  }
  // 089 (rule 6): two fields when the trip has both sides and ONE vehicle (with a handover each segment has its own fee,
  // «Αλλαγή οχήματος…»), and only once 089 runs: its plan_h_seg_json names partner_rate_anodos on every segment (null
  // included). Before it the key is absent and the form keeps one field (the base would refuse the key: bad_input).
  // Prefilled from the base: ΚΑΘΟΔΟΥ = fee − part, ΑΝΟΔΟΥ = part. A fee with no part (a trip that got its second side
  // later) prefills nothing — which side the fee was is not known — and shows the fee as «σύνολο».
  const _r2 = (n) => Math.round(n * 100) / 100;
  const _eur = (n) => String(_r2(Number(n))).replace('.', ',');
  function _splitOf(st, c) {
    const sides = new Set((c.stops || []).map((s) => s.side));
    const segs = c.segments || [];
    // one side: the one field is named by the trip's own side (a vehicle form has no side of its own)
    if (sides.size === 1) st.rateSide = [...sides][0];
    if (!(sides.has('KATHODOS') && sides.has('ANODOS')) || segs.length > 1 || !segs[0] || !('partner_rate_anodos' in segs[0])) return;
    st.split = true;
    const fee = c.trip_type === 'PARTNER' && c.partner_rate != null ? Number(c.partner_rate) : null;
    const an = c.trip_type === 'PARTNER' && segs[0] && segs[0].partner_rate_anodos != null ? Number(segs[0].partner_rate_anodos) : null;
    st.an0 = an; st.fee0 = fee;
    if (fee !== null && an !== null) { st.rateTxt = String(_r2(fee - an)); st.rate2Txt = String(an); }
    else { st.rateTxt = ''; st.rate2Txt = ''; st.total = fee; }
    st.rate0 = st.rateTxt; st.rate20 = st.rate2Txt;
  }
  // the keys of the two fields: the whole fee and its ΑΝΟΔΟΥ part (null = «λείπει»). Both fields empty and untouched on a
  // fee with no part: no key, the fee stays as it is (plan_rt_update keeps what the body does not name).
  function _split(st) {
    const k = K(), a = k.rate(st.rateTxt), b = k.rate(st.rate2Txt);
    if (!a.ok || !b.ok) return { ok: false };
    if (b.v !== null && a.v === null) return { ok: false };
    if (a.v === null && b.v === null && st.rateTxt === st.rate0 && st.rate2Txt === st.rate20) return { ok: true, keys: {} };
    return { ok: true, keys: { partner_rate: a.v === null ? null : _r2(a.v + (b.v || 0)), partner_rate_anodos: b.v } };
  }
  // beside the ΚΑΘΟΔΟΥ: the fee the P&L reads when the save changes it («σύνολο 700 → 400 €»: an empty ΑΝΟΔΟΥ lowers it,
  // said before the press), or the fee with no part while nothing is typed («σύνολο 700 €»); nothing otherwise
  function _sumAv(st) {
    if (!st.split) return '';
    const s = _split(st);
    if (s.ok && 'partner_rate' in s.keys && st.fee0 !== null && s.keys.partner_rate !== st.fee0) {
      return 'σύνολο ' + _eur(st.fee0) + ' → ' + (s.keys.partner_rate === null ? '—' : _eur(s.keys.partner_rate)) + ' €';
    }
    return st.total !== null && !st.rateTxt && !st.rate2Txt ? 'σύνολο ' + _eur(st.total) + ' €' : '';
  }
  // the pieces the request carries: the whole group, or the pressed piece alone («μόνο αυτές οι παλέτες», F42)
  function _sel(st) { return st.only && st.focus ? st.items.filter((it) => it.piece_id === st.focus) : st.items; }
  function _needsOf(st) {
    const k = K();
    const take = new Map((st.pieces || []).map((p) => [p.piece_id, p]));
    const hub = k.hubId();
    const sel = _sel(st);
    st.needs = sel.flatMap((it) => k.needs(it, !!(take.get(it.piece_id) || {}).to_hub, hub));
    const pals = sel.map((it) => { const p = take.get(it.piece_id); return p && typeof p.take_pallets === 'number' ? p.take_pallets : it.pallets; });
    st.pallets = k.sum(pals);
    st.palUnk = pals.filter((x) => x == null).length;
  }
  const _hd = (st) => K().hubDayOf(st.needs, st.day);
  // the day that decides join or new: a ΚΑΘΟΔΟΣ loads at Veroia on its Veroia day (F27); an ΑΝΟΔΟΣ loads at its
  // supplier on its own day, so its truck must run that day
  const _dayD = (st) => (st.hub ? st.hub.day : st.side === 'KATHODOS' ? (_hd(st) || st.day) : st.day);
  const _inWeek = (st, d) => !st.week || (d >= st.week && d <= K().addDays(st.week, 6));
  // the days the vehicle must run for this request: the row's day, the Veroia day and the joining day
  // (a vehicle change: every day of the cycle it changes, code review high)
  const _span = (st) => {
    const ds = (st.mode === 'vehicle' && st.cur ? [st.cur.date_start, st.cur.date_end, st.day] : [st.day, _hd(st), _dayD(st)]).filter(Boolean).sort();
    return ds.length ? [ds[0], ds[ds.length - 1]] : null;
  };
  // a day of the span outside the loaded week: what the vehicle does then is not on the board (code review of #171)
  const _blind = (st) => { const sp = _span(st); if (!sp) return false; for (let d = sp[0]; d <= sp[1]; d = K().addDays(d, 1)) if (!_inWeek(st, d)) return true; return false; };
  const _covers = (c, d) => (c.date_start <= d && d <= c.date_end) || K().ymdOf(c.end_at) === d;
  const _segs = (c) => { try { return typeof WN5L !== 'undefined' ? WN5L.segmentsOf(c).segments : [c]; } catch (e) { return [c]; } };
  const _uses = (c, key, id) => id != null && (c[key] === id || _segs(c).some((g) => g[key] === id));
  // the live cycles of a vehicle that run on day d, the earliest first (two the same day = «άλλο ›», never a silent pick)
  function _cands(st, who, id, d) {
    if (id == null || !d) return [];
    const key = who === 'partner' ? 'partner_id' : 'truck_id';
    return st.cycles.filter((c) => (who === 'partner' ? c.trip_type === 'PARTNER' : c.trip_type !== 'PARTNER') && _uses(c, key, id) && _covers(c, d))
      .sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at) || a.rt_id - b.rt_id);
  }
  // F51 / F61 (owner 30-31/10): a vehicle that already runs that day offers BOTH «στο ίδιο φορτίο» (each of its
  // cycles of the day: target rt_id) and «νέο φορτίο μετά την <last stop>» (target new_rt, its stops of that day from
  // the previous trip's end: the base's busy check is [) — an end at 14:00 and a start at 14:00 do not clash, 071b).
  // Default: join; a ΚΑΘΟΔΟΣ after a trip that came back to Veroia that day is a new load. The user switches, one click.
  function _target(st) {
    const k = K();
    const id = st.who === 'partner' ? st.partner : st.who === 'own' ? st.truck : null;
    if (id == null) return null;
    const D = _dayD(st);
    const cs = _cands(st, st.who, id, D);
    const opts = cs.map((c) => ({ cyc: c, after: null }));
    let def = 0;
    if (cs.length) {
      const last = cs.slice().sort((a, b) => Date.parse(b.end_at) - Date.parse(a.end_at))[0];
      const end = (last.stops || []).slice().sort((x, y) => Date.parse(x.planned_to) - Date.parse(y.planned_to)).pop();
      const hub = k.hubId();
      const place = end ? (end.location_id === hub ? 'Βέροια' : k.placeCity(end.location_id) || end.location || k.placeName(end.location_id)) : '—';
      opts.push({ cyc: null, after: { iso: last.end_at, day: k.ymdOf(last.end_at), hm: k.hm(last.end_at), place } });
      if (st.side === 'KATHODOS' && end && end.location_id === hub && k.ymdOf(last.end_at) === D) def = opts.length - 1;
    }
    const i = opts.length ? (st.opt == null ? def : st.opt % opts.length) : 0;
    const o = opts[i] || { cyc: null, after: null };
    return { cyc: o.cyc, after: o.after, n: cs.length, opts, i };
  }
  // F54 (owner 30/10): the load of a side is its PEAK along the stops in time order, never the sum of every loading —
  // 30 unloaded at Patra then 27 loaded is 30 at most, not 57. Unloads first at the same time. Unknown pallets count 0
  // and are said by WN5L.palText as before.
  function _peak(ev) {
    let cur = 0, max = 0;
    for (const e of ev.slice().sort((a, b) => a.t - b.t || a.d - b.d)) { cur += e.d; if (cur > max) max = cur; }
    return Math.round(max * 10) / 10;
  }
  function _sideEvents(cyc, side) {
    const ev = [];
    for (const s of (cyc && cyc.stops) || []) {
      if (s.side !== side) continue;
      for (const l of s.legs || []) if (typeof l.pallets === 'number') ev.push({ t: Date.parse(s.planned_from), d: l.act === 'unload' ? -l.pallets : l.pallets });
    }
    return ev;
  }
  // before / after of the line: the target's side, then the same with this request's pieces at their stops' times
  function _load(st, tg, r) {
    const before = tg && tg.cyc ? _peak(_sideEvents(tg.cyc, st.side)) : 0;
    if (!r || r.missing || !r.body) return { before, after: before + st.pallets };
    const t = new Map();
    for (const s of r.body.stops || []) {
      const ex = s.stop_id != null && tg.cyc ? (tg.cyc.stops || []).find((x) => x.stop_id === s.stop_id) : null;
      if (ex) t.set(ex.location_id, Date.parse(ex.planned_from)); else if (s.location_id != null) t.set(s.location_id, Date.parse(s.planned_from));
    }
    const take = new Map((st.pieces || []).map((p) => [p.piece_id, p]));
    const ev = _sideEvents(tg.cyc, st.side);
    _sel(st).forEach((it, i) => {
      const p = take.get(it.piece_id), pal = p && typeof p.take_pallets === 'number' ? p.take_pallets : it.pallets;
      const a = st.needs[2 * i], b = st.needs[2 * i + 1];
      if (typeof pal !== 'number' || !a || !b || !t.has(a.loc) || !t.has(b.loc)) return;
      ev.push({ t: t.get(a.loc), d: pal }, { t: t.get(b.loc), d: -pal });
    });
    return { before, after: _peak(ev) };
  }

  // ═══ «Ημέρα και παράθυρο»: one row per stop of the request (decision 6: one stop per place per side) ═══
  // fixed = a window that already exists (the target cycle's stop at that place, the order's own window, the Veroia
  // board's Veroia stop); else the row is the user's: «όλη η ημέρα» by default, «ώρες…» to type them.
  function _rows(st, cyc) {
    const k = K();
    const hubLoc = st.needs.some((n) => n.hub) ? k.hubId() : null;
    const hd = _hd(st);
    const out = [], seen = new Set();
    for (const n of st.needs) {
      const key = n.hub ? 'hub' : n.key;
      if (seen.has(key)) continue;
      seen.add(key);
      const day = n.hub ? (st.hub ? st.hub.day : hd) : n.day;
      const verb = n.role === 'load' ? 'Φόρτωση' : (n.hub ? 'Άφιξη' : 'Παράδοση');
      const ex = n.loc != null && cyc ? (cyc.stops || []).find((s) => s.side === st.side && s.location_id === n.loc) : null;
      const pl = n.hub ? 'Βέροια' : _place(n.loc);
      const row = { key, n, verb, place: pl, day: ex ? k.stopDay(ex) : day, fixed: null, missing: n.loc == null || !day,
        est: !ex && !st.hub && n.hub && !!n.hubEst && !st.needs.some((m) => m.hub && m.hubDay === day && !m.hubEst) };
      if (ex) row.fixed = k.hmw(ex.planned_from, ex.planned_to);
      else if (n.hub && st.hub) {
        // the Veroia board's window is the one sent (req): a half-typed one is red here and named, never this form's own
        const f = k.hhmm(st.hub.from), t = k.hhmm(st.hub.to);
        row.fixed = f && t ? (f === '00:00' && t === '23:59' ? 'όλη η ημέρα' : f + '–' + t) : '—';
        row.hubBad = !(f && t);
      }
      else if (n.hub && n.own && n.from && n.to) row.fixed = k.hmw(n.from, n.to);
      else if (!n.hub && n.from && n.to) row.fixed = k.hmw(n.from, n.to);
      // two Veroia days have no right one (decision 6) — unless the Veroia board fixed the day (st.hub)
      if (n.hub && !st.hub && hubLoc != null && k.hubDays(st.needs).length > 1) row.twoDays = k.hubDays(st.needs);
      out.push(row);
    }
    return out;
  }
  function _place(loc) {
    const k = K();
    if (loc == null) return '—';
    const name = k.placeName(loc), city = k.placeCity(loc);
    return city && name.toLowerCase().indexOf(city.toLowerCase()) < 0 ? name + ', ' + city : name;
  }
  // a row the user owns: {all: true} (default) or {all: false, from, to}
  const _w = (st, key) => st.win[key] || { all: true, from: '', to: '' };
  function _winOf(st, key, day, after) {
    const k = K(), w = _w(st, key);
    if (w.all) return day ? k.win(day, after && after.day === day && after.hm < '23:59' ? after.hm : '00:00', '23:59') : null;
    const f = k.hhmm(w.from), t = k.hhmm(w.to);
    return day && f && t ? k.win(day, f, t) : null;
  }

  // ═══ the request (or what is missing) — from the state only ═══
  function req(st) {
    const k = K();
    if (st.mode === 'vehicle') {
      if (st.who === 'own' && st.truck) {
        const set = { trip_type: 'OWNED', truck_id: st.truck };
        // only what the user chose: a key sent as null would EMPTY it (vehicle_clear_use_clear, 072)
        if (st.trailer) set.trailer_id = st.trailer;
        if (st.driver) set.driver_id = st.driver;
        return { method: 'PATCH', path: '/plan/rt/' + st.rtId, body: { set } };
      }
      if (st.who === 'partner' && st.partner && st.split) {
        const s = _split(st);
        return s.ok ? { method: 'PATCH', path: '/plan/rt/' + st.rtId, body: { set: Object.assign({ trip_type: 'PARTNER', partner_id: st.partner }, s.keys) } } : null;
      }
      if (st.who === 'partner' && st.partner) {
        const r = k.rate(st.rateTxt);
        return r.ok ? { method: 'PATCH', path: '/plan/rt/' + st.rtId, body: { set: { trip_type: 'PARTNER', partner_id: st.partner, partner_rate: r.v } } } : null;
      }
      return null;
    }
    const tg = _target(st);
    if (!tg) return null;
    let target;
    if (tg.cyc) target = { rt_id: tg.cyc.rt_id, side: st.side };
    else if (st.who === 'own') target = { new_rt: { trip_type: 'OWNED', truck_id: st.truck, trailer_id: st.trailer || null, driver_id: st.driver || null }, side: st.side };
    else {
      const r = k.rate(st.rateTxt);
      if (!r.ok) return null;
      target = { new_rt: { trip_type: 'PARTNER', partner_id: st.partner, partner_rate: r.v }, side: st.side };
    }
    const hd = st.hub ? st.hub.day : _hd(st);
    const hubWin = st.hub ? (k.hhmm(st.hub.from) && k.hhmm(st.hub.to) ? k.win(st.hub.day, k.hhmm(st.hub.from), k.hhmm(st.hub.to)) : null) : _winOf(st, 'hub', hd, tg.after);
    const r = k.stopsFor(st.needs, tg.cyc, st.side, hubWin, (n) => _winOf(st, n.key, n.day, tg.after));
    if (r.missing.length) return { missing: r.missing, lack: r.lack };
    const sel = _sel(st);
    const body = st.only || !st.group
      ? { pieces: st.only ? sel.map((it) => ({ piece_id: it.piece_id })) : st.pieces, target, stops: r.stops }
      : { group: st.group, target, stops: r.stops };
    return { method: 'POST', path: '/plan/legs', body };
  }

  // ═══ what is missing: field marks and the «Λείπει: …» words (rule 3) ═══
  function problems(st) {
    const k = K();
    const out = { fields: {}, rows: {}, words: [], soft: {} };
    const add = (w) => { if (!out.words.includes(w)) out.words.push(w); };
    for (const px of Object.keys(FIELDS)) {
      if (st.typed[px] && st[FIELDS[px].key] == null) { out.fields[px] = PICK; add(FIELDS[px].lbl.toLowerCase() + ' (' + PICK + ')'); }
    }
    if (!st.who && !Object.keys(out.fields).length) add('φορτηγό ή συνεργάτης');
    if (st.who === 'partner' && st.split) {
      const a = k.rate(st.rateTxt), b = k.rate(st.rate2Txt);
      if (!a.ok) { out.fields.rate = 'μόνο αριθμός'; add('κόμιστρο ΚΑΘΟΔΟΥ (αριθμός)'); }
      if (!b.ok) { out.fields.rate2 = 'μόνο αριθμός'; add('κόμιστρο ΑΝΟΔΟΥ (αριθμός)'); }
      // an ΑΝΟΔΟΥ alone would make the ΚΑΘΟΔΟΥ a silent 0: it is asked for (0 is typed, never assumed)
      if (a.ok && b.ok && b.v !== null && a.v === null) { out.fields.rate = 'γράψε ποσό'; add('κόμιστρο ΚΑΘΟΔΟΥ'); }
      // an empty ΑΝΟΔΟΥ is saved as «λείπει» (coordinator 1/11): said beside the field, never a block
      if (b.ok && b.v === null) out.soft.rate2 = 'λείπει';
    } else if (st.who === 'partner' && !k.rate(st.rateTxt).ok) { out.fields.rate = 'μόνο αριθμός'; add('κόμιστρο (αριθμός)'); }
    if (st.mode === 'vehicle') return out;
    const tg = _target(st);
    for (const row of _rows(st, tg && tg.cyc)) {
      if (row.twoDays) { add('μία ημέρα Βέροιας (' + row.twoDays.map(k.dayShort).join(', ') + ')'); continue; }
      if (row.hubBad) { add('παράθυρο Βέροιας'); continue; }
      if (row.missing) { add((row.n.role === 'load' ? 'τόπος φόρτωσης' : 'τόπος παράδοσης') + (row.n.loc == null ? '' : ' ' + row.place)); continue; }
      if (row.fixed != null) continue;
      if (!_winOf(st, row.key, row.day, tg && tg.after)) { out.rows[row.key] = HOURS; add('ώρες ' + (row.n.role === 'load' ? 'φόρτωσης' : 'παράδοσης') + ' ' + (row.n.hub ? 'Βέροια' : k.placeCity(row.n.loc) || k.placeName(row.n.loc))); }   // Figma 2395:8132: the town («ώρες παράδοσης Larisa»)
    }
    return out;
  }

  // ═══ availability of a vehicle on the request's days (Figma 1: «Σίνδος ως 13:00», «✓ ελεύθερο») ═══
  // From the loaded week only: a day outside it reads «—», never «ελεύθερο» (principle 1, doc «Τι θέλει SQL ή Worker»).
  function avail(st, px, id) {
    const k = K(), f = FIELDS[px];
    if (id == null || px === 'pt') return null;
    const key = f.kind + '_id';
    const D = _dayD(st);
    const sp = _span(st);
    if (!sp) return null;
    const a = sp[0], b = sp[1];
    if (_blind(st)) return { txt: '—', cls: '' };
    const mine = st.cycles.filter((c) => c.rt_id !== st.rtId && _uses(c, key, id));
    const on = mine.filter((c) => { for (let d = a; d <= b; d = k.addDays(d, 1)) if (_covers(c, d)) return true; return false; })
      .sort((x, y) => Date.parse(x.start_at) - Date.parse(y.start_at));
    if (on.length) {
      const c = on[0];
      const hubLoc = k.hubId();
      const hs = (c.stops || []).find((s) => s.side === st.side && s.location_id === hubLoc);
      const sp = st.sidePal[c.rt_id] || { pal: 0, unk: 0 };
      if (hs && k.stopDay(hs) === D) return { txt: 'Βέροια ' + k.hmw(hs.planned_from, hs.planned_to) + ' · ' + WN5L.palText(sp.pal, sp.unk) + 'π', cls: 'dim' };
      const last = (c.stops || []).slice().sort((x, y) => Date.parse(x.planned_to) - Date.parse(y.planned_to)).pop();
      const at = last ? (last.location_id === hubLoc ? 'Βέροια' : last.location || k.placeName(last.location_id)) : '—';
      const endDay = k.ymdOf(c.end_at);
      return { txt: at + ' ως ' + (endDay === D ? '' : k.dayShort(endDay).split(' ')[0] + ' ') + k.hm(c.end_at), cls: 'busy' };
    }
    // a driver back on day X leaves on X+2 (561/2006, the International popover's rule); before that he is not free
    if (f.kind === 'driver') {
      const back = mine.map((c) => k.ymdOf(c.end_at)).filter((e) => e && e < a).sort().pop();
      if (back && k.addDays(back, 2) > a) return { txt: 'από ' + k.dayShort(k.addDays(back, 2)) + ' (Χ+2)', cls: 'busy' };
    }
    return { txt: f.free, cls: 'free' };
  }
  // the last rate of a partner on the loaded week (the history of the line needs a Worker read: follow-up)
  function _lastRate(st, id) {
    const c = st.cycles.filter((x) => x.trip_type === 'PARTNER' && x.partner_id === id && x.partner_rate != null)
      .sort((x, y) => String(y.date_start).localeCompare(String(x.date_start)))[0];
    return c ? K().pal(c.partner_rate) + ' € · ' + K().dayShort(c.date_start) : '';
  }
  // open work order, a document due (core/utils.js vehicleWarnings, as the International popover): by the facade id
  function _warn(px, id) {
    if ((px !== 'tk' && px !== 'tl') || typeof vehicleWarnings !== 'function' || typeof PlanIds === 'undefined') return [];
    try {
      const x = _list(FIELDS[px].kind).find((v) => v.id === id);
      return x && x.legacy_id ? vehicleWarnings(px === 'tl' ? 'trailer' : 'truck', x.legacy_id) : [];
    } catch (e) { K().log(e, 'WN5Assign vehicleWarnings'); return []; }
  }

  // ═══ the line under the fields: the vehicle, its day, the pallets before → after (rule 1) ═══
  function line(st) {
    const k = K();
    if (st.mode === 'vehicle' || !st.who) return null;
    const id = st.who === 'own' ? st.truck : st.partner;
    if (id == null) return null;
    const lbl = _label(st.who === 'own' ? 'tk' : 'pt', id);
    const tg = _target(st);
    const D = _dayD(st);
    let txt, road = false, other = null;
    if (tg.cyc) {
      road = tg.cyc.date_start < D;
      txt = lbl + ' · ' + (road ? 'στο δρόμο από ' + k.dayShort(tg.cyc.date_start) : k.dayShort(D)) + (tg.n > 1 ? ' · ' + k.hm(tg.cyc.start_at) : '');
      // the cycle's own Veroia stop on another day than the load's: the load goes to that stop (decision 6)
      const hs = st.needs.some((n) => n.hub) && (tg.cyc.stops || []).find((s) => s.side === st.side && s.location_id === k.hubId());
      if (hs && k.stopDay(hs) !== D) other = 'Βέροια ' + k.dayShort(k.stopDay(hs));
    } else if (tg.after) txt = lbl + ' · νέο φορτίο μετά την ' + tg.after.place + ' · ελεύθερο από ' + (tg.after.day === D ? '' : k.dayShort(tg.after.day) + ' ') + tg.after.hm;
    else txt = lbl + ' · ' + (_blind(st) ? '—' : 'ελεύθερο');
    const unk = tg.cyc ? (st.sidePal[tg.cyc.rt_id] || { unk: 0 }).unk : 0;
    const ld = _load(st, tg, req(st));
    // the options of a vehicle that already runs that day (F51 / F61): «στο ίδιο φορτίο» per cycle, then «νέο φορτίο»
    const opts = tg.opts.length > 1 ? tg.opts.map((o, i) => ({ i, on: i === tg.i,
      label: o.cyc ? 'στο ίδιο φορτίο' + (tg.n > 1 ? ' · ' + k.hm(o.cyc.start_at) : '') : 'νέο φορτίο' })) : [];
    return { txt, road, other, opts, before: WN5L.palText(ld.before, unk), after: WN5L.palText(ld.after, unk + st.palUnk), over: ld.after > 33,
      join: !!tg.cyc, rtId: tg.cyc ? tg.cyc.rt_id : null };
  }
  function _label(px, id) {
    if (id == null || typeof PlanIds === 'undefined') return '';
    try { const x = _list(FIELDS[px].kind).find((v) => v.id === id); return x ? x.label : '#' + id; } catch (e) { return '#' + id; }
  }

  // ═══ drawing ═══
  const _e = (s) => K().esc(s);
  function _fieldHTML(st, px, pb, disabled) {
    const f = FIELDS[px];
    const id = st[f.key];
    const val = id != null ? _label(px, id) : st.typed[px];
    const bad = pb.fields[px];
    let av = bad ? { txt: bad, cls: 'bad' } : (st.who === (px === 'pt' ? 'partner' : 'own') && id != null ? avail(st, px, id) : null);
    // F56 (owner 31/10): the truck's last trailer / driver is a SUGGESTION — shown as one, one click to change
    const sg = !bad && !disabled && id != null && st.sugg[px];
    if (sg) av = { txt: 'πρόταση' + (av && av.txt ? ' · ' + av.txt : ''), cls: 'sugg' };
    return '<div class="wi-pop-field wn5a-f' + (bad ? ' wn5a-bad' : '') + (sg ? ' wn5a-sugg' : '') + '" data-f="' + px + '"><span class="wi-pop-lbl">' + f.lbl + '</span>'
      + '<span class="wn5a-sd"><input type="text" class="wi-pop-inp wn5a-in' + (f.mono ? ' wn5a-mono' : '') + '" data-in="' + px + '" placeholder="' + f.ph + '" value="' + _e(val) + '" autocomplete="off"'
      + (disabled ? ' disabled' : '') + ' aria-label="' + f.lbl + '"><span class="wn5a-car" aria-hidden="true">▾</span></span>'
      + '<span class="wn5a-av' + (av ? ' ' + av.cls : '') + '" data-av="' + px + '">' + _e(av ? av.txt : '') + '</span></div>';
  }
  function _rowsHTML(st, pb, cyc, after) {
    const k = K();
    let h = '';
    for (const row of _rows(st, cyc)) {
      const bad = pb.rows[row.key];
      const lbl = row.verb + ' · ' + row.place + (row.day ? ' · ' + k.dayShort(row.day) + (row.est ? ' (εκτίμηση)' : '') : '');
      if (row.fixed != null || row.missing || row.twoDays) {
        const v = row.twoDays ? row.twoDays.map(k.dayShort).join(' / ') : row.missing ? '—' : row.fixed;
        h += '<div class="wn5a-win" data-row="' + _e(row.key) + '"><span class="wn5a-wl' + (row.missing || row.twoDays || row.hubBad ? ' bad' : '') + '">' + _e(lbl) + '</span><span class="wn5a-wv">' + _e(v) + '</span></div>';
        continue;
      }
      const w = _w(st, row.key);
      h += '<div class="wn5a-win" data-row="' + _e(row.key) + '"><span class="wn5a-wl' + (bad ? ' bad' : '') + '">' + _e(lbl) + '</span>'
        + (w.all
          ? '<button type="button" class="wn5a-all on" data-act="all" data-row="' + _e(row.key) + '">' + (after && after.day === row.day && after.hm < '23:59' ? 'από ' + _e(after.hm) : 'όλη η ημέρα') + '</button><button type="button" class="wn5a-hrs" data-act="hours" data-row="' + _e(row.key) + '">ώρες…</button>'
          : '<input class="wi-pop-inp wn5a-hm' + (bad ? ' bad' : '') + '" data-hm="from" data-row="' + _e(row.key) + '" inputmode="numeric" maxlength="5" placeholder="ΗΗ:ΛΛ" value="' + _e(w.from) + '" aria-label="από">'
            + '<span class="wn5a-dash">–</span><input class="wi-pop-inp wn5a-hm' + (bad ? ' bad' : '') + '" data-hm="to" data-row="' + _e(row.key) + '" inputmode="numeric" maxlength="5" placeholder="ΗΗ:ΛΛ" value="' + _e(w.to) + '" aria-label="έως">'
            + '<button type="button" class="wn5a-all" data-act="all" data-row="' + _e(row.key) + '">όλη η ημέρα</button>')
        + '</div>' + (bad ? '<div class="wn5a-werr">' + _e(bad) + '</div>' : '');
    }
    return h ? '<div class="wn5a-sec"><div class="wi-pop-section-lbl">ΗΜΕΡΑ ΚΑΙ ΠΑΡΑΘΥΡΟ</div>' + h + '</div>' : '';
  }
  function _lineHTML(st) {
    const l = line(st);
    if (!l) return '';
    return '<div class="wn5a-line" data-line><span class="wn5a-lt">' + _e(l.txt) + '</span>'
      + (l.other ? '<span class="wn5a-note">' + _e(l.other) + '</span>' : '')
      + (l.road && st.who === 'own' ? '<span class="wn5a-note">νέο φύλλο στον οδηγό</span>' : '')
      + (l.opts.length ? '<span class="wn5a-opts" role="group">' + l.opts.map((o) => '<button type="button" class="wn5a-opt' + (o.on ? ' on' : '') + '" data-act="opt" data-i="' + o.i + '">' + _e(o.label) + '</button>').join('') + '</span>' : '')
      + '<span class="wn5a-cap' + (l.over ? ' over' : '') + '" data-cap>' + _e(l.before + ' → ' + l.after + '/33') + '</span></div>';
  }
  function bodyHTML(st) {
    const k = K();
    const pb = problems(st);
    const tg = st.mode === 'vehicle' ? null : _target(st);
    const joinOwn = !!(tg && tg.cyc && st.who === 'own');
    const joinPar = !!(tg && tg.cyc && st.who === 'partner');
    let h = '';
    // F42: a VS with several deliveries goes whole; «μόνο αυτές οι παλέτες» sends the pressed piece alone
    if (st.mode === 'legs' && st.group && st.group.order_id != null && st.items.length > 1 && st.focus) {
      h += '<div class="wn5a-band"><span>' + _e(st.ref + ' · ' + st.items.length + ' παραδόσεις · ' + WN5L.palText(k.sum(st.items.map((x) => x.pallets)), st.items.filter((x) => x.pallets == null).length) + 'π') + '</span>'
        + '<label class="wn5a-only"><input type="checkbox" data-only' + (st.only ? ' checked' : '') + '><span>μόνο αυτές οι παλέτες</span></label></div>';
    }
    h += '<div class="wi-pop-body wn5a-body">';
    if (st.mode !== 'vehicle') h += _rowsHTML(st, pb, tg && tg.cyc, tg && tg.after);
    h += '<div class="wn5a-sec"><div class="wi-pop-section-lbl">ΔΙΚΟΣ ΣΤΟΛΟΣ</div><div class="wi-pop-row">'
      + _fieldHTML(st, 'tk', pb) + _fieldHTML(st, 'tl', pb, joinOwn) + _fieldHTML(st, 'dr', pb, joinOwn) + '</div></div>';
    const rateBad = pb.fields.rate;
    const rateVal = joinPar ? (tg.cyc.partner_rate == null ? '' : String(tg.cyc.partner_rate)) : st.rateTxt;
    // 089: the second field and the «σύνολο» of a fee with no part (rule 6)
    const rateSide = st.split ? 'KATHODOS' : (st.rateSide || st.side);
    const rateAv = rateBad || _sumAv(st);
    const bad2 = pb.fields.rate2, av2 = bad2 || pb.soft.rate2 || '';
    h += '<div class="wn5a-sec"><div class="wi-pop-section-lbl">ΣΥΝΕΡΓΑΤΗΣ</div><div class="wi-pop-row">' + _fieldHTML(st, 'pt', pb)
      + '<div class="wi-pop-field wn5a-f wn5a-rate' + (rateBad ? ' wn5a-bad' : '') + '" data-f="rate"><span class="wi-pop-lbl">Κόμιστρο ' + (rateSide === 'ANODOS' ? 'ΑΝΟΔΟΥ' : 'ΚΑΘΟΔΟΥ') + ' €</span>'
      + '<input class="wi-pop-inp" data-rate inputmode="decimal" placeholder="0.00" value="' + _e(rateVal) + '"' + (joinPar ? ' disabled' : '') + ' aria-label="Κόμιστρο ' + (rateSide === 'ANODOS' ? 'ΑΝΟΔΟΥ' : 'ΚΑΘΟΔΟΥ') + ' €">'
      + '<span class="wn5a-av' + (rateBad ? ' bad' : '') + '">' + _e(rateAv) + '</span></div>'
      + (st.split ? '<div class="wi-pop-field wn5a-f wn5a-rate' + (bad2 ? ' wn5a-bad' : '') + '" data-f="rate2"><span class="wi-pop-lbl">Κόμιστρο ΑΝΟΔΟΥ €</span>'
        + '<input class="wi-pop-inp" data-rate2 inputmode="decimal" placeholder="0.00" value="' + _e(st.rate2Txt) + '" aria-label="Κόμιστρο ΑΝΟΔΟΥ €">'
        + '<span class="wn5a-av' + (av2 ? ' bad' : '') + '">' + _e(av2) + '</span></div>' : '')
      + '</div></div>';
    if (st.mode !== 'vehicle') h += _lineHTML(st);
    h += '</div>';
    return h;
  }
  // the order and its way in the header (Figma: «#2041 · Βέροια Δευ 12/10 → Lambda Pack, Larisa Τρί 13/10 · 12π»)
  function _sub(st) {
    const k = K();
    if (st.mode === 'vehicle') {
      const c = st.cur;
      const now = c.trip_type === 'PARTNER' ? (c.partner || '—') : [c.truck, c.driver].filter(Boolean).join(' · ') || 'ΠΡΟΣ ΑΝΑΘΕΣΗ';
      return k.dayShort(st.day) + ' · ' + now;
    }
    const load = st.needs.find((n) => n.role === 'load'), drop = st.needs.find((n) => n.role === 'drop');
    const end = (n) => (n ? (n.hub ? 'Βέροια' : _place(n.loc)) + ' ' + (n.hub ? k.dayShort(st.hub ? st.hub.day : _hd(st) || n.day) : k.dayShort(n.day)) : '—');
    const more = _sel(st).length > 1 ? ' +' + (_sel(st).length - 1) : '';
    return st.ref + ' · ' + end(load) + ' → ' + end(drop) + more + ' · ' + WN5L.palText(st.pallets, st.palUnk) + 'π';
  }

  // ═══ the search list of a field (the International popover's .wi-sd, here with the keyboard) ═══
  function _options(st, px, q) {
    const k = K();
    if (typeof PlanIds === 'undefined') return [];
    const nq = q ? k.norm(q) : '';
    return _list(FIELDS[px].kind).filter((x) => x.active && (!nq || k.norm(x.label).includes(nq))).slice(0, 60).map((x) => {
      const a = px === 'pt' ? null : avail(Object.assign({}, st, { who: 'own' }), px, x.id);
      const sub = px === 'pt' ? _lastRate(st, x.id) : (a ? a.txt : '');
      return { id: x.id, label: x.label, sub, cls: a ? a.cls : '', warn: _warn(px, x.id) };
    });
  }
  function _listHTML(opts, px, hi) {
    return opts.map((o, i) => '<div class="wn5a-o' + (i === hi ? ' hi' : '') + (o.cls === 'busy' ? ' wi-sdo--busy' : '') + '" data-pick="' + o.id + '" data-px="' + px + '">'
      + '<span class="' + (FIELDS[px].mono ? 'wn5a-mono' : '') + '">' + _e(o.label) + '</span>'
      + (o.sub ? '<div class="wi-sdo-sub wn5a-osub ' + o.cls + '">' + _e(o.sub) + '</div>' : '')
      + (o.warn.length ? '<div class="wi-sdo-sub wi-sdo-warn">' + _e(o.warn.join(' · ')) + '</div>' : '') + '</div>').join('')
      + (opts.length ? '' : '<div class="wn5a-none">—</div>')
      + (px === 'dr' ? '<div class="wn5a-lnote">' + _e(DRV_NOTE) + '</div>' : '');
  }

  // ═══ one open form ═══
  // ctx.onPick (pick mode): the «Επιλογή» button hands the choice to the caller and writes nothing.
  function _form(st, ctx) {
    const k = K();
    const d = k.dlg('assign', 'Ανάθεση', { anchor: ctx.anchor || null, onClose: () => { _dropList(); if (ctx.onCancel && !d.picked) ctx.onCancel(); } });
    d.dlg.classList.add('wn5a');
    const hd = d.dlg.querySelector('.wi4-dlg-hd');
    hd.querySelector('.wi4-dlg-t').insertAdjacentHTML('afterend', '<span class="wn5a-sub">' + _e(_sub(st)) + '</span>'
      + (st.mode === 'vehicle' ? '' : '<span class="wn5a-side">' + SIDE_GR[st.side] + '</span>'));
    const saveTxt = () => (st.mode === 'pick' ? 'Επιλογή' + (line(st) ? ' · ' + line(st).txt.split(' · ')[0] : '') : 'Αποθήκευση ανάθεσης');
    const clr = st.mode === 'vehicle' && st.cur && (st.cur.truck_id != null || st.cur.partner_id != null);
    d.ft.innerHTML = '<span class="wn5a-miss" data-miss></span>' + (clr ? '<button type="button" class="wi-pop-cancel" data-act="clear">Καθαρισμός</button>' : '')
      + '<button type="button" class="wi-pop-save" data-act="save"></button>';
    let list = null;   // the open search list: { px, el, opts, hi }
    function _dropList() { if (list && list.el.parentNode) list.el.parentNode.removeChild(list.el); list = null; }
    const changed = () => {
      if (st.mode !== 'vehicle') return true;
      const c = st.cur;
      if (st.who === 'own') return st.truck !== c.truck_id || (st.trailer && st.trailer !== c.trailer_id) || (st.driver && st.driver !== c.driver_id) || c.trip_type === 'PARTNER';
      if (st.who === 'partner' && st.split) {
        if (st.partner !== c.partner_id) return true;
        const s = _split(st);
        return s.ok && 'partner_rate' in s.keys && (s.keys.partner_rate !== (c.partner_rate == null ? null : Number(c.partner_rate)) || s.keys.partner_rate_anodos !== st.an0);
      }
      if (st.who === 'partner') return st.partner !== c.partner_id || (k.rate(st.rateTxt).v !== (c.partner_rate == null ? null : Number(c.partner_rate)));
      return false;
    };
    d.refresh = () => {
      const pb = problems(st);
      const r = req(st);
      const miss = d.dlg.querySelector('[data-miss]');
      miss.textContent = pb.words.length ? 'Λείπει: ' + pb.words.join(', ') : '';
      // the stop order the base would refuse (stop_order, 072 plan_h_reseq): said before the press, red, never a block
      const ow = r && !r.missing && r.body && r.body.target && r.body.target.rt_id ? k.orderWarn(st.cycles.find((c) => c.rt_id === r.body.target.rt_id), r) : null;
      if (ow && !pb.words.length) miss.textContent = ow;
      const b = d.dlg.querySelector('[data-act="save"]');
      b.textContent = saveTxt();
      b.disabled = d.locked || d.busy || !r || !!r.missing || !!pb.words.length || !changed();
    };
    // A redraw replaces the body: the element the user was moving to (focus: a relatedTarget) gets its focus back
    // in the new body, so a click from one field to the next is never eaten by the redraw.
    // drawing: replacing the body blurs its focused field, and that focusout must not read the field being replaced
    let drawing = false;
    const draw = (focus) => {
      _dropList();
      drawing = true;
      const f = focus && focus.getAttribute && d.body.contains(focus) ? ['data-in', 'data-hm', 'data-rate', 'data-rate2', 'data-row'].map((a) => [a, focus.getAttribute(a)]).filter((x) => x[1] !== null) : null;
      try { d.body.innerHTML = bodyHTML(st); } finally { drawing = false; }
      d.refresh();
      if (f && f.length) {
        const el = d.body.querySelector(f.map(([a, v]) => '[' + a + (v ? '="' + v + '"' : '') + ']').join(''));
        if (el && !el.disabled) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (_) { /* not a text input */ } }
      }
    };
    // the red marks of the window rows while the user types hours: no redraw (the caret stays where it is)
    const markRows = () => {
      const pb = problems(st);
      for (const w of d.body.querySelectorAll('.wn5a-win[data-row]')) {
        const bad = pb.rows[w.dataset.row];
        w.querySelector('.wn5a-wl').classList.toggle('bad', !!bad);
        for (const i of w.querySelectorAll('.wn5a-hm')) i.classList.toggle('bad', !!bad);
        let e = w.nextElementSibling && w.nextElementSibling.classList.contains('wn5a-werr') ? w.nextElementSibling : null;
        if (bad && !e) { e = document.createElement('div'); e.className = 'wn5a-werr'; e.textContent = bad; w.insertAdjacentElement('afterend', e); }
        if (!bad && e) e.remove();
      }
    };
    // after a truck or an option is chosen: joining keeps that cycle's trailer and driver (a change of them is
    // «Αλλαγή οχήματος…»); a new load gets the truck's last trailer and driver as a suggestion (F56), never over a
    // value the user picked
    let fromJoin = false;   // trailer / driver copied from a joined cycle (not the user's pick): replaced when it no longer joins
    const _vehicleOf = () => {
      if (st.mode === 'vehicle' || st.who !== 'own') return;
      const tg = _target(st);
      if (tg && tg.cyc) { st.trailer = tg.cyc.trailer_id || null; st.driver = tg.cyc.driver_id || null; st.typed.tl = st.typed.dr = ''; st.sugg.tl = st.sugg.dr = false; fromJoin = true; return; }
      // the truck's last trip BEFORE the load's day (a later trip is not «the last one»), else its latest on the board
      const D = _dayD(st);
      const mine = st.cycles.filter((c) => c.trip_type !== 'PARTNER' && _uses(c, 'truck_id', st.truck))
        .sort((a, b) => Date.parse(b.end_at) - Date.parse(a.end_at));
      const last = mine.find((c) => !D || K().ymdOf(c.end_at) <= D) || mine[0];
      for (const [px, key] of [['tl', 'trailer'], ['dr', 'driver']]) {
        if (st[key] != null && !st.sugg[px] && !fromJoin) continue;
        const v = last ? last[key + '_id'] || null : null;
        st[key] = v; st.sugg[px] = v != null; st.typed[px] = '';
      }
      fromJoin = false;
    };
    // a pick from the list (or an exact name typed); own and partner exclude each other, as one executes
    const choose = (px, id, next) => {
      const f = FIELDS[px];
      st[f.key] = id;
      st.typed[px] = '';
      st.sugg[px] = false;
      if (px === 'tl' || px === 'dr') fromJoin = false;   // the user's own pick from here on
      if (px === 'pt') { st.who = 'partner'; st.truck = st.trailer = st.driver = null; st.typed.tk = st.typed.tl = st.typed.dr = ''; st.opt = null; st.sugg = {}; }
      else {
        if (st.who !== 'own') { st.partner = null; st.typed.pt = ''; if (st.mode !== 'vehicle') st.rateTxt = ''; }
        st.who = 'own';
        if (px === 'tk') { st.opt = null; _vehicleOf(st); }
      }
      draw(next);
    };
    const openList = (inp) => {
      const px = inp.dataset.in;
      if (!list || list.px !== px) {
        _dropList();
        const el = document.createElement('div');
        // its own class, not .wi-sdl: weekly_intl.js hides every .wi-sdl on any click of the page (its global handler)
        el.className = 'wn5a-list';
        el.setAttribute('role', 'listbox');
        document.body.appendChild(el);
        list = { px, el, opts: [], hi: 0 };
        el.addEventListener('mousedown', (ev) => {
          const o = ev.target.closest('[data-pick]');
          ev.preventDefault();
          if (o) choose(px, Number(o.dataset.pick), null);
        });
      }
      const q = st[FIELDS[px].key] != null && inp.value === _label(px, st[FIELDS[px].key]) ? '' : inp.value;
      list.opts = _options(st, px, q);
      list.hi = Math.min(list.hi, Math.max(0, list.opts.length - 1));
      list.el.innerHTML = _listHTML(list.opts, px, list.hi);
      const r = inp.getBoundingClientRect();
      list.el.style.display = 'block';
      list.el.style.left = r.left + 'px';
      list.el.style.top = (r.bottom + 2) + 'px';
      list.el.style.width = Math.max(r.width, 220) + 'px';
      // a list that would end under the window opens above its field
      const lh = list.el.offsetHeight;
      if (r.bottom + 2 + lh > window.innerHeight - 8 && r.top - 2 - lh > 8) list.el.style.top = (r.top - 2 - lh) + 'px';
    };
    d.dlg.addEventListener('focusin', (ev) => { const t = ev.target; if (t.matches && t.matches('[data-in]')) openList(t); });
    d.dlg.addEventListener('focusout', (ev) => {
      const t = ev.target;
      if (drawing || !t.matches || !t.matches('[data-in]')) return;
      // F39: what was typed and not picked stays, red; an exact name is the pick
      const px = t.dataset.in, f = FIELDS[px];
      const v = t.value.trim();
      const next = ev.relatedTarget || null;
      if (list && next && list.el.contains(next)) return;
      if (st[f.key] != null && v === _label(px, st[f.key])) { _dropList(); return; }
      if (!v) { if (st[f.key] != null || st.typed[px]) { st[f.key] = null; st.typed[px] = ''; st.sugg[px] = false; if (px === 'pt' ? st.who === 'partner' : (px === 'tk' && st.who === 'own')) st.who = null; draw(next); } else _dropList(); return; }
      const hit = _options(st, px, '').filter((o) => k.norm(o.label) === k.norm(v));
      if (hit.length === 1) { choose(px, hit[0].id, next); return; }
      st[f.key] = null; st.typed[px] = v; st.sugg[px] = false;
      if (px === 'tk' && st.who === 'own') st.who = null;
      if (px === 'pt' && st.who === 'partner') st.who = null;
      draw(next);
    });
    d.dlg.addEventListener('input', (ev) => {
      const t = ev.target;
      if (t.matches('[data-in]')) { list && (list.hi = 0); openList(t); return; }
      if (t.matches('[data-rate]') || t.matches('[data-rate2]')) {
        if (t.matches('[data-rate]')) st.rateTxt = t.value; else st.rate2Txt = t.value;
        // both fields: «γράψε ποσό» of the ΚΑΘΟΔΟΥ follows what is typed in the ΑΝΟΔΟΥ (rule 6), no redraw (the caret stays)
        const pb = problems(st);
        for (const [key, msg] of [['rate', pb.fields.rate || ''], ['rate2', pb.fields.rate2 || pb.soft.rate2 || '']]) {
          const f = d.body.querySelector('.wn5a-f[data-f="' + key + '"]');
          if (!f) continue;
          f.classList.toggle('wn5a-bad', !!pb.fields[key]);
          const av = f.querySelector('.wn5a-av');
          av.textContent = msg || (key === 'rate' ? _sumAv(st) : '');
          av.classList.toggle('bad', !!msg);
        }
        d.refresh(); return;
      }
      if (t.matches('[data-hm]')) { const w = st.win[t.dataset.row] || (st.win[t.dataset.row] = { all: false, from: '', to: '' }); w[t.dataset.hm] = t.value; markRows(); d.refresh(); }
    });
    d.dlg.addEventListener('change', (ev) => {
      const t = ev.target;
      if (t.matches('[data-only]')) { st.only = t.checked; _needsOf(st); draw(); d.dlg.querySelector('.wn5a-sub').textContent = _sub(st); }
      // «0730» → «07:30» when the field is left, as the leg form reads it (_hhmm)
      else if (t.matches('[data-hm]')) { const v = k.hhmm(t.value); if (v) { t.value = v; const w = st.win[t.dataset.row]; if (w) w[t.dataset.hm] = v; } markRows(); d.refresh(); }
    });
    d.dlg.addEventListener('keydown', (ev) => {
      const t = ev.target;
      if (!t.matches || !t.matches('[data-in]') || !list) return;
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        list.hi = Math.max(0, Math.min(list.opts.length - 1, list.hi + (ev.key === 'ArrowDown' ? 1 : -1)));
        list.el.innerHTML = _listHTML(list.opts, list.px, list.hi);
      } else if (ev.key === 'Enter') {
        ev.preventDefault();
        const o = list.opts[list.hi];
        if (o) choose(list.px, o.id, null);
      }
      // Esc closes the form (and its list with it): the dialog's own key handler runs first, on window capture
    }, true);
    d.dlg.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-act]');
      if (!b || b.disabled || !_live()) return;
      const a = b.dataset.act;
      if (a === 'all') { st.win[b.dataset.row] = { all: true, from: '', to: '' }; draw(); }
      else if (a === 'hours') { st.win[b.dataset.row] = { all: false, from: '', to: '' }; draw(); const el = d.body.querySelector('[data-hm="from"][data-row="' + b.dataset.row + '"]'); if (el) el.focus(); }
      else if (a === 'opt') { st.opt = Number(b.dataset.i); _vehicleOf(); draw(); }
      else if (a === 'clear') { if (!d.busy) WN5Act.clear(st.rtId); }
      else if (a === 'save') {
        const r = req(st);
        if (!r || r.missing || problems(st).words.length) return;
        if (st.mode === 'pick') { d.picked = true; k.close(d); if (ctx.onPick) ctx.onPick(choiceOf(st)); return; }
        k.send(d, r, st.mode === 'vehicle' ? 'Άλλαξε το όχημα' : 'Ανατέθηκε', { intl: true });
      }
    });
    // the list follows its field when the form scrolls or the window moves, and goes when the form closes
    d.dlg.addEventListener('scroll', () => _dropList(), true);
    draw();
    if (ctx.anchor) k.place(d);
    k.gate(d);
    d.st = st;
    return d;
  }

  // the choice of the pick mode: who executes, the windows typed, the cycle shown (the caller re-reads it at the save)
  function choiceOf(st) {
    return K().copy({ who: st.who, truck: st.truck, trailer: st.trailer, driver: st.driver, partner: st.partner, rateTxt: st.rateTxt, win: st.win, opt: st.opt, sugg: st.sugg });
  }

  // ═══ public ═══
  // the form for an assignment (src = {group} | {pieces}) or for a cycle's vehicle (src = null, ctx.rtId)
  function open(src, ctx) {
    if (!_live()) return null;
    const st = build(src, ctx);
    if (st.err) { WN5Act.strip(K().boardHost(), st.err); return null; }
    return PlanIds.load().then((ids) => {
      const d = _form(st, ctx || {});
      if (!ids.ok) { WN5Act.strip(d.msg, ids.err || K().clientErr('ids_missing', 'Οι κατάλογοι δεν φορτώθηκαν — κλείσε και ξανάνοιξε')); K().lock(d); }
      return d;
    });
  }
  // the Veroia board's «Νέο φορτίο» (Figma 2396:8024): the same form, «Επιλογή» hands the choice back, no write
  function pick(pieces, ctx) {
    if (!_live()) return Promise.resolve(null);
    return new Promise((resolve) => {
      const st = build({ pieces }, Object.assign({}, ctx, { pick: true }));
      if (st.err) { WN5Act.strip(K().boardHost(), st.err); resolve(null); return; }
      PlanIds.load().then((ids) => {
        const d = _form(st, Object.assign({}, ctx, { onPick: resolve, onCancel: () => resolve(null) }));
        if (!ids.ok) { WN5Act.strip(d.msg, ids.err || K().clientErr('ids_missing', 'Οι κατάλογοι δεν φορτώθηκαν — κλείσε και ξανάνοιξε')); K().lock(d); }
      });
    });
  }
  // the request and the line of a choice, for a caller that holds its own pieces (the Veroia board's «Νέο φορτίο»)
  function forChoice(pieces, ctx, choice) {
    const st = build({ pieces }, Object.assign({}, ctx, { pick: true, choice, live: true }));
    if (st.err) return { err: st.err };
    return { req: req(st), line: line(st), problems: problems(st), label: st.who ? _label(st.who === 'own' ? 'tk' : 'pt', st.who === 'own' ? st.truck : st.partner) : '',
      sub: st.who === 'own' ? [_label('tl', st.trailer), _label('dr', st.driver)].filter(Boolean).join(' · ') : '' };
  }

  window.WN5Assign = Object.freeze({ open, pick, forChoice, _build: build, _req: req, _problems: problems, _line: line, _avail: avail, _peak });
})();
