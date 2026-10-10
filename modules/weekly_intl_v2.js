// ═══════════════════════════════════════════════════════════════════════
// WEEKLY INTERNATIONAL v4 — board renderer (global WIV2)
// ─────────────────────────────────────────────────────────────────────
// Spec: docs/weekly-intl-redesign/TECH_DESIGN.md §a, §b, §e, §f. Owner: WP4.
// Frozen signatures: tests/wi4-contract.stub.js (a change there is a
// coordinator commit, never a silent drift).
//
// v4 is a SECOND RENDERER of the same state, not a second module: loading,
// row building and every write stay in modules/weekly_intl.js and are reached
// only through window.WINTL and window.WI_INTERNAL (§a.1). Nothing is copied.
//
// WP0 PLACEHOLDER: the old module's hooks (§a.4) call only WIV2.active() and,
// unguarded in the mast markup, WIV2.switchHTML(). Both answer «inactive», so
// every hook falls through to today's code and the old board stays
// byte-identical. Everything else in the contract is reached only while
// active() is true, which this placeholder never is. At load it must only
// define WIV2 — no listener, timer, observer or fetch (§b step 6).
// ═══════════════════════════════════════════════════════════════════════
(function () {
'use strict';

window.WIV2 = {
  __wi4Placeholder: 'WP4',
  // Sticky fallback flag (§a.4); kept so a reader never sees undefined.
  _broken: false,
  active() { return false; },
  switchHTML() { return ''; },
};
})();
