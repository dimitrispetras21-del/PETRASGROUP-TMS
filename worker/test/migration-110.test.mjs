// 110 (owner 8/11, «ΤΟΠΙΚΑ» panel): plan_board = the text 109 left + one hunk that adds the local driver's truck to
// stops[].local_loading. The files are ASCII; the hunk pair is the same in the run, the dry run and the rollback;
// the run and the dry run hold the same guards and md5s, and the rollback goes from the new md5 back to 109's. The
// md5s themselves were measured on the live text by SELECT md5(replace(prosrc, a, b)) (8/11); the dry run proves them
// again before anything is kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const D = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations/drafts');
const read = (f) => fs.readFileSync(path.join(D, f), 'utf8');
const RUN = read('110_plan_board_local_truck.sql');
const DRY = read('110_plan_board_local_truck_dryrun.sql');
const RB = read('110_plan_board_local_truck_rollback.sql');
const VER = read('110_plan_board_local_truck_verify.sql');
const OLD = '1fcb789ba0cf08aea836c3aa98270610';
const NEW = 'd8fa4ba5ea2ce1d4d87b33e22f499956';
const hunks = (t) => {
  const a = /b_a CONSTANT text := \$h\$([\s\S]*?)\$h\$;/.exec(t);
  const b = /b_b CONSTANT text := \$h\$([\s\S]*?)\$h\$;/.exec(t);
  return a && b ? [a[1], b[1]] : null;
};

test('110 files are ASCII', () => {
  for (const [n, t] of [['run', RUN], ['dry', DRY], ['rollback', RB], ['verify', VER]]) assert.ok(/^[\x00-\x7f]*$/.test(t), n);
});
test('one hunk pair, the same in the run, the dry run and the rollback', () => {
  const h = hunks(RUN);
  assert.ok(h);
  assert.deepEqual(hunks(DRY), h);
  assert.deepEqual(hunks(RB), h);
  // the new text only ADDS: the old hunk's lines stay, the truck keys and the left join come in
  assert.ok(h[1].includes("'truck_id', lm.truck_id, 'truck', tl2.license_plate)"));
  assert.ok(h[1].includes('left join trucks tl2 on tl2.id = lm.truck_id'));
  assert.ok(h[1].includes('from local_moves lm left join drivers d2 on d2.id = lm.driver_id'));
});
test('run and dry run: same guards (109 text in, measured text out), the dry run ends in an error', () => {
  for (const t of [RUN, DRY]) {
    assert.ok(t.includes(`md5(p.prosrc) IS DISTINCT FROM '${OLD}'`));
    assert.ok(t.includes(`IF md5(v_new) <> '${NEW}'`));
    assert.ok(t.includes("has_function_privilege('service_role', 'public.plan_board(date,text)', 'EXECUTE')"));
  }
  assert.ok(/RAISE EXCEPTION '110 DRY RUN OK:[^']*nothing kept'/.test(DRY));
  assert.ok(!/RAISE NOTICE '110 OK/.test(DRY), 'the dry run never ends in the success notice');
});
test('rollback: from the new md5 back to 109\'s; verify reads the new md5', () => {
  assert.ok(RB.includes(`IS DISTINCT FROM '${NEW}'`));
  assert.ok(RB.includes(`IF md5(v_new) <> '${OLD}'`));
  assert.ok(RB.includes('replace(p.prosrc, b_b, b_a)'));
  assert.ok(VER.includes(`md5(prosrc) = '${NEW}'`));
  assert.ok(!/\b(insert|update|delete|create|drop|alter)\b/i.test(VER.replace(/--.*$/gm, '')), 'verify is read-only');
});
