// ═══════════════════════════════════════════════════════════════════════
// WEEKLY NATIONAL v5 — pure logic (global WN5L)
// ─────────────────────────────────────────────────────────────────────
// Plan: docs/superpowers/plans/2026-10-26-f4a-national-v5-screens.md, Task T4. Input: the JSON of GET /plan/board
// (worker/migrations/072_plan_functions.sql plan_board); the fixture tests/fixtures/wn5-week.json is held to that
// SQL by tests/wn5-logic.test.js, so a new key of the board cannot be missed here.
//
// Plain functions on plain objects: no DOM, no WNATL, no Date.now() — «today» is an argument — so the board, the
// queue and the Veroia line read ONE rule each and node --test proves them without a browser. The same file loads
// as a browser global and as a node module. At load it only defines WN5L (tests/wn5-contract.test.js).
//
// What this file does NOT decide (principle 3, spec §3 Board): whether something is executed, dimmed or late. Those
// come from the base (v_rt_stop_state.dim / side_dim / cycle_dim / has_late / has_vehicle, v_piece_state.overdue)
// and are copied as they are. What is computed here is display only: the day a row sits under, the numbering of
// cycles and points, sums of pallets, the Athens hh:mm of an instant.
// ═══════════════════════════════════════════════════════════════════════
(function () {
'use strict';

const freeze = Object.freeze;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CAP = 33;   // pallets of one trailer — the same number as the base's over_33 warning (Ε-17); display only
// Upper case is TYPED (the tonos trap of CSS text-transform).
const DOW_HEAD = freeze(['ΚΥΡΙΑΚΗ', 'ΔΕΥΤΕΡΑ', 'ΤΡΙΤΗ', 'ΤΕΤΑΡΤΗ', 'ΠΕΜΠΤΗ', 'ΠΑΡΑΣΚΕΥΗ', 'ΣΑΒΒΑΤΟ']);
const LISTS = freeze(['cycles', 'waiting', 'hub', 'notices']);
const ATH_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit' });
const ATH_TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

class ShapeError extends Error {
  constructor(what) { super('plan_board shape: ' + what); this.name = 'ShapeError'; this.what = what; }
}

const r1 = (x) => Math.round(Number(x || 0) * 10) / 10;   // pallets: one decimal at most (numeric(6,1))
const _sum = (items) => r1(items.reduce((n, x) => n + Number(x.pallets || 0), 0));
const _ms = (iso) => { const t = new Date(iso).getTime(); return Number.isNaN(t) ? Infinity : t; };
function athensDay(iso) { if (!iso) return null; const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : ATH_DAY.format(d); }
function athensTime(iso) { if (!iso) return null; const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : ATH_TIME.format(d); }
// F1 (owner 28/10): a point entered without a window is stored as its whole Athens day, 00:00–23:59 (the order form's
// default, as the Δ1 default of #160): the schema keeps a window on every national point and the base invents no hour.
// ONE reader rule for every screen (principle 3): the same Athens day, 00:00 to 23:59 = «όλη η ημέρα», never an hour
// someone agreed. A window over two days is never «όλη η ημέρα».
const DAY_WIN = freeze({ from: '00:00', to: '23:59' });
function allDay(fromIso, toIso) {
  const a = athensDay(fromIso);
  return !!a && a === athensDay(toIso) && athensTime(fromIso) === DAY_WIN.from && athensTime(toIso) === DAY_WIN.to;
}
function _addDays(day, n) { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); }
function _dowOf(day) { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
// The board's day words come from ONE place, WI4.dayLabel (core/wi4-logic.js): «Τρί 13/10».
function _wi4() {
  if (typeof WI4 !== 'undefined') return WI4;
  if (typeof require === 'function') { try { return require('./wi4-logic.js'); } catch (_) { return null; } }
  return null;
}
const _dow = (day) => { const lg = _wi4(); return lg && day ? lg.dayLabel(day).split(' ')[0] : day || ''; };
const _rate = (x) => Number(x).toLocaleString('el-GR', { maximumFractionDigits: 2 });
const _idOrNull = (x) => (x === null || x === undefined || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));
// The distinct temperatures of a point's loads (°C, ascending): what the driver keeps the trailer at. Unknown = none
// (an empty list), never 0 — a missing temperature is not «0 °C» (trap 2 of CLAUDE.md).
const _temps = (items) => [...new Set((items || []).map((x) => x && x.temperature_c)
  .filter((t) => t !== null && t !== undefined && t !== '' && Number.isFinite(Number(t))).map(Number))].sort((a, b) => a - b);

// The Veroia hub has no flag on the board's stops (072 plan_board sends location_id only). Its id is read from the
// one fact the base guarantees about a VS (072 leg_place, «από την αφετηρία του, μέσω Βέροιας»): a vs_import starts
// at the hub, a vs_export ends there. A hub[] item IS at the hub (071 at_hub); it names its destination
// (nat_to_location_id, 074a) but not where it stands, so it says nothing about the hub's id. No VS in the week → null (opts.hubId from PlanIds.hub() when the catalogue exists, Ε-27); model()
// then puts HUB_UNKNOWN on the board, never a silent ordinary «ΒΕΡΟΙΑ» stop (Ε-44).
function hubFromBoard(board, errors) {
  const seen = new Set();
  for (const w of (board && board.waiting) || []) {
    if (w.kind === 'vs_import' && w.nat_from_location_id != null) seen.add(Number(w.nat_from_location_id));
    if (w.kind === 'vs_export' && w.nat_to_location_id != null) seen.add(Number(w.nat_to_location_id));
  }
  for (const c of (board && board.cycles) || []) for (const s of c.stops || []) for (const l of s.legs || []) {
    if ((l.kind === 'vs_import' && l.act === 'load') || (l.kind === 'vs_export' && l.act === 'unload')) seen.add(Number(s.location_id));
  }
  if (seen.size > 1 && errors) errors.push('Δεν βρέθηκε ένας μόνο κόμβος Βέροιας στα δεδομένα (θέσεις ' + [...seen].join(', ') + ')');
  return seen.size === 1 ? [...seen][0] : null;
}

// 072 boards carry no `segments` key: one segment from the cycle's own vehicle, drawn exactly as today (R-59).
// With 072b the key is a non-empty list; present but not that is a shape the screen cannot draw (OPEN-9).
function segmentsOf(cycle) {
  if (!cycle || typeof cycle !== 'object') throw new ShapeError('cycle');
  if (!Object.prototype.hasOwnProperty.call(cycle, 'segments')) {
    const stops = Array.isArray(cycle.stops) ? cycle.stops : [];
    // has_vehicle is the base's (v_rt_stop_state); only a cycle without stops falls back to that view's own CASE.
    const has = stops.length ? stops[0].has_vehicle === true : cycle.trip_type === 'PARTNER' ? cycle.partner_id != null : cycle.truck_id != null;
    return { source: 'cycle', segments: [{ segment_id: null, label: null, trip_type: cycle.trip_type, truck_id: cycle.truck_id, truck: cycle.truck,
      trailer_id: cycle.trailer_id, trailer: cycle.trailer, driver_id: cycle.driver_id, driver: cycle.driver, partner_id: cycle.partner_id,
      partner: cycle.partner, partner_rate: cycle.partner_rate, has_vehicle: has, stop_ids: null }] };
  }
  if (!Array.isArray(cycle.segments) || !cycle.segments.length) throw new ShapeError(`cycles[${cycle.rt_id}].segments`);
  return { source: 'segments', segments: cycle.segments };
}

// Owned cycles of one truck in the week, by start: «κύκλος 1» alone, «1/2», «2/2» (owner 22/10). Partners: none.
function cycleNumbers(cycles) {
  const by = new Map();
  for (const c of cycles || []) {
    if (c.trip_type === 'PARTNER' || c.truck_id == null) continue;
    if (!by.has(c.truck_id)) by.set(c.truck_id, []);
    by.get(c.truck_id).push(c);
  }
  const out = new Map();
  for (const list of by.values()) {
    list.sort((a, b) => _ms(a.start_at) - _ms(b.start_at) || a.rt_id - b.rt_id);
    list.forEach((c, i) => out.set(c.rt_id, { n: i + 1, m: list.length }));
  }
  return out;
}

// x/33 of one side: the pallets its stops load (raw board stops of that side).
function capacity(sideStops) {
  const pallets = _sum((sideStops || []).flatMap((s) => (s.legs || []).filter((l) => l.act === 'load')));
  return { pallets, over: pallets > CAP ? r1(pallets - CAP) : 0 };
}

// «μπαίνει kη»: the place a new stop would take by its planned_from (display only — the base orders the stops).
function stopRank(stops, plannedFrom) {
  const at = _ms(plannedFrom);
  return 1 + (stops || []).filter((s) => _ms(s.planned_from) < at).length;
}

function searchParts(row) {
  return (row && Array.isArray(row._parts) ? row._parts : []).filter((x) => x != null && String(x).trim() !== '').map(String);
}

function _legs(s, act) { return (s.legs || []).filter((l) => l.act === act); }
function _point(s, pallets, legs) {
  // locId: the screen names the place's city from the catalogue (owner 28/10: place + city, as the Weekly International)
  return { stopId: s.stop_id, n: 0, name: s.location || '—', city: null, locId: s.location_id == null ? null : Number(s.location_id),
    clients: [...new Set((s.legs || []).map((l) => l.client).filter(Boolean))], temps: _temps(legs),
    from: athensTime(s.planned_from), to: athensTime(s.planned_to), allDay: allDay(s.planned_from, s.planned_to), pallets,
    dim: s.dim === true, late: s.has_late === true, segmentId: null, segLabel: null, day: s.stop_day || athensDay(s.planned_to) };
}
// One side of a cycle. KATHODOS: the hub stop is the Veroia loading (its window shows under «Βέροια», on the side,
// never on the vehicle tile: owner 25/10); ANODOS: the last hub stop closes the cycle («Βέροια · τέλος κύκλου»).
function _side(name, list, hubId) {
  const isHub = (s) => hubId != null && Number(s.location_id) === hubId;
  const hubIdx = list.map((s, i) => (isHub(s) ? i : -1)).filter((i) => i >= 0);
  const vIdx = name === 'KATHODOS' && hubIdx.length ? hubIdx[0] : -1;
  const eIdx = name === 'ANODOS' && hubIdx.length ? hubIdx[hubIdx.length - 1] : -1;
  const from = [], to = [];
  let vBefore = 0;   // loadings the cycle makes BEFORE its Veroia loading (list is in seq order): drawn first (Figma H1 row 5)
  list.forEach((s, i) => {
    if (i === vIdx || i === eIdx) return;
    const loads = _legs(s, 'load'), unloads = _legs(s, 'unload');
    const isFrom = loads.length && !unloads.length ? true : unloads.length ? false : name === 'ANODOS';
    if (isFrom && vIdx >= 0 && i < vIdx) vBefore++;
    (isFrom ? from : to).push(_point(s, isFrom ? _sum(loads) : _sum(unloads), isFrom ? loads : unloads));
  });
  from.forEach((p, i) => { p.n = i + 1; });
  to.forEach((p, i) => { p.n = i + 1; });
  const v = vIdx >= 0 ? list[vIdx] : null;
  const dayStop = v || list[0];
  const pallets = _sum(list.flatMap((s) => _legs(s, 'load')));
  return {
    side: {
      side: name, day: dayStop.stop_day || null, toDay: name === 'KATHODOS' && to.length ? to[to.length - 1].day : null,
      veroia: v ? { stopId: v.stop_id, from: athensTime(v.planned_from), to: athensTime(v.planned_to), allDay: allDay(v.planned_from, v.planned_to) } : null, vBefore,
      headDim: dayStop.dim === true, from, to, pallets, over: pallets > CAP ? r1(pallets - CAP) : 0,
      sideDim: list[0].side_dim === true, gap: null,
    },
    endStop: eIdx >= 0 ? list[eIdx] : null,
  };
}
function _gapSide(c, kath) {
  let text = 'Κενό γύρισμα';
  if (c.trip_type === 'PARTNER') text = 'Μόνο κάθοδος · συνεργάτης';
  else if (kath && kath.to.length) {
    const last = kath.to[kath.to.length - 1];
    text = `Κενό γύρισμα · ελεύθερο από ${_dow(last.day)} ${last.to} · ${last.name}`;
  }
  return { side: 'ANODOS', day: null, toDay: null, veroia: null, vBefore: 0, headDim: false, from: [], to: [], pallets: 0, over: 0, sideDim: false, gap: { text } };
}
function _tile(s, no, multi) {
  const type = s.has_vehicle !== true ? 'un' : s.trip_type === 'PARTNER' ? 'par' : 'own';
  const t = { type, label: s.label || null, line1: '', line2: '', segmentId: s.segment_id == null ? null : s.segment_id,
    partnerRate: type === 'par' && s.partner_rate != null ? Number(s.partner_rate) : null, missing: false };
  if (type === 'un') { t.line1 = 'ΠΡΟΣ ΑΝΑΘΕΣΗ'; return t; }
  if (type === 'par') {
    t.line1 = s.partner || '—';
    if (multi) {
      // H3 segment tile (Ε-13): the rate of THIS partner segment. Decision 41: for every role; an empty one is an
      // open item, never 0 (S-44).
      t.missing = t.partnerRate == null;
      t.line2 = t.missing ? 'κόμιστρο λείπει' : `${_rate(t.partnerRate)} €`;
    } else {
      // A one-segment cycle stays exactly as F0 7745 / H1 (R-59, Σ5): line 2 is the partner's plate. The 072 board
      // carries none (Ε-35) → «—», never the rate in its place (Ε-36). The rate stays data (partnerRate, rates):
      // Δ1, the move list and the cycle card show it.
      t.line2 = '—';
    }
    return t;
  }
  if (multi) { t.line1 = s.truck || '—'; t.line2 = s.driver || 'χωρίς οδηγό'; return t; }   // Σ5: no trailer, no «κύκλος n/m»
  t.line1 = [s.truck, s.trailer].filter(Boolean).join(' · ') || '—';
  t.line2 = [s.driver || 'χωρίς οδηγό', no ? (no.m > 1 ? `κύκλος ${no.n}/${no.m}` : 'κύκλος 1') : null].filter(Boolean).join(' · ');
  return t;
}
function _cycleRow(c, hubId, nums, errors) {
  if (!Array.isArray(c.stops)) throw new ShapeError(`cycles[${c.rt_id}].stops`);
  const name = c.code || 'RT ' + c.rt_id;
  const stops = c.stops.slice().sort((a, b) => a.seq - b.seq);
  if (!stops.length) errors.push(`${name}: κύκλος χωρίς στάσεις`);
  const by = { KATHODOS: [], ANODOS: [] };
  for (const s of stops) {
    if (!by[s.side]) { errors.push(`${name}: η στάση ${s.stop_id} έχει άγνωστη πλευρά «${s.side}» — δεν σχεδιάστηκε`); continue; }
    by[s.side].push(s);
  }
  const K = by.KATHODOS.length ? _side('KATHODOS', by.KATHODOS, hubId) : null;
  const A = by.ANODOS.length ? _side('ANODOS', by.ANODOS, hubId) : null;
  const kath = K ? K.side : null;
  const anod = A ? A.side : _gapSide(c, kath);
  const no = nums.get(c.rt_id) || null;
  const seg = segmentsOf(c);
  const tiles = seg.segments.map((s) => _tile(s, no, seg.source === 'segments' && seg.segments.length > 1));
  const pts = [...(kath ? kath.from.concat(kath.to) : []), ...anod.from, ...anod.to];
  // H-9 (072b): each point's segment from stop_ids alone; the Veroia loading head and the cycle end are stops too
  // (Figma H1 2120:8921 draws the segment line under «Βέροια · τέλος κύκλου» as well).
  const segs = stopSegments(c);
  const segOf = (id) => (segs.has(id) ? segs.get(id) : null);
  for (const p of pts) { const g = segOf(p.stopId); p.segmentId = g ? g.segmentId : null; p.segLabel = g ? g.label : null; }
  // Only when the stop has a segment: a one-segment cycle keeps exactly today's veroia / end objects (R-59).
  if (kath && kath.veroia && segOf(kath.veroia.stopId)) kath.veroia.segLabel = segOf(kath.veroia.stopId).label;
  const local = stops.filter((s) => s.local_loading).map((s) => {
    const p = pts.find((x) => x.stopId === s.stop_id);
    // T17 attaches a local loading to a pickup outside Veroia (Figma 2011:8305): the line names what is picked up
    // there («<client>, <place> → Βέροια · 10π») and the delivery it is FOR — the stop where the same leg unloads,
    // with that leg's client and the stop's number on the board. Printing the pickup's own place after «για» would
    // say the goods are for the pickup. A stop with no load legs (a delivery) keeps the T5 «για <place> (στάση n)».
    const loads = hubId != null && Number(s.location_id) === hubId ? [] : _legs(s, 'load');
    const pickup = loads.length ? { who: [...new Set(loads.map((l) => l.client).filter(Boolean))].join(', ') || null,
      place: s.location || '—', pallets: _sum(loads) } : null;
    const forStops = [];
    for (const l of loads) {
      const t = stops.find((x) => x !== s && (x.legs || []).some((u) => u.act === 'unload' && u.leg_id === l.leg_id));
      const tp = t ? pts.find((x) => x.stopId === t.stop_id) : null;
      if (!tp) continue;   // unloaded at Veroia or off this cycle: no delivery of this cycle to name
      const unl = t.legs.find((u) => u.act === 'unload' && u.leg_id === l.leg_id);
      const name = (unl && unl.client) || tp.name;
      let f = forStops.find((x) => x.stopId === t.stop_id);
      if (!f) forStops.push(f = { stopId: t.stop_id, names: [], n: tp.n });
      if (!f.names.includes(name)) f.names.push(name);
    }
    return { stopId: s.stop_id, local_move_id: s.local_loading.local_move_id, driver: s.local_loading.driver || null,
      move_date: s.local_loading.move_date || null, time_from: s.local_loading.time_from || null, time_to: s.local_loading.time_to || null,
      dim: s.dim === true, stopName: s.location || null, stopN: p ? p.n : null,
      pickup, forStops: forStops.map((f) => ({ stopId: f.stopId, name: f.names.join(', '), n: f.n })) };
  });
  const legs = stops.flatMap((s) => s.legs || []);
  const clients = [...new Set(legs.map((l) => l.client).filter(Boolean))];
  const refs = [...new Set([c.code, ...legs.map((l) => l.reference)].filter(Boolean))];
  const places = [...new Set(stops.map((s) => s.location).filter(Boolean))];
  const sortStop = (kath && kath.veroia && by.KATHODOS.find((s) => s.stop_id === kath.veroia.stopId)) || by.KATHODOS[0] || by.ANODOS[0] || null;
  return {
    key: 'rt:' + c.rt_id, rtId: c.rt_id, kind: 'cycle', dayKey: kath ? kath.day : anod.day,
    kath, anod, tiles, segSource: seg.source, cycleNo: no,
    end: A && A.endStop ? { place: 'Βέροια', by: A.endStop.planned_to, stopId: A.endStop.stop_id, dim: A.endStop.dim === true,
      ...(segOf(A.endStop.stop_id) ? { segLabel: segOf(A.endStop.stop_id).label } : {}) } : null,
    local, handovers: handoversOf(c),
    late: stops.some((s) => s.has_late === true),
    rail: tiles.some((t) => t.type === 'un') ? 'red' : null,
    rowDim: stops.length > 0 && stops[0].cycle_dim === true,
    rates: { partner_rate: c.partner_rate == null ? null : Number(c.partner_rate), missing: c.trip_type === 'PARTNER' && c.partner_rate == null },
    pieceIds: [...new Set(legs.map((l) => l.piece_id))], group: null, vs: false, clients, refs,
    sortAt: sortStop ? sortStop.planned_from : c.start_at,
    _parts: [c.truck, c.trailer, c.driver, c.partner, ...clients, ...places, ...refs],
  };
}
// A hub[] item no truck has taken (live 072: an import VS without a national truck, a national that loads at
// Veroia): not stock, not unloaded here by a cycle (inbound_rt_id), not sent to be split (for_split, Ε-41 — a key
// 072 does not have yet). It is a «ΠΡΟΣ ΑΝΑΘΕΣΗ» row, never «για μοίρασμα» (owner 19/10: «VS μπαίνει ως σειρά
// ΠΡΟΣ ΑΝΑΘΕΣΗ», «απόθεμα μόνο στον Πίνακα Βέροιας»).
const _neverAssigned = (h) => h.is_stock !== true && h.inbound_rt_id == null && h.for_split !== true;
// The visible line of a week whose hub id is unknown (Ε-27, Ε-44): no PlanIds.hub() (GET /plan/lookups not live)
// and no VS leg to read it from. A cycle then cannot name its Veroia stop: its window would vanish from under
// «Βέροια» and Veroia would read as an ordinary point. Said on the board, never in silence (principle 1).
const HUB_UNKNOWN = 'Η Βέροια δεν αναγνωρίστηκε σε αυτή την εβδομάδα — οι ώρες φόρτωσης Βέροιας δεν φαίνονται και η Βέροια δείχνεται ως απλή στάση';
// The day a load waits under: its loading window, else the base's nat_ready_day. A hub[] item has no load_from
// (Ε-26) and its nat_ready_day comes from orders.cross_dock_date, which can be empty: then the owner's rule for an
// import VS (23/8, «import = Delivery Date − 1»), the day before nat_due_day; else nat_due_day. Never the week's
// Saturday by default.
function _loadDay(w) {
  const d = athensDay(w.load_from) || w.nat_ready_day || null;
  if (d || !DAY_RE.test(String(w.nat_due_day || ''))) return d;
  const h = w.kind === 'vs_import' ? vsHubDay(w) : null;
  return h ? h.day : w.nat_due_day;
}
// A VS's Veroia day = its cross_dock_date, which 071 v_shipments maps to nat_ready_day of an import and nat_due_day of
// an export. Empty: the owner's rule (23/8: import = Delivery Date − 1, export = Loading Date + 1), est = true so the
// screen names it «εκτίμηση». ONE rule for the board (_loadDay) and the assignment windows (wn5_actions _needs, F27);
// null for a national or stock (their nat_ready_day is a supplier's / a parent's day, no Veroia day) or no day at all.
function vsHubDay(w) {
  const imp = w && w.kind === 'vs_import';
  if (!w || w.is_stock || (!imp && w.kind !== 'vs_export')) return null;
  const d = imp ? w.nat_ready_day : w.nat_due_day;
  if (DAY_RE.test(String(d || ''))) return { day: d, est: false };
  const b = imp ? w.nat_due_day : w.nat_ready_day;
  return DAY_RE.test(String(b || '')) ? { day: _addDays(b, imp ? -1 : 1), est: true } : null;
}
// The side a waiting piece goes on — ONE rule for the board's row and the assignment window (wn5_actions _sideFor):
// standing at the hub = ΚΑΘΟΔΟΣ; towards the hub (a vs_export, or nat_to = hub) = ΑΝΟΔΟΣ; neither end the hub = the
// order's own direction (075: plan_board's waiting[].direction, from the form's «Κατεύθυνση»; 072 never stored it),
// and with no direction (before 075, or never chosen) ΚΑΘΟΔΟΣ as before.
function waitSide(w, hubId) {
  if (!w) return 'KATHODOS';
  const hub = hubId != null ? Number(hubId) : null;
  if (w._atHub === true || w.at_hub === true || (hub != null && Number(w.nat_from_location_id) === hub)) return 'KATHODOS';
  if (w.kind === 'vs_export' || (hub != null && w.nat_to_location_id != null && Number(w.nat_to_location_id) === hub)) return 'ANODOS';
  return w.direction === 'ANODOS' || w.direction === 'KATHODOS' ? w.direction : 'KATHODOS';
}
// A load without a vehicle is a «ΠΡΟΣ ΑΝΑΘΕΣΗ» row of its order (all its pieces: a VS with two deliveries is one
// row with two points, Figma 2011:7745 VS-118) — one row because the base assigns the order whole (072
// plan_put_group: «a group is its waiting pieces, whole»). Its side: towards the hub = ΑΝΟΔΟΣ, else ΚΑΘΟΔΟΣ.
function _waitRow(list, hubId, errors, nameOf) {
  const ws = list.slice().sort((a, b) => a.piece_id - b.piece_id);
  const w0 = ws[0];
  // _atHub: the piece came in hub[] — at Veroia by the base rule (071 at_hub), whatever id the board names
  const atHub = (w) => w._atHub === true || (hubId != null && Number(w.nat_from_location_id) === hubId);
  // Decided over ALL the pieces, never by the lowest one: a groupage may load at Veroia AND elsewhere (Ε-19 N×1),
  // and then the row has the «Βέροια» head and one loading point per other place.
  const hubWs = ws.filter(atHub), outWs = ws.filter((w) => !atHub(w));
  const anodos = !hubWs.length && waitSide(w0, hubId) === 'ANODOS';
  // Each piece is a point at ITS place (074a: every waiting / hub item names nat_from / nat_to): the loading place of an
  // ΑΝΟΔΟΣ, the delivery place of a ΚΑΘΟΔΟΣ, with the client before it («ΠΕΛΑΤΗΣ · τόπος», Figma H1). A place the
  // catalogue cannot name is «—» and a line of the board's error strip (nameOf), never the client in its place.
  const pts = ws.map((w, i) => ({ stopId: null, n: i + 1, name: nameOf(anodos ? w.nat_from_location_id : w.nat_to_location_id), city: null,
    locId: _idOrNull(anodos ? w.nat_from_location_id : w.nat_to_location_id),
    clients: w.client ? [w.client] : [], temps: _temps([w]),
    from: athensTime(anodos ? w.load_from : w.deliver_from), to: athensTime(anodos ? w.load_to : w.deliver_to),
    allDay: anodos ? allDay(w.load_from, w.load_to) : allDay(w.deliver_from, w.deliver_to), pallets: r1(w.pallets),
    dim: false, late: w.overdue === true, segmentId: null, segLabel: null, day: athensDay(anodos ? w.load_from : w.deliver_from) }));
  const pallets = _sum(ws);
  const loadDay = ws.map(_loadDay).filter(Boolean).sort()[0] || null;
  // A ΚΑΘΟΔΟΣ load that starts outside the hub: one loading point per place (nat_from), named by the catalogue.
  const byFrom = new Map();
  for (const w of anodos ? [] : outWs) {
    const k = String(w.nat_from_location_id);
    if (!byFrom.has(k)) byFrom.set(k, []);
    byFrom.get(k).push(w);
  }
  const origin = [...byFrom.values()].map((g, i) => ({ stopId: null, n: i + 1, name: nameOf(g[0].nat_from_location_id), city: null, locId: _idOrNull(g[0].nat_from_location_id), clients: [], temps: _temps(g),
    from: athensTime(g[0].load_from), to: athensTime(g[0].load_to), allDay: allDay(g[0].load_from, g[0].load_to),
    pallets: _sum(g), dim: false, late: false, segmentId: null, segLabel: null, day: _loadDay(g[0]) }));
  // ΠΡΟΣ of an ΑΝΟΔΟΣ: where the loads go (nat_to), one point per place — «Βέροια» for the hub (a vs_export), never
  // an empty cell for a destination the board knows.
  const byTo = new Map();
  for (const w of anodos ? ws : []) {
    const k = String(w.nat_to_location_id);
    if (!byTo.has(k)) byTo.set(k, []);
    byTo.get(k).push(w);
  }
  // hub: the ΑΝΟΔΟΣ ends at Veroia (the screen draws it as a cycle's end, Figma audit B-12) and due is the base's day
  // for it (the earliest nat_due_day of the group), never an hour
  const dest = [...byTo.values()].map((g, i) => ({ stopId: null, n: i + 1, name: nameOf(g[0].nat_to_location_id), city: null, locId: _idOrNull(g[0].nat_to_location_id), clients: [], temps: [],
    from: athensTime(g[0].deliver_from), to: athensTime(g[0].deliver_to), allDay: allDay(g[0].deliver_from, g[0].deliver_to), pallets: _sum(g), dim: false, late: false, segmentId: null, segLabel: null,
    day: athensDay(g[0].deliver_from), toDay: athensDay(g[0].deliver_to), hub: hubId != null && Number(g[0].nat_to_location_id) === hubId,
    due: g.map((w) => w.nat_due_day).filter((d) => DAY_RE.test(String(d || ''))).sort()[0] || null }));
  const side = { side: anodos ? 'ANODOS' : 'KATHODOS', day: loadDay, toDay: anodos || !pts.length ? null : pts[pts.length - 1].day,
    veroia: !anodos && hubWs.length ? { stopId: null, from: athensTime(hubWs[0].load_from), to: athensTime(hubWs[0].load_to), allDay: allDay(hubWs[0].load_from, hubWs[0].load_to) } : null, vBefore: 0,
    headDim: false, from: anodos ? pts : origin, to: anodos ? dest : pts, pallets, over: pallets > CAP ? r1(pallets - CAP) : 0, sideDim: false, gap: null };
  const refs = [...new Set(ws.map((w) => w.reference).filter(Boolean))];
  const clients = [...new Set(ws.map((w) => w.client).filter(Boolean))];
  // Day L (F5 FE-2, owner 28/10): no more «… δεν ήρθαν (Worker)» line under ΠΡΟΣ ΑΝΑΘΕΣΗ. 074a sends the window
  // keys for every hub[] item (Ε-26), so an ABSENT key is a broken board, said once per row in the error strip
  // (model.errors), never a waiting line; a key present with null (a stop without a window) shows «—».
  const wk = anodos ? 'load_from' : 'deliver_from';
  if (ws.some((w) => !Object.prototype.hasOwnProperty.call(w, wk))) errors.push(`${refs[0] || 'κομμάτι ' + w0.piece_id}: ο πίνακας ήρθε χωρίς «${wk}» — τα παράθυρα δείχνουν «—»`);
  return {
    key: 'wait:' + w0.piece_id, rtId: null, kind: 'unassigned', dayKey: loadDay,
    kath: anodos ? null : side, anod: anodos ? side : null,
    tiles: [{ type: 'un', label: null, line1: 'ΠΡΟΣ ΑΝΑΘΕΣΗ', line2: '', segmentId: null, partnerRate: null }],
    segSource: 'cycle', cycleNo: null, end: null, local: [], handovers: [],
    late: ws.some((w) => w.overdue === true), rail: 'red', rowDim: false, rates: { partner_rate: null, missing: false },
    pieceIds: ws.map((w) => w.piece_id),
    group: w0.order_id != null ? { order_id: w0.order_id } : w0.nat_order_id != null ? { nat_order_id: w0.nat_order_id } : null,
    vs: String(w0.kind || '').startsWith('vs_'), clients, refs, sortAt: w0.load_from, _parts: [...clients, ...refs],
  };
}

function model(board, opts) {
  const o = opts || {};
  if (!board || typeof board !== 'object' || Array.isArray(board)) throw new ShapeError('board');
  if (!DAY_RE.test(String(board.week || ''))) throw new ShapeError('week');
  for (const k of LISTS) if (!Array.isArray(board[k])) throw new ShapeError(k);
  const errors = [];
  const week = board.week, last = _addDays(week, 6);
  const today = DAY_RE.test(String(o.today || '')) ? o.today : null;
  const hubId = o.hubId != null ? Number(o.hubId) : hubFromBoard(board, errors);
  // hubFromBoard already wrote a line when the facts disagree (two hubs); a week with cycles, or with a waiting
  // national (its ΑΝΟΔΟΣ/ΚΑΘΟΔΟΣ side depends on whether it ends at Veroia), and no id at all gets its own (Ε-44).
  // A week with neither has nothing to place.
  const needsHub = board.cycles.length > 0 || board.waiting.some((w) => w && w.kind === 'national');
  if (hubId == null && needsHub && !errors.length) errors.push(HUB_UNKNOWN);
  // The place names of the waiting / hub rows (the board has ids only): opts.place(id) → {name} from the catalogue
  // (PlanIds.place, GET /plan/lookups). Without a catalogue every such place is «—» and the screen says why (its own
  // strip); with one, an id it does not hold is one error line per id — never a silent «—».
  const place = typeof o.place === 'function' ? o.place : null;
  const unnamed = new Set();
  const nameOf = (id) => {
    if (id === null || id === undefined || id === '') return '—';
    if (hubId != null && Number(id) === hubId) return 'Βέροια';
    if (!place) return '—';
    const p = place(Number(id));
    if (p && p.name) return String(p.name);
    if (!unnamed.has(String(id))) { unnamed.add(String(id)); errors.push(`τόπος #${id} δεν υπάρχει στον κατάλογο τόπων — δείχνεται «—»`); }
    return '—';
  };
  const nums = cycleNumbers(board.cycles);
  const rows = board.cycles.map((c) => _cycleRow(c, hubId, nums, errors));
  const groups = new Map();
  const add = (w, atHub) => {
    const gk = w.order_id != null ? 'o' + w.order_id : w.nat_order_id != null ? 'n' + w.nat_order_id : 'p' + w.piece_id;
    if (!groups.has(gk)) groups.set(gk, []);
    groups.get(gk).push(atHub ? Object.assign({ _atHub: true }, w) : w);
  };
  // The rows come from BOTH lists: 072 puts every piece standing at Veroia in hub[] (072:2443 «not ps.at_hub»),
  // so an import VS without a national truck is never in waiting[] (fixture note, Interfaces).
  for (const w of board.waiting) if (w.is_stock !== true) add(w, false);   // stock lives only in the Veroia board (owner rule 5, 19/10)
  for (const h of board.hub) if (_neverAssigned(h)) add(h, true);
  for (const list of groups.values()) rows.push(_waitRow(list, hubId, errors, nameOf));
  // Days by the Veroia loading day of ΚΑΘΟΔΟΣ (else the ΑΝΟΔΟΣ day); inside a day the cycles first, by that time,
  // then the loads waiting for a vehicle (Figma 2011:7745 row order).
  rows.sort((a, b) => String(a.dayKey || '').localeCompare(String(b.dayKey || ''))
    || (a.kind === b.kind ? 0 : a.kind === 'cycle' ? -1 : 1)
    || ((_ms(a.sortAt) - _ms(b.sortAt)) || 0)
    || String(a.key).localeCompare(String(b.key)));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = _addDays(week, i);
    days.push({ date, head: `${DOW_HEAD[_dowOf(date)]} ${Number(date.slice(8))}/${Number(date.slice(5, 7))}`, rows: [], empty: true });
  }
  // A cycle that started the week before (or ends after it) sits on the first (last) day, never dropped.
  for (const r of rows) {
    const k = !r.dayKey || r.dayKey < week ? week : r.dayKey > last ? last : r.dayKey;
    days.find((d) => d.date === k).rows.push(r);
  }
  for (const d of days) d.empty = d.rows.length === 0;
  // ΕΠΟΜΕΝΑ: every VS still without a truck. 'late' = the base's overdue of such a VS (v_piece_state.overdue); a
  // VS already on a cycle that delivers after its day is that row's amber rail (has_late), never a card.
  const queue = rows.filter((r) => r.kind === 'unassigned' && r.vs).map((r) => ({
    pieceId: r.pieceIds[0],
    orderId: r.group && r.group.order_id != null ? r.group.order_id : null,
    natOrderId: r.group && r.group.nat_order_id != null ? r.group.nat_order_id : null,
    code: r.refs[0] || '', title: `${r.refs[0] || '—'} → ${r.clients.join(' · ') || '—'}`, day: r.dayKey, pieces: r.pieceIds.length,
    pallets: (r.kath || r.anod).pallets, late: r.late, reason: r.late ? 'late' : 'no_truck',
  }));
  const item = (h) => ({ pieceId: h.piece_id, client: h.client || null, place: null, pallets: r1(h.pallets), leave_by: h.leave_by || null,
    overdue: h.overdue === true, nat_due_day: h.nat_due_day || null, kind: h.kind, reference: h.reference || null });
  // «ΓΙΑ ΜΟΙΡΑΣΜΑ» = unloaded at Veroia by a cycle (inbound_rt_id), sent there to be split (for_split, Ε-41), or a VS
  // import standing at Veroia with no national truck yet (owner 28/10, B1: the international truck unloads it there,
  // so it is split and loaded from the Veroia board) — it ALSO stays a «ΠΡΟΣ ΑΝΑΘΕΣΗ» row, for assigning the order whole.
  const split = board.hub.filter((h) => h.is_stock !== true && (!_neverAssigned(h) || h.kind === 'vs_import')).map(item);
  const stock = board.hub.filter((h) => h.is_stock === true).map(item);
  return {
    week, today, hubId, days, queue,
    hub: { day: today && today >= week && today <= last ? today : week, split, stock, pallets: { split: _sum(split), stock: _sum(stock) }, empty: !split.length && !stock.length },
    notices: board.notices.map((n) => ({ id: n.id, kind: n.kind, message: n.message, order_id: n.order_id, nat_order_id: n.nat_order_id, rt_id: n.rt_id, created_at: n.created_at, created_by: n.created_by || null })),
    errors,
  };
}

// H-9 (072b): a stop's segment is the one whose stop_ids hold it (plan_h_seg_of_stop, the segment of its
// arrival) — never a time computation of the screen. One segment = no label at all (R-59: exactly today).
function stopSegments(cycle) {
  const out = new Map();
  const { source, segments } = segmentsOf(cycle);
  if (source !== 'segments' || segments.length < 2) return out;
  for (const g of segments) for (const id of g.stop_ids || []) out.set(id, { segmentId: g.segment_id, label: g.label || null });
  return out;
}
// The handover points of a cycle: for every segment after the first, the last stop executed before it and the
// first one after it (a middle segment with no stop of its own takes the next segment that has one, H3).
function handoversOf(cycle) {
  const { source, segments } = segmentsOf(cycle);
  if (source !== 'segments' || segments.length < 2) return [];
  const seq = new Map((cycle.stops || []).map((s) => [s.stop_id, s.seq]));
  const last = (ids) => ids.reduce((a, b) => (a === null || seq.get(b) > seq.get(a) ? b : a), null);
  const first = (ids) => ids.reduce((a, b) => (a === null || seq.get(b) < seq.get(a) ? b : a), null);
  const out = [];
  for (let i = 1; i < segments.length; i++) {
    let before = null;
    for (let j = i - 1; j >= 0 && before === null; j--) before = last(segments[j].stop_ids || []);
    let after = null;
    for (let j = i; j < segments.length && after === null; j++) after = first(segments[j].stop_ids || []);
    const g = segments[i];
    out.push({ at: g.from_at, place_note: g.place_note, reason: g.reason, segmentId: g.segment_id, label: g.label || null, beforeStopId: before, afterStopId: after });
  }
  return out;
}

const WN5L = freeze({ model, waitSide, vsHubDay, segmentsOf, stopSegments, handoversOf, searchParts, cycleNumbers, capacity, stopRank, hubFromBoard, athensDay, athensTime, allDay, DAY_WIN, CAP, HUB_UNKNOWN, ShapeError });
if (typeof module !== 'undefined') module.exports = WN5L; else window.WN5L = WN5L;
})();
