// node --test tests/f5-legacy-writes-gated.test.mjs
// F5 FE-1 (plan 2026-10-28, Task F, Step 1 static test): no write to NATIONAL LOADS / GROUPAGE LINES /
// CONSOLIDATED LOADS (or NATIONAL ORDERS) in orders_intl.js, order-sync.js, daily_ops.js without a PlanConfig
// check on its way. Every writing function is either behind a gate (named below, with where the gate is) or a
// named exception with its reason. A new writer anywhere else fails this test until it is gated or listed.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.resolve(HERE, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const WRITE = /\bat(?:Create|CreateBatch|Patch|PatchBatch|SafePatch|Delete|SoftDelete)\(\s*TABLES\.(NAT_LOADS|GL_LINES|CONS_LOADS|NAT_ORDERS)\b/;

// top-level function → writes; a nested function counts as its outer one (the gate sits in the outer)
function writers(src) {
  const out = {}; let fn = '(top)';
  src.split('\n').forEach((line) => {
    const m = /^(?:async )?function ([A-Za-z_$][\w$]*)\s*\(|^  (?:async )?function ([A-Za-z_$][\w$]*)\s*\(/.exec(line);
    if (m) fn = m[1] || m[2];
    if (WRITE.test(line)) (out[fn] = out[fn] || []).push(line.trim().slice(0, 80));
  });
  return out;
}
const GATED = {
  'modules/orders_intl.js': {
    // the gate: PlanConfig.load({ fresh: true }) before the first NL read; 'after' returns _vsAfterCutover
    _syncVeroiaSwitch: 'top of the function',
    // reached ONLY from _syncVeroiaSwitch, past its gate (checked below)
    _deleteGrpForIntl: 'via _syncVeroiaSwitch', _syncGroupageLines: 'via _syncVeroiaSwitch',
    // the pre-save restore block: skipped when PlanConfig says after
    submitIntlOrder: 'pre-save restore block',
  },
  'core/order-sync.js': {
    syncGLtoCLtoNL: 'returns on after once it has a line', releaseGroupageTrucks: 'callers gated (submitIntlOrder, _deleteGrpForIntl); orders_natl is stream d1',
  },
  'modules/daily_ops.js': {},
};
const EXCEPT = {
  'modules/orders_intl.js': {
    // The order is deleted FIRST by the Worker; what follows removes the order's own leftovers. After day L the
    // Worker (Ε16) refuses an NL/GL/CL change by every role but the owner (409 legacy_closed), counted in
    // _delFail and said — the base's delete_order_cascade / order_delete_preview (Ε19) own the v5 side.
    deleteIntlOrder: 'delete leftovers after the Worker delete (Ε16 refuses after L, said)',
    // console-only repair tools («Run from console»), no screen calls them
    cleanupOrphanGL: 'console tool', cleanupOrphans: 'console tool',
  },
};

test('F5-FE1: every NL/GL/CL writer is gated or a named exception', () => {
  for (const f of Object.keys(GATED)) {
    const w = writers(read(f));
    const unknown = Object.keys(w).filter((fn) => !(fn in GATED[f]) && !((EXCEPT[f] || {})[fn]));
    assert.deepStrictEqual(unknown, [], f + ': ungated writer(s) ' + JSON.stringify(unknown.map((k) => [k, w[k]])));
  }
});

test('F5-FE1: the gates are where the list says', () => {
  const oi = read('modules/orders_intl.js');
  const vs = oi.slice(oi.indexOf('async function _syncVeroiaSwitch('));
  const gate = vs.indexOf("PlanConfig.load({ fresh: true })"), firstNl = vs.indexOf('TABLES.NAT_LOADS');
  assert.ok(gate > 0 && gate < firstNl, '_syncVeroiaSwitch reads PlanConfig before any NATIONAL LOADS');
  assert.match(vs.slice(gate, firstNl), /state === 'unknown'[\s\S]*throw[\s\S]*state === 'after'\) return await _vsAfterCutover/);
  for (const callee of ['_deleteGrpForIntl(', '_syncGrpFromIntl(']) {
    const at = [...oi.matchAll(new RegExp(callee.replace('(', '\\('), 'g'))].map((m) => m.index)
      .filter((i) => !/function $/.test(oi.slice(i - 9, i)));
    const vsStart = oi.indexOf('async function _syncVeroiaSwitch('), vsEnd = oi.indexOf('\n}\n', vsStart);
    assert.ok(at.length && at.every((i) => i > vsStart + gate && i < vsEnd), callee + ' is called only inside _syncVeroiaSwitch, past its gate');
  }
  assert.ok(oi.indexOf('_syncGroupageLines(') > 0 && [...oi.matchAll(/_syncGroupageLines\(/g)].length === 2, '_syncGroupageLines: its definition + the one call in _syncGrpFromIntl');
  assert.match(oi, /fields\['National Groupage'\] && fields\['Veroia Switch'\]\s*\n\s*&& !\(typeof PlanConfig !== 'undefined' && \(await PlanConfig\.load\(\{ fresh: true \}\)\)\.state === 'after'\)/);
  const os = read('core/order-sync.js');
  const gl = os.slice(os.indexOf('async function syncGLtoCLtoNL('));
  const g = gl.indexOf("_pc.state === 'after') return"), w = gl.search(/at(Patch|Delete)\(TABLES\./);
  assert.ok(g > 0 && g < w, 'syncGLtoCLtoNL returns on after before its first write');
  assert.match(gl.slice(0, w), /_pc\.state === 'unknown'\) throw/, 'unknown fails the step, never the old chain on a guess');
  assert.match(os, /if \(_ps === 'unknown'\) throw/, 'the PL step too');
});
