// node --test tests/client-search-words.test.js
// F19 (live 28/10): a client search with two words («name + start of the 2nd word») found nothing; one word worked.
// The whole phrase was ONE ilike on the server; 279 of 1,927 live client names (SELECT 28/10) have two spaces between
// words, so «alpha be» never matched «ALPHA  BETA». core/form-helpers.js fhSearchClients now asks the server for one
// word and keeps the names that hold every word. The REAL file runs in a vm; atGet is a stub that answers like the
// Worker's SEARCH → ilike (a raw, case-insensitive substring of the stored name). Synthetic names only.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.join(__dirname, '..');
const NAMES = ['ALPHA  BETA FOODS', 'ALPHA GAMMA', 'BETA-ALPHA TRADE', 'DELTA ALPHA', 'ΒΗΤΑ ΑΛΦΑ Α.Ε.'];
function load() {
  const asked = [];
  const ctx = { console: { log() {}, warn() {}, error() {} }, TABLES: { CLIENTS: 'tblC' } };
  ctx.window = ctx;
  ctx.atGet = async (table, formula) => {
    const m = /^SEARCH\(LOWER\("(.*)"\), LOWER\(\{Company Name\}\)\)$/.exec(formula);
    asked.push(m ? m[1] : formula);
    const q = m ? m[1].toLowerCase() : '\u0000';
    return NAMES.filter((n) => n.toLowerCase().includes(q)).map((n, i) => ({ id: 'recC' + i, fields: { 'Company Name': n } }));
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core/form-helpers.js'), 'utf8'), ctx, { filename: 'core/form-helpers.js' });
  const find = async (q) => (await ctx.fhSearchClients(q)).map((c) => c.label);
  return { find, asked };
}

test('F19: «alpha be» finds «ALPHA  BETA FOODS» (two spaces) and «BETA-ALPHA TRADE»; the server is asked one word', async () => {
  const s = load();
  assert.deepStrictEqual(await s.find('alpha be'), ['ALPHA  BETA FOODS', 'BETA-ALPHA TRADE']);
  assert.ok(s.asked.every((q) => !/\s/.test(q)), 'a phrase with a space reached the server: ' + JSON.stringify(s.asked));
});

test('F19: word order does not matter, every word must be there, one word works as before', async () => {
  const s = load();
  assert.deepStrictEqual(await s.find('beta alph'), ['ALPHA  BETA FOODS', 'BETA-ALPHA TRADE']);
  assert.deepStrictEqual(await s.find('alpha zeta'), []);
  assert.deepStrictEqual(await s.find('alpha'), ['ALPHA  BETA FOODS', 'ALPHA GAMMA', 'BETA-ALPHA TRADE', 'DELTA ALPHA']);
  // Greek as typed still finds the Greek name, with its 2nd word started
  assert.deepStrictEqual(await s.find('βητα αλ'), ['ΒΗΤΑ ΑΛΦΑ Α.Ε.']);
});

test('F19 code review: typing on in the 2nd word asks the server nothing more; «Α.Ε.» is never the probe', async () => {
  const s = load();
  await s.find('alpha b'); await s.find('alpha be'); await s.find('alpha bet');
  assert.deepStrictEqual(s.asked, ['alpha'], 'one server read for the three keystrokes');
  const t = load();
  assert.deepStrictEqual(await t.find('Α.Ε. ΑΛΦ'), ['ΒΗΤΑ ΑΛΦΑ Α.Ε.']);
  assert.deepStrictEqual(t.asked, ['ΑΛΦ']);
});
