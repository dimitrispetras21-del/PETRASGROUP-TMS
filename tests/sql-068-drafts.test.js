// tests/sql-068-drafts.test.js - run: node --test tests/sql-068-drafts.test.js
// The 068 (presence) drafts at build time, plain node, no database (principle 6). The SQL itself runs on PGlite
// in tms-auditor/test/presence-068.test.mjs; this file guards the text between the five files:
//   - ASCII only after the first line (clipboard-safe); the writing files are ONE DO block;
//   - the dry run holds 068's DO body byte for byte (its header's own check);
//   - service_role is REVOKEd before its grant and both 068 and verify prove exactly the four privileges (review 23/10);
//   - the changes join is the two index-friendly joins, and the rules test S13 compares THOSE ON clauses with the
//     old OR join (review 23/10);
//   - 068 creates no trigger (monitoring B-54 stays at the live count).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'worker/migrations/drafts');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const strip = (s) => s.replace(/--[^\n]*/g, '');
const FILES = ['068_presence.sql', '068_presence_dryrun.sql', '068_presence_rollback.sql', '068_presence_test.sql', '068_presence_verify.sql'];
const LEGACY_JOIN = 'JOIN orders o ON o.legacy_id = a.record_id';
const ID_JOIN = "JOIN orders o ON o.id = CASE WHEN a.record_id ~ '^[0-9]{1,18}$' THEN a.record_id::bigint END\n                     AND o.id::text = a.record_id";

test('the five 068 files are there and ASCII after the first line', () => {
  for (const f of FILES) {
    const rest = read(f).split('\n').slice(1).join('\n');
    assert.ok(!/[^\x00-\x7F]/.test(rest), `${f}: non-ASCII after line 1`);
  }
});

test('every 068 file is ONE DO block', () => {
  for (const f of FILES) {
    const body = strip(read(f));
    assert.strictEqual((body.match(/^DO \$/gm) || []).length, 1, `${f}: DO blocks`);
    assert.strictEqual(body.replace(/^DO \$(\w+)\$[\s\S]*?\n\$\1\$;\s*/m, '').trim(), '', `${f}: text outside the DO block`);
  }
});

test('the dry run holds 068 body byte for byte', () => {
  const b = read('068_presence.sql').split('DO $do$\n')[1].split('\n$do$;')[0];
  const r = read('068_presence_dryrun.sql').split('-- ===== BEGIN 068 body =====\n')[1].split('\n-- ===== END 068 body =====')[0];
  assert.strictEqual(r, b + ';', 'DRIFT - re-copy the 068 body into the dry run');
});

test('service_role: REVOKE ALL before the four-privilege GRANT, proven exact in 068 and verify', () => {
  const s = strip(read('068_presence.sql'));
  const rv = s.indexOf('REVOKE ALL ON public.presence FROM service_role;');
  const gr = s.indexOf('GRANT SELECT, INSERT, UPDATE, DELETE ON public.presence TO service_role;');
  assert.ok(rv > 0 && gr > rv, 'REVOKE ALL FROM service_role must come before its GRANT');
  assert.ok(s.includes("IS DISTINCT FROM 'DELETE,INSERT,SELECT,UPDATE'"), '068 proof of the exact four');
  const v = strip(read('068_presence_verify.sql'));
  assert.ok(v.includes("IS NOT DISTINCT FROM 'DELETE,INSERT,SELECT,UPDATE'"), 'verify V4 exact four');
  for (const p of ['TRUNCATE', 'REFERENCES', 'TRIGGER'])
    assert.ok(v.includes(`NOT has_table_privilege('service_role', 'public.presence', '${p}')`), `verify V4 refuses ${p}`);
});

test('changes join: two index-friendly joins under UNION, no OR join; S13 uses the same ON clauses', () => {
  const s = strip(read('068_presence.sql'));
  assert.ok(!/o\.legacy_id = a\.record_id OR/.test(s), '068 still has the OR join');
  assert.ok(s.includes(LEGACY_JOIN) && s.includes(ID_JOIN), '068 join clauses');
  assert.match(s, /AND a\.created_at > v_floor\n\s+UNION\n\s+SELECT a\.id/);
  const t = strip(read('068_presence_test.sql'));
  assert.ok(t.includes(LEGACY_JOIN.replace('orders o', 'public.orders o')), 'S13 legacy join = 068');
  assert.ok(t.includes(ID_JOIN.replace('orders o', 'public.orders o')), 'S13 id join = 068');
  assert.ok(t.includes('(o.legacy_id = a.record_id OR o.id::text = a.record_id)'), 'S13 compares with the old OR join');
  assert.match(read('068_presence_test.sql'), /Result: 13 OK, 0 FAIL/);
});

test('068 creates no trigger and touches no monitoring check (B-54 unchanged)', () => {
  const s = strip(read('068_presence.sql'));
  assert.ok(!/CREATE\s+(CONSTRAINT\s+)?TRIGGER/i.test(s));
  assert.ok(!/monitoring\./i.test(s));
});
