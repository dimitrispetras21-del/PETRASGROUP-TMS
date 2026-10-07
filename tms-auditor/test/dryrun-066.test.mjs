// 066 (related orders join one round trip whatever the group suffix) and its check B-77, proved at build time
// (principle 6) - the evening run should only ever confirm what these tests already know.
// 1. The 066 dry run is GENERATED from 066 (same idea as 060/063): a hand-edited or stale copy would «prove»
//    statements the owner will never run (principle 3).
// 2. 066 re-creates two functions from their LIVE text, guarded by md5s read on production 7/10. Those texts are
//    the repo's own: rt_link_split = 037's body byte for byte, rt_create_from_order = 033's body without its
//    full-line comments (the executed copy carried none). Rebuilt here as pg_get_functiondef prints them, the
//    before/after md5s in 066, its dry run, its rules test and its rollback must be THESE texts and the ONE
//    substitution - a fingerprint left stale after an edit fails here, not as «066: ... re-measure» that evening.
// 3. 066 writes B-77 exactly as tms-auditor/checks/B-77.sql says (base64 for Greek), and its result row runs the
//    same SQL.
// 4. B-77's relation = the walks' relation: the audit allow-list has no split_part, so B-77 compares base Group
//    IDs with a back-reference regex. Proved equal to split_part(…,'|',1) on a grid of real-shaped ids.
// 5. B-77 on a fixture: the 7/10 incident before the repair = 1 (both orders named), after it = 0.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { buildDryRun, SOURCE, TARGET, DRAFTS } from '../../worker/migrations/drafts/tools/build-066-dryrun.mjs';
import { loadChecks } from '../checks/load.mjs';
import { freshDb, onlyChecks, all } from './helpers.mjs';

const OPEN = '\nDO $do$\n';
const CLOSE = '\nEND $do$;\n';
const nonAscii = (s) => [...s].filter((c) => c.charCodeAt(0) > 127);
const read = (f) => fs.readFileSync(path.join(DRAFTS, f), 'utf8');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const MIG = path.resolve(DRAFTS, '..');

// The live definitions as pg_get_functiondef prints them, rebuilt from the repo migrations.
const HEAD = (name) => `CREATE OR REPLACE FUNCTION public.${name}()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$`;
function body(file, head) {
  const s = fs.readFileSync(path.join(MIG, file), 'utf8');
  const a = s.indexOf(head);
  assert.ok(a >= 0, `${head} not found in ${file}`);
  const b = s.indexOf('as $$', a) + 'as $$'.length;
  return s.slice(b, s.indexOf('$$;', b));
}
const PROSRC_CREATE = body('033_rt_create_related.sql', 'create or replace function rt_create_from_order()')
  .split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
const PROSRC_SPLIT = body('037_rt_merge_split_pairs.sql', 'create or replace function rt_link_split()');
const DEF_CREATE = HEAD('rt_create_from_order') + PROSRC_CREATE + '$function$\n';
const DEF_SPLIT = HEAD('rt_link_split') + PROSRC_SPLIT + '$function$\n';
const lit = (src, name) => {
  const m = src.match(new RegExp(`  ${name} text := \\$c\\$(.*?)\\$c\\$;`));
  assert.ok(m, `${name} not declared`);
  return m[1];
};

test('066 dry run is regenerated from 066, never hand-edited (run: node worker/migrations/drafts/tools/build-066-dryrun.mjs)', () => {
  const src = fs.readFileSync(SOURCE, 'utf8');
  const dry = fs.readFileSync(TARGET, 'utf8');
  assert.equal(dry, buildDryRun(src));
  assert.equal((src.match(/^DO \$/gm) || []).length, 1, '066 must stay ONE DO block');
  assert.deepEqual(nonAscii(src), [], '066 must stay ASCII');
  const blk = src.slice(src.indexOf(OPEN) + OPEN.length, src.lastIndexOf(CLOSE));
  assert.ok(dry.includes(blk + '\nEND;\n'), 'the dry run must hold 066\'s block unchanged');
  assert.equal((dry.match(/^DO \$/gm) || []).length, 1, 'exactly ONE DO block');
  assert.deepEqual(nonAscii(dry), [], 'the dry run is ASCII');
  const tail = dry.slice(dry.lastIndexOf('RAISE EXCEPTION'));
  assert.match(tail, /^RAISE EXCEPTION 'DRY RUN 066 finished - EVERYTHING UNDONE, nothing kept\. Result: % OK, % FAIL {2}\|\| {2}%', ok, bad, array_to_string\(res, ' {2}\| {2}'\);\nEND\n\$dry\$;\n$/);
  const added = dry.replace(blk, '');
  for (const s of ['A', 'B', 'C', 'D']) assert.ok(added.includes(`EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('${s} ERROR ' || SQLERRM);`), `scenario ${s}`);
  // no trigger is added or dropped: the count is read and asserted before = after, B-54 is never written
  assert.match(blk, /IF NOT EXISTS \(SELECT 1 FROM monitoring\.checks WHERE id = 'B-54' AND red_value = trg_before AND baseline IS NULL\)/);
  assert.match(blk, /IF tg_after IS DISTINCT FROM tg_before OR trg_after <> trg_before/);
  assert.doesNotMatch(blk, /UPDATE monitoring\.checks|DELETE FROM monitoring|CREATE TRIGGER|DROP TRIGGER/i, '066 writes no trigger and no auditor row but its B-77 INSERT');
  assert.equal((blk.match(/INSERT INTO /g) || []).length, 1, 'one INSERT: B-77');
  assert.ok(added.includes("'C FAIL data changed during the dry run") && added.includes('wait 5 minutes and run the dry run once more'), 'scenario C FAIL names the retry');
  // C fingerprints everything but the one row 066 adds
  assert.ok(added.includes("FROM monitoring.checks WHERE id <> 'B-77'"));
});

test('the 066 builder refuses a 066 it does not understand (loud, never a silent wrong copy)', () => {
  assert.throws(() => buildDryRun('select 1;'), /not found/);
  assert.throws(() => buildDryRun('x\nDO $do$\nDECLARE\nBEGIN PERFORM 1; -- $dry$\nEND $do$;\n'), /choose other tags/);
});

test('066 fingerprints = the repo texts of 033/037 and the ONE substitution, in every 066 file', () => {
  const src = fs.readFileSync(SOURCE, 'utf8');
  const dry = fs.readFileSync(TARGET, 'utf8');
  const rb = read('066_rt_group_base_join_rollback.sql');
  const rt = read('066_rt_group_base_join_test.sql');
  for (const [name, s] of [['rollback', rb], ['rules test', rt]]) {
    assert.deepEqual(nonAscii(s), [], `066 ${name} must stay ASCII`);
    assert.equal((s.match(/^DO \$/gm) || []).length, 1, `066 ${name} must stay ONE DO block`);
  }
  // the same two strings in 066 and its rollback, the new one exactly the coordinator's condition
  const OLD = lit(src, 'cond_old'), NEW = lit(src, 'cond_new');
  assert.equal(OLD, '(cur.group_id is not null and n.group_id = cur.group_id)');
  assert.equal(NEW, "(cur.group_id is not null and split_part(n.group_id,'|',1) = split_part(cur.group_id,'|',1))");
  assert.equal(lit(rb, 'cond_old'), OLD); assert.equal(lit(rb, 'cond_new'), NEW);
  const before = { create: md5(DEF_CREATE), split: md5(DEF_SPLIT), createSrc: md5(PROSRC_CREATE), splitSrc: md5(PROSRC_SPLIT) };
  // = what the coordinator read on production 7/10 (pg_get_functiondef / prosrc)
  assert.deepEqual(before, { create: '3f3a01204f7f4a4b6546e965fc231ae3', split: '6189950c70b289fd5075afd17e28ecec',
    createSrc: 'f71d333b33e1404817779c4033534b30', splitSrc: '75da6f6f0389ba01ffd86074191eb4d7' });
  for (const d of [DEF_CREATE, DEF_SPLIT]) {
    assert.equal(d.split(OLD).length - 1, 1, 'the condition sits once in each walk');
    assert.equal(d.split(NEW).length - 1, 0);
    assert.equal(d.replace(OLD, NEW).replace(NEW, OLD), d, 'the swap undoes byte for byte');
  }
  const after = { create: md5(DEF_CREATE.replace(OLD, NEW)), split: md5(DEF_SPLIT.replace(OLD, NEW)),
    createSrc: md5(PROSRC_CREATE.replace(OLD, NEW)), splitSrc: md5(PROSRC_SPLIT.replace(OLD, NEW)) };
  const count = (s, x) => s.split(x).length - 1;
  // 066: guards on before (def + prosrc), proofs + result row on after, header names both
  assert.ok(src.includes(`IF md5(old_create) <> '${before.create}'`) && src.includes(`<> '${before.createSrc}' THEN`));
  assert.ok(src.includes(`IF md5(old_split) <> '${before.split}'`) && src.includes(`<> '${before.splitSrc}' THEN`));
  assert.equal(count(src, `'${after.create}'`), 3, '066: already-applied guard, proof, result row (create)');
  assert.equal(count(src, `'${after.split}'`), 3, '066: already-applied guard, proof, result row (split)');
  assert.ok(src.includes(`<> '${after.createSrc}'`) && src.includes(`<> '${after.splitSrc}'`), '066 proofs on prosrc');
  for (const h of [before.create, before.createSrc, before.split, before.splitSrc, after.create, after.createSrc, after.split, after.splitSrc]) {
    assert.ok(src.slice(0, src.indexOf(OPEN)).includes(h), `066 header names ${h}`);
  }
  // rollback: refuses unless 066's texts, proves the 7/10 texts after
  assert.ok(rb.includes(`IF md5(cur_create) <> '${after.create}' THEN`) && rb.includes(`IF md5(cur_split) <> '${after.split}' THEN`));
  assert.ok(rb.includes(`md5(pg_get_functiondef(fn_create)) <> '${before.create}'`) && rb.includes(`<> '${before.createSrc}' THEN`));
  assert.ok(rb.includes(`md5(pg_get_functiondef(fn_split)) <> '${before.split}'`) && rb.includes(`<> '${before.splitSrc}' THEN`));
  // rules test runs only on 066's texts; the dry run's A names them and its header the 7/10 ones
  assert.ok(rt.includes(`<> '${after.create}'`) && rt.includes(`<> '${after.split}'`));
  assert.ok(dry.includes(`= '${after.create}'`) && dry.includes(`= '${after.split}'`));
  assert.ok(dry.includes(`still ${before.create}`) && dry.includes(`still ${before.split}`));
  // no superuser-only statement anywhere (the SQL editor's postgres is rolsuper = false)
  for (const f of ['066_rt_group_base_join.sql', '066_rt_group_base_join_dryrun.sql', '066_rt_group_base_join_rollback.sql', '066_rt_group_base_join_test.sql']) {
    assert.doesNotMatch(read(f).replace(/--[^\n]*/g, ''), /ALTER\s+(FUNCTION|ROLE|SYSTEM)|SET\s+SESSION\s+AUTHORIZATION/i, `${f}: superuser-only statement`);
  }
  // the rules test: twelve scenarios, each reported once, and the header promises twelve
  for (let i = 1; i <= 12; i++) assert.equal(rt.split(`'S${i} `).length - 1, 1, `S${i} labelled once`);
  assert.ok(rt.includes('"Result: 12 OK, 0 FAIL"'));
});

// ---- 066's B-77 row = the catalog file -----------------------------------------------------------------------
const COLS = ['id', 'title', 'flows', 'sql_text', 'ids_sql', 'entity_table', 'red_op', 'red_value', 'baseline', 'severity',
  'schedule_tag', 'is_queue', 'impact', 'next_step', 'exceptions', 'tolerance', 'enabled', 'disabled_reason'];
const FIELD = { sql_text: 'sql', schedule_tag: 'schedule' };
function insertRow(src) {
  let i = src.indexOf('VALUES', src.indexOf('INSERT INTO monitoring.checks (id, title')) + 'VALUES'.length;
  const skip = () => { while (/[\s,]/.test(src[i])) i++; };
  const val = () => {
    skip();
    if (src.startsWith('$m$', i)) { const e = src.indexOf('$m$', i + 3); const v = src.slice(i + 3, e); i = e + 3; return v; }
    const b64 = "convert_from(decode('";
    if (src.startsWith(b64, i)) { const s = i + b64.length, e = src.indexOf("'", s); i = src.indexOf("'UTF8')", e) + 7; return Buffer.from(src.slice(s, e), 'base64').toString('utf8'); }
    if (src.startsWith('ARRAY[', i)) { const e = src.indexOf(']::text[]', i); const v = src.slice(i + 6, e).split(',').map((x) => x.replace(/\$m\$/g, '')); i = e + 9; return v; }
    const m = src.slice(i).match(/^(NULL|true|false|-?\d+(?:\.\d+)?)/);
    assert.ok(m, 'unexpected token in 066 INSERT: ' + src.slice(i, i + 40));
    i += m[0].length; return m[0] === 'NULL' ? null : m[0];
  };
  skip(); assert.equal(src[i], '(', '066 INSERT tuple'); i++;
  const row = Object.fromEntries(COLS.map((c) => [c, val()]));
  skip(); assert.equal(src[i], ')', '066 INSERT tuple end'); i++;
  skip(); assert.equal(src[i], ';', 'ONE tuple');
  return row;
}

test('066 writes B-77 exactly as tms-auditor/checks/B-77.sql says; its proofs and result row use the same texts', () => {
  const src = fs.readFileSync(SOURCE, 'utf8');
  const c = loadChecks().checks.find((x) => x.id === 'B-77');
  assert.ok(c && c.enabled && c.severity === 'P2' && c.schedule === 'hourly' && c.red_op === '>' && c.red_value === 0 && !c.is_queue);
  const r = insertRow(src);
  for (const col of COLS) {
    const want = col === 'flows' ? c.flows : (c[FIELD[col] || col] == null ? null : String(c[FIELD[col] || col]));
    assert.deepEqual(r[col], want, `B-77.${col}: 066 differs from tms-auditor/checks/B-77.sql - regenerate 066's literal`);
  }
  const fp = md5([r.title, r.sql_text, r.ids_sql ?? '', r.impact ?? '', r.next_step ?? '', r.exceptions ?? '', r.entity_table ?? '',
    r.red_op, String(r.red_value), r.severity, r.schedule_tag].join('|'));
  assert.equal(src.split(`= '${fp}'`).length - 1, 1, `066 proof 3c must name the fingerprint ${fp}`);
  assert.ok(src.slice(0, src.indexOf(OPEN)).includes(`\n-- ${fp}.\n`), '066 header names the fingerprint');
  assert.ok(fs.readFileSync(TARGET, 'utf8').includes(`= '${fp}'`), 'dry run D names the fingerprint');
  // the result row runs B-77's own SQL (no second copy that could drift)
  const row = src.slice(src.lastIndexOf('SELECT CASE WHEN'));
  assert.ok(row.includes(`(${c.sql}) AS b77_related_on_two_rts;`), 'result row = B-77.sql');
  // ids B-66..B-76 belong to the closed-RT plan (062): 066's statements name only B-54 and B-77
  assert.deepEqual([...new Set(src.slice(src.indexOf(OPEN)).match(/\bB-\d\d\b/g))].sort(), ['B-54', 'B-77']);
});

test('B-77 relates group ids exactly as the walks do: regex back-reference = split_part(id, \'|\', 1)', async () => {
  const c = loadChecks().checks.find((x) => x.id === 'B-77');
  const re = c.sql.match(/~ '([^']+)'/)[1];
  assert.ok(c.ids_sql.includes(`~ '${re}'`), 'sql and ids use the same pattern');
  const ids = ['GI-MUV7FNKE', 'GI-MUV7FNKE|rec3VtYdr6rqPykbG,rec0iMsyPTnjncyDv', 'GI-MUV7FNKE|rec0iMsyPTnjncyDv,rec3VtYdr6rqPykbG',
    'GI-MUV7FNK', 'GI-MUV7FNKEX', 'GI-MUV7FNKEX|recA', 'GRP-12', 'GRP-12|recA,recB', 'GRP-1', 'GRP-123|recA', 'GE-AB', 'GE-AB|',
    '|recA', '|recB', 'A|B|C', 'A|D', 'A', 'a', 'GI-mUV7FNKE', 'x y', 'x y|z', 'GRP-12||recA'];
  const db = new PGlite();
  try {
    const rows = (await db.query(`SELECT a, b, ((a || '#' || b) ~ $1) AS rx, (split_part(a, '|', 1) = split_part(b, '|', 1)) AS sp
      FROM unnest($2::text[]) a CROSS JOIN unnest($2::text[]) b`, [re, ids])).rows;
    assert.equal(rows.length, ids.length ** 2);
    const differ = rows.filter((r) => r.rx !== r.sp);
    assert.deepEqual(differ, [], 'B-77 and the walks disagree on these pairs');
    assert.ok(rows.some((r) => r.rx && r.a !== r.b), 'some different texts share a base');
    // NULL on either side relates nothing - as in the walk (cur.group_id is not null; split_part(NULL) = NULL)
    const n = (await db.query(`SELECT ((NULL::text || '#' || 'GI-1') ~ $1) AS a, (('GI-1' || '#' || NULL::text) ~ $1) AS b`, [re])).rows[0];
    assert.deepEqual(n, { a: null, b: null });
  } finally { await db.close(); }
});

test('B-77 on a fixture: the 7/10 split = 1 naming both orders; after the repair 0; deleted orders and cancelled trips never count', async () => {
  const db = await freshDb();
  try {
    await onlyChecks(db, ['B-77']);
    const q = (s, p) => db.query(s, p);
    const order = async (legacy, f = {}) => (await q(`INSERT INTO orders (legacy_id, status, direction, group_id, matched_import_id, rotation_id, deleted_at)
      VALUES ($1, 'Assigned', $2, $3, $4, $5, $6) RETURNING id`, [legacy, f.dir || 'Import', f.g || null, f.m || null, f.r || null, f.del ? new Date() : null])).rows[0].id;
    const trip = async (code, status = 'planned') => (await q(`INSERT INTO ct_round_trips (code, scope, trip_type, date_start, status, source, created_by, updated_at)
      VALUES ($1, 'INTL', 'OWNED', current_date, $2, 'planner', 'trigger:rt_create', now()) RETURNING id`, [code, status])).rows[0].id;
    const leg = (rt, o, dir = 'IMPORT') => q(`INSERT INTO ct_rt_legs (rt_id, direction, order_id) VALUES ($1, $2, $3)`, [rt, dir, o]);
    const b77 = async () => {
      await q(`SELECT monitoring.run_checks('hourly')`);
      const r = (await all(db, `SELECT value::int AS v, status, ids FROM monitoring.results WHERE check_id = 'B-77' ORDER BY id DESC LIMIT 1`))[0];
      return r;
    };
    // production after the 7/10 repair, in shape: RT-1217 = export #438 + group GI-MUV7FNKE (#451 with the suffix,
    // #449 too), a bare/bare group, a GRP export group, a matched pair, a rota, unrelated orders on their own trips
    const SUF = 'GI-MUV7FNKE|rec0iMsyPTnjncyDv,rec3VtYdr6rqPykbG';
    const rt1217 = await trip('RT-1217');
    const o438 = await order('recEXP438', { dir: 'Export', m: 'rec0iMsyPTnjncyDv' });
    const o451 = await order('rec0iMsyPTnjncyDv', { g: SUF });
    const o449 = await order('rec3VtYdr6rqPykbG', { g: SUF });
    await leg(rt1217, o438, 'EXPORT'); await leg(rt1217, o451);
    const rtA = await trip('RT-A'); await leg(rtA, await order('recGA1', { g: 'GI-AAAA' })); await leg(rtA, await order('recGA2', { g: 'GI-AAAA' }));
    const rtG = await trip('RT-G'); await leg(rtG, await order('recGRP1', { dir: 'Export', g: 'GRP-7|recGRP1,recGRP2' }), 'EXPORT');
    await leg(rtG, await order('recGRP2', { dir: 'Export', g: 'GRP-7' }), 'EXPORT');
    const rtP = await trip('RT-P'); await leg(rtP, await order('recPE', { dir: 'Export', m: 'recPI' }), 'EXPORT'); await leg(rtP, await order('recPI'));
    const rtR = await trip('RT-R'); await leg(rtR, await order('recRA')); await leg(rtR, await order('recRB', { dir: 'Export', r: 'recRA' }), 'EXPORT');
    for (let i = 0; i < 5; i++) { const t = await trip('RT-U' + i); await leg(t, await order('recU' + i, { g: i < 2 ? 'GI-U' + i : null })); }
    // noise that must never count: a deleted group member on another trip; a group member whose trip is cancelled
    const rtD = await trip('RT-D'); await leg(rtD, await order('recGA3', { g: 'GI-AAAA|recGA1', del: true }));
    const rtX = await trip('RT-X', 'cancelled'); await leg(rtX, await order('recGA4', { g: 'GI-AAAA' }));
    // the 7/10 state: #449 alone on RT-1220
    const rt1220 = await trip('RT-1220'); await leg(rt1220, o449);
    let r = await b77();
    assert.deepEqual([r.v, r.status, r.ids], [1, 'red', ['rec0iMsyPTnjncyDv', 'rec3VtYdr6rqPykbG']], 'the 7/10 split: one pair, both orders named');
    // the repair of 7/10: leg #449 moved to RT-1217, RT-1220 cancelled by the base
    await q(`UPDATE ct_rt_legs SET rt_id = $1 WHERE order_id = $2`, [rt1217, o449]);
    await q(`UPDATE ct_round_trips SET status = 'cancelled' WHERE id = $1`, [rt1220]);
    r = await b77();
    assert.deepEqual([r.v, r.status, r.ids], [0, 'green', []], 'after the repair: 0 (the seed value today)');
    // a related pair on another vehicle's trip counts too (033 makes it on purpose; the relation says one trip)
    const rtV = await trip('RT-V'); await leg(rtV, await order('recGA5', { g: 'GI-AAAA|recGA5' }));
    r = await b77();
    assert.deepEqual([r.v, r.status], [2, 'red'], 'GI-AAAA|recGA5 relates to both members on RT-A: two pairs');
  } finally { await db.close(); }
});
