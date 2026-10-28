// core/plan-config.js — National v5 F5 (FE-1): has day L happened? ONE answer, from the base, for every screen.
// Plan: docs/superpowers/plans/2026-10-28-f5-national-v5-cutover.md, Task F. Worker: GET /plan/config (Task W1)
// → {cutover_day, opened_at, writes_open}; the base writes cutover_day once, in 074 (plan_config, one row).
//   - 'after'   = cutover_day is set: 074 ran. From that moment the bridge exists and the base refuses any new
//                 NL / GL / CL (plan:legacy_frozen), so a screen stops writing the old model — whatever today's date.
//   - 'before'  = cutover_day null, or 404 no_route: a Worker without the route (before deploy 1, or rolled back
//                 to one) has no day L either. The known gap, like LOOKUPS_PENDING in core/plan-ids.js: not logged.
//   - 'unknown' = no answer, a refusal, or a body the client cannot read. NEVER silently 'before' (principle 1):
//                 the caller shows it and decides; the failure is logged once, here or by planFetch.
// No screen computes the cut from a date (principle 3): the date is returned for display only.
// Only a definite answer is kept; a failure is not, so the next call reads again (a user's act — never a retry
// inside load()). 'after' is final. 'before' is kept BEFORE_TTL_MS only: a tab opened at 14:00 must not go on
// reading the old model after 074 runs at 15:30 and soft-deletes the NLs it would show. A write path asks with
// {fresh:true} (one GET per save of a VS order); a fresh read that fails forgets the old 'before' too.
// Callers guard with typeof PlanConfig: app.html loads this file only from stream (e)'s bump on (F5 plan §10).
// Nothing at load: the first call to load() is the first fetch. UMD like core/plan-ids.js.
(function (root) {
  'use strict';
  const STATE = Object.freeze({ BEFORE: 'before', AFTER: 'after', UNKNOWN: 'unknown' });
  const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
  const BEFORE_TTL_MS = 5 * 60 * 1000;
  let _known = null;
  let _knownAt = 0;
  let _inflight = null;

  function _result(state, cutoverDay, writesOpen, err) {
    return Object.freeze({ state, cutoverDay: cutoverDay || null, writesOpen: writesOpen === true, err: err || null });
  }
  // A local error in the shape of planFetch's errors, so every screen reads err.kind / err.message the same way.
  function _err(code, message) {
    const f = { message, status: 0, type: 'CLIENT', code, kind: 'client', write: false, maybeSaved: false, data: null, route: 'GET /plan/config' };
    return typeof PlanError === 'function' ? new PlanError(f) : Object.assign(new Error(message), f, { name: 'PlanError' });
  }
  function _log(e) {
    try { if (typeof logError === 'function') logError(e, 'PlanConfig.load'); } catch (_) { /* reporting never cascades */ }
  }

  // a real calendar day: '2026-13-45' matches the pattern but is no day, and must not read as 'after'
  function _isDay(s) {
    const m = typeof s === 'string' && DAY.exec(s);
    if (!m) return false;
    const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return t.getUTCFullYear() === +m[1] && t.getUTCMonth() === +m[2] - 1 && t.getUTCDate() === +m[3];
  }
  function _keep(r) { _known = r; _knownAt = Date.now(); return r; }
  function _read(d) {
    const day = d && typeof d === 'object' ? d.cutover_day : undefined;
    const okDay = day === null || _isDay(day);
    if (!okDay || typeof d.writes_open !== 'boolean') return null;
    return day === null ? _result(STATE.BEFORE, null, d.writes_open) : _result(STATE.AFTER, day, d.writes_open);
  }

  function load(opts) {
    const fresh = !!(opts && opts.fresh);
    if (_known && (_known.state === STATE.AFTER || (!fresh && Date.now() - _knownAt < BEFORE_TTL_MS))) return Promise.resolve(_known);
    _known = null;
    if (_inflight) return _inflight;
    _inflight = (async () => {
      try {
        if (typeof planFetch !== 'function') {
          const e = _err('config_no_client', 'Η εφαρμογή φορτώθηκε χωρίς το core/plan-api.js — ενημέρωσε τον Δημήτρη');
          _log(e);
          return _result(STATE.UNKNOWN, null, false, e);
        }
        const d = await planFetch('GET', '/plan/config', { designed: ['no_route'] });
        const r = _read(d);
        if (!r) {
          const e = _err('config_shape', 'Η κατάσταση μετάβασης εθνικών ήρθε σε άγνωστη μορφή — ενημέρωσε τον Δημήτρη');
          _log(e);
          return _result(STATE.UNKNOWN, null, false, e);
        }
        return _keep(r);
      } catch (e) {
        if (e && e.status === 404 && e.code === 'no_route') {
          return _keep(_result(STATE.BEFORE, null, false));
        }
        // planFetch logs what is not a designed answer; a designed one (a 403: every role has GET /plan/config,
        // so a refusal is a PLAN_PERMS bug) it does not, so it is logged here.
        if (e && typeof PlanApi !== 'undefined' && PlanApi.isDesigned(e)) _log(e);
        return _result(STATE.UNKNOWN, null, false, e);
      } finally {
        _inflight = null;
      }
    })();
    return _inflight;
  }
  const PlanConfig = Object.freeze({ STATE, load });
  if (typeof module !== 'undefined' && module.exports) module.exports = PlanConfig;
  else root.PlanConfig = PlanConfig;
})(typeof window !== 'undefined' ? window : this);
