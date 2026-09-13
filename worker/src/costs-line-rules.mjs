// Pure validation for POST/PATCH /costs/lines — trailer_id/fuel_source/
// toll_country rules added with migration 030 (fuel-collection-program spec,
// docs/superpowers/specs/2026-09-13-fuel-collection-program.md §2.Α). Lives
// outside index.js so it runs under node:test without a Worker runtime —
// same posture as rt-rules.mjs/ledger-rules.mjs. Every rejection names the
// field: CLAUDE.md «ο,τι δεν γίνεται πρέπει να ακούγεται» — the facade's own
// silent-drop trap (unknown field → no `else`, 200 OK) is exactly what this
// file exists to not repeat for the two new columns.
export const CT_FUEL_SOURCE_CATEGORIES = ["fuel", "reefer_fuel", "adblue"];
export const CT_FUEL_SOURCES = ["DKV", "DADI", "BG_STATION", "OWN_STATION", "THIRD_PARTY"];
// How a line was PAID (migration 032, owner 13/9): DKV account, driver cash, or
// the Revolut business account. Orthogonal to fuel_source (who sold the fuel).
export const CT_PAY_SOURCES = ["DKV", "CASH", "REVOLUT"];

// body: the EFFECTIVE line after merge — for POST, the new row; for PATCH,
// the existing row with the patch applied on top (a PATCH that only touches
// net/vat must not let an already-broken category/fuel_source/toll_country
// combination slide through untouched).
// isImport: true when the line already carries a doc_id — it came from the
// DKV importer (worker/src/import-rules.mjs toCostLineRow, POST
// /costs/import/commit), which sets toll_country itself from the parsed
// passage. That path is explicitly out of scope here ("Do not touch the
// import path") — a manual PATCH on an already-imported row skips the
// toll_country requirement instead of demanding a field the import never
// asked the accountant to type.
export function validateLineBody(body, { isImport } = {}) {
  const category = body && body.category;
  const fuelSource = body && body.fuel_source;
  if (fuelSource !== undefined && fuelSource !== null) {
    if (!CT_FUEL_SOURCE_CATEGORIES.includes(category)) {
      return { ok: false, status: 400, error: "fuel_source only valid with category " + CT_FUEL_SOURCE_CATEGORIES.join("/") };
    }
    if (!CT_FUEL_SOURCES.includes(fuelSource)) {
      return { ok: false, status: 400, error: "fuel_source must be one of " + CT_FUEL_SOURCES.join("|") };
    }
  }
  const paySource = body && body.pay_source;
  if (paySource !== undefined && paySource !== null && !CT_PAY_SOURCES.includes(paySource)) {
    return { ok: false, status: 400, error: "pay_source must be one of " + CT_PAY_SOURCES.join("|") };
  }
  let tollCountry;
  if (category === "tolls" && !isImport) {
    const raw = body && body.toll_country;
    const code = typeof raw === "string" ? raw.trim().toUpperCase() : "";
    if (!/^[A-Z]{2}$/.test(code)) {
      return { ok: false, status: 400, error: "toll_country required (ISO-2)" };
    }
    tollCountry = code;
  }
  return { ok: true, toll_country: tollCountry };
}
