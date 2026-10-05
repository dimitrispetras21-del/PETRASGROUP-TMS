// The 060 dry run (worker/migrations/drafts/060_local_relay_dryrun.sql) is GENERATED from 060 — same idea as the
// 057 pair and the 047b seed-drift test: a hand-edited or stale copy would «prove» statements the owner will never
// run that evening (principle 3). Its behaviour on a production-shaped database (the result line, nothing kept, a
// broken guard speaking with its own message) needs order_soft_delete_unlink / dl_v_entries at their measured md5,
// which this fixture does not have; what IS proved here is the shape, at build time (principle 6).
// Second test: 060 carries the auditor rows B-09 / B-63..B-65 as literals (base64 for Greek) plus md5 proofs of
// them. Editing a check file without regenerating 060 used to surface only that evening as «060 proof: only 2 of
// B-63..B-65 match the catalog» — here it fails at build time.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { buildDryRun, SOURCE, TARGET } from '../../worker/migrations/drafts/tools/build-060-dryrun.mjs';
import { loadChecks } from '../checks/load.mjs';

const OPEN = '\nDO $do$\n';
const CLOSE = '\nEND $do$;\n';
const ascii = (s) => [...s].filter((c) => c.charCodeAt(0) > 127);

test('060 dry run is regenerated from 060, never hand-edited (run: node worker/migrations/drafts/tools/build-060-dryrun.mjs)', () => {
  const src = fs.readFileSync(SOURCE, 'utf8');
  const dry = fs.readFileSync(TARGET, 'utf8');
  assert.equal(dry, buildDryRun(src));
  // 060 itself: ONE DO block, ASCII only (the owner pastes it from a clipboard that has mangled Greek before)
  assert.equal((src.match(/^DO \$/gm) || []).length, 1, '060 must stay ONE DO block');
  assert.deepEqual(ascii(src), [], '060 must stay ASCII');
  // 060's block sits inside unchanged (DECLARE … no END), as a nested block of the ONE outer DO block
  const body = src.slice(src.indexOf(OPEN) + OPEN.length, src.lastIndexOf(CLOSE));
  assert.ok(dry.includes(body + '\nEND;\n'), 'the dry run must hold 060\'s block unchanged');
  assert.equal((dry.match(/^DO \$/gm) || []).length, 1, 'exactly ONE DO block');
  assert.deepEqual(ascii(dry), [], 'the dry run is ASCII');
  // the deliberate error is the very last statement of the block
  const tail = dry.slice(dry.lastIndexOf('RAISE EXCEPTION'));
  assert.match(tail, /^RAISE EXCEPTION 'DRY RUN 060 finished - EVERYTHING UNDONE, nothing kept\. Result: % OK, % FAIL {2}\|\| {2}%', ok, bad, array_to_string\(res, ' {2}\| {2}'\);\nEND\n\$dry\$;\n$/);
  // three scenarios, each in its own exception block so one error never hides the others
  const added = dry.replace(body, '');
  for (const s of ['A', 'B', 'C']) assert.ok(added.includes(`EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('${s} ERROR ' || SQLERRM);`), `scenario ${s}`);
  // B-54 is counted inside the block, never typed: 060 requires red_value = the live count before, proves +5,
  // moves it only from that value (27 alone, 31 after 057 -> 36); the dry run checks the same +5 on the result
  assert.match(body, /IF NOT EXISTS \(SELECT 1 FROM monitoring\.checks WHERE id = 'B-54' AND red_value = trg_before AND baseline IS NULL\)/);
  assert.match(body, /IF trg_after <> trg_before \+ 5 THEN/);
  assert.match(body, /UPDATE monitoring\.checks SET red_value = trg_after WHERE id = 'B-54' AND red_value = trg_before;/);
  assert.ok(added.includes('dry_n = dry_trg_before + 5'), 'scenario B must check the +5');
});

test('the builder refuses a 060 it does not understand (loud, never a silent wrong copy)', () => {
  assert.throws(() => buildDryRun('select 1;'), /not found/);
  assert.throws(() => buildDryRun('x\nDO $do$\nDECLARE\nBEGIN PERFORM 1; -- $dry$\nEND $do$;\n'), /choose other tags/);
});

// ---- 060's auditor rows = the catalog files ------------------------------------------------------------------
const COLS = ['id', 'title', 'flows', 'sql_text', 'ids_sql', 'entity_table', 'red_op', 'red_value', 'baseline', 'severity',
  'schedule_tag', 'is_queue', 'impact', 'next_step', 'exceptions', 'tolerance', 'enabled', 'disabled_reason'];
const FIELD = { sql_text: 'sql', schedule_tag: 'schedule' };
function insertRows(src) {
  let i = src.indexOf('VALUES', src.indexOf('INSERT INTO monitoring.checks (id, title')) + 'VALUES'.length;
  const skip = () => { while (/[\s,]/.test(src[i])) i++; };
  const val = () => {
    skip();
    if (src.startsWith('$m$', i)) { const e = src.indexOf('$m$', i + 3); const v = src.slice(i + 3, e); i = e + 3; return v; }
    const b64 = "convert_from(decode('";
    if (src.startsWith(b64, i)) { const s = i + b64.length, e = src.indexOf("'", s); i = src.indexOf("'UTF8')", e) + 7; return Buffer.from(src.slice(s, e), 'base64').toString('utf8'); }
    if (src.startsWith('ARRAY[', i)) { const e = src.indexOf(']::text[]', i); const v = src.slice(i + 6, e).split(',').map((x) => x.replace(/\$m\$/g, '')); i = e + 9; return v; }
    const m = src.slice(i).match(/^(NULL|true|false|-?\d+(?:\.\d+)?)/);
    assert.ok(m, 'unexpected token in 060 INSERT: ' + src.slice(i, i + 40));
    i += m[0].length; return m[0] === 'NULL' ? null : m[0];
  };
  const rows = [];
  for (let t = 0; t < 3; t++) {
    skip(); assert.equal(src[i], '(', '060 INSERT tuple'); i++;
    rows.push(Object.fromEntries(COLS.map((c) => [c, val()])));
    skip(); assert.equal(src[i], ')', '060 INSERT tuple end'); i++;
  }
  return rows;
}

test('060 writes B-09 and B-63..B-65 exactly as the catalog files say, and its md5 proofs match them', () => {
  const src = fs.readFileSync(SOURCE, 'utf8');
  const by = Object.fromEntries(loadChecks().checks.map((c) => [c.id, c]));
  const rows = insertRows(src);
  assert.deepEqual(rows.map((r) => r.id), ['B-63', 'B-64', 'B-65']);
  for (const r of rows) {
    const c = by[r.id];
    for (const col of COLS) {
      const want = col === 'flows' ? c.flows : (c[FIELD[col] || col] == null ? null : String(c[FIELD[col] || col]));
      assert.deepEqual(r[col], want, `${r.id}.${col}: 060 differs from tms-auditor/checks/${r.id}.sql — regenerate 060's literal`);
    }
    // the proof in 060 section 10: md5(title|sql|ids|impact|next|exceptions|entity|red_op|red_value|severity|schedule)
    const fp = crypto.createHash('md5').update([r.title, r.sql_text, r.ids_sql ?? '', r.impact ?? '', r.next_step ?? '',
      r.exceptions ?? '', r.entity_table ?? '', r.red_op, String(r.red_value), r.severity, r.schedule_tag].join('|')).digest('hex');
    assert.ok(src.includes(`('${r.id}', '${fp}')`), `${r.id}: the md5 proof in 060 is not ${fp}`);
  }
  // B-09: sql / ids / exceptions only (the other columns stay as the owner left them), and their md5 proofs
  const b9 = by['B-09'];
  const u = src.indexOf("UPDATE monitoring.checks SET\n    sql_text = $m$");
  const lit = (from) => { const s = src.indexOf('$m$', from) + 3; return [src.slice(s, src.indexOf('$m$', s)), src.indexOf('$m$', s) + 3]; };
  const [sql9, after9] = lit(u);
  const [ids9, afterIds] = lit(after9);
  const d = src.indexOf("decode('", afterIds) + "decode('".length;
  const exc9 = Buffer.from(src.slice(d, src.indexOf("'", d)), 'base64').toString('utf8');
  assert.equal(sql9, b9.sql); assert.equal(ids9, b9.ids_sql); assert.equal(exc9, b9.exceptions);
  const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
  assert.ok(src.includes(`md5(sql_text) = '${md5(b9.sql)}' AND md5(ids_sql) = '${md5(b9.ids_sql)}' AND md5(exceptions) = '${md5(b9.exceptions)}'`), 'B-09 md5 proof in 060');
});
