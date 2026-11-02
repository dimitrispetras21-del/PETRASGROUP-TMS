// tests/sql-097-drafts.test.js - run: node --test tests/sql-097-drafts.test.js
// The 097 / 097b drafts (owner 2/11: Dragan's export and his return from Voitsberg on two round trips) at build time,
// plain node, no database:
//   - every file and the builder are there; ASCII only; the writing files are ONE DO block; verify only reads;
//   - the four generated dry runs have 0 drift;
//   - one md5 per fact: the trigger 097 creates is the one its rollback drops and verify reads;
//   - 097 creates exactly one trigger and calls rt_link_split unchanged (no function text, no table, no grant).
// The rules are proven on PGlite by tms-auditor/test/rt-097.test.mjs (the 2/11 sequence NO-GO live, GO after 097).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DRAFTS = path.join(ROOT, 'worker/migrations/drafts');
// drafts/ until the owner runs them, then one up (CLAUDE.md rule 5); never both
const file = (f) => {
  const d = path.join(DRAFTS, f), m = path.join(ROOT, 'worker/migrations', f);
  if (fs.existsSync(d) && fs.existsSync(m)) throw new Error(`${f} in drafts/ AND one up`);
  return fs.existsSync(d) ? d : m;
};
const read = (f) => fs.readFileSync(file(f), 'utf8');
const strip = (s) => s.replace(/--[^\n]*/g, '');
const A = '097_rt_split_vehicle_recheck', B = '097b_rt_split_repair';
const DO_FILES = [`${A}.sql`, `${A}_dryrun.sql`, `${A}_rollback.sql`, `${A}_rollback_dryrun.sql`,
  `${B}.sql`, `${B}_dryrun.sql`, `${B}_rollback.sql`, `${B}_rollback_dryrun.sql`];
const BUILDER = path.join(DRAFTS, 'tools/build-097.mjs');
const TRIGGER_MD5 = /md5\(pg_get_triggerdef\(oid\)\) = '([0-9a-f]{32})'/;

test('097: every file is there, ASCII only; one DO block per writing file; verify only reads', () => {
  for (const f of [...DO_FILES, `${A}_verify.sql`]) {
    const bad = read(f).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[^\x00-\x7f]/.test(l));
    assert.deepStrictEqual(bad, [], `${f}: non-ASCII lines`);
  }
  for (const f of DO_FILES) assert.strictEqual((strip(read(f)).match(/^DO \$/gm) || []).length, 1, f);
  const v = strip(read(`${A}_verify.sql`)).replace(/deleted_at|created_at/g, '');
  assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate|perform)\b/i.test(v));
});

test('097: the builder has no drift (four dry runs)', () => {
  assert.match(execFileSync(process.execPath, [BUILDER, '--check']).toString(), /0 drift/);
});

test('097: one md5 per fact - the trigger 097 proves is the one the rollback drops and verify reads', () => {
  const m = TRIGGER_MD5.exec(read(`${A}.sql`))[1];
  assert.strictEqual(TRIGGER_MD5.exec(read(`${A}_rollback.sql`))[1], m);
  assert.strictEqual(TRIGGER_MD5.exec(read(`${A}_verify.sql`))[1], m);
  assert.ok(!/GEN_/.test(read(`${A}.sql`)), 'no placeholder left');
});

test('097 creates one trigger that calls rt_link_split as it is; 097b writes only through rt_merge', () => {
  const src = strip(read(`${A}.sql`));
  assert.strictEqual((src.match(/CREATE TRIGGER/g) || []).length, 1);
  assert.match(src, /CREATE TRIGGER rt_y_link_split_vehicle\s+AFTER UPDATE OF truck_id, partner_id, is_partner_trip ON public\.orders[\s\S]*?EXECUTE FUNCTION public\.rt_link_split\(\);/);
  assert.ok(!/CREATE (OR REPLACE )?(TABLE|FUNCTION|VIEW|INDEX)\b/.test(src));
  assert.ok(!/\b(GRANT|REVOKE|ALTER)\b/.test(src));
  // the name sorts after rt_sync_from_order (013 puts the vehicle on the round trip first) and before rt_z_*
  assert.ok('rt_sync_from_order' < 'rt_y_link_split_vehicle' && 'rt_y_link_split_vehicle' < 'rt_z_auto_close_order');
  const rep = strip(read(`${B}.sql`));
  assert.ok(!/\b(INSERT|UPDATE|DELETE)\b/.test(rep.replace(/FOR UPDATE/g, '')), '097b writes only through rt_merge');
  assert.match(rep, /PERFORM rt_merge\(k\.id, d\.id,/);
});
