// Critics #3 and #4 from DESIGN.md ΜΕΡΟΣ Α, made executable.
//
// Ratchet, not absolute: today the codebase holds 528 hex literals inside
// modules, so asserting zero would paint every unit red on day one and the
// suite would be ignored within a week. Instead each unit carries an allowance
// (docs/redesign/baseline.json) that may only ever go DOWN. When a unit is
// redesigned its allowance is set to 0 and the rule becomes absolute.

const fs = require('fs');

// 3-, 6- and 8-digit hex. \b at the end keeps #FFFFFF80 from matching twice.
const HEX = /#[0-9A-Fa-f]{3,8}\b/g;
// DESIGN.md #6: company and location names are never cut — dispatchers phone
// these companies and read the name off the screen.
const TRUNCATE = /(text-overflow\s*:\s*ellipsis|\btruncate\b|\bline-clamp\b)/g;

// The HEX regex matches "#..." anywhere, including inside comments that have
// nothing to do with colour: modules/pallet_ledger.js:72 has a Greek comment
// mentioning "Πελάτης #1314" (a historical customer-index bug — 1314 is
// valid hex), and modules/metrics_audit.js:299 cites "SESSION.md learning
// #105". Since docs/redesign/baseline.json is a ratchet (numbers only ever
// go down, becoming each unit's permanent budget), that noise would be
// baked in forever, and a future comment citing an issue number could
// silently eat into budget meant for real colour literals. So comments are
// stripped before either regex runs. Strings are matched and passed through
// untouched (not stripped) so this doesn't also swallow real hex literals
// that happen to sit next to a "//" inside a string.
const STRING_OR_COMMENT = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/[^\n]*|\/\*[\s\S]*?\*\//g;

function stripComments(src) {
  return src.replace(STRING_OR_COMMENT, (m) => (m[0] === '/' ? '' : m));
}

function countIn(file, re) {
  const src = stripComments(fs.readFileSync(file, 'utf8'));
  return (src.match(re) || []).length;
}

function measure(unit) {
  return {
    hex:      unit.files.reduce((n, f) => n + countIn(f, HEX), 0),
    truncate: unit.files.reduce((n, f) => n + countIn(f, TRUNCATE), 0),
  };
}

function check(unit, allowance) {
  const m = measure(unit);
  const failures = [];
  if (m.hex > allowance.hex) {
    failures.push(`${unit.unit}: hex ${m.hex} > όριο ${allowance.hex} (DESIGN.md #1)`);
  }
  if (m.truncate > allowance.truncate) {
    failures.push(`${unit.unit}: κοπή ${m.truncate} > όριο ${allowance.truncate} (DESIGN.md #6)`);
  }
  return { pass: failures.length === 0, failures, measured: m };
}

module.exports = { measure, check };
