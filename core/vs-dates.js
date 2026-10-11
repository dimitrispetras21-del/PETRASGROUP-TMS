// ═══════════════════════════════════════════════════════════════════════
// VEROIA SWITCH — the Veroia day in ONE place (global VsDates)
// ─────────────────────────────────────────────────────────────────────
// Spec: docs/weekly-natl-redesign/PLAN.md §3.3–§3.4 (WP-A). Owner decision
// 11/10 21:10: a VS load has ONE Veroia day, `orders.cross_dock_date`, and
// every other place (the national load, its Veroia stop, the order's
// Cross-dock stop, the Ramp) follows it. Until now the rule lived only inside
// _syncVeroiaSwitch and each caller fed it a different copy of the order —
// the Weekly International assignment never asked for the cross-dock, so it
// rewrote the national load to the ±1 estimate. Two copies of a date rule
// drift (principle 3); this file is the one copy the sync, the international
// form and the Weekly National v4 read.
//
// Plain functions on plain objects: no DOM, no fetch, no timer at load. The
// same file loads as a browser global and as a node module (node --test).
//
// Days are LOCAL calendar days 'YYYY-MM-DD'. A datetime is turned into the
// local day of the browser (Athens), as _vsToLocalDate always did — never
// sliced: slicing a UTC ISO string gives the wrong day near midnight.
// ═══════════════════════════════════════════════════════════════════════
(function () {
'use strict';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// The local day of a value, or null. '' / null / undefined are «no value»
// (a NULL column is absent from a facade answer; an empty input is '').
function day(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw);
  if (DAY_RE.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Calendar arithmetic on a day, in UTC so no DST hour turns a day into 23 h.
function addDays(d, n) {
  if (!DAY_RE.test(String(d || ''))) return null;
  const t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + n));
  return t.toISOString().slice(0, 10);
}

const isExport = (dir) => dir === 'Export';

/**
 * The Veroia day of an ORDERS record, read the only way that works.
 * The Worker returns cross_dock_date ONLY as 'VS CD Date' (columnToLabel: the
 * last label of a column wins, and «VS CD Date» comes after «Cross-dock
 * Date» in the ORDERS map). So `f['Cross-dock Date']` on a GET answer is
 * always empty — a reader that used it would see «no cross-dock» on every
 * order and rewrite the estimate over the dispatcher's day (plan §3.1, P1).
 * 'Cross-dock Date' is still read second for objects built in the browser
 * (the form's own fields), never as the server's answer.
 * @param {Object} f - ORDERS fields
 * @returns {string|null} 'YYYY-MM-DD' or null
 */
function cdOf(f) {
  if (!f) return null;
  return day(f['VS CD Date']) || day(f['Cross-dock Date']) || null;
}

/**
 * The national leg's days from its international order.
 * Export (ΑΝΟΔΟΣ): loads with the order, reaches Veroia on the cross-dock day.
 * Import (ΚΑΘΟΔΟΣ): leaves Veroia on the cross-dock day, delivers with the order.
 * The cross-dock is taken AS IT IS. ±1 only when it is empty. The old sync
 * silently replaced a cross-dock on or after the delivery (import) / on or
 * before the loading (export) with the estimate, so the two boards showed two
 * different Veroia days with no word (7 of 63 on 11/10). A day that does not
 * hold is now the dispatcher's question (vsHubBad), never a silent rewrite.
 * @returns {{natLoad: string|null, natDel: string|null, hub: string|null}}
 */
function vsNatDates(dir, loading, delivery, cd) {
  const c = day(cd);
  if (isExport(dir)) {
    const natLoad = day(loading);
    const natDel = c || addDays(natLoad, 1);
    return { natLoad, natDel, hub: natDel };
  }
  const natDel = day(delivery);
  const natLoad = c || addDays(natDel, -1);
  return { natLoad, natDel, hub: natLoad };
}

/**
 * A Veroia day that does not hold: an import leaving Veroia AFTER it is
 * delivered, an export reaching Veroia BEFORE it is loaded. The same day is
 * fine (a near customer). Same verdict as DATE_MISMATCH of the Weekly
 * International v4 (core/wi4-logic.js) — one rule, proven equal by
 * tests/vs-dates.test.js, not a second one. Unknown days are not «bad»:
 * this only decides whether to ask a question.
 */
function vsHubBad(dir, loading, delivery, hub) {
  const h = day(hub);
  if (!h) return false;
  if (isExport(dir)) { const l = day(loading); return !!l && h < l; }
  const d = day(delivery);
  return !!d && h > d;
}

/**
 * What the international form sends as 'Cross-dock Date' on save.
 * The form used to send the estimate (delivery−1 / loading+1) on EVERY save,
 * for any reason — so the Veroia day a dispatcher set elsewhere was lost the
 * next time anyone saved the order, and in the same write trigger 028 moved
 * it a second time (the «double move» behind all 7 stale cross-docks, §3.2).
 * Now an existing VS order that already has a cross-dock does NOT send it:
 * if its delivery/loading moved, the base moves the cross-dock by the same Δ,
 * once (069_hub_day_once). The estimate is sent only where there is nothing
 * to keep: a new order, VS just switched on, an empty cross-dock, or a
 * direction change (the old day belongs to the other side).
 * @param {Object|null} prev - the ORDERS fields the form was opened with (null = new order)
 * @param {{vs: boolean, dir: string, loading: string, delivery: string}} next - the form now
 * @returns {{send: boolean, cd: string|null}} send=false → leave 'Cross-dock Date' out of the PATCH
 */
function vsCdOnSave(prev, next) {
  const n = next || {};
  if (!n.vs) return { send: true, cd: null };
  const keep = prev ? cdOf(prev) : null;
  if (prev && prev['Veroia Switch'] && (prev['Direction'] || '') === (n.dir || '') && keep) return { send: false, cd: keep };
  const cd = isExport(n.dir) ? addDays(day(n.loading), 1) : addDays(day(n.delivery), -1);
  return { send: true, cd };
}

/**
 * The national load's drop order, matched BY PLACE (plan §2.4).
 * The sync used to rewrite the national stops by position (`type_number`)
 * in the international order's sequence, silently undoing every drag the
 * national dispatcher made (_wnSaveSegOrder). Now: the national order is
 * kept for the places both have; places the international order added go
 * last, in its order; places it removed go away. The same place twice pairs
 * in order of appearance. The caller takes pallets and day of each drop
 * from the international stop of the SAME place (the returned index).
 * @param {Array<string>} intlLocs - location ids of the international drops, in its order
 * @param {Array<string>} natLocs - location ids of the national drops, in the national order
 * @returns {Array<number>} indexes into intlLocs, in the order the national load keeps
 */
function vsNatDropOrder(intlLocs, natLocs) {
  const a = Array.isArray(intlLocs) ? intlLocs : [];
  const used = a.map(() => false);
  const out = [];
  (Array.isArray(natLocs) ? natLocs : []).forEach((loc) => {
    const i = a.findIndex((l, k) => !used[k] && l === loc);
    if (i >= 0) { used[i] = true; out.push(i); }
  });
  a.forEach((_, k) => { if (!used[k]) out.push(k); });
  return out;
}

const VsDates = Object.freeze({ cdOf, vsNatDates, vsHubBad, vsCdOnSave, vsNatDropOrder, day, addDays });

if (typeof module !== 'undefined') module.exports = VsDates; else window.VsDates = VsDates;
})();
