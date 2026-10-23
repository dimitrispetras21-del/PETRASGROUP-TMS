// tests/vs-sync-callers.test.js — run: node --test tests/vs-sync-callers.test.js
// Static guard of the ONE Veroia day path (Weekly National v4 plan §3.4, §6.1,
// WP-A; principle 6: caught at build time, not by an audit months later).
// Over modules/ + core/ (comments ignored, strings kept), the build fails when:
//   1. a call to _syncVeroiaSwitch( has anything but ONE argument — the sync
//      reads the order itself; a caller's own field list is how the Weekly
//      International assignment rewrote the national load to ±1;
//   2. code READS ['Cross-dock Date'] outside VsDates.cdOf — the Worker answers
//      cross_dock_date ONLY as «VS CD Date», so such a read is always empty
//      (writes `x['Cross-dock Date'] = …` are fine: both labels write);
//   3. a writer of the Veroia day is not in WRITERS below, or a listed one no
//      longer runs the sync after its write — no Veroia day without the sync;
//   4. Pallet Exchange (owner Ε3, 11/10 night: «να ακολουθείται η ανταλλαγή
//      παλετών»): the national load's fields that _syncVeroiaSwitch builds lose
//      the 'Pallet Exchange' key copied from the order, or a `delete` before
//      the PATCH removes any key but 'Status'. A field dropped from that PATCH
//      makes no noise: the Worker answers 200 and the load keeps the old value.
//      Proven the other way round too: copies of the function without the key
//      (or with a second delete) must fail.
// Limit (stated, not hidden): a writer that builds the label dynamically
// (`{[field]: val}`) is invisible to a scan; the one that exists today
// (_wiDateWrite) is listed by its exact text, so a change to it is seen.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
// Same tokenizer as tests/critics/static.js (strings kept, comments blanked);
// comments become blank lines so reported line numbers stay true.
const STRING_OR_COMMENT = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/[^\n]*|\/\*[\s\S]*?\*\//g;
const strip = (src) => src.replace(STRING_OR_COMMENT, (m) => (m[0] === '/' ? m.replace(/[^\n]/g, '') : m));
const FILES = ['modules', 'core'].flatMap((d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith('.js')).map((f) => d + '/' + f));
const SRC = Object.fromEntries(FILES.map((f) => [f, strip(fs.readFileSync(path.join(ROOT, f), 'utf8'))]));
const lineOf = (src, i) => src.slice(0, i).split('\n').length;

// The text between a '(' / '{' at `open` and its partner (strings already intact).
function balanced(src, open) {
  const pair = { '(': ')', '{': '}', '[': ']' };
  const stack = [src[open]];
  let q = null;
  for (let k = open + 1; k < src.length; k++) {
    const c = src[k];
    if (q) { if (c === '\\') k++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (pair[c]) stack.push(c);
    else if (c === pair[stack[stack.length - 1]]) { stack.pop(); if (!stack.length) return src.slice(open + 1, k); }
  }
  throw new Error('unbalanced at ' + open);
}
// Top-level arguments of an argument list text.
function args(text) {
  const out = []; let depth = 0, cur = '', q = null;
  for (let k = 0; k < text.length; k++) {
    const c = text[k];
    if (q) { cur += c; if (c === '\\') { cur += text[++k]; } else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; cur += c; continue; }
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth--;
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
// The body of `function name(...) {...}` in a stripped source.
function fnBody(src, name) {
  const m = new RegExp(`function\\s+${name}\\s*\\(`).exec(src);
  assert.ok(m, `${name} not found`);
  const paramsOpen = m.index + m[0].length - 1;
  const params = balanced(src, paramsOpen);
  const bodyOpen = src.indexOf('{', paramsOpen + params.length + 1);
  return { params: args(params), body: balanced(src, bodyOpen), at: m.index };
}

// ─── 1. one argument ────────────────────────────────────────────────────
function syncCalls() {
  const calls = [];
  for (const f of FILES) {
    const src = SRC[f];
    for (const m of src.matchAll(/(?<![\w$.])_syncVeroiaSwitch\s*\(/g)) {
      if (/function\s+$/.test(src.slice(Math.max(0, m.index - 20), m.index))) continue;   // the definition
      calls.push({ f, line: lineOf(src, m.index), args: args(balanced(src, m.index + m[0].length - 1)) });
    }
  }
  return calls;
}
test('_syncVeroiaSwitch takes ONE parameter (the order id) and reads the order itself', () => {
  const def = fnBody(SRC['modules/orders_intl.js'], '_syncVeroiaSwitch');
  assert.deepStrictEqual(def.params, ['orderId']);
  assert.match(def.body, /await atGetOne\(TABLES\.ORDERS, orderId\)/, 'the sync must do its own read of the order');
});
test('every call of _syncVeroiaSwitch( passes exactly ONE argument', () => {
  const calls = syncCalls();
  const bad = calls.filter((c) => c.args.length !== 1).map((c) => `${c.f}:${c.line} (${c.args.length} args: ${c.args.join(', ')})`);
  assert.deepStrictEqual(bad, [], 'a caller hands the sync its own copy of the order — the sync reads it itself');
});
test('the three known callers are still there (the check above is not vacuous)', () => {
  const where = syncCalls().map((c) => c.f);
  for (const f of ['modules/orders_intl.js', 'core/order-sync.js', 'modules/weekly_intl.js'])
    assert.ok(where.includes(f), `${f} no longer calls _syncVeroiaSwitch — update this test with where the call went`);
});
test('no caller reads the order just to hand it to the sync (form, VS chain stage, assignment)', () => {
  assert.doesNotMatch(SRC['core/order-sync.js'], /atGetOne\(TABLES\.ORDERS,\s*orderId\)[\s\S]{0,400}_syncVeroiaSwitch/);
  assert.doesNotMatch(SRC['modules/weekly_intl.js'], /fields:\s*\['Direction','Type','Veroia Switch'/);
  assert.doesNotMatch(SRC['modules/orders_intl.js'], /atGetOne\(TABLES\.ORDERS, savedOrderId\)/);
});

// ─── 2. no read of 'Cross-dock Date' outside cdOf ───────────────────────
test('no READ of [\'Cross-dock Date\'] outside VsDates.cdOf (the Worker returns it only as «VS CD Date»)', () => {
  const READ = /\[\s*(['"])Cross-dock Date\1\s*\](?!\s*=(?!=))/g;
  const hits = [];
  for (const f of FILES) {
    let src = SRC[f];
    if (f === 'core/vs-dates.js') src = src.replace(fnBody(src, 'cdOf').body, '');
    for (const m of src.matchAll(READ)) hits.push(`${f}:${lineOf(src, m.index)}`);
  }
  assert.deepStrictEqual(hits, [], 'read the Veroia day with VsDates.cdOf(fields)');
  assert.match(fnBody(SRC['core/vs-dates.js'], 'cdOf').body, /\['VS CD Date'\][\s\S]*\['Cross-dock Date'\]/, 'cdOf reads «VS CD Date» first');
});

// ─── 3. the writers of the Veroia day, each followed by the sync ────────
// file → the exact write, how many times, and what proves the sync follows it.
const WRITERS = [
  { file: 'modules/orders_intl.js', what: 'the international form (VsDates.vsCdOnSave; VS off = null)',
    write: /fields\['Cross-dock Date'\] = /g, n: 2, sync: /await _syncVeroiaSwitch\(savedOrderId\)/ },
  { file: 'modules/weekly_intl.js', what: '_wiDateWrite — the v1 chip and the v4 date panel (label = field)',
    write: /atSafePatch\(TABLES\.ORDERS,orderId,\{\[field\]:val\},opt\)/g, n: 1, fn: '_wiDateWrite', sync: /syncOrderDownstream\(orderId,/ },
  { file: 'modules/daily_ops.js', what: '«Σε μεταφορά» stamps the Veroia day of a VS export',
    write: /patch\['VS CD Date'\]=_opsTgt\(\)/g, n: 1, fn: '_opsStatFinal', sync: /syncOrderDownstream\(id,\{ source:'intl', changedFields:\['VS CD Date'\]/ },
];
test('every listed writer of the Veroia day still writes it, and runs the sync after', () => {
  for (const w of WRITERS) {
    const src = SRC[w.file];
    assert.strictEqual((src.match(w.write) || []).length, w.n, `${w.file}: ${w.what} — the write changed; review it and this list`);
    const scope = w.fn ? fnBody(src, w.fn).body : src;
    assert.match(scope, w.sync, `${w.file}: ${w.what} — writes the Veroia day without the sync`);
  }
});
test('no OTHER writer of the Veroia day (assignment to a bare body, or an object key with a value)', () => {
  // Assignment into a request body: `patch['VS CD Date'] = …` (an in-memory
  // mirror `r0.fields[…] = …` is not a write to the base). Object keys with a
  // literal or object value are label maps ('VS CD Date': 'ημερομηνία …').
  const ASSIGN = /(?<![\w$.\]])[A-Za-z_$][\w$]*\s*\[\s*(['"])(Cross-dock Date|VS CD Date)\1\s*\]\s*=(?!=)/g;
  const KEY = /(['"])(Cross-dock Date|VS CD Date)\1\s*:\s*(?![\s'"`{])/g;
  // A candidate is a listed writer only when a WRITERS match starts at the
  // very same place (a second write on the same line is still a stray).
  const knownAt = (f) => new Set(WRITERS.filter((w) => w.file === f).flatMap((w) => [...SRC[f].matchAll(new RegExp(w.write.source, 'g'))].map((m) => m.index)));
  const stray = [];
  for (const f of FILES) {
    const src = SRC[f];
    const at = knownAt(f);
    for (const re of [ASSIGN, KEY]) for (const m of src.matchAll(re)) {
      if (at.has(m.index)) continue;
      const line = src.split('\n')[lineOf(src, m.index) - 1];
      stray.push(`${f}:${lineOf(src, m.index)}: ${line.trim().slice(0, 120)}`);
    }
  }
  assert.deepStrictEqual(stray, [], 'a new writer of the Veroia day: it must run the VS chain (syncOrderDownstream / _syncVeroiaSwitch) and be added to WRITERS');
});

// ─── 4. Pallet Exchange travels in every national PATCH ─────────────────
function peProblems(fileSrc) {
  const problems = [];
  const body = fnBody(fileSrc, '_syncVeroiaSwitch').body;
  const m = /const nlFields\s*=\s*\{/.exec(body);
  if (!m) return ['nlFields object not found'];
  const obj = balanced(body, m.index + m[0].length - 1);
  if (!/'Pallet Exchange'\s*:\s*!!fields\['Pallet Exchange'\]/.test(obj)) problems.push("nlFields has no 'Pallet Exchange' key copied from the order's 'Pallet Exchange'");
  for (const d of body.matchAll(/delete\s+nlFields\s*\[\s*(['"])([^'"]+)\1\s*\]/g)) if (d[2] !== 'Status') problems.push(`delete nlFields['${d[2]}'] — only 'Status' may leave the national PATCH`);
  if (/delete\s+nlFields\s*\.(?!Status\b)/.test(body) || /delete\s+nlFields\s*\[\s*[^'"\s]/.test(body)) problems.push('a computed delete on nlFields');
  if (!/atPatch\(TABLES\.NAT_LOADS,\s*existingNL\[0\]\.id,\s*nlFields\)/.test(body)) problems.push('the national PATCH does not send nlFields');
  if (!/atCreate\(TABLES\.NAT_LOADS,\s*nlFields\)/.test(body)) problems.push('the national POST does not send nlFields');
  return problems;
}
const INTL = SRC['modules/orders_intl.js'];
test('Pallet Exchange: the national fields carry it from the order, nothing but Status is deleted before the PATCH', () => {
  assert.deepStrictEqual(peProblems(INTL), []);
});
test('Pallet Exchange guard, the other way round: a copy WITHOUT the key fails', () => {
  const broken = INTL.replace(/\n[^\n]*'Pallet Exchange':\s*!!fields\['Pallet Exchange'\],[^\n]*/, '');
  assert.notStrictEqual(broken, INTL, 'the mutation must apply');
  assert.ok(peProblems(broken).some((p) => /no 'Pallet Exchange' key/.test(p)), peProblems(broken).join('; '));
});
test('Pallet Exchange guard, the other way round: a copy reading the key from elsewhere fails', () => {
  const broken = INTL.replace("'Pallet Exchange':   !!fields['Pallet Exchange']", "'Pallet Exchange':   false");
  assert.notStrictEqual(broken, INTL, 'the mutation must apply');
  assert.ok(peProblems(broken).length > 0);
});
test('Pallet Exchange guard, the other way round: a second delete before the PATCH fails', () => {
  const broken = INTL.replace("delete nlFields['Status'];", "delete nlFields['Status']; delete nlFields['Pallet Exchange'];");
  assert.notStrictEqual(broken, INTL, 'the mutation must apply');
  assert.ok(peProblems(broken).some((p) => /delete nlFields\['Pallet Exchange'\]/.test(p)), peProblems(broken).join('; '));
});

// ─── the sync's failures are loud (plan §3.4: no «console.warn» left) ────
test('a failed national write or stops write fails the sync — no toast-only or console.warn path', () => {
  const body = fnBody(INTL, '_syncVeroiaSwitch').body;
  assert.doesNotMatch(body, /reportError\('Σφάλμα (ενημέρωσης|δημιουργίας) NAT_LOADS/, 'the national write error is thrown, not toasted');
  assert.doesNotMatch(body, /console\.warn\('NL ORDER_STOPS write error/, 'the stops write error is thrown, not warned');
  assert.match(body, /if \(upd\?\.error\) throw /);
  assert.match(body, /if \(cre\?\.error\) throw /);
  assert.match(body, /if \(_stopsErr\) \{[\s\S]*?throw /);
});
