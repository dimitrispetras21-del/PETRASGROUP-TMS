// ═══════════════════════════════════════════════════════════════════════
// ROUTE DIAGRAM ADAPTERS — what each host already read → RouteDiagram input (global RouteDiagramAdapters)
// ─────────────────────────────────────────────────────────────────────
// One pure function per kind of source, so a host calls one line:
//   RouteDiagram.render(RouteDiagramAdapters.boardCycle(cycle, ctx))          Weekly National v5 (GET /plan/board)
//   RouteDiagram.render(RouteDiagramAdapters.facadeOrder(rec, stops, ctx))    one order (ORDERS + ORDER STOPS facade)
//   RouteDiagram.render(RouteDiagramAdapters.facadeRt(items, ctx))            one RT = its orders, in RT order
//   RouteDiagramAdapters.natLegFromBoard(boards, orderPgId)                   the national leg of a VS order (ctx.natLeg)
// No fetch here: the host passes records it read and small lookups (ctx.locMeta, ctx.countryOf). What each host
// reads, from which endpoint and table: docs/route-diagram/DESIGN.md §4.
//
// The national board rules are NOT copied: the segment of a stop and the handover points come from WN5L
// (core/wn5-logic.js stopSegments / handoversOf), the reason text from WN5Lab.reasonLine — read through the global
// (or ctx.WN5L / ctx.WN5Lab in tests) at call time (principle 3: one rule, one place).
// ═══════════════════════════════════════════════════════════════════════
(function () {
'use strict';

const freeze = Object.freeze;
const ATH_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit' });
const ATH_TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const _ok = (iso) => !!iso && !Number.isNaN(new Date(iso).getTime());
const athensDay = (iso) => (_ok(iso) ? ATH_DAY.format(new Date(iso)) : null);
const athensTime = (iso) => (_ok(iso) ? ATH_TIME.format(new Date(iso)) : null);
const first = (v) => (Array.isArray(v) ? v[0] : v) || null;
const g = (name, ctx) => (ctx && ctx[name]) || (typeof window !== 'undefined' ? window[name] : undefined);

// ── Weekly National v5: one cycle of GET /plan/board (072 plan_board + 072b segments) ──────────────────
// ctx: { today, hubId, countryOf?(location_id) → 'GR' | null (null = known missing), cityOf?(location_id) → text,
//        overlapDays?: ['YYYY-MM-DD'] }
function boardCycle(cycle, ctx) {
  const c = ctx || {};
  const L = g('WN5L', c), Lab = g('WN5Lab', c);
  if (!L) throw new Error('route diagram: WN5L (core/wn5-logic.js) not loaded');
  const stops = (cycle.stops || []).slice().sort((a, b) => a.seq - b.seq);
  const segs = L.stopSegments(cycle);
  const hand = L.handoversOf(cycle);
  const segInfo = L.segmentsOf(cycle);
  const multi = segInfo.source === 'segments' && segInfo.segments.length > 1;
  const segById = new Map(segInfo.segments.map((s) => [s.segment_id, s]));
  const overlap = new Set(c.overlapDays || []);
  const sumPal = (legs) => (legs.some((l) => l.pallets == null) ? null : legs.reduce((n, l) => n + Number(l.pallets), 0));
  const rowOf = (s) => {
    const legs = s.legs || [];
    const day = s.stop_day || athensDay(s.planned_from);
    // the instant of the window, unless it is the whole Athens day (F1: a point with no hour is 00:00–23:59)
    const time = s.planned_from && !L.allDay(s.planned_from, s.planned_to) ? L.athensTime(s.planned_from) : null;
    const sg = segs.get(s.stop_id) || null;
    const seg = sg && sg.label ? sg.label : null;
    const base = { day, time, marked: s.executed === true, overlap: overlap.has(day), seg };
    const isHub = c.hubId != null && Number(s.location_id) === Number(c.hubId);
    // Owner rule 6 draws «Cross-dock · Βέροια (VS)» where VS goods cross; the card RT17 draws a national cycle that
    // only loads at Veroia as an ordinary «Φόρτωση · Βέροια». So the hub is the cross-dock row only with a VS leg.
    if (isHub && legs.some((l) => String(l.kind || '').startsWith('vs_'))) {
      return Object.assign(base, { kind: 'crossdock', name: 'Βέροια', pallets: sumPal(legs) });
    }
    const acts = new Set(legs.map((l) => l.act));
    const act = acts.has('load') && acts.has('unload') ? 'both' : acts.has('load') ? 'load' : 'unload';
    const extra = [];
    // RT17 card: in a cycle of two or more segments each point names the vehicle of its segment
    if (multi && sg) {
      const sd = segById.get(sg.segmentId);
      if (sd) extra.push(sd.trip_type === 'PARTNER' ? (sd.partner || 'συνεργάτης') : [sd.truck, sd.driver].filter(Boolean).join(' · '));
    }
    const cc = typeof c.countryOf === 'function' ? c.countryOf(s.location_id) : undefined;
    const city = typeof c.cityOf === 'function' ? c.cityOf(s.location_id) || undefined : undefined;
    return Object.assign(base, { kind: 'stop', act, name: s.location || '—', city, cc, pallets: sumPal(legs), extra,
      assigned: s.has_vehicle !== false, late: s.has_late === true });
  };
  const SIDES = [['KATHODOS', 'ΚΑΘΟΔΟΣ'], ['ANODOS', 'ΑΝΟΔΟΣ']];
  const sections = SIDES.map(([k, title]) => ({ title, ids: stops.filter((s) => s.side === k).map((s) => s.stop_id) }))
    .filter((x) => x.ids.length)
    .map((x) => ({ title: x.title, ids: x.ids, rows: x.ids.map((id) => rowOf(stops.find((s) => s.stop_id === id))) }));
  // K9: the ⇄ row after the last stop of the segment that ends (WN5L.handoversOf)
  hand.forEach((h, i) => {
    const sec = sections.find((s) => s.ids.includes(h.beforeStopId));
    // handoversOf walks segments[1..]: hand[i] starts segments[i + 1], so the one that ends is segments[i]
    const prev = segInfo.segments[i];
    const reason = Lab && h.reason ? Lab.reasonLine(h.reason).text : null;
    const row = { kind: 'handover', what: 'vehicle', day: athensDay(h.at), time: athensTime(h.at), place: h.place_note || '—',
      from: prev && prev.label, to: h.label, reason: reason && reason !== '—' ? reason : null };
    if (!sec) { (sections[0] || { rows: [] }).rows.push(row); return; }
    const at = sec.ids.indexOf(h.beforeStopId);
    // keep ids aligned with rows: the handover takes a slot no stop id names
    sec.rows.splice(at + 1, 0, row);
    sec.ids.splice(at + 1, 0, null);
  });
  const single = segInfo.segments[0];
  const exKind = cycle.trip_type === 'PARTNER' ? 'partner' : 'own';
  const assigned = single && single.has_vehicle !== false && stops.every((s) => s.has_vehicle !== false);
  return {
    today: c.today,
    empty: 'Δρομολόγιο χωρίς στάσεις.',
    sections: sections.map((s) => ({ title: s.title, rows: s.rows,
      // one segment: the executor bar of the section (2283:9925); two or more: the RT17 card names the vehicle per point
      executor: multi ? null : { desk: 'natl', kind: assigned ? exKind : 'none' } })),
  };
}

// ── One order through the facade (ORDERS + ORDER STOPS, as «Παραγγελίες › Εβδομάδα» and «Παλέτες › Εβδομάδα» read) ─
// rec   : ORDERS record { id, fields: { 'Order No', Direction, 'Veroia Switch', Truck, Partner, Status, 'Pallet Exchange' } }
// stops : ORDER STOPS records { fields: { 'Stop Type', 'Stop Number', DateTime, Location, Pallets, 'Completed At' } }
// ctx   : { today, locMeta(locRecId) → {name, city, cc} | null,
//           natLeg?: { ref: 'NL 158', kind: 'own'|'partner'|'none' }   the national leg of a VS order, if the host read it
//           legs?: [{ rec, stops }]                                     split legs (Δ5) in leg order, if any
//           temp?: '4°', stockOut?: text, stockIn?: text }
function _stopRow(s, ctx) {
  const f = s.fields || {};
  const t = f['Stop Type'];
  const day = athensDay(f.DateTime);
  const m = typeof ctx.locMeta === 'function' ? ctx.locMeta(first(f.Location)) : null;
  const pallets = f.Pallets == null || f.Pallets === '' ? undefined : Number(f.Pallets);
  if (t === 'Cross-dock') return { kind: 'crossdock', day, name: 'Βέροια', pallets, marked: !!f['Completed At'] };
  return { kind: 'stop', act: t === 'Loading' ? 'load' : 'unload', day, name: (m && m.name) || '—',
    city: (m && m.city) || undefined, cc: m ? (m.cc || null) : undefined, pallets, marked: !!f['Completed At'], _type: t };
}
const _sorted = (stops) => (stops || []).filter((s) => s && s.fields && ['Loading', 'Unloading', 'Cross-dock'].includes(s.fields['Stop Type']))
  .slice().sort((a, b) => (Number(a.fields['Stop Number']) || 0) - (Number(b.fields['Stop Number']) || 0)
    || String(a.fields.DateTime || '').localeCompare(String(b.fields.DateTime || '')));
const _exKind = (f) => (first(f.Partner) ? 'partner' : first(f.Truck) ? 'own' : 'none');
const _no = (rec) => { const n = rec && rec.fields && (rec.fields['Order No'] != null ? rec.fields['Order No'] : null); return n != null ? '#' + n : null; };

function facadeOrder(rec, stops, ctx) {
  const c = ctx || {};
  const f = rec.fields || {};
  const imp = f.Direction === 'Import';
  const title = imp ? 'ΕΙΣΑΓΩΓΗ' : 'ΕΞΑΓΩΓΗ';
  const done = f.Status === 'Delivered';
  const aside = done ? 'παραδόθηκε' : [f['Pallet Exchange'] ? 'PE' : null, c.temp || null].filter(Boolean).join(' · ') || null;
  // Δ5: a split order travels with its legs (K7), each leg its own executor; the join is a «Μεταφόρτωση» row
  if (Array.isArray(c.legs) && c.legs.length > 1) {
    const rows = [];
    const n = c.legs.length;
    const segOf = (i) => (i === 0 ? 'initial' : i === n - 1 ? 'final' : 'intermediate');
    c.legs.forEach((leg, i) => {
      const lr = _sorted(leg.stops).map((s) => Object.assign(_stopRow(s, c), { seg: segOf(i) }));
      if (i > 0) {
        // Card Δ5: the join is the end of one leg and the start of the next (K1, checked by place) — drawn ONCE, as
        // the ⇄ row, in place of the previous leg's last stop and this leg's first one
        const prevLast = rows.length && rows[rows.length - 1].kind === 'stop' ? rows.pop() : null;
        const head = lr.length ? lr.shift() : null;
        const at = prevLast || head;
        rows.push({ kind: 'handover', what: 'transship', day: at ? at.day : null, place: at ? at.name : '—',
          meta: 'τέλος ' + (_no(c.legs[i - 1].rec) || 'σκέλους ' + i) + ' · αρχή ' + (_no(leg.rec) || 'σκέλους ' + (i + 1)) });
      }
      rows.push(...lr);
    });
    return { today: c.today, sections: [{ title, chip: _no(rec), aside, done, rows: rows.map(_clean),
      executors: c.legs.map((l) => ({ desk: 'intl', kind: _exKind(l.rec.fields || {}) })) }], empty: 'Η παραγγελία δεν έχει στάσεις.' };
  }
  const rows = _sorted(stops).map((s) => _stopRow(s, c));
  if (c.stockOut) rows.unshift({ kind: 'node', node: 'stock-out', name: c.stockOut });
  if (c.stockIn) rows.push({ kind: 'node', node: 'stock-in', name: c.stockIn });
  const intlEx = { desk: 'intl', kind: _exKind(f) };
  const hub = rows.findIndex((r) => r.kind === 'crossdock');
  if (!f['Veroia Switch'] || hub < 0) {
    const sec = { title, chip: _no(rec), aside, done, rows: rows.map(_clean), executor: rows.length ? intlEx : null };
    // VS on but no cross-dock stop: the national leg cannot be drawn — said in the heading, never silently plain
    if (f['Veroia Switch'] && hub < 0) { sec.aside = 'VS χωρίς στάση cross-dock'; sec.asideTone = 'red'; }
    return { today: c.today, sections: [sec], empty: 'Η παραγγελία δεν έχει στάσεις.' };
  }
  // VS (Δ3 / Δ8 / Δ11): the Veroia boundary (owner 14/10) splits the order's own stops between the two desks.
  // Import: abroad → cross-dock with the international executor, then the Greek points as ΕΘΝΙΚΟ ΣΚΕΛΟΣ (2283:9994).
  // Export: the Greek points to the cross-dock first, then cross-dock → abroad.
  const nl = c.natLeg || null;
  const natRows = (imp ? rows.slice(hub + 1) : rows.slice(0, hub)).map((r) => Object.assign(r, { assigned: nl ? nl.kind !== 'none' : true }));
  const intlRows = imp ? rows.slice(0, hub + 1) : rows.slice(hub);
  const nat = { title: 'ΕΘΝΙΚΟ ΣΚΕΛΟΣ', chip: nl && nl.ref ? nl.ref : null, rows: natRows.map(_clean),
    executor: nl ? { desk: 'natl', kind: nl.kind } : null };
  // the host did not read the national leg: its executor is unknown, said in the heading (principle 1)
  if (!nl) { nat.aside = 'εκτελεστής: δεν διαβάστηκε'; nat.asideTone = 'red'; }
  const intlSec = { title, chip: _no(rec), aside, done, rows: intlRows.map(_clean), executor: intlEx };
  return { today: c.today, sections: imp ? [intlSec, nat] : [nat, intlSec], empty: 'Η παραγγελία δεν έχει στάσεις.' };
}
function _clean(r) { const o = Object.assign({}, r); delete o._type; return o; }

// The national leg of a VS order on the v5 board(s) the host already read (Weekly National v5 / «Παραγγελίες ›
// Εβδομάδα» _v5Board): on a cycle → that cycle's executor, waiting or at the hub → «χωρίς ανάθεση», on no board → null
// (unknown — facadeOrder then says «εκτελεστής: δεν διαβάστηκε», never «χωρίς ανάθεση»). orderPgId = the Postgres id
// of the international order (OrdersWeekView.pgIdOf), as the board's legs[].order_id carry it.
function natLegFromBoard(boards, orderPgId) {
  const id = Number(orderPgId);
  if (!Number.isFinite(id)) return null;
  for (const b of [].concat(boards || []).filter(Boolean)) {
    for (const cy of b.cycles || []) {
      for (const s of cy.stops || []) {
        if (!(s.legs || []).some((l) => Number(l.order_id) === id)) continue;
        const kind = s.has_vehicle === false ? 'none' : cy.trip_type === 'PARTNER' ? 'partner' : 'own';
        return { ref: cy.code || null, kind };
      }
    }
    if ((b.waiting || []).concat(b.hub || []).some((w) => Number(w.order_id) === id)) return { ref: null, kind: 'none' };
  }
  return null;
}

// One RT through the facade: its orders in the RT's order (export leg, rota, import — /costs/rt legs[].seq), each
// drawn as facadeOrder draws it (Figma 2283:10025: ΕΞΑΓΩΓΗ #558 · ΕΙΣΑΓΩΓΗ #554 · ΕΘΝΙΚΟ ΣΚΕΛΟΣ NL 158).
// items: [{ rec, stops, ctx? }] — a per-order ctx (natLeg, legs, temp) is merged over the shared one.
function facadeRt(items, ctx) {
  const c = ctx || {};
  const sections = [];
  for (const it of items || []) sections.push(...facadeOrder(it.rec, it.stops, Object.assign({}, c, it.ctx || {})).sections);
  return { today: c.today, sections, empty: c.cancelled ? 'Ακυρωμένο δρομολόγιο · χωρίς σκέλος.' : 'Δρομολόγιο χωρίς σκέλος.' };
}

const RouteDiagramAdapters = freeze({ boardCycle, facadeOrder, facadeRt, natLegFromBoard, athensDay, athensTime });
if (typeof module !== 'undefined' && module.exports) module.exports = RouteDiagramAdapters;
if (typeof window !== 'undefined') window.RouteDiagramAdapters = RouteDiagramAdapters;
})();
