// ═══════════════════════════════════════════════════════════════════════
// WEEKLY INTERNATIONAL v4 — pure logic (global WI4)
// ─────────────────────────────────────────────────────────────────────
// Spec: docs/weekly-intl-redesign/TECH_DESIGN.md §d. Owner: WP1.
//
// Plain functions on plain objects: no DOM, no WINTL, no Date.now() (today
// and now are arguments), so the row rail, the day header and the queue read
// ONE rule each (principle 3) and node --test can prove them without a
// browser. The same file loads as a browser global and as a node module.
//
// WP0 PLACEHOLDER: only the global exists. It is loaded by app.html behind
// FEATURES.WI_V2 = 'off' and nothing calls it yet. At load it must only
// define WI4 — no listener, timer, observer or fetch (§b step 6, checked by
// tests/wi4-contract.test.js).
// ═══════════════════════════════════════════════════════════════════════
(function () {
'use strict';

const WI4 = Object.freeze({ __wi4Placeholder: 'WP1' });

if (typeof module !== 'undefined') module.exports = WI4; else window.WI4 = WI4;
})();
