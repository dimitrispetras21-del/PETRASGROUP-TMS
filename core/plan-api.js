// ═══════════════════════════════════════════════════════════════════════
// NATIONAL v5 — the one client of the Worker's /plan/* (globals planFetch, PlanError, PlanApi)
// ─────────────────────────────────────────────────────────────────────
// Plan: docs/superpowers/plans/2026-10-26-f4a-national-v5-screens.md, Task T1. Worker: worker/src/index.js
// handlePlan (PLAN_ROUTES, planError — the ONE error shape {error:{type, code, message}}).
// The binding notes of F2 (docs/superpowers/plans/2026-10-22-f2-national-v5-plan-functions.md, decision 44) this
// file keeps, each one a way a v5 record would be written twice or a refusal would read as success:
//   - ONE fetch per call, whatever the answer. Never core/api.js _atRetry (it re-sends every 5xx and every network
//     drop up to three times), never _enqueue, never the offline queue (it replays writes from localStorage later).
//     A 500 plan_unknown may have been SAVED: only the user, after looking at the board, presses again — with the
//     SAME request_id, so the DB answers the first result (replayed) instead of writing again.
//   - request_id only on the routes whose RPC takes it (three creations); dry_run only on the four with a dry run.
//     Anywhere else the DB refuses the key as bad_input, so the client refuses it first, without sending.
//   - The caller owns the request_id through PlanApi.slot(), in memory only: sessionStorage and history.state are
//     copied by «Διπλότυπη καρτέλα», and two tabs with one id would be one creation reported twice.
//   - The message shown is error.message of the Worker's body, as it came: no Greek text of the Worker or the DB is
//     copied into the front end (principle 3). The local texts below exist only for answers that carry no body.
//   - Never a silent {}: a 2xx that is not JSON is an error (principle 1).
//   - Only the headers Authorization and Content-Type: the Worker's CORS allows nothing else, and a refused preflight
//     would fail every request (so no x-tms-* header here).
// At load it only defines its three globals: no listener, timer, observer or fetch (tests/wn5-contract.test.js).
// ═══════════════════════════════════════════════════════════════════════
(function () {
'use strict';

const KIND = Object.freeze({
  REFUSAL: 'refusal',       // 422 any type (PLAN_RULE | LOCAL_RELAY_RULE | STOCK_RULE), except the two below
  STALE: 'stale',           // 422 stale_confirm: the list changed since the dry run
  REUSED: 'reused',         // 422 request_reused: the FIRST submission was saved, no ids come back
  NEED_TOKEN: 'need_token', // 428: the act needs its dry-run list first
  CLOSED: 'closed',         // 409 writes_closed (until day L)
  BUSY: 'busy',             // 409 busy_retry: nothing was kept
  UNKNOWN: 'unknown',       // plan_unknown (422 live, 500 older), or no answer / a gateway page on a WRITE: maybe saved
  LEAK: 'leak',             // amount_leak (422 live, 500 older)
  SLOW: 'slow',             // 503 slow | db_refused
  SCHEMA: 'schema',         // 503 schema_behind | db_grant
  FAILED: 'failed',         // 500 plan_failed, or no answer on a read or a dry run
  FORBIDDEN: 'forbidden',   // 403 in the /plan shape (a role); the Origin gate's string 403 is CLIENT (config, logged)
  AUTH: 'auth',             // 401 (thrown as the session refusal of core/api.js)
  CLIENT: 'client',         // 400, 404, a local client_* code, a 2xx that is not JSON
  OFFLINE: 'offline',
});
// The Worker said «no» on purpose: shown to the user, never counted as an app error (the auditor's B-34 reads app_errors).
const DESIGNED = Object.freeze([KIND.REFUSAL, KIND.STALE, KIND.REUSED, KIND.NEED_TOKEN, KIND.CLOSED, KIND.BUSY, KIND.FORBIDDEN]);
// PLAN_ROUTES rows with dryRun:true (worker/src/index.js) — held equal by tests/wn5-plan-api-worker.test.mjs.
const DRY_ROUTES = Object.freeze(['POST /plan/move', 'PATCH /plan/rt/:id', 'POST /plan/rt/:id/clear', 'POST /plan/delete']);
// The 072 RPCs whose key list holds request_id — held equal by the same test.
const REQUEST_ROUTES = Object.freeze(['POST /plan/orders', 'POST /plan/pieces/split', 'POST /plan/local-loading']);
// 072 plan_h_replay accepts a uuid in either case; crypto.randomUUID() gives lower case v4.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The client's OWN texts: answers without a Worker body (no network, a proxy page) and client bugs refused before
// sending. None of them repeats a Worker text.
const LOCAL = Object.freeze({
  offline: 'Δεν υπάρχει σύνδεση — η πράξη δεν στάλθηκε· πάτησέ την ξανά όταν επανέλθει το δίκτυο',
  net_unknown: 'Χάθηκε η απάντηση του διακομιστή — η πράξη μπορεί να αποθηκεύτηκε· δες πρώτα τον πίνακα και μόνο αν λείπει πάτησε ξανά το ίδιο κουμπί',
  net_failed: 'Δεν ήρθε απάντηση από τον διακομιστή — τίποτα δεν διαβάστηκε',
  bad_answer: 'Η απάντηση του διακομιστή δεν διαβάζεται — ενημέρωσε τον Δημήτρη',
  client_bad_call: 'Λάθος κλήση της εφαρμογής προς το /plan — ενημέρωσε τον Δημήτρη',
  client_dry_route: 'Αυτή η πράξη δεν έχει προεπισκόπηση — ενημέρωσε τον Δημήτρη',
  client_request_route: 'Κωδικός αιτήματος σε πράξη που δεν τον δέχεται — ενημέρωσε τον Δημήτρη',
  client_request_id: 'Μη έγκυρος κωδικός αιτήματος — ενημέρωσε τον Δημήτρη',
  client_body_key: 'Το σώμα έχει κλειδί που ορίζει μόνο το planFetch — ενημέρωσε τον Δημήτρη',
  client_not_finite: 'Ένας αριθμός της φόρμας δεν είναι έγκυρος — τίποτα δεν στάλθηκε',
  client_slot_closed: 'Η φόρμα έκλεισε — άνοιξέ την ξανά',
  client_no_uuid: 'Ο browser δεν δίνει κωδικό αιτήματος (crypto.randomUUID) — ενημέρωσε τον Δημήτρη',
  origin: 'Ο διακομιστής δεν δέχεται αυτή τη διεύθυνση της εφαρμογής (Origin) — ρύθμιση, όχι δικαίωμα· ενημέρωσε τον Δημήτρη',
});

class PlanError extends Error {
  constructor(f) {
    super(f.message);
    this.name = 'PlanError';
    this.status = f.status;
    this.type = f.type;
    this.code = f.code;
    this.kind = f.kind;
    this.write = f.write;
    this.maybeSaved = f.maybeSaved;
    this.data = f.data;
    this.route = f.route;
    // logError (core/utils.js) marks an error with _kind 'offline' as informational, out of the error counts.
    if (f.kind === KIND.OFFLINE) this._kind = 'offline';
  }
}

function isDesigned(err) { return !!err && DESIGNED.includes(err.kind); }

// 'PATCH /plan/rt/123?x' → 'PATCH /plan/rt/:id' — the resource form the Worker's messages and the logs use.
function routeOf(method, path) {
  const p = String(path || '').split('?')[0].replace(/\/\d+(?=\/|$)/g, '/:id');
  return `${String(method || '').toUpperCase()} ${p}`;
}

function _log(e, quiet) {
  if (isDesigned(e)) return;
  if (quiet && quiet.includes(e.code)) return;   // opts.designed: a code the CALLER expects and shows (Ε-2)
  try { if (typeof logError === 'function') logError(e, 'planFetch ' + e.route); } catch (_) { /* reporting never cascades */ }
}
function _make(f, quiet) { const e = new PlanError(f); _log(e, quiet); return e; }
function _local(code, kind, route, write) {
  const net = code === 'net_unknown' || code === 'net_failed';
  return _make({ status: 0, type: net ? 'NETWORK' : 'CLIENT', code, message: LOCAL[code], kind, write,
    maybeSaved: kind === KIND.UNKNOWN, data: null, route });
}

// JSON.stringify sends Infinity / NaN as null: a silent change of meaning (a rate «cleared»). Refused here, the
// same rule the Worker keeps (planNonFinite), so the form says it before anything is sent.
function _nonFinite(v) {
  if (typeof v === 'number') return !Number.isFinite(v);
  if (Array.isArray(v)) return v.some(_nonFinite);
  if (v && typeof v === 'object') return Object.values(v).some(_nonFinite);
  return false;
}

function _kindOf(status, code, write) {
  // By code first: the live Worker answers both with PLAN_NO_RESEND = 422 (review of PR #90, finding 1 — 422 is
  // a status core/api.js _atRetry never re-sends), so read by status alone a maybe-saved write would show as a
  // plain refusal («not saved»). The 500 branch below keeps the older status as well.
  if (code === 'plan_unknown') return KIND.UNKNOWN;
  if (code === 'amount_leak') return KIND.LEAK;
  if (status === 403) return KIND.FORBIDDEN;
  if (status === 428) return KIND.NEED_TOKEN;
  if (status === 422) return code === 'stale_confirm' ? KIND.STALE : code === 'request_reused' ? KIND.REUSED : KIND.REFUSAL;
  if (status === 409) return code === 'writes_closed' ? KIND.CLOSED : code === 'busy_retry' ? KIND.BUSY : KIND.CLIENT;
  if (status === 500) {
    if (code === 'amount_leak') return KIND.LEAK;
    if (code === 'plan_failed') return KIND.FAILED;
    if (code === 'plan_unknown') return KIND.UNKNOWN;
    return write ? KIND.UNKNOWN : KIND.FAILED;
  }
  if (status === 503) return code === 'schema_behind' || code === 'db_grant' ? KIND.SCHEMA : KIND.SLOW;
  // A gateway (502/504): the Worker's COMMIT may have happened before the link dropped.
  if (status >= 500) return write ? KIND.UNKNOWN : KIND.FAILED;
  return KIND.CLIENT;   // 400, 404 and anything else: a client bug, logged
}

async function planFetch(method, path, opts) {
  const o = opts || {};
  const m = String(method || '').toUpperCase();
  const route = routeOf(m, path);
  const write = m !== 'GET' && o.dry !== true;
  if ((m !== 'GET' && m !== 'POST' && m !== 'PATCH') || typeof path !== 'string' || !/^\/plan\//.test(path)) {
    throw _local('client_bad_call', KIND.CLIENT, route, write);
  }
  let raw;
  if (m === 'GET') {
    if (o.body !== undefined || o.dry !== undefined || o.requestId !== undefined) throw _local('client_bad_call', KIND.CLIENT, route, false);
  } else {
    const src = o.body === undefined ? {} : o.body;
    if (!src || typeof src !== 'object' || Array.isArray(src)) throw _local('client_bad_call', KIND.CLIENT, route, write);
    // The two keys planFetch owns: a caller that writes them itself bypasses the route checks below.
    if (Object.prototype.hasOwnProperty.call(src, 'dry_run') || Object.prototype.hasOwnProperty.call(src, 'request_id')) {
      throw _local('client_body_key', KIND.CLIENT, route, write);
    }
    const body = Object.assign({}, src);   // never touch the caller's form state
    if (o.dry !== undefined) {
      if (o.dry !== true || !DRY_ROUTES.includes(route)) throw _local('client_dry_route', KIND.CLIENT, route, write);
      body.dry_run = true;
    }
    if (o.requestId !== undefined) {
      // never on a dry run: the 072b handover takes request_id on its execution only (H-5)
      if (!REQUEST_ROUTES.includes(route) || o.dry === true) throw _local('client_request_route', KIND.CLIENT, route, write);
      if (typeof o.requestId !== 'string' || !UUID.test(o.requestId)) throw _local('client_request_id', KIND.CLIENT, route, write);
      body.request_id = o.requestId;
    }
    if (_nonFinite(body)) throw _local('client_not_finite', KIND.CLIENT, route, write);
    raw = JSON.stringify(body);
  }
  // Same rule as the facade (core/api.js, the 5/10 storm): after the first 401 nothing is sent and nothing logged.
  // req = null on purpose, here and on the 401 below: the facade's req is its Level-A request id, sent as an
  // x-tms-* header; /plan/* sends Authorization + Content-Type only (the Worker's CORS), so no id exists to tie the
  // session row to — the `where` («plan POST /plan/move») names the call instead.
  if (typeof tmsSessionGone === 'function' && tmsSessionGone()) throw tmsSessionRefuse(null);
  // Offline: refused loudly and NOT queued — a queued v5 write would be replayed later without the user.
  if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) throw _local('offline', KIND.OFFLINE, route, write);
  let jwt = null;
  try { jwt = localStorage.getItem('tms_jwt'); } catch (_) { jwt = null; }
  if (!jwt) throw tmsSessionExpired('plan ' + route, null);
  const headers = { Authorization: 'Bearer ' + jwt };
  if (raw !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    // _fetchWithTimeout (core/api.js) is a plain fetch with an abort timer and cache:'no-store' — no retry in it.
    res = await _fetchWithTimeout(PROXY_URL + path, { method: m, headers, body: raw }, o.timeoutMs || 30000);
  } catch (_) {
    // No answer (network, abort, timeout): on a write the COMMIT may have happened — never «not saved».
    throw _local(write ? 'net_unknown' : 'net_failed', write ? KIND.UNKNOWN : KIND.FAILED, route, write);
  }
  if (res.status === 401) throw tmsSessionExpired('plan ' + route, null);
  let text = null;
  try { text = await res.text(); } catch (_) { text = null; }
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch (_) { data = null; } }
  if (res.ok) {
    if (data && typeof data === 'object') return data;
    // A 2xx the client cannot read: on a write the Worker did answer, so it may well have saved.
    throw _make({ status: res.status, type: 'CLIENT', code: 'bad_answer', message: LOCAL.bad_answer, kind: KIND.CLIENT,
      write, maybeSaved: write, data: null, route });
  }
  const eb = data && data.error;
  const quiet = Array.isArray(o.designed) ? o.designed.map(String) : null;
  if (eb && typeof eb === 'object') {
    const code = String(eb.code || '');
    const kind = _kindOf(res.status, code, write);
    throw _make({ status: res.status, type: String(eb.type || ''), code, message: String(eb.message || code), kind, write,
      maybeSaved: kind === KIND.UNKNOWN || (kind === KIND.LEAK && write), data, route }, quiet);
  }
  // Not the /plan shape: the Origin gate's string error (403) — a configuration fault (a new domain such as
  // tms.petrasgroup.com), not a role, so NOT a designed answer: kind client, the client's own Greek words, logged.
  // /app-errors from the same page is refused by the same gate, so the copy logError keeps in localStorage
  // (tms_errors) is the trace. A gateway or proxy page: loud too.
  const origin = res.status === 403 && typeof eb === 'string';
  const kind = origin ? KIND.CLIENT : res.status >= 500 ? (write ? KIND.UNKNOWN : KIND.FAILED) : KIND.CLIENT;
  const message = origin ? LOCAL.origin : kind === KIND.UNKNOWN ? LOCAL.net_unknown : kind === KIND.FAILED ? LOCAL.net_failed : LOCAL.bad_answer;
  throw _make({ status: res.status, type: origin ? 'CLIENT' : 'NETWORK', code: origin ? 'origin' : 'bad_answer',
    message, kind, write, maybeSaved: kind === KIND.UNKNOWN, data, route }, quiet);
}

function _uuid() {
  if (typeof crypto === 'undefined' || !crypto || typeof crypto.randomUUID !== 'function') throw _local('client_no_uuid', KIND.CLIENT, 'slot', false);
  return crypto.randomUUID();
}
// One request_id per open create form AND per RPC (F2 note 3): the same id on every press and after a lost answer,
// plan_unknown, busy_retry or slow; a new one only after a CONFIRMED 200 (confirm) or when the form closes (close).
// Kept in this closure only — never sessionStorage, localStorage, history.state or the URL.
function slot() {
  let id = _uuid();
  return Object.freeze({
    get id() { if (id === null) throw _local('client_slot_closed', KIND.CLIENT, 'slot', false); return id; },
    confirm() { if (id !== null) id = _uuid(); },
    close() { id = null; },
  });
}

const PlanApi = Object.freeze({ KIND, isDesigned, DRY_ROUTES, REQUEST_ROUTES, routeOf, slot });
window.planFetch = planFetch;
window.PlanError = PlanError;
window.PlanApi = PlanApi;
})();
