// The 057 dry run (worker/migrations/drafts/057_stock_lots_dryrun.sql) is GENERATED from 057 — the same idea as
// the 047b seed-drift test: a hand-edited or stale copy would «prove» statements the owner will never run that
// evening (principle 3). Its behaviour on a production-shaped database (the result line, nothing kept, a broken
// guard speaking with its own message) is proved in the PGlite replica of 057, not here: this fixture has no
// orders_with_derived / ct_v_rt_revenue to run 057 against.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { buildDryRun, SOURCE, TARGET } from '../../worker/migrations/drafts/tools/build-057-dryrun.mjs';

const BODY_OPEN = '\ndo $mig$\n';
const BODY_CLOSE = '\nend\n$mig$;';

test('057 dry run is regenerated from 057, never hand-edited (run: node worker/migrations/drafts/tools/build-057-dryrun.mjs)', () => {
  const src = fs.readFileSync(SOURCE, 'utf8');
  const dry = fs.readFileSync(TARGET, 'utf8');
  assert.equal(dry, buildDryRun(src));
  // 057's block sits inside unchanged (declare … end), as a nested block of the ONE outer DO block
  const body = src.slice(src.indexOf(BODY_OPEN) + BODY_OPEN.length, src.lastIndexOf(BODY_CLOSE));
  assert.ok(dry.includes(body + '\nend;\n'), 'the dry run must hold 057\'s block unchanged');
  assert.equal((dry.match(/^DO \$/gim) || []).length, 1, 'exactly ONE DO block');
  // the deliberate error is the very last statement of the block
  const tail = dry.slice(dry.lastIndexOf('RAISE EXCEPTION'));
  assert.match(tail, /^RAISE EXCEPTION 'DRY RUN 057 finished - EVERYTHING UNDONE, nothing kept\. Result: % OK, % FAIL {2}\|\| {2}%', ok, bad, array_to_string\(res, ' {2}\| {2}'\);\nEND\n\$dry\$;\n$/);
  // what the dry run adds around 057 is ASCII (the owner's clipboard has mangled Greek before)
  const added = dry.replace(body, '');
  assert.deepEqual([...added].filter((c) => c.charCodeAt(0) > 127), []);
  // six scenarios, each in its own exception block so one error never hides the others
  for (const s of ['A', 'B', 'C', 'D', 'E', 'F']) assert.match(added, new RegExp(`exception when others then bad := bad \\+ 1; res := res \\|\\| \\('${s} ERROR ' \\|\\| sqlerrm\\);`));
});

test('the builder refuses a 057 it does not understand (loud, never a silent wrong copy)', () => {
  assert.throws(() => buildDryRun('select 1;'), /not found/);
  assert.throws(() => buildDryRun('x\ndo $mig$\nbegin perform 1; end $fp$\nend\n$mig$;'), /choose other tags/);
});
