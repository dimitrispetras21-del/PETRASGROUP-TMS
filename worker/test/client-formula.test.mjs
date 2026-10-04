// Client filter formulas name fields by label only (4/10/2026): the internal
// `{__col:...}` form that preResolveLinkTerms generates is not accepted from
// clients. Lifts the real formula translator + link pre-resolution out of the
// bundled worker/src/index.js and replays handleFacadeGet's order of steps
// (client check → preResolveLinkTerms → applyFilter), like the other
// lift-style tests here (αρχή 3: the deployed code, not a copy).
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, '..', 'src', 'index.js'), 'utf8');
function lift(re, what) {
  const m = src.match(re);
  assert.ok(m, `${what} not found in worker/src/index.js`);
  return m[0];
}
const parts = [
  lift(/\/\/ src\/lib\/formula-translate\.js[\s\S]*?(?=\/\/ src\/lib\/facade-links\.js)/, 'formula-translate section'),
  lift(/async function preResolveLinkTerms\(formula, cfg, env\) \{[\s\S]*?\n\}\n/, 'preResolveLinkTerms'),
  lift(/var TABLES = \{[\s\S]*?\n\};\n/, 'TABLES'),
  lift(/var PL_READERS = [^\n]*\n/, 'PL_READERS'),
  lift(/function cfgForRole\(cfg, role\) \{[\s\S]*?\n\}\n/, 'cfgForRole'),
  lift(/function filterFieldMap\(cfg\) \{[\s\S]*?\n\}\n/, 'filterFieldMap'),
];
// Stub for the one DB call preResolveLinkTerms makes (FIND on a link label):
// every requested recid resolves to id 42.
const resolveLegacyToIds = async (env, db, table, recids) => new Map(recids.map((r) => [r, 42]));
const W = new Function('__name', 'resolveLegacyToIds', 'dbSelectRaw', parts.join('\n') +
  '\nreturn { UnsupportedFilter, assertClientFormula, preResolveLinkTerms, applyFilter, TABLES, cfgForRole, filterFieldMap };')(
  () => {}, resolveLegacyToIds, null);

const PA = W.TABLES.tblUhgqnmiam5MGNK;
// Same steps, same order as handleFacadeGet.
async function filterAs(role, formula) {
  const cfg = W.cfgForRole(PA, role);
  const params = new URLSearchParams();
  W.assertClientFormula(formula);
  const f = await W.preResolveLinkTerms(formula, cfg, {});
  W.applyFilter(f, W.filterFieldMap(cfg), params);
  return params.toString();
}
const refused = (p) => assert.rejects(p, (e) => e instanceof W.UnsupportedFilter);

test('internal filter syntax in a client formula is refused (any case, any table role)', async () => {
  for (const role of ['owner', 'dispatcher']) {
    await refused(filterAs(role, '{__col:status}="Assigned"'));
    await refused(filterAs(role, '{__COL:status}="Assigned"'));
    await refused(filterAs(role, 'AND({Status}="Assigned",{ __col:status}>0)'));
  }
});

test('link terms generated internally still translate', async () => {
  const q = await filterAs('dispatcher', 'FIND("recPartner00001A", ARRAYJOIN({Partner}, ","))>0');
  assert.strictEqual(new URLSearchParams(q).get('partner_id'), 'eq.42');
  const q2 = await filterAs('dispatcher', 'COUNTA({Order})>0');
  assert.ok(new URLSearchParams(q2).has('order_id'), q2);
});

test('label filters behave as before for owner and dispatcher', async () => {
  for (const role of ['owner', 'dispatcher']) {
    const q = await filterAs(role, '{Status}="Assigned"');
    assert.strictEqual(new URLSearchParams(q).get('status'), 'eq.Assigned', role);
  }
  assert.ok((await filterAs('owner', '{Margin Percent}="40"')).includes('margin_percent'));
  await refused(filterAs('dispatcher', '{Margin Percent}="40"'));
});
