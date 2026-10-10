// ═══════════════════════════════════════════════════════════════════════
// WEEKLY INTERNATIONAL v4 — actions (global WI4Actions)
// ─────────────────────────────────────────────────────────────────────
// Spec: docs/weekly-intl-redesign/TECH_DESIGN.md §d.4, §e #3/#9/#10/#17/#19,
// §e.9, §g.4. Owner: WP5. Frozen signatures: tests/wi4-contract.stub.js.
//
// Per-load menu, date panel, conflict dialog, keyboard + «?» sheet and the
// queue «Όλα N ▾» panel. Every item calls an EXISTING opener or write through
// window.WI_INTERNAL (principle 3); the only v4-only item is «Άνοιγμα
// παραγγελίας», which is today's name click (§e.9).
//
// WP0 PLACEHOLDER: only the global exists. Nothing calls it while WIV2 is
// inactive. At load it must only define WI4Actions — no listener, timer,
// observer or fetch (§b step 6): v4 keyboard listeners are attached by the
// first v4 paint, never by loading this file.
// ═══════════════════════════════════════════════════════════════════════
(function () {
'use strict';

window.WI4Actions = Object.freeze({ __wi4Placeholder: 'WP5' });
})();
