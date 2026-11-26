// Generates the dry run, the rollback, the rollback's dry run and verify of 115 FROM its source (115_rt_partner_plates.sql):
//   node worker/migrations/drafts/tools/build-115.mjs          (writes them)
//   node worker/migrations/drafts/tools/build-115.mjs --check  (exit 1 if a committed file drifted)
// Why generated (principle 3): the dry run runs EXACTLY the owner's statements, and the rollback reverses EXACTLY the
// hunks 115 applied - it declares the source's own constants block (live md5, generated md5, hunks), never a hand copy.
// tests/sql-115-drafts.test.js fails on drift; tms-auditor/test/plan-115.test.mjs runs them on a PGlite copy.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDryRun } from './build-073-dryrun.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// drafts/ until the owner runs 115, then one up (CLAUDE.md rule 5): the builder stays here
const DRAFTS = path.resolve(HERE, '..');
const P = '115_rt_partner_plates';
export const SOURCE = `${P}.sql`;
export const DIR = fs.existsSync(path.join(DRAFTS, SOURCE)) ? DRAFTS : path.resolve(DRAFTS, '..');
const OPEN_C = '  -- ===== CONSTANTS (115)';
const CLOSE_C = '  -- ===== END CONSTANTS =====\n';

// the hunks in the order 115 applies them, per function
export const HUNKS = { upd: ['u0', 'u1', 'u2'], cre: ['c0', 'c1', 'c2', 'c3', 'c4'], brd: ['b1'] };

export function facts(src) {
  const a = src.indexOf(OPEN_C), b = src.indexOf(CLOSE_C);
  if (a < 0 || b < a) throw new Error(`${SOURCE}: the constants block was not found`);
  const block = src.slice(a, b + CLOSE_C.length);
  const consts = Object.fromEntries([...block.matchAll(/^ {2}([a-z0-9_]+) CONSTANT text := (?:'([^']*)'|\$h\$([\s\S]*?)\$h\$);$/gm)]
    .map((m) => [m[1], m[2] ?? m[3]]));
  const need = ['m_upd_live', 'm_cre_live', 'm_brd_live', 'm_upd_gen', 'm_cre_gen', 'm_brd_gen'];
  for (const h of HUNKS.upd.concat(HUNKS.cre, HUNKS.brd)) need.push(h + '_a', h + '_b');
  for (const k of need) if (!(k in consts)) throw new Error(`${SOURCE}: constant ${k} missing`);
  return { consts, block };
}
// the texts 115 writes, from live texts (the PGlite test checks the source's m_*_gen with it)
export function generated(live) {
  const { consts: c } = facts(fs.readFileSync(path.join(DIR, SOURCE), 'utf8'));
  const app = (t, hs) => hs.reduce((x, h) => x.replace(c[h + '_a'], () => c[h + '_b']), t);
  return { upd: app(live.upd, HUNKS.upd), cre: app(live.cre, HUNKS.cre), brd: app(live.brd, HUNKS.brd) };
}

const SIG = { upd: 'public.plan_rt_update(jsonb,text,text)', cre: 'public.plan_rt_create(jsonb,text,text)', brd: 'public.plan_board(date,text)' };
const TRG_COUNT = `SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND n.nspname = 'public'`;

const EPI = `  res := format('115 ran: columns %s, checks %s, trigger %s, helper %s, upd %s, cre %s, brd %s, B-54 %s of %s',
    (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.ct_round_trips'::regclass AND NOT attisdropped
      AND attname IN ('partner_plates', 'partner_driver')),
    (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.ct_round_trips'::regclass
      AND conname IN ('rt_partner_text_shape', 'rt_partner_text_partner')),
    (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.ct_round_trips'::regclass AND tgname = 'rt_partner_text_follow'),
    (SELECT count(*) FROM pg_proc WHERE proname = 'plan_h_partner_text'),
    (SELECT md5(prosrc) FROM pg_proc WHERE oid = '${SIG.upd}'::regprocedure),
    (SELECT md5(prosrc) FROM pg_proc WHERE oid = '${SIG.cre}'::regprocedure),
    (SELECT md5(prosrc) FROM pg_proc WHERE oid = '${SIG.brd}'::regprocedure),
    (SELECT red_value FROM monitoring.checks WHERE id = 'B-54'), (${TRG_COUNT}));`;

// The reverse: every hunk b -> a in the opposite order, each exactly once; the result must be the live md5 115 met.
function rbSwap(key, fn) {
  const hs = HUNKS[key].slice().reverse();
  const once = hs.map((h) => `(length(v_new) - length(replace(v_new, ${h}_b, ''))) <> length(${h}_b)`).join('\n     OR ');
  let rep = 'v_new';
  for (const h of hs) rep = `replace(${rep}, ${h}_b, ${h}_a)`;
  return `  SELECT * INTO p FROM pg_proc WHERE oid = '${SIG[key]}'::regprocedure;
  v_new := p.prosrc;
  IF ${once} THEN
    RAISE EXCEPTION '115 rollback: a hunk of ${fn} is not in its text exactly once - stop';
  END IF;
  v_new := ${rep};
  IF md5(v_new) <> m_${key}_live THEN RAISE EXCEPTION '115 rollback: ${fn} would not return to its live text (md5 %) - stop', md5(v_new); END IF;
  EXECUTE format('CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS %s LANGUAGE plpgsql %s %s SET search_path = public AS %L',
    p.proname, pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
    CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
    CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END, v_new);
  IF (SELECT proacl::text FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.proacl::text THEN
    RAISE EXCEPTION '115 rollback: ${fn} lost its rights';
  END IF;
`;
}

export function buildRollback(src) {
  const { block } = facts(src);
  return `-- 115 ROLLBACK - GENERATED by worker/migrations/drafts/tools/build-115.mjs from ${SOURCE}.
-- DO NOT EDIT BY HAND (tests/sql-115-drafts.test.js fails on drift). ASCII only, ONE DO block.
-- Puts back plan_rt_update / plan_rt_create / plan_board as 115 met them (md5 m_*_live), drops the trigger
-- rt_partner_text_follow and its function, the helper plan_h_partner_text, the two CHECKs and the two columns, and
-- B-54 back by one. It REFUSES while a trip holds plates or a partner driver: those texts are what a dispatcher typed,
-- and a rollback never loses them in silence (copy them out first; the message says how many).
-- The front end needs nothing: plan_board stops naming the keys and the two fields hide themselves.
-- ONE CHAIN WITH 114: this rollback runs BEFORE 114's (plan_board goes back to the text 114 wrote).
-- EXPECTED: NOTICE "115 ROLLED BACK: ...".
DO $do$
DECLARE
${block}  p pg_proc%rowtype; v_new text; v_n bigint; v_trg0 int; v_trg1 int; v_k int;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  PERFORM set_config('search_path', 'public', true);
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ct_round_trips'
        AND column_name IN ('partner_plates', 'partner_driver')) <> 2 THEN
    RAISE EXCEPTION '115 rollback: 115 has not run, nothing to reverse';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = '${SIG.upd}'::regprocedure) IS DISTINCT FROM m_upd_gen
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = '${SIG.cre}'::regprocedure) IS DISTINCT FROM m_cre_gen
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = '${SIG.brd}'::regprocedure) IS DISTINCT FROM m_brd_gen THEN
    RAISE EXCEPTION '115 rollback: a function is no longer the text 115 wrote (a later migration changed it) - stop';
  END IF;
  SELECT count(*) INTO v_n FROM public.ct_round_trips WHERE partner_plates IS NOT NULL OR partner_driver IS NOT NULL;
  IF v_n > 0 THEN
    RAISE EXCEPTION '115 rollback: % trips hold partner plates or a partner driver - copy them out first (SELECT id, partner_plates, partner_driver FROM ct_round_trips WHERE partner_plates IS NOT NULL OR partner_driver IS NOT NULL), nothing changed', v_n;
  END IF;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND n.nspname = 'public';
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value::int = v_trg0) THEN
    RAISE EXCEPTION '115 rollback: B-54 red_value is not the live trigger count % - re-measure', v_trg0;
  END IF;
  -- ===== the texts back =====
${rbSwap('upd', 'plan_rt_update')}${rbSwap('cre', 'plan_rt_create')}${rbSwap('brd', 'plan_board')}  -- ===== the trigger, the helper, the rules, the columns =====
  DROP TRIGGER rt_partner_text_follow ON public.ct_round_trips;
  DROP FUNCTION public.rt_partner_text_follow();
  DROP FUNCTION public.plan_h_partner_text(jsonb, text, integer);
  ALTER TABLE public.ct_round_trips DROP CONSTRAINT rt_partner_text_partner, DROP CONSTRAINT rt_partner_text_shape;
  ALTER TABLE public.ct_round_trips DROP COLUMN partner_plates, DROP COLUMN partner_driver;
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND n.nspname = 'public';
  IF v_trg1 <> v_trg0 - 1 THEN RAISE EXCEPTION '115 rollback: triggers % -> %, expected one fewer', v_trg0, v_trg1; END IF;
  UPDATE monitoring.checks SET red_value = v_trg1 WHERE id = 'B-54' AND red_value::int = v_trg0;
  GET DIAGNOSTICS v_k = ROW_COUNT;
  IF v_k <> 1 THEN RAISE EXCEPTION '115 rollback: B-54 not updated (% rows)', v_k; END IF;
  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE '115 ROLLED BACK: three texts back to their live md5, trigger and helper gone, columns dropped; triggers % -> %, B-54 = %',
    v_trg0, v_trg1, v_trg1;
END $do$;
`;
}

export function buildVerify(src) {
  const { consts: c } = facts(src);
  return `-- 115 VERIFY - GENERATED by worker/migrations/drafts/tools/build-115.mjs from ${SOURCE}. Read-only.
-- Expected ONE row, every column true.
SELECT
  (SELECT md5(prosrc) FROM pg_proc WHERE oid = '${SIG.upd}'::regprocedure) = '${c.m_upd_gen}' AS upd_ok,
  (SELECT md5(prosrc) FROM pg_proc WHERE oid = '${SIG.cre}'::regprocedure) = '${c.m_cre_gen}' AS cre_ok,
  (SELECT md5(prosrc) FROM pg_proc WHERE oid = '${SIG.brd}'::regprocedure) = '${c.m_brd_gen}' AS brd_ok,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ct_round_trips'
     AND column_name IN ('partner_plates', 'partner_driver')) = 2 AS columns_ok,
  (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.ct_round_trips'::regclass
     AND conname IN ('rt_partner_text_shape', 'rt_partner_text_partner') AND convalidated) = 2 AS checks_ok,
  (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.ct_round_trips'::regclass AND tgname = 'rt_partner_text_follow'
     AND tgenabled <> 'D') = 1 AS trigger_ok,
  (SELECT red_value::int FROM monitoring.checks WHERE id = 'B-54') = (${TRG_COUNT}) AS b54_ok,
  -- plan_rt_create has no EXECUTE for the Worker (25/11 SELECT): plan_put_pieces calls it, SECURITY DEFINER
  has_function_privilege('service_role', '${SIG.upd}', 'EXECUTE')
    AND has_function_privilege('service_role', '${SIG.brd}', 'EXECUTE') AS worker_exec,
  NOT has_function_privilege('anon', 'public.plan_h_partner_text(jsonb,text,integer)', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'public.plan_h_partner_text(jsonb,text,integer)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.rt_partner_text_follow()', 'EXECUTE') AS born_closed;
`;
}

const DRY = {
  source: SOURCE, target: `${P}_dryrun.sql`, name: 'DRY RUN 115', epilogue: EPI,
  header: (c) => `-- 115 DRY RUN - GENERATED by worker/migrations/drafts/tools/build-115.mjs from ${SOURCE}.
-- DO NOT EDIT BY HAND (tests/sql-115-drafts.test.js fails on drift). ONE DO block = ONE statement: its final error
-- undoes everything inside it (lesson 056). ASCII only. AFTER 15:00, BEFORE ${SOURCE}.
-- EXPECTED (the red ERROR is deliberate): NOTICE "115 OK: ..." and then
--   ERROR: P0001: DRY RUN 115 finished - EVERYTHING UNDONE, nothing kept. The block ran to its end  ||  115 ran:
--   columns 2, checks 2, trigger 1, helper 1, upd ${c.m_upd_gen}, cre ${c.m_cre_gen},
--   brd ${c.m_brd_gen}, B-54 N of N (the same N twice: the live count plus one)
-- Any other error = stop, 115 is not run.`,
};
const RB_DRY = {
  source: `${P}_rollback.sql`, target: `${P}_rollback_dryrun.sql`, name: 'DRY RUN 115 ROLLBACK', epilogue: EPI,
  header: (c) => `-- 115 ROLLBACK DRY RUN - GENERATED by worker/migrations/drafts/tools/build-115.mjs from ${P}_rollback.sql.
-- DO NOT EDIT BY HAND. ONE DO block, its final error undoes everything. ASCII only.
-- EXPECTED: NOTICE "115 ROLLED BACK: ..." then ERROR: P0001: DRY RUN 115 ROLLBACK finished - EVERYTHING UNDONE ...
--   ||  115 ran: columns 0, checks 0, trigger 0, helper 0, upd ${c.m_upd_live}, cre ${c.m_cre_live},
--   brd ${c.m_brd_live}, B-54 N of N`,
};

export function buildAll() {
  const src = fs.readFileSync(path.join(DIR, SOURCE), 'utf8');
  const { consts: c } = facts(src);
  const rb = buildRollback(src);
  return {
    [DRY.target]: buildDryRun(src, { ...DRY, header: DRY.header(c) }),
    [`${P}_rollback.sql`]: rb,
    [RB_DRY.target]: buildDryRun(rb, { ...RB_DRY, header: RB_DRY.header(c) }),
    [`${P}_verify.sql`]: buildVerify(src),
  };
}

// realpath: through a symlink path.resolve would differ and --check could not fail (found on 072b's tool)
if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const out = buildAll();
  if (process.argv.includes('--check')) {
    const drift = Object.entries(out).filter(([f, s]) => !fs.existsSync(path.join(DIR, f)) || fs.readFileSync(path.join(DIR, f), 'utf8') !== s);
    for (const [f] of drift) console.error('drift: ' + f);
    console.log(`${drift.length} drift`);
    process.exit(drift.length ? 1 : 0);
  }
  for (const [f, s] of Object.entries(out)) fs.writeFileSync(path.join(DIR, f), s);
  console.log('wrote ' + Object.keys(out).join(', '));
}
