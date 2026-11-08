// ═══════════════════════════════════════════════════════════════════════
// PLAIN REF — how every message names an order or a trip (global PlainRef)
// ─────────────────────────────────────────────────────────────────────
// Owner 8/11 (rule, approved with the before → after list in
// docs/plain-messages/2026-11-08-before-after.md): a message a person reads
// never names a record by its code («RT-1543», «#1229», «recAbC…», «GI-…»).
// It says what the record is:
//   order → «ΦΑΓΕ, Βέροια → Μόναχο · Δευ 2/11»   (client, first load → first delivery, load day)
//   trip  → «ΚΖΗ-1234 · Σαρίδης Γ. · Δευ 2/11»    (plate or partner, driver, start day)
// The code may stay only in a title="" tooltip, for search. ONE builder for
// every screen (principle 3): before 8/11 each screen wrote its own label and
// most fell back to the code.
//
// Returns PLAIN text (no HTML): a caller that puts it into innerHTML (toast,
// banners) escapes it; confirm()/alert() take it as it is.
//
// Two layers in one file:
//   - pure: day, dm, person, order, trip, list (no DOM, no globals, no clock)
//     → node --test proves them (tests/plain-ref.test.js);
//   - adapters: orderOf(rec), tripOf(rt, lookups) read an ORDERS record or a
//     /costs/rt row with the page's lookups (orderClientName,
//     getRefLocations — core/data-helpers.js); each lookup is guarded, so a
//     missing one gives fewer words, never a code and never a throw.
// UMD like core/wi4-logic.js: require() in node, window.PlainRef in the page.
// ═══════════════════════════════════════════════════════════════════════
(function () {
'use strict';

const GR_DOW = Object.freeze(['Κυρ', 'Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ']);
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// «<» and «>» are dropped from every input: a client name can then never open a
// tag when a caller puts the text into innerHTML (toast). A title="" attribute
// still needs escapeHtml at the call site (quotes stay).
const s = (v) => (v == null ? '' : String(v)).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();

// A calendar day from 'YYYY-MM-DD' (taken as it is) or a datetime (read in
// the browser's LOCAL time: slicing a UTC ISO string gives the wrong day near
// midnight in Athens, see core/wi4-logic.js). null when there is no day.
function _ymd(d) {
  const t = s(d);
  if (!t) return null;
  const m = DAY_RE.exec(t);
  if (m) return [+m[1], +m[2], +m[3]];
  const x = new Date(t);
  return isNaN(x.getTime()) ? null : [x.getFullYear(), x.getMonth() + 1, x.getDate()];
}
// «2/11» (no zero pad, no year: the board's own format)
function dm(d) { const y = _ymd(d); return y ? `${y[2]}/${y[1]}` : ''; }
// «Δευ 2/11»
function day(d) {
  const y = _ymd(d);
  if (!y) return '';
  return `${GR_DOW[new Date(Date.UTC(y[0], y[1] - 1, y[2])).getUTCDay()]} ${y[2]}/${y[1]}`;
}
// A driver as the papers write one (modules/pnl_paper.js pnlpDriverShort):
// «Σαρίδης Γεώργιος» → «Σαρίδης Γ.», a single word stays as it is.
function person(full) {
  const p = s(full).split(' ').filter(Boolean);
  if (!p.length) return '';
  return p.length === 1 ? p[0] : p[0] + ' ' + p[1].charAt(0) + '.';
}

// «ΦΑΓΕ, Βέροια → Μόναχο · Δευ 2/11». Every part is optional; with nothing
// known it is '' and the caller says «η παραγγελία» — never the code.
function order(o) {
  o = o || {};
  const client = s(o.client), from = s(o.from), to = s(o.to);
  const route = from && to ? `${from} → ${to}` : from ? `από ${from}` : to ? `για ${to}` : '';
  const head = client && route ? `${client}, ${route}` : client || route;
  const d = o.day ? day(o.day) : '';
  return head && d ? `${head} · ${d}` : head || (d ? `φόρτωση ${d}` : '');
}
// «ΚΖΗ-1234 · Σαρίδης Γ. · Δευ 2/11», a span «… · 2/11–7/11» when dayEnd is
// another day, a partner by its name. '' when no vehicle and no day is known.
function trip(t) {
  t = t || {};
  const who = s(t.partner) || s(t.plate);
  const drv = s(t.partner) ? '' : person(t.driver);
  const a = t.day ? day(t.day) : '', b = t.dayEnd ? dm(t.dayEnd) : '';
  const when = a && b && b !== dm(t.day) ? `${dm(t.day)}–${b}` : a;
  return [who, drv, when].filter(Boolean).join(' · ');
}
// «ΦΑΓΕ, Verona → Βέροια και Lidl, Graz → Βέροια»; past `max` the rest is
// counted: «… και 2 ακόμη». Empty parts are dropped.
function list(texts, max) {
  const t = (texts || []).map(s).filter(Boolean), n = max || 3;
  if (t.length <= 1) return t[0] || '';
  const shown = t.length > n ? t.slice(0, n) : t;
  const rest = t.length - shown.length;
  return rest ? `${shown.join(', ')} και ${rest} ακόμη` : `${shown.slice(0, -1).join(', ')} και ${shown[shown.length - 1]}`;
}

// ─── adapters (browser) ───────────────────────────────────────────────
const g = (name) => (typeof globalThis !== 'undefined' && typeof globalThis[name] === 'function' ? globalThis[name] : null);
function _try(fn, ...a) { try { return fn ? s(fn(...a)) : ''; } catch (_) { return ''; } }
// The first point of a summary («"Verona" / "Modena"» → «Verona +1»): the
// Worker serves Loading/Delivery Summary as quoted names joined with «/», and
// the board's stop summaries as «Name, City, Country» — only the name is kept
// (the title the board shows, weekly_intl_v2 _splitName), so a message stays one line.
function _firstOf(summary) {
  const parts = s(summary).replace(/["']+/g, '').split('/').map(s).filter(Boolean);
  if (!parts.length) return '';
  const name = s(parts[0].split(',')[0]) || parts[0];
  return name + (parts.length > 1 ? ` +${parts.length - 1}` : '');
}
function _locName(linkVal, loc) {
  const id = Array.isArray(linkVal) ? (linkVal[0] && (linkVal[0].id || linkVal[0])) : linkVal;
  if (!id || typeof id !== 'string') return '';
  if (loc) return _try(loc, id);
  const locs = g('getRefLocations');
  if (!locs) return '';
  let l = null;
  try { l = (locs() || []).find((r) => r && r.id === id) || null; } catch (_) { l = null; }
  return l && l.fields ? s(l.fields['Name'] || l.fields['City']) : '';
}
// An ORDERS record (or its fields) → order(). opts.day: false drops the day;
// opts.loc(recId) → name replaces getRefLocations for Location 1 (a page that
// keeps its own location map, e.g. the Weekly board's _fhLocationsMap). The
// Summary (the stop names the board injects) comes first either way.
function orderOf(rec, opts) {
  opts = opts || {};
  const f = (rec && rec.fields) || rec || {};
  const client = _try(g('orderClientName'), f) || s(f['Client Name']);
  const place = (k) => _firstOf(f[k === 'load' ? 'Loading Summary' : 'Delivery Summary'])
    || _locName(f[k === 'load' ? 'Loading Location 1' : 'Unloading Location 1'], opts.loc);
  return order({ client, from: place('load'), to: place('del'), day: opts.day === false ? null : f['Loading DateTime'] });
}
// A /costs/rt row ({trip_type, truck_id, driver_id, partner_id, date_start,
// date_end}) with the lookups of /costs/lookups ({trucks, drivers, partners})
// → trip(). opts.span: true shows «2/11–7/11» when the trip ends another day.
function tripOf(rt, lk, opts) {
  rt = rt || {}; lk = lk || {}; opts = opts || {};
  const find = (arr, id) => (id == null ? null : (arr || []).find((x) => x && x.id === id) || null);
  const isPartner = rt.trip_type === 'PARTNER' || (rt.partner_id != null && rt.truck_id == null);
  return trip({
    partner: isPartner ? s((find(lk.partners, rt.partner_id) || {}).company_name) : '',
    plate: s((find(lk.trucks, rt.truck_id) || {}).license_plate),
    driver: s((find(lk.drivers, rt.driver_id) || {}).full_name),
    day: rt.date_start || null,
    dayEnd: opts.span ? rt.date_end || null : null,
  });
}

const PlainRef = Object.freeze({ day, dm, person, order, trip, list, orderOf, tripOf });
if (typeof module !== 'undefined') module.exports = PlainRef; else window.PlainRef = PlainRef;
})();
