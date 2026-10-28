// 074a (national v5 F5, the reads day L needs) on a production-shaped PGlite copy, at build time (principle 6): the
// owner's evening run should only confirm what this file already knows.
// Production shape = ONE builder (prod-shaped-072.mjs with the live money views and 072b), then the v1 money fixture,
// 073 and 073b as executed - the state of production 28/10 - checked against fixtures/live-073b.sql (the SELECT
// capture of that day: the texts 074a hooks or calls, the columns it reads, what must not exist yet).
// Then: the dry run keeps nothing; 074a applies with 0 v5 rows and no trigger (A8); the verify; the rules test
// (074a_plan_reads_test.sql, A1-A7, B1-B5, E-19) all OK; four mutations, each failing exactly its cases; the rollback
// refuses after day L or with a v5 row, and otherwise returns the live texts byte for byte; 074a again.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prodShaped072, TRG } from './prod-shaped-072.mjs';
import { migrationFile, DRAFTS } from '../lib/db.mjs';
import { IDS as IDS_073B } from '../../worker/migrations/drafts/tools/build-073b.mjs';
import { hooks, finalMd5, CREATED } from '../../worker/migrations/drafts/tools/build-074a.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');                   // 073 / 073b: executed, out of drafts/
const draft = (f) => fs.readFileSync(path.join(DRAFTS, f), 'utf8');              // 074a: a draft until the owner runs it
const fixture = (f) => fs.readFileSync(path.join(HERE, 'fixtures', f), 'utf8');

const V5_ROWS = `SELECT (SELECT count(*) FROM shipments) + (SELECT count(*) FROM shipment_pieces) + (SELECT count(*) FROM rt_stops)
  + (SELECT count(*) FROM piece_legs) + (SELECT count(*) FROM plan_notices) + (SELECT count(*) FROM ct_round_trips WHERE model = 2)
  + (SELECT count(*) FROM rt_vehicle_segments) AS n`;

async function prodShaped() {
  const db = await prodShaped072(true, { money: 'live', with072b: true });
  await db.exec(fixture('v1-money-073.sql'));
  await db.exec(read('073_plan_money.sql'));
  // the local seed (047b, generated from every check file) already holds 073b's checks; production had none before 073b
  await db.query('DELETE FROM monitoring.checks WHERE id = ANY($1)', [IDS_073B]);
  await db.exec(read('073b_plan_monitoring.sql'));
  return db;
}
async function errorOf(db, sql) { try { await db.exec(sql); return null; } catch (e) { return String(e.message); } }
const count = async (db, sql) => Number((await db.query(sql)).rows[0].n);
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
const fnMd5 = async (db, sig) => (await one(db, 'SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = to_regprocedure($1)', [sig]))?.m;
const wantCount = (sql) => (sql.match(/^ {4}, '(ok|plan:[a-z0-9_]+|con:[a-z0-9_]+|state:[0-9A-Z]{5})'/gm) || []).length;
const failedCases = (msg) => [...(msg || '').matchAll(/\| (\d+) FAIL want/g)].map((m) => Number(m[1]));
// A mutation: the live function with one text replaced (exactly once), through its own CREATE OR REPLACE
async function mutate(db, sig, from, to) {
  const def = (await one(db, 'SELECT pg_get_functiondef(to_regprocedure($1)) AS d', [sig])).d;
  assert.strictEqual(def.split(from).length, 2, `${sig}: the mutated text is there exactly once`);
  await db.exec(def.replace(from, () => to));   // a function: "$$" in the text stays "$$", never a replacement pattern
}

test('074a on the production-shaped copy', async (t) => {
  const db = await prodShaped();
  const src = draft('074a_plan_reads.sql');
  const trg0 = await count(db, TRG);
  const live = (await db.query(fixture('live-073b.sql'))).rows;

  await t.test('the copy is production of 28/10 (fixtures/live-073b.sql), and 074a guards on those same texts', async () => {
    const fns = live.filter((r) => r.kind === 'fn');
    assert.ok(fns.length >= 8);
    for (const r of fns) assert.strictEqual(await fnMd5(db, r.name), r.value, `${r.name}: re-capture if production moved`);
    for (const r of live.filter((x) => x.kind === 'col')) {
      const [tb, col] = r.name.split('.');
      const got = await one(db, `SELECT data_type AS t FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`, [tb, col]);
      assert.strictEqual(got?.t, r.value, r.name);
    }
    for (const r of live.filter((x) => x.kind === 'nocol')) {
      const [tb, col] = r.name.split('.');
      assert.strictEqual((await db.query(`SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`, [tb, col])).rows.length, 0, r.name);
    }
    assert.strictEqual(await count(db, `SELECT count(*) AS n FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'plan\\_%'`),
      Number(live.find((r) => r.name === 'plan_functions').value));
    // the md5 074a guards on (PART 0) and starts its hooks from are the captured ones
    const byName = Object.fromEntries(live.filter((r) => r.kind === 'fn').map((r) => [r.name, r.value]));
    for (const m of src.slice(src.indexOf('PART 0'), src.indexOf('PART 1')).matchAll(/\('(public\.[^']+)', '([0-9a-f]{32})'\)/g)) {
      assert.strictEqual(m[2], byName[m[1]], `PART 0 ${m[1]}`);
    }
    for (const f of finalMd5(src)) assert.strictEqual(f.before, byName[f.sig], `${f.sig}: the first hook starts from the live text`);
  });

  await t.test('NO-GO before 074a: the rules test refuses (it tests something that is not there yet)', async () => {
    const msg = await errorOf(db, draft('074a_plan_reads_test.sql'));
    assert.match(msg ?? '', /RULES TEST 074a: 074a is not applied/);
  });

  await t.test('074a dry run runs to its end and keeps nothing', async () => {
    const msg = await errorOf(db, draft('074a_plan_reads_dryrun.sql'));
    assert.match(msg ?? '', /DRY RUN 074a finished - EVERYTHING UNDONE, nothing kept\. The block ran to its end {2}\|\| {2}074a ran: hooked functions 2, for_split_at yes, plan_config rows 0, config \{"opened_at": null, "cutover_day": null\}, lookups lists 6, hubs 1, open to API 0, triggers (\d+), B-54 \1, v5 rows 0/, msg);
    assert.strictEqual((await one(db, `SELECT to_regclass('public.plan_config')::text AS r`)).r, null);
    for (const f of finalMd5(src)) assert.strictEqual(await fnMd5(db, f.sig), f.before, `${f.sig} untouched`);
  });

  await t.test('074a applies: A8 0 v5 rows, no trigger, B-54 unchanged', async () => {
    const res = await db.exec(src);
    const r = res.at(-1).rows[0];
    assert.strictEqual(r.result, '074a OK');
    assert.strictEqual(Number(r.hooked_functions), 2);
    assert.strictEqual(Number(r.plan_config_rows), 0);
    assert.strictEqual(Number(r.public_triggers), trg0);
    assert.strictEqual(Number(r.b54_red_value), trg0);
    assert.strictEqual(await count(db, V5_ROWS), 0);
    assert.strictEqual(await count(db, TRG), trg0);
  });

  await t.test('074a verify: in place, closed, empty, B-54 matches', async () => {
    const r = await one(db, draft('074a_plan_reads_verify.sql'));
    assert.strictEqual(r.applied, '074a in place');
    assert.strictEqual(Number(r.hooks_in_place), 2);
    assert.strictEqual(r.column_ok, true);
    assert.strictEqual(Number(r.plan_config_rows), 0);
    assert.deepStrictEqual(r.config, { cutover_day: null, opened_at: null });
    assert.strictEqual(Number(r.lookups_lists), 6);
    assert.strictEqual(Number(r.hubs), 1);
    assert.strictEqual(Number(r.open_to_api), 0);
    assert.strictEqual(Number(r.worker_can_call), 3);
    assert.strictEqual(r.b54_matches, true);
    assert.strictEqual(Number(r.v5_rows), 0);
  });

  await t.test('the Worker role reads what it needs, anon nothing (service_role as PostgREST calls it)', async () => {
    await db.exec('SET ROLE service_role');
    try {
      const cfg = (await one(db, 'SELECT plan_config_read() AS j')).j;
      assert.deepStrictEqual(cfg, { cutover_day: null, opened_at: null });
      const lk = (await one(db, `SELECT plan_lookups('dispatcher') AS j`)).j;
      assert.deepStrictEqual(Object.keys(lk).sort(), ['clients', 'drivers', 'locations', 'partners', 'trailers', 'trucks']);
      const pv = (await one(db, `SELECT order_delete_preview('rec-none', 'dispatcher') AS j`)).j;
      assert.deepStrictEqual(pv, { ok: true, op: 'order_delete_preview', order_id: null, needs_confirm: false, confirm_token: null, consequences: [] });
      assert.match(await errorOf(db, `SELECT plan_cutover_day()`) ?? '', /permission denied/);
      assert.match(await errorOf(db, `INSERT INTO plan_config VALUES (1, '2099-01-03', now(), 'x')`) ?? '', /permission denied/);
    } finally { await db.exec('RESET ROLE'); }
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      try {
        for (const s of CREATED) {
          const call = `SELECT ${s.replace('(text,text)', "('x','owner')").replace('(text)', "('owner')")}`;
          assert.match(await errorOf(db, call) ?? '', /permission denied/, `${role} ${s}`);
        }
      } finally { await db.exec('RESET ROLE'); }
    }
  });

  const rules = draft('074a_plan_reads_test.sql');
  const n = wantCount(rules);
  await t.test('074a rules test: every case OK, nothing kept', async () => {
    assert.ok(n >= 26, `${n} cases`);
    const msg = await errorOf(db, rules);
    assert.match(msg ?? '', new RegExp(`RULES TEST 074a finished - EVERYTHING UNDONE, nothing kept\\. Result: ${n} OK, 0 FAIL`), msg);
    assert.strictEqual(await count(db, V5_ROWS), 0);
    assert.strictEqual(await count(db, 'SELECT count(*) AS n FROM plan_config'), 0);
  });

  // Each mutation breaks one rule of 074a and must fail exactly its cases (the rules test sees the rule, not a side
  // effect); then the 074a text is put back and checked by md5. [what, function, text, replacement, cases]
  const MUTATIONS = [
    ['no is_hub on the stops (E-27)', 'public.plan_board(date,text)', "'is_hub', coalesce(lo.is_hub, false),", "'no_hub', null,", [3, 13]],
    ['no mark on Split -> Veroia (E-41)', 'public.plan_move_pieces(jsonb,text,text)',
      'update shipment_pieces set for_split_at = now() where id = v_x;', 'perform 1;', [6]],
    ['an old mark never goes stale (E-41)', 'public.plan_board(date,text)', 'l.created_at > sp.for_split_at', 'l.id < 0', [7]],
    ['the delete preview shows amounts to every role (E-19)', 'public.order_delete_preview(text,text)',
      'plan_h_strip_amounts(v_full, p_role)', 'plan_h_strip_amounts(v_full, $$owner$$)', [23]],
  ];
  for (const [what, sig, from, to, cases] of MUTATIONS) {
    await t.test(`mutation "${what}" fails cases ${cases.join(', ')} only`, async () => {
      const m0 = await fnMd5(db, sig);
      await mutate(db, sig, from, to);
      try {
        const msg = await errorOf(db, rules);
        assert.match(msg ?? '', /RULES TEST 074a finished/, msg);
        assert.deepStrictEqual(failedCases(msg), cases, msg);
      } finally {
        await mutate(db, sig, to, from);
      }
      assert.strictEqual(await fnMd5(db, sig), m0, `${sig} back to its 074a text`);
    });
  }

  await t.test('rollback refuses after day L (plan_config has its row) and with a v5 row; nothing changed', async () => {
    const rb = draft('074a_plan_reads_rollback.sql');
    await db.exec('BEGIN');
    await db.exec(`INSERT INTO plan_config VALUES (1, current_date + 1 + ((12 - extract(isodow FROM current_date)::int) % 7) + 7, now(), 'test:074a')`);
    assert.match(await errorOf(db, rb) ?? '', /074 is applied \(plan_config has its row or plan_cutover_log exists\) - roll back 074 first/);
    await db.exec('ROLLBACK');
    await db.exec('BEGIN');
    await db.exec('SET CONSTRAINTS ALL DEFERRED');
    await db.exec(`DO $x$ DECLARE no bigint; sh bigint; hub bigint; la bigint; BEGIN
      SELECT id INTO hub FROM locations WHERE is_hub;
      INSERT INTO locations (legacy_id, name) VALUES ('rec074aRB', 'TEST 074a RB') RETURNING id INTO la;
      INSERT INTO national_orders (legacy_id, reference, price, pallets) VALUES ('rec074aRBN', 'WN074a-TEST', 1, 1) RETURNING id INTO no;
      INSERT INTO shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to, deliver_from, deliver_to, created_by)
      VALUES (no, la, hub, 1, now() + interval '40 days', now() + interval '40 days 1 hour', now() + interval '40 days 2 hours',
              now() + interval '40 days 3 hours', 'test:074a') RETURNING id INTO sh;
      INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (sh, 1, 'test:074a');
    END $x$`);
    assert.match(await errorOf(db, rb) ?? '', /074a rollback: 2 v5 row\(s\) exist - after the first real v5 row there is no rollback/);
    await db.exec('ROLLBACK');
    const r = await one(db, draft('074a_plan_reads_verify.sql'));
    assert.strictEqual(r.applied, '074a in place');
    assert.strictEqual(Number(r.hooks_in_place), 2);
  });

  await t.test('rollback: the live texts back byte for byte, plan_config and the column gone; then 074a again', async () => {
    const res = await db.exec(draft('074a_plan_reads_rollback.sql'));
    const r = res.at(-1).rows[0];
    assert.strictEqual(r.result, '074a ROLLED BACK');
    assert.strictEqual(Number(r.plan_functions), 80);
    assert.strictEqual(Number(r.public_triggers), trg0);
    for (const f of finalMd5(src)) assert.strictEqual(await fnMd5(db, f.sig), f.before, `${f.sig} back to the live text`);
    assert.strictEqual((await db.query(`SELECT 1 FROM pg_attribute WHERE attrelid = 'public.shipment_pieces'::regclass AND attname = 'for_split_at' AND NOT attisdropped`)).rows.length, 0);
    for (const s of CREATED) assert.strictEqual((await one(db, 'SELECT to_regprocedure($1)::text AS p', [s])).p, null, s);
    assert.strictEqual((await db.exec(src)).at(-1).rows[0].result, '074a OK');
    assert.strictEqual(hooks(src).length, 4);
    const msg = await errorOf(db, rules);
    assert.match(msg ?? '', new RegExp(`Result: ${n} OK, 0 FAIL`), msg);
  });
});
