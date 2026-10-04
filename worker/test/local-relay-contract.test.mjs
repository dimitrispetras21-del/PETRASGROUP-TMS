// 060 ↔ Worker refusal contract (coordinator D1, 4/10/2026: the Worker adopts
// 060's hint and constraint names — the lower layer names them, αρχή 4).
// The first Worker draft chose its own codes before the SQL existed and 8 of
// 060's 15 hints reached the dispatcher as English DB text, while the old test
// only looped over the Worker's own keys and stayed green (circular). This
// test reads the migration itself, so a rename on either side fails HERE, at
// build time, never on a dispatcher's save (αρχή 6).
//
// The migration is read from this checkout — never skipped when missing:
//   worker/migrations/drafts/060_local_relay.sql  (draft, until it runs)
//   worker/migrations/060_local_relay.sql         (after it ran and moved)
// On the Worker deploy branch the draft is a COPY of the SQL branch's file;
// when 060 changes there, copy it again and re-run this test before deploy
// (the diagnostic line below prints the md5 that was checked).
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, '..', 'src', 'index.js'), 'utf8');
const candidates = [
  path.join(here, '..', 'migrations', 'drafts', '060_local_relay.sql'),
  path.join(here, '..', 'migrations', '060_local_relay.sql'),
];
const sqlFile = candidates.find((f) => existsSync(f));

function lift(re, what) {
  const m = src.match(re);
  assert.ok(m, `${what} not found in worker/src/index.js`);
  return m[0];
}
const fn = (name) => lift(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}\\n`), name);
// stockRuleError is ONE mapper for the stock (057) and relay (060) families,
// so it is lifted with all three text tables it reads.
const W = new Function('__name', [
  lift(/const STOCK_CHECK_TEXT = \{[\s\S]*?\n\};\n/, 'STOCK_CHECK_TEXT'),
  lift(/const RELAY_RULE_TEXT = \{[\s\S]*?\n\};\n/, 'RELAY_RULE_TEXT'),
  lift(/const RELAY_CHECK_TEXT = \{[\s\S]*?\n\};\n/, 'RELAY_CHECK_TEXT'),
  fn('stockRuleError'),
].join('\n') + '\nreturn { RELAY_RULE_TEXT, RELAY_CHECK_TEXT, stockRuleError };')(() => {});

// Live production CHECKs on local_moves that predate 060 (pg_constraint,
// SELECT 4/10/2026). Plain Weekly National moves can meet them, so the Worker
// keeps a text for each; any other Worker key must come from 060.
const LIVE_PRE_060 = ['local_moves_one_parent', 'local_moves_time_from_fmt', 'local_moves_time_to_fmt'];
// 060 constraints the facade never meets, each with the reason:
const NOT_FACADE = {
  // dl_entries is not a facade table; /costs/ledger is the only writer, and
  // its local-line allow-list (no rt_id, no type change) keeps them out of
  // reach — pinned in ledger-rules.test.mjs.
  dl_one_origin: 'ledger-only, unreachable (allow-list)',
  dl_lm_is_trip: 'ledger-only, unreachable (allow-list)',
};
const NOT_FACADE_UNIQUE = {
  // the payroll line per (driver, day): 060 serialises its writers with an
  // advisory lock; a slip would be a transient race, and the 5xx retry is the
  // cure (stockRuleError returns null on purpose).
  dl_local_day_live: 'advisory-locked, 500/retry path deliberate',
};

function read060() {
  assert.ok(sqlFile, '060_local_relay.sql not found in this checkout (looked in: ' + candidates.join(', ') +
    ') — copy it from the SQL branch: git checkout origin/feat/local-relay-sql -- worker/migrations/drafts/060_local_relay.sql');
  return readFileSync(sqlFile, 'utf8');
}
const uniq = (re, text) => [...new Set([...text.matchAll(re)].map((m) => m[1]))].sort();
const greek = /[α-ωΑ-Ωά-ώ]/;

test('060 file found and fingerprinted', (t) => {
  const sql = read060();
  t.diagnostic(`060 checked: ${path.relative(path.join(here, '..', '..'), sqlFile)} md5 ${createHash('md5').update(sql).digest('hex')}`);
  assert.ok(sql.includes("HINT = 'local_relay:"), 'the file carries local_relay hints');
});

test('every 060 hint has a Greek text, and every Worker hint key is raised by 060', () => {
  const sql = read060();
  const hints = uniq(/HINT = 'local_relay:(\w+)'/g, sql);
  assert.ok(hints.length >= 10, `060 hints parsed: ${hints.join(', ')}`);
  for (const code of hints) {
    const r = W.stockRuleError({ pg: { code: '23514', hint: 'local_relay:' + code, message: 'local_relay: ascii' } });
    assert.ok(Object.prototype.hasOwnProperty.call(W.RELAY_RULE_TEXT, code), `060 raises «${code}» — no Greek text in RELAY_RULE_TEXT`);
    assert.strictEqual(r.code, code);
    assert.strictEqual(r.message, W.RELAY_RULE_TEXT[code]);
    assert.match(r.message, greek, `${code} text is Greek`);
    assert.ok(!r.message.includes('δεν αποθηκεύτηκε ('), `${code} must not take the generic fallback`);
  }
  const dead = Object.keys(W.RELAY_RULE_TEXT).filter((k) => !hints.includes(k));
  assert.deepStrictEqual(dead, [], 'Worker hint keys that 060 never raises (dead code, αρχή 8)');
});

test('every 060 CHECK is either mapped to Greek or classified; every Worker CHECK key exists', () => {
  const sql = read060();
  const checks = uniq(/ADD CONSTRAINT (\w+) CHECK/g, sql);
  assert.ok(checks.includes('local_moves_kind_parent'), `060 CHECKs parsed: ${checks.join(', ')}`);
  for (const name of checks) {
    if (Object.prototype.hasOwnProperty.call(NOT_FACADE, name)) continue;
    assert.ok(name.startsWith('local_moves_') || name.startsWith('drivers_pay_basis'),
      `060 CHECK «${name}» is neither mapped nor classified — add a text or a NOT_FACADE reason`);
    const r = W.stockRuleError({ pg: { code: '23514', message: `new row violates check constraint "${name}"` } });
    assert.ok(r, `${name} → null (would be the 500 path)`);
    assert.match(r.message, greek, `${name} text is Greek`);
    assert.ok(!r.message.includes('κανόνας ' + name), `${name} must have its own text, not the generic «κανόνας» fallback`);
  }
  const known = new Set([...checks, ...LIVE_PRE_060]);
  const dead = Object.keys(W.RELAY_CHECK_TEXT).filter((k) => !known.has(k));
  assert.deepStrictEqual(dead, [], 'Worker CHECK keys with no constraint in 060 or live before it');
});

test('every 060 UNIQUE index is mapped or classified', () => {
  const sql = read060();
  const idx = uniq(/CREATE UNIQUE INDEX (\w+)/g, sql);
  assert.ok(idx.includes('local_moves_relay_once'), `060 unique indexes parsed: ${idx.join(', ')}`);
  for (const name of idx) {
    const r = W.stockRuleError({ pg: { code: '23505', message: `duplicate key value violates unique constraint "${name}"` } });
    if (Object.prototype.hasOwnProperty.call(NOT_FACADE_UNIQUE, name)) {
      assert.strictEqual(r, null, `${name}: ${NOT_FACADE_UNIQUE[name]}`);
      continue;
    }
    assert.ok(name.startsWith('local_moves_'), `060 unique index «${name}» is neither mapped nor classified`);
    assert.ok(r, `${name} → null (would be the 500 path)`);
    assert.match(r.message, greek);
  }
  // the race floor and the trigger's own refusal say the same thing
  const race = W.stockRuleError({ pg: { code: '23505', message: 'duplicate key value violates unique constraint "local_moves_relay_once"' } });
  assert.deepStrictEqual(race, { type: 'LOCAL_RELAY_RULE', code: 'relay_exists', message: W.RELAY_RULE_TEXT.relay_exists });
});
