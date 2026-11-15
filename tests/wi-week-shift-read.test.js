// node --test tests/wi-week-shift-read.test.js
// C6 / Α2 (audit 15/11/2026): «Μεταφορά εβδομάδας» twice put an import on no
// board. Import loading Mon 16/11/2026 (W47) → moved to W48 → moved again to
// W49: W49's read (±8 days around 28/11–4/12) did not include a loading day of
// 16/11, W47 and W48 hide it as «another week's», and the toast said
// «Θα εμφανίζεται στην W49 ✓». The move stays possible (corrective moves,
// owner 15/11); the fix is that the board of the week it was moved to reads it.
// The case runs the REAL import filter of renderWeeklyIntl (the template line,
// extracted verbatim) through a small evaluator of the facade's formula forms
// it uses (AND / OR / IS_AFTER / IS_BEFORE / {x}='v'), the Worker's rule:
// IS_AFTER = strictly after `from` 00:00 UTC, IS_BEFORE = strictly before `to`.
// UNIT ONLY. WI_SRC=<path> runs it against another copy of weekly_intl.js.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const WI = fs.readFileSync(process.env.WI_SRC || path.join(__dirname, '..', 'modules/weekly_intl.js'), 'utf8');
const line = WI.match(/const impFilter=(`[^\n]*`);/);
if (!line) throw new Error('impFilter not found');
const impFilter = win => Function('win', 'return ' + line[1])(win);

// split «a,b,c» at depth 0
function args(s) {
  const out = []; let d = 0, q = null, cur = '';
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"') { q = ch; cur += ch; continue; }
    if (ch === '(') d++; if (ch === ')') d--;
    if (ch === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function ev(t, f) {
  t = t.trim();
  let m = t.match(/^(AND|OR)\(([\s\S]*)\)$/);
  if (m) { const a = args(m[2]).map(x => ev(x, f)); return m[1] === 'AND' ? a.every(Boolean) : a.some(Boolean); }
  m = t.match(/^IS_(AFTER|BEFORE)\(\{([^}]+)\},'([^']+)'\)$/);
  if (m) { const v = f[m[2]]; if (!v) return false; const x = Date.parse(v.length === 10 ? v + 'T00:00:00Z' : v), b = Date.parse(m[3] + 'T00:00:00Z'); return m[1] === 'AFTER' ? x > b : x < b; }
  m = t.match(/^\{([^}]+)\}='([^']*)'$/);
  if (m) return String(f[m[1]] || '') === m[2];
  throw new Error('form not handled: ' + t);
}
const win49 = { from: '2026-11-20', to: '2026-12-12' };   // WI4.readWindow(Sat 28/11/2026)
const imp = { Type: 'International', Direction: 'Import', 'Loading DateTime': '2026-11-16T06:00:00.000Z', 'Plan Week Start': '2026-11-28' };

test('Α2: an import moved to W49 (Plan Week Start 28/11) is read by the W49 board, whatever its loading day', () => {
  assert.strictEqual(ev(impFilter(win49), imp), true, impFilter(win49));
});

test('Α2: the board still reads the imports of its own window and nothing else', () => {
  assert.strictEqual(ev(impFilter(win49), { ...imp, 'Plan Week Start': '', 'Loading DateTime': '2026-11-30T06:00:00.000Z' }), true);
  assert.strictEqual(ev(impFilter(win49), { ...imp, 'Plan Week Start': '' }), false);
  assert.strictEqual(ev(impFilter(win49), { ...imp, Direction: 'Export' }), false);
});
