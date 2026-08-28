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

function countIn(file, re) {
  const src = fs.readFileSync(file, 'utf8');
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
