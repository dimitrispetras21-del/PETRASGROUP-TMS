// tests/groupage-off-shared-cl.test.js — run: node --test tests/groupage-off-shared-cl.test.js
// Audit A4 (owner go 3/10): unticking «National Groupage» on ONE order deleted
// the consolidated load (groupage truck) shared by every customer. Runs the
// REAL core/order-sync.js in a sandbox over an in-memory facade that answers
// the same filter shapes the Worker does. The second half checks that both
// edit paths (natl GRP OFF, intl _deleteGrpForIntl) go through the shared
// helper instead of deleting the CL themselves.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const TABLES = { GL_LINES: 'GL', CONS_LOADS: 'CL', NAT_LOADS: 'NL', ORDERS: 'O', NAT_ORDERS: 'NO', ORDER_STOPS: 'OS', RAMP: 'R' };

function world({ failShareCheck = false } = {}) {
  const db = {
    GL: new Map(), CL: new Map(), NL: new Map(),
    deleted: [], toasts: [],
  };
  const linkHas = (v, id) => (v || []).some(x => ((x && x.id) || x) === id);
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    TABLES,
    getLinkedId: v => (Array.isArray(v) ? (v[0] && v[0].id) || v[0] || null : typeof v === 'string' ? v : null),
    invalidateCache() {},
    logError() {},
    toast: (m, k) => db.toasts.push([k || 'info', String(m)]),
    showErrorToast: (m, k) => db.toasts.push([k || 'error', String(m)]),
    async atGetAll(table, opts = {}) {
      const f = opts.filterByFormula || '';
      let m;
      if (table === 'GL' && (m = f.match(/^AND\(FIND\("([^"]+)",ARRAYJOIN\(\{Linked Consolidated Load\},","\)\)>0,\{Status\}="Assigned"\)$/))) {
        if (failShareCheck) throw new Error('503 from Worker');
        return [...db.GL.values()].filter(r => linkHas(r.fields['Linked Consolidated Load'], m[1]) && r.fields.Status === 'Assigned');
      }
      if (table === 'GL' && (m = f.match(/^FIND\("([^"]+)",ARRAYJOIN\(\{Linked National Order\},","\)\)>0$/)))
        return [...db.GL.values()].filter(r => linkHas(r.fields['Linked National Order'], m[1]));
      if (table === 'NL' && (m = f.match(/^FIND\("([^"]+)",ARRAYJOIN\(\{Source Consolidated Load\},","\)\)>0$/)))
        return [...db.NL.values()].filter(r => linkHas(r.fields['Source Consolidated Load'], m[1]));
      throw new Error('fake facade: unmodelled read ' + table + ' ' + f);
    },
    async atDelete(table, id) {
      if (table === 'GL') throw new Error('never-delete: groupage_lines has no DELETE');
      if (!db[table].delete(id)) throw new Error('Record not found ' + id);
      db.deleted.push(table + ':' + id);
      return { id, deleted: true };
    },
    async atPatch(table, id, fields) { Object.assign(db[table].get(id).fields, fields); return { id }; },
  };
  ctx.atSafePatch = ctx.atPatch;
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core/order-sync.js'), 'utf8'), ctx, { filename: 'core/order-sync.js' });
  // Two national orders (A, B) on ONE truck CL1, its national load NL1.
  db.CL.set('recCL1', { id: 'recCL1', fields: {} });
  db.NL.set('recNL1', { id: 'recNL1', fields: { 'Source Consolidated Load': ['recCL1'] } });
  const gl = (id, no, status = 'Assigned') => db.GL.set(id, { id, fields: { Status: status, 'Linked National Order': [no], 'Linked Consolidated Load': ['recCL1'] } });
  gl('recGLa1', 'recNOa'); gl('recGLa2', 'recNOa'); gl('recGLb1', 'recNOb');
  return { ctx, db };
}

// The natl edit path's sequence (orders_natl.js, National Groupage OFF):
// read the order's lines → releaseGroupageTrucks → each line → Unassigned.
async function untickNatl({ ctx, db }, noId) {
  const lines = await ctx.atGetAll('GL', { filterByFormula: `FIND("${noId}",ARRAYJOIN({Linked National Order},","))>0` });
  const res = await ctx.releaseGroupageTrucks(lines, 'test ' + noId);
  for (const r of lines) await ctx.atSafePatch('GL', r.id, { Status: 'Unassigned' });
  return res;
}

test('untick ONE of two orders on a shared truck → truck survives, only its lines are released', async () => {
  const w = world();
  assert.strictEqual(typeof w.ctx.releaseGroupageTrucks, 'function', 'core/order-sync.js must expose releaseGroupageTrucks');
  const res = await untickNatl(w, 'recNOa');
  assert.deepStrictEqual(w.db.deleted, [], 'nothing deleted while order B is still on the truck');
  assert.ok(w.db.CL.has('recCL1') && w.db.NL.has('recNL1'));
  assert.strictEqual(w.db.GL.get('recGLa1').fields.Status, 'Unassigned');
  assert.strictEqual(w.db.GL.get('recGLa2').fields.Status, 'Unassigned');
  assert.strictEqual(w.db.GL.get('recGLb1').fields.Status, 'Assigned', 'other order untouched');
  assert.deepStrictEqual({ ...res }, { kept: 1, deleted: 0, unsure: 0, failed: 0 }, 'two lines on one truck → decided once');
  assert.ok(w.db.toasts.some(([k, m]) => k === 'info' && /άλλους πελάτες/.test(m)), 'the user is told the truck stayed');
});

test('untick the LAST order on the truck → CL and its national load are deleted, lines never', async () => {
  const w = world();
  await untickNatl(w, 'recNOa');
  const res = await untickNatl(w, 'recNOb');
  assert.deepStrictEqual(w.db.deleted.sort(), ['CL:recCL1', 'NL:recNL1']);
  assert.strictEqual(w.db.GL.size, 3, 'groupage lines are never deleted');
  assert.ok([...w.db.GL.values()].every(r => r.fields.Status === 'Unassigned'));
  assert.deepStrictEqual({ ...res }, { kept: 0, deleted: 1, unsure: 0, failed: 0 });
});

test('share check read fails → truck KEPT and a visible warning, never a delete', async () => {
  const w = world({ failShareCheck: true });
  const res = await untickNatl(w, 'recNOb');
  assert.deepStrictEqual(w.db.deleted, []);
  assert.strictEqual(res.unsure, 1);
  assert.ok(w.db.toasts.some(([k, m]) => k === 'warn' && /ΔΕΝ σβήστηκε/.test(m)), 'warning shown');
});

test('clOtherAssignedLines: excludes only the released ids; a stale Unassigned FK is not «another customer»', async () => {
  const w = world();
  w.db.GL.get('recGLb1').fields.Status = 'Unassigned';
  const others = await w.ctx.clOtherAssignedLines('recCL1', ['recGLa1']);
  assert.deepStrictEqual([...others.map(r => r.id)], ['recGLa2']);
});

// ── wiring: the edit paths must not delete a CL on their own any more ──
function block(src, startRe, endRe) {
  const s = src.search(startRe); assert.ok(s >= 0, 'block start not found: ' + startRe);
  const rest = src.slice(s); const e = rest.slice(1).search(endRe);
  return e < 0 ? rest : rest.slice(0, e + 1);
}
test('natl edit path (National Groupage OFF) delegates to releaseGroupageTrucks', () => {
  const src = fs.readFileSync(path.join(ROOT, 'modules/orders_natl.js'), 'utf8');
  const b = block(src, /else if \(savedNatlId && !fields\['National Groupage'\]\)/, /\/\/ ── Sync NATIONAL LOADS/);
  assert.match(b, /releaseGroupageTrucks\(staleGL/);
  assert.doesNotMatch(b, /atDelete\(TABLES\.CONS_LOADS/);
});
test('intl edit path (_deleteGrpForIntl) delegates to releaseGroupageTrucks', () => {
  const src = fs.readFileSync(path.join(ROOT, 'modules/orders_intl.js'), 'utf8');
  const b = block(src, /async function _deleteGrpForIntl\(/, /\n\}\n/);
  assert.match(b, /releaseGroupageTrucks\(/);
  assert.doesNotMatch(b, /atDelete\(TABLES\.CONS_LOADS/);
});
test('order delete paths use the same shared check (one copy)', () => {
  for (const f of ['modules/orders_intl.js', 'modules/orders_natl.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.match(src, /clOtherAssignedLines\(cl\.id, gls\.map/, f);
    assert.doesNotMatch(src, /\{Status\}="Assigned"\)`/, f + ': no private copy of the share-check filter');
  }
});
