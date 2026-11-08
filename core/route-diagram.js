// ═══════════════════════════════════════════════════════════════════════
// ROUTE DIAGRAM — the vertical route («Διαδρομή») of an order or a road trip (global RouteDiagram)
// ─────────────────────────────────────────────────────────────────────
// Owner 8/11/2026: «το feature με το διάγραμμα» in Weekly National v5, «Παραγγελίες › Εβδομάδα» and «Παλέτες ›
// Εβδομάδα», covering every case already designed (docs/order-route/CASES.md Δ1–Δ20, RT-CASES.md RT0–RT20). Design
// and case table: docs/route-diagram/DESIGN.md. Figma KO7l2AfucR3HJEDIg1Yptr: the «Διαδρομή» tab 2283:10009 (page
// 2281:7735) and the panel-style cards 2310:7917–2310:7926 (page 2306:7735). No new design is invented here.
//
// Two pure functions and nothing else: no fetch, no DOM, no Date.now() — «today» is an argument, so node --test
// proves every case without a browser (tests/route-diagram.test.js). Hosts turn what they already read into the
// input with an adapter (core/route-diagram-adapters.js) and paint RouteDiagram.render(input) where they want it.
//   build(input) → model   the normalised route: sections → rows {kind: stop|crossdock|node|handover|executor}
//   html(model)  → string  every text escaped, CSS classes rd-* (assets/route-diagram.css)
//
// What this file does NOT decide (principle 3): whether a stop is executed, late or assigned. Those are facts the
// host copies from its source (order_stops.completed_at, v_rt_stop_state.executed / has_late / has_vehicle) — the
// diagram only draws them. A fact the source does not have is left out, never guessed: a country that is known to
// be missing is «χώρα;» (cc === null); a country nobody asked for (cc undefined) is simply not printed.
// ═══════════════════════════════════════════════════════════════════════
(function () {
'use strict';

const freeze = Object.freeze;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DOW = freeze(['Κυρ', 'Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ']);
// Upper case is TYPED (the tonos trap of CSS text-transform).
const SEG = freeze({ initial: 'ΑΡΧΙΚΟ', intermediate: 'ΕΝΔΙΑΜΕΣΟ', final: 'ΤΕΛΙΚΟ' });
const SEG_GEN = freeze({ initial: 'ΑΡΧΙΚΟΥ', intermediate: 'ΕΝΔΙΑΜΕΣΟΥ', final: 'ΤΕΛΙΚΟΥ' });
const ACT = freeze({ load: 'Φόρτωση', unload: 'Παράδοση', both: 'Παράδοση + φόρτωση' });
// Node labels: Figma cards Δ15 (warehouse, both directions read «Φόρτωση · αποθήκη τρίτου»), Δ19 (customs, border).
// Stock (Δ12 / Δ17) has no panel card: its two words are the grammar's (ROUTE-GRAMMAR §1 S↓ / S↑).
const NODE = freeze({
  'warehouse-leave': 'Φόρτωση · αποθήκη τρίτου', 'warehouse-pick': 'Φόρτωση · αποθήκη τρίτου',
  customs: 'Τελωνείο', border: 'Σύνορα', 'stock-out': 'Από απόθεμα', 'stock-in': 'Σε απόθεμα',
});
const HAND = freeze({ vehicle: 'Αλλαγή οχήματος', transship: 'Μεταφόρτωση', driver: 'Αλλαγή οδηγού' });
const DESK = freeze({ intl: 'Διεθνών', natl: 'Εθνικών' });
const WHO = freeze({ own: 'δικό μας φορτηγό', partner: 'συνεργάτης', none: 'χωρίς ανάθεση', local: 'τοπικός οδηγός', client: 'όχημα πελάτη' });
const KINDS = freeze(['stop', 'crossdock', 'node', 'handover']);

class InputError extends Error {
  constructor(what) { super('route diagram input: ' + what); this.name = 'InputError'; this.what = what; }
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const _d = (ymd) => new Date(ymd + 'T12:00:00Z');
// «Δευ 19/10» (Figma 2283:9914). With a time the card RT17 prints the weekday and the time only: «Τρί 06:00».
function dayText(day, time, dayTo) {
  if (!day) return null;
  if (!DAY_RE.test(day)) throw new InputError('day ' + day);
  const a = _d(day);
  if (time) return DOW[a.getUTCDay()] + ' ' + time;
  if (dayTo && dayTo !== day) {
    if (!DAY_RE.test(dayTo)) throw new InputError('dayTo ' + dayTo);
    const b = _d(dayTo);
    // RT16 card: «Σάβ 24 – Κυρ 25/10»; the month is said once when both days share it
    const left = DOW[a.getUTCDay()] + ' ' + a.getUTCDate() + (a.getUTCMonth() === b.getUTCMonth() ? '' : '/' + (a.getUTCMonth() + 1));
    return left + ' – ' + DOW[b.getUTCDay()] + ' ' + b.getUTCDate() + '/' + (b.getUTCMonth() + 1);
  }
  return DOW[a.getUTCDay()] + ' ' + a.getUTCDate() + '/' + (a.getUTCMonth() + 1);
}
// pallets: null = not known yet (F1/F4, owner 28/10) → «;π», never 0; undefined = the host did not ask → nothing
function palText(p) {
  if (p === undefined) return null;
  if (p === null || p === '' || Number.isNaN(Number(p))) return ';π';
  return String(Math.round(Number(p) * 10) / 10).replace('.', ',') + 'π';
}
// The grey line under the name: «City, CC · 26π» (Figma 2283:9916). A country known to be missing is red «χώρα;»
// (N2 of ROUTE-GRAMMAR §3), never a guessed «GR».
function metaParts(r) {
  const out = [];
  const ccMissing = r.cc === null || r.cc === '';
  const cc = typeof r.cc === 'string' && r.cc ? r.cc : null;
  if (r.city) out.push({ text: cc ? r.city + ', ' + cc : String(r.city), tone: null });
  else if (cc) out.push({ text: cc, tone: null });
  if (ccMissing) out.push({ text: 'χώρα;', tone: 'red' });
  const p = palText(r.pallets);
  if (p) out.push({ text: p, tone: null });
  for (const x of r.extra || []) if (x != null && x !== '') out.push({ text: String(x), tone: null });
  return out;
}
const _notes = (r) => (r.notes || []).filter((n) => n && n.text).map((n) => ({ tone: ['red', 'amber', 'muted'].includes(n.tone) ? n.tone : 'muted', text: String(n.text) }));

// The dot of a stop, from facts only (Figma 2281:7735 dot set):
//   unassigned  white, red dashed ring   — the leg has no vehicle yet (K10); the bar of the section says it
//   missed      white, red ring + «δεν σημειώθηκε» — its day passed and nobody marked it (completed_at / executed)
//   done        grey                     — marked
//   today       blue                     — its day is today
//   future      white, navy ring
// late (has_late, spec §2.3) is a red ring with «καθυστέρηση»; a stop without a day says «χωρίς ημέρα» (E8).
function stopState(r, today) {
  if (r.assigned === false) return { dot: 'unassigned', flag: null };
  if (r.late === true) return { dot: 'missed', flag: 'καθυστέρηση' };
  if (r.marked === true) return { dot: 'done', flag: null };
  if (!r.day) return { dot: 'future', flag: 'χωρίς ημέρα' };
  if (today && r.day < today) return { dot: 'missed', flag: 'δεν σημειώθηκε' };
  if (today && r.day === today) return { dot: 'today', flag: null };
  return { dot: 'future', flag: null };
}

function rowOf(r, today) {
  if (!r || !KINDS.includes(r.kind)) throw new InputError('row kind ' + (r && r.kind));
  const isToday = !!today && r.day === today && !r.time;
  let dt = dayText(r.day, r.time, r.dayTo);
  const dayTone = r.overlap ? 'overlap' : isToday ? 'today' : null;
  if (dt && isToday) dt += ' · σήμερα';
  const base = { kind: r.kind, dayText: dt || '—', dayTone, notes: _notes(r), tag: null, flag: null, nameTone: null, line: false };
  if (r.kind === 'stop') {
    if (!ACT[r.act]) throw new InputError('stop act ' + r.act);
    const st = stopState(r, today);
    const tag = r.seg && SEG[r.seg] ? { text: SEG[r.seg], seg: r.seg } : r.tag ? { text: String(r.tag), seg: null } : null;
    return Object.assign(base, { dot: st.dot, label: r.label || ACT[r.act], flag: st.flag ? { text: st.flag, tone: 'red' } : null,
      tag, name: r.name || '—', nameTone: st.dot === 'done' ? 'done' : null, meta: metaParts(r) });
  }
  if (r.kind === 'crossdock') {
    // Owner rule 6 (26/10): «Cross-dock · Βέροια (VS)» on the hub stop. Figma 2283:9952: blue when it is today,
    // the amber node colour of the cards (Δ15, RT10) otherwise. «όριο» = the Veroia boundary between the two desks
    // (owner 14/10), printed after the pallets as in 2283:9960.
    const meta = metaParts({ pallets: r.pallets, extra: r.extra });
    if (r.boundary !== false) meta.push({ text: 'όριο', tone: null });
    const tag = r.seg && SEG[r.seg] ? { text: SEG[r.seg], seg: r.seg } : null;
    return Object.assign(base, { dot: isToday ? 'today' : 'node', label: 'Cross-dock', vs: true, tag, name: r.name || 'Βέροια', meta });
  }
  if (r.kind === 'node') {
    if (!NODE[r.node]) throw new InputError('node ' + r.node);
    return Object.assign(base, { dot: 'node', node: r.node, label: r.label || NODE[r.node], name: r.name || '—', meta: metaParts(r) });
  }
  // handover: the ⇄ row (owner rule 5) — a vehicle change inside one cycle (K9, RT17/RT18/Π11) or the transshipment
  // between the legs of a split order (Δ5, Δ20). Its grey line says which segment ends and which starts.
  if (!HAND[r.what]) throw new InputError('handover what ' + r.what);
  const meta = [];
  if (r.meta) meta.push({ text: String(r.meta), tone: null });
  else if (r.from && r.to && SEG_GEN[r.from] && SEG_GEN[r.to]) meta.push({ text: 'τέλος ' + SEG_GEN[r.from] + ' · αρχή ' + SEG_GEN[r.to], tone: null });
  if (r.reason) meta.push({ text: String(r.reason), tone: null });
  return Object.assign(base, { dot: 'handover', label: HAND[r.what], name: r.place || '—', meta });
}

function executorOf(e, done) {
  if (!e || !DESK[e.desk] || !WHO[e.kind]) throw new InputError('executor ' + JSON.stringify(e));
  return { kind: 'executor', desk: e.desk, who: e.kind, text: e.text ? String(e.text) : DESK[e.desk] + ' · ' + WHO[e.kind], done: !!done, line: false };
}

function build(input) {
  if (!input || typeof input !== 'object') throw new InputError('input');
  const today = input.today || null;
  if (today && !DAY_RE.test(today)) throw new InputError('today ' + today);
  const sections = (input.sections || []).map((s, i) => {
    if (!s || !Array.isArray(s.rows)) throw new InputError(`sections[${i}].rows`);
    const rows = s.rows.map((r) => rowOf(r, today));
    // one line from a dot down to the next dot of the same section; the last point has none (2283:9918)
    rows.forEach((r, j) => { r.line = j < rows.length - 1; });
    const ex = Array.isArray(s.executors) ? s.executors : s.executor ? [s.executor] : [];
    for (const e of ex) rows.push(executorOf(e, s.done));
    return { title: String(s.title || ''), chip: s.chip ? String(s.chip) : null, aside: s.aside ? String(s.aside) : null,
      asideTone: s.asideTone === 'red' ? 'red' : null, rows };
  });
  const kv = (input.kv || []).map(([k, v, t]) => ({ k: String(k), v: v == null || v === '' ? '—' : String(v), tone: ['red', 'orange'].includes(t) ? t : null }));
  // K0 (ROUTE-GRAMMAR §2): a record without nodes is not a route — said, never an empty panel
  const empty = sections.some((s) => s.rows.length) ? null : String(input.empty || 'Δεν υπάρχουν στάσεις.');
  return freeze({ today, sections, kv, empty });
}

function rowHtml(r) {
  if (r.kind === 'executor') {
    return `<div class="rd-ex" data-who="${esc(r.who)}" data-desk="${esc(r.desk)}"${r.done ? ' data-done="1"' : ''}>${esc(r.text)}</div>`;
  }
  const mark = r.dot === 'handover' ? '<span class="rd-hand" aria-hidden="true">⇄</span>' : '<span class="rd-dot" aria-hidden="true"></span>';
  const head = `<span class="rd-lab">${esc(r.label)}</span>`
    + (r.vs ? '<span class="rd-vs">VS</span>' : '')
    + (r.tag ? `<span class="rd-tag"${r.tag.seg ? ` data-seg="${esc(r.tag.seg)}"` : ''}>${esc(r.tag.text)}</span>` : '')
    + (r.flag ? `<span class="rd-flag" data-tone="${esc(r.flag.tone)}">${esc(r.flag.text)}</span>` : '');
  const meta = r.meta.length ? `<div class="rd-meta">${r.meta.map((m) => (m.tone ? `<span data-tone="${esc(m.tone)}">${esc(m.text)}</span>` : esc(m.text))).join(' · ')}</div>` : '';
  return `<div class="rd-row" data-kind="${esc(r.kind)}" data-dot="${esc(r.dot)}"${r.line ? ' data-line="1"' : ''}>`
    + mark + (r.line ? '<span class="rd-line" aria-hidden="true"></span>' : '')
    + `<div class="rd-hd"><span class="rd-hl">${head}</span><span class="rd-day"${r.dayTone ? ` data-tone="${esc(r.dayTone)}"` : ''}>${esc(r.dayText)}</span></div>`
    + `<div class="rd-name"${r.nameTone ? ` data-tone="${esc(r.nameTone)}"` : ''}>${esc(r.name)}</div>`
    + meta
    + r.notes.map((n) => `<div class="rd-note" data-tone="${esc(n.tone)}">${esc(n.text)}</div>`).join('')
    + '</div>';
}

function html(model) {
  if (!model || !Array.isArray(model.sections)) throw new InputError('model');
  const secs = model.sections.map((s) => '<section class="rd-sec">'
    + `<div class="rd-sh"><span class="rd-st">${esc(s.title)}</span>${s.chip ? `<span class="rd-chip">${esc(s.chip)}</span>` : ''}`
    + (s.aside ? `<span class="rd-aside"${s.asideTone ? ` data-tone="${esc(s.asideTone)}"` : ''}>${esc(s.aside)}</span>` : '') + '</div>'
    + s.rows.map(rowHtml).join('') + '</section>').join('');
  const empty = model.empty ? `<div class="rd-empty">${esc(model.empty)}</div>` : '';
  const kv = model.kv && model.kv.length ? '<div class="rd-kv">' + model.kv.map((x) => `<div class="rd-kvr"><span>${esc(x.k)}</span><b${x.tone ? ` data-tone="${esc(x.tone)}"` : ''}>${esc(x.v)}</b></div>`).join('') + '</div>' : '';
  return `<div class="rd">${secs}${empty}${kv}</div>`;
}

const render = (input) => html(build(input));

const RouteDiagram = freeze({ build, html, render, dayText, palText, esc, SEG, InputError });
if (typeof module !== 'undefined' && module.exports) module.exports = RouteDiagram;
if (typeof window !== 'undefined') window.RouteDiagram = RouteDiagram;
})();
