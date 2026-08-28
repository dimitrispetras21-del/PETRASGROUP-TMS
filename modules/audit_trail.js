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
// ============================================================================

// Server-side roles allowed to read the trail (mirrors AUDIT_READERS in the
// backend's src/routes/audit.js). Checked here only to show an honest message
// instead of a 403; the SERVER is the real boundary, this is presentation.
const AUDIT_UI_ROLES = ['owner', 'management'];

// AT-7: κλικ στο record id → το trail φιλτράρει στο ιστορικό ΤΟΥ record.
function _auditFilterRecord(id) {
  const inp = document.getElementById('afRecord');
  if (inp) inp.value = id;
  _auditFilters.record_id = id;
  document.getElementById('afApply')?.click();
}
window._auditFilterRecord = _auditFilterRecord;

let _auditFilters = { record_id: '', table: '', actor: '', action: '', since: '', until: '' };
let _auditEntries = [];
let _auditLoading = false;
let _auditError = '';

/**
 * Fetch the trail with the current filters.
 * @returns {Promise<void>} resolves once _auditEntries / _auditError are set.
 */
async function _auditFetch() {
  _auditLoading = true;
  _auditError = '';
  try {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(_auditFilters)) {
      if (v && String(v).trim()) qs.set(k, String(v).trim());
    }
    qs.set('limit', '200');

    const token = localStorage.getItem('tms_jwt');
    if (!token) throw new Error('No session token. Sign in again.');

    const res = await fetch(`${PROXY_URL}/audit?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 403) throw new Error('Your role cannot view the audit trail.');
    if (res.status === 401) throw new Error('Session expired. Sign in again.');
    if (!res.ok) throw new Error(`Could not load the audit trail (${res.status}).`);

    const data = await res.json();
    _auditEntries = Array.isArray(data.entries) ? data.entries : [];
  } catch (e) {
    _auditEntries = [];
    _auditError = e.message || 'Could not load the audit trail.';
    if (typeof logError === 'function') logError(e, 'auditTrail:fetch');
  } finally {
    _auditLoading = false;
  }
}

/** Format an ISO timestamp for display, local time, seconds included. */
function _auditWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  return d.toLocaleString('el-GR', { dateStyle: 'short', timeStyle: 'medium' });
}

/**
 * Diff two audit JSON blobs into the fields that actually changed.
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
    const fromV = JSON.stringify(b[k] ?? null);
    const toV = JSON.stringify(a[k] ?? null);
    if (fromV !== toV) out.push({ field: k, from: b[k] ?? null, to: a[k] ?? null });
  }
  return out;
}

function _auditVal(v) {
  if (v === null || v === undefined || v === '') return '<span class="txt-dim">(empty)</span>';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  const clipped = s.length > 120 ? s.slice(0, 120) + '…' : s;
  // escapeHtml is the shared helper; fall back to a local escape if absent so a
  // missing util can never turn stored data into markup.
  return typeof escapeHtml === 'function'
    ? escapeHtml(clipped)
    : clipped.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Render one row, with its changed-field breakdown. */
function _auditRow(e, idx) {
  const diff = e.action === 'update' ? _auditDiff(e.before_data, e.after_data) : [];
  const actionCls = e.action === 'delete' ? 'badge-red' : e.action === 'create' ? 'badge-green' : 'badge-blue';

  let detail = '';
  if (e.action === 'update' && diff.length) {
    detail = diff
      .map(
        (d) =>
          `<div class="audit-diff"><b>${_auditVal(d.field)}</b>: ` +
          `<span class="audit-from">${_auditVal(d.from)}</span> → ` +
          `<span class="audit-to">${_auditVal(d.to)}</span></div>`,
      )
      .join('');
  } else if (e.action === 'create') {
    detail = '<div class="audit-diff txt-dim">Record created</div>';
  } else if (e.action === 'delete') {
    detail = '<div class="audit-diff txt-dim">Record deleted</div>';
  }
  if (e.action === 'update' && !diff.length) {
    detail = '<div class="audit-diff txt-dim">Saved with no field changes</div>';
  }

  return `
    <tr>
      <td class="nowrap">${_auditWhen(e.created_at)}</td>
      <td>${_auditVal(e.actor)}<div class="txt-dim">${_auditVal(e.role)}</div></td>
      <td><span class="badge ${actionCls}">${_auditVal(e.action)}</span></td>
      <td>${_auditVal(e.table_name)}</td>
      <td class="mono">${e.record_id ? `<button type="button" style="appearance:none;border:0;background:none;font:inherit;color: var(--accent-text);cursor:pointer;padding:0" title="Ιστορικό αυτής της εγγραφής" onclick="_auditFilterRecord('${e.record_id}')">${_auditVal(e.record_id)}</button>` : '—'}</td>
      <td>${detail}</td>
    </tr>`;
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
      <div class="page-header"><h2>Audit Trail</h2></div>
      <div class="empty-state">
        <p><b>The audit trail is not available in this mode.</b></p>
        <p class="txt-dim">The app is currently talking to Airtable directly, which keeps no
        server-side record of who changed what. The trail lives on the new backend and starts
        working when the app is switched over to it.</p>
      </div>`;
    return;
  }

  if (!AUDIT_UI_ROLES.includes(role)) {
    c.innerHTML = typeof showAccessDenied === 'function'
      ? showAccessDenied()
      : '<div class="empty-state"><p>Your role cannot view the audit trail.</p></div>';
    return;
  }

  c.innerHTML = `
    <div class="page-header">
      <h2>Audit Trail</h2>
      <div class="txt-dim">Ποιος άλλαξε τι, και πότε. Server-side και tamper-resistant.</div>
    </div>
    <div class="filters" id="auditFilters">
      <input id="afRecord" placeholder="Record ID (recXXXX…)" value="${_auditFilters.record_id}">
      <input id="afTable"  placeholder="Table (e.g. orders)"   value="${_auditFilters.table}">
      <input id="afActor"  placeholder="User"                  value="${_auditFilters.actor}">
      <select id="afAction">
        <option value="">Όλες οι ενέργειες</option>
        <option value="create">Δημιουργίες</option>
        <option value="update">Ενημερώσεις</option>
        <option value="delete">Διαγραφές</option>
      </select>
      <input id="afSince" type="date" value="${_auditFilters.since}">
      <input id="afUntil" type="date" value="${_auditFilters.until}">
      <button class="btn" id="afApply">Apply</button>
      <button class="btn btn-ghost" id="afClear">Clear</button>
    </div>
    <div id="auditBody"><div class="loading">Loading…</div></div>`;

  document.getElementById('afAction').value = _auditFilters.action;

  document.getElementById('afApply').onclick = async () => {
    _auditFilters = {
      record_id: document.getElementById('afRecord').value,
      table: document.getElementById('afTable').value,
      actor: document.getElementById('afActor').value,
      action: document.getElementById('afAction').value,
      since: document.getElementById('afSince').value,
      until: document.getElementById('afUntil').value,
    };
    await _auditRenderBody();
  };
  document.getElementById('afClear').onclick = async () => {
    _auditFilters = { record_id: '', table: '', actor: '', action: '', since: '', until: '' };
    await renderAuditTrail();
  };

  await _auditRenderBody();
}

/** Fetch + paint just the results area, so filters keep their values. */
async function _auditRenderBody() {
  const body = document.getElementById('auditBody');
  if (!body) return;
  body.innerHTML = '<div class="loading">Loading…</div>';

  await _auditFetch();

  if (_auditError) {
    body.innerHTML = `<div class="empty-state"><p><b>${_auditVal(_auditError)}</b></p></div>`;
    return;
  }
  if (!_auditEntries.length) {
    body.innerHTML = `
      <div class="empty-state">
        <p>No matching activity.</p>
        <p class="txt-dim">Nothing recorded for these filters. Widen the date range or clear the filters.</p>
      </div>`;
    return;
  }

  body.innerHTML = `
    <div class="txt-dim" style="margin-bottom:8px">${_auditEntries.length} entries, newest first${
      _auditEntries.length >= 200 ? ' (showing the most recent 200, narrow the filters to see more)' : ''
    }</div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>Πότε</th><th>Ποιος</th><th>Ενέργεια</th><th>Πίνακας</th><th>Εγγραφή</th><th>Αλλαγή</th>
        </tr></thead>
        <tbody>${_auditEntries.map(_auditRow).join('')}</tbody>
      </table>
    </div>`;
}
