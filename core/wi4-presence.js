// ═══════════════════════════════════════════════════════════════════════
// WEEKLY INTERNATIONAL v4 — presence client (global WI4Presence)
// ─────────────────────────────────────────────────────────────────────
// Spec: docs/weekly-intl-redesign/TECH_DESIGN.md §g.4. Owner: WP7.
//
// Presence is an indication, never a lock, and never claims «κανείς»
// (owner 10/10, option A). Beats start only from WIV2.paint() while
// FEATURES.WI_PRESENCE is true — never at load — because every beat is a
// Worker request on the Free plan's 100k/day budget for the whole app.
//
// WP0 PLACEHOLDER: only the global exists. At load it must only define
// WI4Presence — no listener, timer, observer or fetch (§b step 6, checked by
// tests/wi4-contract.test.js).
// ═══════════════════════════════════════════════════════════════════════
(function () {
'use strict';

window.WI4Presence = Object.freeze({ __wi4Placeholder: 'WP7' });
})();
