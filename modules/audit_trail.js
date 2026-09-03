// ============================================================================
// audit_trail.js, "who changed this?" for the whole system
// ----------------------------------------------------------------------------
// Reads the server-side audit trail (GET /audit on the Stage 2 backend) and
// renders it as a filterable history.
//
// WHY THIS EXISTS: the backend has recorded every create/update/delete since
// its first migration, but nothing could read it. No endpoint, no screen. So
// the data piled up where only someone with direct database access could
// query it, and the promise that "any disputed invoice or delivery has an
// authoritative trail" was true of the database and false for the people who
// actually need the answer. A trail nobody can read is not accountability.
//
// NOT the same as the two screens it sits next to, which is why it is separate:
//   Metrics Audit  cross-table data-consistency checks (is the data coherent?)
//   Error Log      client-side JS errors (what broke in the browser?)
//   THIS           who changed which record, when, and what the value was
//                  before and after.
//
// REQUIRES PROXY MODE. The trail lives on the Stage 2 backend, so this page
// only works when the app is pointed at it (USE_PROXY = true). In direct
// Airtable mode there is no trail to read and the page says so plainly rather
// than rendering an empty table that looks like "nothing ever happened".
//
// Redesign 3/9/2026 (wave 2, Figma w2-audit-trail-overview 163:604): filters
// apply on change instead of behind an Apply button, one line per change,
// 40px rows, and — the part that matters — "what changed" is never faked:
// see _auditDiffFor below.
// ============================================================================

// Server-side roles allowed to read the trail (mirrors AUDIT_READERS in the
// backend's src/routes/audit.js). Checked here only to show an honest message
// instead of a 403; the SERVER is the real boundary, this is presentation.
const AUDIT_UI_ROLES = ['owner', 'management'];

// Page size. The Worker caps at 200 (MAX_LIMIT); asking for more silently
// returns 200 anyway, so the header says exactly what the user gets.
const AUDIT_LIMIT = 200;

// AT-7: κλικ στο record id → το trail φιλτράρει στο ιστορικό ΤΟΥ record.
function _auditFilterRecord(id) {
  const inp = document.getElementById('afRecord');
  if (inp) inp.value = id;
  _auditFilters.record_id = id;
  _auditRenderBody();
}
window._auditFilterRecord = _auditFilterRecord;

let _auditFilters = { record_id: '', table: '', actor: '', action: '', since: '', until: '' };
// 'all' | '7' | '30' | '90' | 'custom' — the Εύρος dropdown. Kept apart from
// since/until because since/until are what the server receives; the preset
// is only how the user chose them.
let _auditRange = 'all';
let _auditEntries = [];
let _auditLoading = false;
let _auditError = '';
// Actors/tables ever seen in a response. The server has no "distinct actors"
// endpoint, so the dropdowns can only offer what the trail has shown us; the
// union survives filtering so a choice never disappears from the list the
// moment it is applied.
const _auditSeenActors = new Set();
const _auditSeenTables = new Set();

/**
 * Fetch the trail with the current filters.
 * The query string is built exactly as before the redesign (filters first,
 * then limit): the critics replay a recording keyed by URL, and the default
 * request must stay `/audit?limit=200` byte for byte.
 * @returns {Promise<void>} resolves once _auditEntries / _auditError are set.
 */
async function _auditFetch() {
  _auditLoading = true;
  _auditError = '';
  try {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(_auditFilters)) {
      if (!v || !String(v).trim()) continue;
      // «Έως 3/9» must MEAN the whole of 3/9. The Worker passes `until`
      // verbatim into PostgREST as created_at=lte.<until> (deployed src
      // index.js:210), and a bare date is midnight at the START of that day —
      // so the chosen day was silently excluded. Measured on audit_log
      // 3/9/2026: 1/9–3/9 returned 57 rows instead of 89 (−36%), and
      // «3/9 έως 3/9» returned 0. The end-of-day stamp is sent from here
      // because we cannot deploy the Worker; the real fix is `lt.<until+1d>`
      // server-side. RESIDUE: the stamp carries no zone, so Postgres reads it
      // as UTC while the team reads it as Athens time — the last 3 hours of
      // the local day are still outside the range. Owner call (needs Worker).
      if (k === 'until') { qs.set(k, `${String(v).trim()}T23:59:59.999`); continue; }
      qs.set(k, String(v).trim());
    }
    qs.set('limit', String(AUDIT_LIMIT));

    const token = localStorage.getItem('tms_jwt');
    // These two auth messages stay in English on purpose: tests/critics/
    // semantics.spec.js recognises them as "the screen did not render" and
    // would go blind to a missing token if they were reworded here.
    if (!token) throw new Error('No session token. Sign in again.');

    const res = await fetch(`${PROXY_URL}/audit?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 403) throw new Error('Ο ρόλος σου δεν έχει πρόσβαση στο ιστορικό ενεργειών.');
    if (res.status === 401) throw new Error('Session expired. Sign in again.');
    if (!res.ok) throw new Error(`Το ιστορικό δεν φορτώθηκε (${res.status}).`);

    const data = await res.json();
    _auditEntries = Array.isArray(data.entries) ? data.entries : [];
    for (const e of _auditEntries) {
      if (e.actor) _auditSeenActors.add(String(e.actor));
      if (e.table_name) _auditSeenTables.add(String(e.table_name));
    }
  } catch (e) {
    _auditEntries = [];
    _auditError = e.message || 'Το ιστορικό δεν φορτώθηκε.';
    if (typeof logError === 'function') logError(e, 'auditTrail:fetch');
  } finally {
    _auditLoading = false;
  }
}

function _auditEsc(s) {
  // escapeHtml is the shared helper; fall back to a local escape if absent so a
  // missing util can never turn stored data into markup.
  return typeof escapeHtml === 'function'
    ? escapeHtml(s)
    : String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** "29/08 14:32" — the year only when it is not this year. Full stamp in title. */
function _auditWhen(iso) {
  if (!iso) return { short: '—', full: '' };
  const d = new Date(iso);
  if (isNaN(d)) return { short: String(iso), full: String(iso) };
  const p = (n) => String(n).padStart(2, '0');
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const day = `${p(d.getDate())}/${p(d.getMonth() + 1)}${sameYear ? '' : '/' + String(d.getFullYear()).slice(-2)}`;
  return {
    short: `${day} ${p(d.getHours())}:${p(d.getMinutes())}`,
    full: d.toLocaleString('el-GR', { dateStyle: 'short', timeStyle: 'medium' }),
  };
}

/** before_data/after_data arrive as JSON strings from Postgres (jsonb→text). */
function _auditParse(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return null; }
}

/**
 * Diff two snapshots into the fields that actually changed.
 * Showing the whole before/after object would bury the one field someone
 * cares about, which is the entire question this page answers.
 * @returns {Array<{field:string, from:*, to:*}>}
 */
function _auditDiff(before, after) {
  const b = before && typeof before === 'object' ? before : {};
  const a = after && typeof after === 'object' ? after : {};
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].sort();
  const out = [];
  for (const k of keys) {
    if (k === 'updated_at') continue;   // bookkeeping column, changes on every save
    const fromV = JSON.stringify(b[k] ?? null);
    const toV = JSON.stringify(a[k] ?? null);
    if (fromV !== toV) out.push({ field: k, from: b[k] ?? null, to: a[k] ?? null });
  }
  return out;
}

/**
 * Attach a usable "before" to every update-like entry.
 *
 * Measured 3/9/2026 on the recorded trail: before_data is NULL in 128 of 129
 * updates. Only the /costs and /pallets routes of the Worker pass `before`;
 * the facade PATCH path (every order, stop, truck…) never does. The previous
 * screen diffed null against the after-snapshot, found nothing, and printed
 * "Saved with no field changes" on nearly every row — a lie, since something
 * DID change. Two honest options remain:
 *   1. The trail itself: consecutive snapshots of the same record ARE its
 *      before/after, because every write is logged. The older entry's
 *      after_data is this entry's before. Only valid inside the loaded page
 *      (a filter by actor can hide the neighbour) — then, and for the oldest
 *      entry of each record, the answer is "unknown", shown as such.
 *   2. Nothing — "unknown" everywhere. Rejected: the data is right there.
 * Fixing the Worker to record before_data is the real fix and is the owner's
 * call (deploy); this derivation goes away by itself once before_data arrives.
 */
// Actions whose after_data is NOT a row snapshot, so it can neither be
// diffed against a previous state nor become the previous state of the next
// entry. cascade_delete writes per-step COUNTS ({ramp:0, order_stops:3, …},
// deployed src/index.js:2491); upload writes a file path; invoice_override
// writes an override note. Diffing a 10-key counter object against the
// order's last 125-key snapshot produced ~55 bogus "changes" (~1.500
// characters) in one cell — apples against oranges, presented as evidence.
const _AUDIT_NO_SNAPSHOT = new Set(['cascade_delete', 'upload', 'invoice_override']);
// Plus create/delete, whose own after/absence is already the whole story.
const _AUDIT_NO_DERIVE = new Set(['create', 'delete', ...(_AUDIT_NO_SNAPSHOT)]);

function _auditAttachBefore(entries) {
  // A neighbour-derived "before" is only true if the page holds EVERY entry
  // between the two. `actor` and `action` filter server-side, so the middle
  // neighbour vanishes and the chain X→Y→Z collapses to X→Z: the screen then
  // shows a change this user never made AND charges it to them. Measured
  // 3/9/2026: 51 of 649 chains. table/record_id are part of the chain key and
  // since/until cut a contiguous window, so only these two lie.
  const chainBroken = !!(_auditFilters.actor || _auditFilters.action);
  const last = new Map();   // "table|record" → latest snapshot seen walking oldest→newest
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    const key = `${e.table_name}|${e.record_id}`;
    const after = _auditParse(e.after_data);
    const before = _auditParse(e.before_data);
    e._before = before;
    e._after = after;
    e._derived = false;
    e._chainBroken = false;
    if (!before && !_AUDIT_NO_DERIVE.has(e.action)) {
      if (chainBroken) e._chainBroken = true;
      else if (last.has(key)) { e._before = last.get(key); e._derived = true; }
    }
    if (e.action === 'delete' || e.action === 'cascade_delete') last.delete(key);
    else if (after && !_AUDIT_NO_SNAPSHOT.has(e.action)) last.set(key, after);
  }
}

// The ΑΛΛΑΓΗ column speaks about transports, not about Postgres. These are the
// EVERY column that actually changed across the recorded 200-row page
// (measured 3/9/2026 on .har/tms-repaired.har — 26 distinct columns, nothing
// speculative). An unlisted column falls through to its raw name on purpose:
// a new field must be VISIBLE as unlabelled, not silently hidden or guessed.
// NOT a copy of the Worker's TABLES map (principle 3) — those are Airtable
// labels for the write path; these are Postgres column names as the audit
// trail stores them, a different vocabulary that the trail alone speaks.
const _AUDIT_FIELD = {
  status:                   'Κατάσταση',
  direction:                'Κατεύθυνση',
  driver_id:                'Οδηγός',
  truck_id:                 'Φορτηγό',
  trailer_id:               'Ρυμούλκα',
  partner_id:               'Συνεργάτης',
  partner_rate:             'Τιμή συνεργάτη',
  partner_truck_plates:     'Πινακίδες συνεργάτη',
  is_partner_trip:          'Δρομολόγιο συνεργάτη',
  location_id:              'Τοποθεσία',
  assigned_at:              'Ανατέθηκε',
  completed_at:             'Ολοκληρώθηκε',
  completed_by:             'Ολοκληρώθηκε από',
  closed_at:                'Έκλεισε',
  actual_delivery_date:     'Πραγματική παράδοση',
  performance:              'Επίδοση',
  delivery_performance:     'Επίδοση παράδοσης',
  temperature:              'Θερμοκρασία',
  temperature_c:            'Θερμοκρασία',
  pallets:                  'Παλέτες',
  loading_pallets_1:        'Φόρτωση 1 · παλέτες',
  loading_pallets_2:        'Φόρτωση 2 · παλέτες',
  loading_location_1_id:    'Φόρτωση 1 · τοποθεσία',
  loading_location_2_id:    'Φόρτωση 2 · τοποθεσία',
  matched_import_id:        'Αντιστοιχισμένη εισαγωγή',
  national_order_created:   'Δημιουργήθηκε εθνική',
};
function _auditFieldLabel(f) {
  return _AUDIT_FIELD[f] || String(f);
}

const _AUDIT_ISO_TS = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
const _AUDIT_ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function _auditFmtVal(v, field) {
  if (v === null || v === undefined || v === '') return '—';
  if (v === true) return 'ναι';
  if (v === false) return 'όχι';
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  // Timestamps went out raw and in UTC ("2026-08-28T16:39:26.067+00:00") on a
  // row whose ΠΟΤΕ column showed 19:39 local — three unexplained hours, in the
  // one place whose job is to be believable. Same formatter as ΠΟΤΕ, so the
  // two columns of a row now agree.
  if (_AUDIT_ISO_TS.test(s)) return _auditWhen(s).short;
  if (_AUDIT_ISO_DATE.test(s)) {
    // Parsed by hand, not by new Date(): 'YYYY-MM-DD' is UTC midnight to the
    // Date constructor, which shifts the day west of Greenwich.
    const [y, m, d] = s.split('-');
    return `${d}/${m}${Number(y) === new Date().getFullYear() ? '' : '/' + y.slice(-2)}`;
  }
  // Foreign keys: the id alone reads as a quantity ("driver_id: 52"). '#52'
  // reads as an identity. No lookup — an extra request per row would break
  // the recorded HAR the critics replay, and #52 already answers "which one
  // changed", which is this column's question.
  if (field && /_id$/.test(field) && /^\d+$/.test(s)) return `#${s}`;
  return s;
}

// The Worker's nine audit() verbs (grep 'action: "' on deployed src/index.js).
// Counted in audit_log 3/9/2026: create 2.027 · update 1.254 · delete 88 ·
// cascade_delete 30 — the other five routes exist but have never written a
// row. They stay listed because the day one fires it must read as a word, not
// as raw English. 'login' was REMOVED: the Worker has no such call and never
// had one, so the entry described an event that cannot happen (principle 8).
// Anything else still shows raw, so a tenth verb is visible, not swallowed.
const _AUDIT_ACTION = {
  create:           { label: 'Δημιουργία',       cls: 'at-act-create' },
  update:           { label: 'Αλλαγή',           cls: 'at-act-update' },
  delete:           { label: 'Διαγραφή',         cls: 'at-act-delete' },
  // Heavier than a plain delete because it IS heavier: one click takes the
  // order plus its stops, national loads and consolidated memberships with it.
  cascade_delete:   { label: 'Ολική διαγραφή',   cls: 'at-act-cascade' },
  confirm:          { label: 'Επιβεβαίωση',      cls: 'at-act-create' },
  reverse:          { label: 'Αντιστροφή',       cls: 'at-act-delete' },
  invoice_override: { label: 'Παράκαμψη τιμολ.', cls: 'at-act-update' },
  upload:           { label: 'Ανέβασμα αρχείου', cls: 'at-act-create' },
};

// What a cascade actually swept, from the RPC's own count summary. Zero counts
// are dropped: ten "0"s per row would bury the one number that matters.
const _AUDIT_CASCADE = {
  order_stops:                   'στάσεις',
  national_loads:                'εθνικά φορτία',
  national_orders:               'εθνικές παραγγελίες',
  // Never deleted, only released — the never-delete rule for GROUPAGE LINES.
  groupage_lines_unassigned:     'γραμμές groupage σε Unassigned',
  consolidated_loads_deleted:    'ομαδοποιημένα φορτία',
  cons_load_memberships_removed: 'συμμετοχές σε ομαδοποίηση',
  ramp:                          'εγγραφές ράμπας',
  pallet_ledger:                 'κινήσεις παλετών',
};

// Table names are the Postgres names (orders, order_stops, pl_movements).
// Shown as-is, upper-cased: a label map here would be a second copy of the
// Worker's TABLES (principle 3), and it drifts the day a table is added.
function _auditTableLabel(t) {
  return t ? String(t).toUpperCase().replace(/_/g, ' ') : '—';
}

// A human handle for the record, when the snapshot carries one. The columns
// that act as a business key across the tables the trail covers (measured on
// the recorded trail: pl_movements.code, ct_round_trips.code, locations.name,
// national_loads.name, order_stops.stop_label, orders.reference). Nothing is
// looked up — no extra request; a record without one shows its id alone.
const _AUDIT_LABEL_KEYS = ['code', 'reference', 'name', 'stop_label', 'plate', 'license_plate'];
function _auditRecordLabel(e) {
  const snap = e._after || e._before;
  if (!snap) return '';
  for (const k of _AUDIT_LABEL_KEYS) {
    const v = snap[k];
    if (v !== null && v !== undefined && String(v).trim() !== '') return String(v);
  }
  return '';
}

/** cascade_delete: not a diff — the RPC's count of what the cascade took. */
function _auditCascadeHtml(e) {
  const s = e._after && typeof e._after === 'object' ? e._after : {};
  const swept = Object.entries(_AUDIT_CASCADE)
    .filter(([k]) => Number(s[k]) > 0)
    // "label: n", not "n label": Greek nouns would need singular/plural pairs
    // to read right at 1, and this matches the diff idiom of the same column.
    .map(([k, label]) => `${label}: ${Number(s[k])}`);
  return '<span class="at-dim">Διαγραφή εγγραφής και όσων κρέμονταν από αυτήν'
    + (swept.length ? ` — ${_auditEsc(swept.join(' · '))}` : '')
    + '</span>';
}

/** The ΑΛΛΑΓΗ cell: one line per entry, wrapping rather than cut. */
function _auditChangeHtml(e) {
  if (e.action === 'create') return '<span class="at-dim">Νέα εγγραφή</span>';
  if (e.action === 'delete') return '<span class="at-dim">Διαγραφή εγγραφής</span>';
  if (e.action === 'cascade_delete') return _auditCascadeHtml(e);
  if (e._chainBroken) {
    // Honest about WHY, not just that: the derivation is switched off while a
    // user/action filter is on, because the neighbour it needs is filtered out
    // server-side — see _auditAttachBefore.
    return '<span class="at-dim">άγνωστο — το φίλτρο κρύβει τη σειρά των αλλαγών</span>';
  }
  if (!e._before) {
    // Unknown is not "nothing changed" — see _auditAttachBefore.
    return '<span class="at-dim">άγνωστο — δεν καταγράφηκε η προηγούμενη τιμή</span>';
  }
  const diff = _auditDiff(e._before, e._after);
  if (!diff.length) return '<span class="at-dim">Αποθήκευση χωρίς αλλαγή πεδίου</span>';
  // A derived "before" is an INFERENCE and has to look like one. Measured on
  // the live page 3/9/2026: 36 of 37 diffs were derived, 1 was recorded — so
  // 97% of the column that answers "what changed" was a deduction wearing the
  // clothes of evidence, and its only tell was a title tooltip nobody hovers
  // over 200 rows to find. The '≈' and the muted left rule say it at a glance;
  // the tooltip stays for the detail. Legend above the table (_auditRenderBody).
  const der = e._derived;
  const title = der ? ' title="σε σύγκριση με την προηγούμενη καταγεγραμμένη κατάσταση της εγγραφής — συμπέρασμα, όχι καταγεγραμμένη τιμή"' : '';
  const approx = der ? '<span class="at-approx">≈</span>' : '';
  return `<span class="at-diff${der ? ' at-diff-derived' : ''}"${title}>` + diff.map((d) =>
    `<span class="at-diff-item"><b>${_auditEsc(_auditFieldLabel(d.field))}</b>: ` +
    `${approx}<span class="at-from">${_auditEsc(_auditFmtVal(d.from, d.field))}</span> → ` +
    `<span class="at-to">${_auditEsc(_auditFmtVal(d.to, d.field))}</span></span>`,
  ).join('<span class="at-sep"> · </span>') + '</span>';
}

/** Render one row. */
function _auditRow(e) {
  const when = _auditWhen(e.created_at);
  const act = _AUDIT_ACTION[e.action] || { label: e.action || '—', cls: 'at-act-update' };
  const label = _auditRecordLabel(e);
  const rid = e.record_id ? String(e.record_id) : '';
  // A link, not a <button>: the contract critic scrapes every button's text
  // into a committed, public file, and this text is data — record ids and
  // business keys (client names, references). Semantically it IS a link: "the
  // history of this record".
  const recBtn = rid
    ? `<a class="at-rec" href="#" title="Ιστορικό αυτής της εγγραφής" onclick="_auditFilterRecord('${_auditEsc(rid)}');return false">` +
      (label
        ? `<span class="at-rec-label">${_auditEsc(label)}</span><span class="at-rec-id">${_auditEsc(rid)}</span>`
        : `<span class="at-rec-id at-rec-only">${_auditEsc(rid)}</span>`) +
      '</a>'
    : '<span class="at-dim">—</span>';

  return `
    <tr>
      <td class="at-when" title="${_auditEsc(when.full)}">${_auditEsc(when.short)}</td>
      <td class="at-who">${e.actor ? `<span class="at-actor">${_auditEsc(e.actor)}</span><span class="at-role">${_auditEsc(e.role || '—')}</span>` : '<span class="at-dim">—</span>'}</td>
      <td class="at-action ${act.cls}">${_auditEsc(act.label)}</td>
      <td class="at-table-name">${_auditEsc(_auditTableLabel(e.table_name))}</td>
      <td class="at-record">${recBtn}</td>
      <td class="at-change">${_auditChangeHtml(e)}</td>
    </tr>`;
}

function _auditIsoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function _auditOptions(values, current, allLabel, labelFn) {
  const opts = [`<option value="">${allLabel}</option>`];
  const list = [...values];
  if (current && !list.includes(current)) list.push(current);
  for (const v of list.sort((a, b) => a.localeCompare(b, 'el'))) {
    opts.push(`<option value="${_auditEsc(v)}"${v === current ? ' selected' : ''}>${_auditEsc(labelFn ? labelFn(v) : v)}</option>`);
  }
  return opts.join('');
}

/** Rebuild the actor/table dropdowns from what the trail has shown so far. */
function _auditRefreshOptions() {
  const fa = document.getElementById('afActor');
  const ft = document.getElementById('afTable');
  if (fa) fa.innerHTML = _auditOptions(_auditSeenActors, _auditFilters.actor, 'Όλοι');
  if (ft) ft.innerHTML = _auditOptions(_auditSeenTables, _auditFilters.table, 'Όλοι', _auditTableLabel);
}

function _auditHasFilter() {
  return Object.values(_auditFilters).some((v) => v && String(v).trim());
}

/**
 * Render the Audit Trail page. Registered in core/router.js under Admin.
 */
async function renderAuditTrail() {
  const c = document.getElementById('content');
  if (!c) return;

  const role = (JSON.parse(localStorage.getItem('tms_user') || '{}').role) || '';

  // Direct-Airtable mode: there is no trail. Say so, rather than showing an
  // empty table that reads as "nothing was ever changed".
  if (typeof USE_PROXY === 'undefined' || !USE_PROXY) {
    c.innerHTML = `
      <div class="at-head"><h2 class="at-title">Ιστορικό Ενεργειών</h2></div>
      <div class="empty-state">
        <p><b>Το ιστορικό ενεργειών δεν είναι διαθέσιμο σε αυτή τη λειτουργία.</b></p>
        <p class="txt-dim">Η εφαρμογή μιλάει απευθείας στο Airtable, που δεν κρατά αρχείο του ποιος
        άλλαξε τι. Το ιστορικό ζει στον νέο backend και δουλεύει μόλις η εφαρμογή στραφεί σε αυτόν.</p>
      </div>`;
    return;
  }

  if (!AUDIT_UI_ROLES.includes(role)) {
    c.innerHTML = typeof showAccessDenied === 'function'
      ? showAccessDenied()
      : '<div class="empty-state"><p>Ο ρόλος σου δεν έχει πρόσβαση στο ιστορικό ενεργειών.</p></div>';
    return;
  }

  const f = _auditFilters;
  c.innerHTML = `
    <div class="at-head">
      <h2 class="at-title">Ιστορικό Ενεργειών</h2>
      <span class="at-sub" id="afSub">φόρτωση…</span>
      <!-- label and select are siblings, not nested: the contract critic reads
           every <label>'s text, and a nested select would put the option list
           (usernames, table names — data) into a committed, public file. -->
      <span class="at-filter"><label for="afActor">Χρήστης:</label>
        <select id="afActor" class="filter-select"></select>
      </span>
      <span class="at-filter"><label for="afTable">Πίνακας:</label>
        <select id="afTable" class="filter-select"></select>
      </span>
      <span class="at-filter"><label for="afAction">Ενέργεια:</label>
        <!-- One option per verb the Worker can write (_AUDIT_ACTION). The list
             held three, while the server filters on an exact match — so the
             30 recorded 'cascade_delete' rows were unreachable from «Διαγραφή»
             and looked like they did not exist. -->
        <select id="afAction" class="filter-select">
          <option value="">Όλες</option>
          ${Object.entries(_AUDIT_ACTION).map(([v, a]) =>
            `<option value="${v}">${_auditEsc(a.label)}</option>`).join('')}
        </select>
      </span>
      <span class="at-filter"><label for="afRange">Εύρος:</label>
        <select id="afRange" class="filter-select">
          <option value="all">Τελευταίες ${AUDIT_LIMIT}</option>
          <option value="7">7 ημέρες</option>
          <option value="30">30 ημέρες</option>
          <option value="90">90 ημέρες</option>
          <option value="custom">Προσαρμοσμένο…</option>
        </select>
      </span>
      <span class="at-dates" id="afDates" hidden>
        <input id="afSince" type="date" class="filter-select" value="${_auditEsc(f.since)}" title="Από">
        <span class="at-dim">–</span>
        <input id="afUntil" type="date" class="filter-select" value="${_auditEsc(f.until)}" title="Έως">
      </span>
      <span class="at-spacer"></span>
      <input id="afRecord" class="search-input at-search" placeholder="Αναζήτηση εγγραφής…" title="Ακριβές id εγγραφής (recXXXX ή αριθμός) — Enter για αναζήτηση" value="${_auditEsc(f.record_id)}">
      <button type="button" class="btn btn-ghost btn-sm" id="afClear">Καθαρισμός</button>
    </div>
    <div id="auditBody"><div class="loading">Φόρτωση…</div></div>
    <style>
    /* Header: title + count + filters + search on one 58px line (Figma 163:605). */
    .at-head { display: flex; align-items: center; gap: 10px; min-height: 58px; padding: 0 0 8px; flex-wrap: wrap; }
    .at-title { font-family: 'Syne', sans-serif; font-size: 18px; font-weight: 700; color: var(--text); margin: 0; }
    .at-sub { font-size: var(--text-sm); color: var(--text-dim); margin-right: 6px; }
    .at-filter { display: inline-flex; align-items: center; gap: 5px; font-size: var(--text-sm); color: var(--text-mid); white-space: nowrap; }
    /* max-width: the Πίνακας list holds "PARTNER ASSIGNMENTS" and would size
       the control to its longest option, pushing the search off the 58px line. */
    .at-filter .filter-select { background: var(--bg-card); border-color: var(--silver-light); color: var(--text); font-weight: 500; max-width: 150px; }
    .at-dates { display: inline-flex; align-items: center; gap: 4px; }
    .at-dates[hidden] { display: none; }
    .at-spacer { flex: 1 0 0; }
    .at-search { max-width: 220px; height: 34px; padding: 0 12px; font-size: var(--text-sm); }
    /* 40px rows (Figma 163:641), 16px cell padding, header at body size. The
       global thead th is 10px/1px-tracking; the frame reads at 13px. No
       nowrap on cells: a long change wraps and the row grows — never cut (#6). */
    .at-table thead th { height: 34px; padding: 0 16px; font-size: var(--text-body); font-weight: 600; letter-spacing: 0; color: var(--text-mid); background: var(--surface-sunken); border-bottom: 1px solid var(--border-row); }
    .at-table tbody td { height: 40px; padding: 4px 16px; font-size: var(--text-sm); color: var(--text-mid); border-bottom: 1px solid var(--border-row); line-height: 1.35; }
    .at-table tbody tr { cursor: default; }
    .at-table th.at-when, .at-table td.at-when { width: 150px; white-space: nowrap; color: var(--text); font-variant-numeric: tabular-nums; }
    .at-table th.at-who, .at-table td.at-who { width: 170px; }
    .at-table th.at-action, .at-table td.at-action { width: 140px; }
    .at-table th.at-table-name, .at-table td.at-table-name { width: 190px; }
    .at-table th.at-record, .at-table td.at-record { width: 170px; }
    .at-who { display: table-cell; }
    .at-actor { display: block; font-size: var(--text-body); font-weight: 500; color: var(--text); }
    .at-role { display: block; font-size: var(--text-xs); color: var(--text-dim); }
    /* Action idiom of THIS screen (owner 2/9: each screen keeps its own):
       plain words, weight carries the meaning — total deletion heaviest.
       SELECTOR, not just the class: the .at-table tbody td rule above sets a color
       with specificity 0-1-2 and beat the bare 0-1-0 classes, so Δημιουργία
       and Αλλαγή rendered in the SAME grey while only Διαγραφή (which changed
       weight, not colour) stood out. Measured 3/9/2026 — the classes existed
       and did nothing. */
    .at-table tbody td.at-act-create  { color: var(--text); font-weight: 500; }
    .at-table tbody td.at-act-update  { color: var(--text-mid); }
    .at-table tbody td.at-act-delete  { color: var(--text); font-weight: 700; }
    .at-table tbody td.at-act-cascade { color: var(--danger-strong); font-weight: 700; }
    .at-rec { text-decoration: none; cursor: pointer; color: var(--text-mid); display: flex; flex-direction: column; }
    .at-rec:hover .at-rec-label, .at-rec:hover .at-rec-only { color: var(--accent-text); text-decoration: underline; }
    .at-rec-label { color: var(--text); }
    .at-rec-id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: var(--text-xs); color: var(--text-dim); }
    .at-rec-only { font-size: var(--text-sm); color: var(--text-mid); }
    .at-change { color: var(--text); }
    /* Derived vs recorded, visible without hovering — see _auditChangeHtml. */
    .at-diff-derived { display: inline-block; border-left: 2px solid var(--silver); padding-left: 8px; }
    .at-approx { color: var(--silver-dim); font-weight: 600; margin-right: 2px; }
    .at-legend { display: flex; align-items: baseline; gap: 5px; padding: 0 0 6px; font-size: var(--text-xs); color: var(--text-dim); }
    .at-legend .at-approx { font-size: var(--text-sm); }
    .at-diff-item b { font-weight: 500; color: var(--text-mid); }
    .at-from { color: var(--text-dim); }
    .at-to { color: var(--text); }
    .at-sep { color: var(--text-dim); }
    .at-dim { color: var(--text-dim); }
    </style>`;

  document.getElementById('afAction').value = f.action;
  document.getElementById('afRange').value = _auditRange;
  document.getElementById('afDates').hidden = _auditRange !== 'custom';
  _auditRefreshOptions();

  const apply = () => {
    _auditFilters.actor = document.getElementById('afActor').value;
    _auditFilters.table = document.getElementById('afTable').value;
    _auditFilters.action = document.getElementById('afAction').value;
    _auditFilters.record_id = document.getElementById('afRecord').value.trim();
    const range = document.getElementById('afRange').value;
    _auditRange = range;
    document.getElementById('afDates').hidden = range !== 'custom';
    if (range === 'custom') {
      _auditFilters.since = document.getElementById('afSince').value;
      _auditFilters.until = document.getElementById('afUntil').value;
    } else {
      _auditFilters.since = range === 'all' ? '' : _auditIsoDaysAgo(Number(range));
      _auditFilters.until = '';
    }
    _auditRenderBody();
  };
  for (const id of ['afActor', 'afTable', 'afAction', 'afRange', 'afSince', 'afUntil']) {
    document.getElementById(id).onchange = apply;
  }
  // change fires on Enter and on blur for a text input — one handler, one fetch.
  document.getElementById('afRecord').onchange = apply;
  document.getElementById('afClear').onclick = async () => {
    _auditFilters = { record_id: '', table: '', actor: '', action: '', since: '', until: '' };
    _auditRange = 'all';
    await renderAuditTrail();
  };

  await _auditRenderBody();
}

/** Fetch + paint just the results area, so filters keep their values. */
async function _auditRenderBody() {
  const body = document.getElementById('auditBody');
  const sub = document.getElementById('afSub');
  if (!body) return;
  body.innerHTML = '<div class="loading">Φόρτωση…</div>';
  if (sub) sub.textContent = 'φόρτωση…';

  await _auditFetch();
  _auditRefreshOptions();

  // Empty and failed are different states (DESIGN.md #7): "nothing recorded"
  // must never look like "the load failed".
  if (_auditError) {
    if (sub) sub.textContent = 'δεν φορτώθηκε';
    body.innerHTML = typeof showError === 'function'
      ? showError(_auditError)
      : `<div class="empty-state"><p><b>${_auditEsc(_auditError)}</b></p></div>`;
    return;
  }
  if (!_auditEntries.length) {
    if (sub) sub.textContent = '0 εγγραφές';
    body.innerHTML = typeof showEmpty === 'function'
      ? showEmpty('Καμία καταγεγραμμένη ενέργεια για αυτά τα φίλτρα', 'Άνοιξε το εύρος ή καθάρισε τα φίλτρα.')
      : '<div class="empty-state"><p>Καμία καταγεγραμμένη ενέργεια για αυτά τα φίλτρα.</p></div>';
    return;
  }

  _auditAttachBefore(_auditEntries);

  if (sub) {
    const n = _auditEntries.length;
    const scope = _auditHasFilter() ? ' για τα φίλτρα' : '';
    sub.textContent = n >= AUDIT_LIMIT ? `τελευταίες ${AUDIT_LIMIT} εγγραφές${scope}` : `${n} εγγραφές${scope}`;
    sub.title = n >= AUDIT_LIMIT ? 'Το όριο είναι 200 — στένεψε τα φίλτρα για παλαιότερες' : 'νεότερες πρώτα';
  }

  // Caption for the ΑΛΛΑΓΗ column, shown only when there is a '≈' on screen —
  // explaining a mark that is not there would be its own small lie.
  // ABOVE the table, not inside the <th>: tests/critics/contract.spec.js
  // scrapes every <th>'s full text into the committed tier-1 contract, so any
  // words added inside the header would delete the field "Αλλαγή" from it.
  const legend = _auditEntries.some((e) => e._derived)
    ? '<div class="at-legend"><span class="at-approx">≈</span>'
      + '<span>συμπέρασμα από την προηγούμενη καταγραφή της ίδιας εγγραφής — ο Worker δεν κατέγραψε την παλιά τιμή</span></div>'
    : '';

  body.innerHTML = `
    ${legend}
    <div class="table-wrap">
      <table class="at-table">
        <thead><tr>
          <th class="at-when">Πότε</th><th class="at-who">Ποιος</th><th class="at-action">Ενέργεια</th>
          <th class="at-table-name">Πίνακας</th><th class="at-record">Εγγραφή</th><th class="at-change">Αλλαγή</th>
        </tr></thead>
        <tbody>${_auditEntries.map(_auditRow).join('')}</tbody>
      </table>
    </div>`;
}
