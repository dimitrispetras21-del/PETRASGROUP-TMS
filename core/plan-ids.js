// core/plan-ids.js — National v5 (F4α, T12): the numeric ids /plan/* wants, from ONE GET /plan/lookups per
// session (Ε-2). The app's pickers hold rec… legacy ids (fhLocSelect / fhClientSelect); 072 casts every id to
// bigint (072:605-678); /costs/lookups maps only vehicles and people and is closed to warehouse.
// Until the route is in the Worker (it is NOT in 39842d18: 404 no_route), load() says {ok:false} and the screens
// switch off only what needs a catalogue. A failed read is NOT kept: the next dialog asks again — a user's act,
// never an automatic retry (decision 44). A catalogue with a missing list is refused whole, never half-used.
// Nothing at load: the first call to load() is the first fetch. UMD like core/wi4-logic.js.
(function (root) {
  'use strict';
  const LISTS = Object.freeze({ location: 'locations', client: 'clients', truck: 'trucks', trailer: 'trailers', driver: 'drivers', partner: 'partners' });
  const LABEL = Object.freeze({
    location: (x) => x.name, client: (x) => x.company_name, truck: (x) => x.license_plate,
    trailer: (x) => x.license_plate, driver: (x) => x.full_name, partner: (x) => x.company_name,
  });
  let _data = null;
  let _inflight = null;
  // Ε-2: the live Worker 39842d18 has no GET /plan/lookups. Until it does, its 404 no_route is the KNOWN gap: the
  // screens say «Οι κατάλογοι δεν είναι διαθέσιμοι ακόμη» (principle 1), and planFetch is told not to log it — else
  // every pilot opening of a window would write an app_errors row that the auditor (B-34) counts as a client bug.
  // tests/wn5-plan-ids.test.mjs holds this flag to the Worker source: the day the route exists the test fails until
  // the flag goes false, and a 404 is a logged bug again.
  const LOOKUPS_PENDING = true;

  // A local refusal in the shape of planFetch's errors (kind 'client'), so every screen shows it the same way.
  // T1's PlanError constructor takes its fields as one object; without core/plan-api.js (a bare test sandbox)
  // a plain Error carries the same fields, so callers read err.kind / err.message the same way.
  function _err(code, message) {
    const f = { message, status: 0, type: 'CLIENT', code, kind: 'client', write: false, maybeSaved: false, data: null, route: 'GET /plan/lookups' };
    return typeof PlanError === 'function' ? new PlanError(f) : Object.assign(new Error(message), f, { name: 'PlanError' });
  }
  function _shapeOk(d) { return !!d && typeof d === 'object' && Object.values(LISTS).every((k) => Array.isArray(d[k])); }

  function load() {
    if (_data) return Promise.resolve({ ok: true });
    if (_inflight) return _inflight;
    _inflight = (async () => {
      try {
        const d = await planFetch('GET', '/plan/lookups', LOOKUPS_PENDING ? { designed: ['no_route'] } : undefined);
        if (!_shapeOk(d)) {
          const e = _err('ids_shape', 'Οι κατάλογοι ήρθαν χωρίς όλες τις λίστες — ενημέρωσε τον Δημήτρη');
          if (typeof logError === 'function') logError(e, 'PlanIds.load');
          return { ok: false, err: e };
        }
        _data = d;
        return { ok: true };
      } catch (e) {
        return { ok: false, err: e };      // planFetch already logged what is not a designed answer (no_route: Ε-2, above)
      } finally {
        _inflight = null;
      }
    })();
    return _inflight;
  }
  function _rows(kind) {
    if (!Object.prototype.hasOwnProperty.call(LISTS, kind)) throw _err('ids_kind', 'Άγνωστος κατάλογος: ' + kind);
    return _data ? _data[LISTS[kind]] : [];
  }
  function id(kind, legacyId) {
    const hit = _rows(kind).find((x) => x.legacy_id === legacyId);
    if (!hit || !Number.isSafeInteger(hit.id)) {
      throw _err('ids_missing', 'Δεν βρέθηκε ο αριθμός της εγγραφής ' + String(legacyId) + ' (' + kind + ') — οι κατάλογοι δεν φορτώθηκαν ή η εγγραφή λείπει');
    }
    return hit.id;
  }
  function place(locationId) {
    const x = _rows('location').find((r) => r.id === locationId);
    return x ? { id: x.id, legacy_id: x.legacy_id, name: x.name, address: x.address == null ? null : x.address,
      city: x.city == null ? null : x.city, phone: x.phone == null ? null : x.phone } : null;
  }
  function list(kind) {
    return _rows(kind)
      .map((x) => ({ id: x.id, legacy_id: x.legacy_id, label: String(LABEL[kind](x) || '—'), active: x.active !== false }))
      .sort((a, b) => a.label.localeCompare(b.label, 'el'));
  }
  // the one hub of the catalogue (072:86 refuses to run without exactly one), or null when not loaded / not one
  function hub() {
    const h = _rows('location').filter((r) => r.is_hub === true);
    return h.length === 1 ? h[0].id : null;
  }

  const PlanIds = Object.freeze({ load, id, place, list, hub });
  if (typeof module !== 'undefined' && module.exports) module.exports = PlanIds;
  else root.PlanIds = PlanIds;
})(typeof window !== 'undefined' ? window : this);
