# 2026-10-28 · dimitris · National v5: live board ↔ approved Figma audit

- Audited the LIVE National v5 board (week W45, `SW_VERSION 1793195238`, after PR #152) against the approved Figma frames: board H1, Δ1/Δ4/Δ11, order form, leg form, order card, driver sheet, Δ12 states. Gap list only, no code changed, no write made (every dialog closed with Cancel/×).
- Result in `docs/national-v5/figma-audit-2026-10-28.md`: 51 rows, A 6 (2 are Φ4β), B 22, C 23. One blocks work: a cycle without segments has no way into «Αλλαγή οχήματος» (the cycle card opens only from a segment tile or ⇄, which exist only after a change).
- Not seen live: H2–H7 (no cycle with segments in W45), notices strip, Δ5 and delete (read-only rule), error and loading states. 1440 px could not be reached in the owner's Chrome (zoom 75% keeps `innerWidth` 1920), so 1440 numbers are the PR #113 rig values.
- Decision for the owner: add an entry point to the vehicle change for plain cycles (✈ menu item and/or click on the plate box), which also needs a Figma update.
