// Generates the three WRITING files of 071a from their sources (principle 3: generated, never retyped):
//   071a_invoice_from_registration.sql           the change (ONE DO block)
//   071a_invoice_from_registration_dryrun.sql    the same block + a deliberate error: NOTHING kept
//   071a_invoice_from_registration_rollback.sql  the exact way back (ONE DO block)
//   node worker/migrations/drafts/tools/build-071a.mjs          (writes all three)
//   node worker/migrations/drafts/tools/build-071a.mjs --check  (exit 1 if a committed file drifted)
// Sources:
//   - the three stock guards as they LIVE: 057's function bodies byte for byte (prosrc md5 read on
//     production 22/10/2026 = the md5 of 057's text, asserted below);
//   - SUBS: every place where «invoiced» stood for «the lot is finished» (owner 21/10/2026: every order,
//     a lot included, is invoiced from its registration). The ONLY invoice rule left in the guards is the
//     lot PRICE freeze (the invoice states that price; OWNER-Q4 4/10);
//   - the auditor rows B-15 and S-03 exactly as tms-auditor/checks/*.sql state them (the seed 047b is
//     generated from the same files, so the base and the seed cannot disagree).
// Greek travels as base64 (precedent 066): the generated files are ASCII only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadChecks } from '../../../../tms-auditor/checks/load.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DIR = path.resolve(HERE, '../..');   // 057/060/069/071a executed: out of drafts/ (CLAUDE.md rule 5)
export const SRC_057 = path.join(DIR, '057_stock_lots.sql');
export const TARGETS = {
  apply: '071a_invoice_from_registration.sql',
  dryrun: '071a_invoice_from_registration_dryrun.sql',
  rollback: '071a_invoice_from_registration_rollback.sql',
};
export const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const count = (hay, needle) => hay.split(needle).length - 1;

// prosrc md5 of the three guards, read on production 22/10/2026 (SELECT md5(prosrc) FROM pg_proc ...).
export const LIVE_MD5 = {
  stock_guard_lots: '46e61e5f4c1e74af19cba5ddaa9f2975',
  stock_guard_orders: '20833484dffdf168b1e1de9fdc242027',
  stock_guard_natl: '26b4cc060ab15152a51693c9f0a67f81',
};
// The auditor rows as they live (read 22/10/2026): 071a changes them only if they are still these.
export const LIVE_B15_MD5 = '40d8808efe298f7321a8706dc726a784';
export const LIVE_S03_MD5 = '0df9746599fb62724c719d2f467ff280';
export const LIVE_B15_SQL = "SELECT count(*) FROM orders o LEFT JOIN stock_v_lots l ON l.order_id = o.id WHERE o.deleted_at IS NULL AND o.status='Delivered' AND o.invoiced IS NOT TRUE AND o.parent_order_id IS NULL AND o.stock_lot_id IS NULL AND CASE WHEN l.id IS NULL THEN coalesce(o.actual_delivery_date,o.delivery_datetime) < current_date-30 ELSE l.complete AND l.completed_on < current_date-30 END";

// The body of `create function public.<fn>()` in 057 = what Postgres keeps as prosrc.
export function body057(src, fn) {
  const i = src.indexOf(`create function public.${fn}() returns trigger`);
  if (i < 0) throw new Error(`057: ${fn} not found`);
  const a = src.indexOf('$f$', i) + 3;
  const b = src.indexOf('$f$', a);
  return src.slice(a, b);
}

const C = '-- 071a (owner 21/10/2026): ';
export const SUBS = [
  // ── stock_guard_lots ───────────────────────────────────────────────────────────────────────────
  { fn: 'stock_guard_lots', old: '    v_invoiced boolean;\n', new: '' },
  { fn: 'stock_guard_lots', old: `    -- invoiced read from the source row itself (also when the source is deleted).
    v_invoiced := coalesce((select o2.invoiced from public.orders o2 where o2.id = new.order_id),
                           (select n2.invoiced from public.national_orders n2 where n2.id = new.nat_order_id),
                           false);

`, new: `    ${C}the source's invoice no longer judges anything here: an invoiced
    -- lot is marked, closed, reopened and unmarked like any other.

` },
  { fn: 'stock_guard_lots', old: `      if v_invoiced then
        perform stock_raise('lot_invoiced', 'Η παρτίδα τιμολογήθηκε — δεν καταργείται');
      end if;
`, new: '' },
  { fn: 'stock_guard_lots', old: 'is distinct from old.warehouse_charge and v_invoiced then', new: 'is distinct from old.warehouse_charge and <source invoiced> then' },
  { fn: 'stock_guard_lots', old: `        if coalesce(o.invoiced, false) then
          perform stock_raise('lot_invoiced', 'Τιμολογημένη παραγγελία δεν γίνεται παρτίδα');
        end if;
        if public.order_pallets(o) <= 0 then`, new: `        if public.order_pallets(o) <= 0 then` },
  { fn: 'stock_guard_lots', old: `        if coalesce(n.invoiced, false) then
          perform stock_raise('lot_invoiced', 'Τιμολογημένη παραγγελία δεν γίνεται παρτίδα');
        end if;
`, new: '' },
  { fn: 'stock_guard_lots', old: `      if v_invoiced then
        perform stock_raise('reopen_invoiced', 'Τιμολογημένη παρτίδα δεν ξανανοίγει');
      end if;
`, new: '' },
  { fn: 'stock_guard_lots', old: `      if v_invoiced then
        perform stock_raise('lot_invoiced', 'Η παρτίδα τιμολογήθηκε — δεν αλλάζει');
      end if;
`, new: '' },
  // ── stock_guard_orders ─────────────────────────────────────────────────────────────────────────
  { fn: 'stock_guard_orders', old: '    v_done    bigint;\n', new: '' },
  { fn: 'stock_guard_orders', old: `        -- Locked like a draw: a delete racing «Invoiced» on the lot queues behind it (or before it).
        perform 1 from public.stock_lots s where s.id = new.stock_lot_id for no key update;
        if coalesce((select coalesce(so.invoiced, sn.invoiced, false)
                       from public.stock_lots s
                       left join public.orders so on so.id = s.order_id
                       left join public.national_orders sn on sn.id = s.nat_order_id
                      where s.id = new.stock_lot_id), false) then
          perform stock_raise('lot_invoiced', 'Η παρτίδα τιμολογήθηκε — αναίρεσε πρώτα το τιμολόγιο');
        end if;
`, new: `        -- Locked like a draw (D-22). ${C.slice(3)}the lot's invoice no longer refuses a delete.
        perform 1 from public.stock_lots s where s.id = new.stock_lot_id for no key update;
` },
  { fn: 'stock_guard_orders', old: 'select v.client_id, v.warehouse_location_id, v.ops_status, v.invoiced, v.closed_at, v.stock_pallets, v.intake_status',
    new: 'select v.client_id, v.warehouse_location_id, v.ops_status, v.closed_at, v.stock_pallets, v.intake_status' },
  { fn: 'stock_guard_orders', old: `        if st.invoiced then
          perform stock_raise('lot_invoiced', 'Η παρτίδα τιμολογήθηκε — αναίρεσε πρώτα το τιμολόγιο');
        end if;
`, new: `        ${C}an invoiced lot still gives pieces (invoiced from registration).
` },
  { fn: 'stock_guard_orders', old: `      -- Once the lot is invoiced, the piece's status is frozen (round 1, critic-3 Σ-08 / critic-2
      -- E2-11): an Undo of «Παραδόθηκε» or a form re-save after the invoice would leave an invoiced
      -- lot with a piece «in transit» — invoiced AND incomplete, found only by S-03 an hour later.
      -- Revivals and inserts are already judged above (lot_invoiced). Only a piece LEAVING Delivered
      -- can race the invoice mark (which reads «all delivered»), so only that takes the lot lock —
      -- FOR NO KEY UPDATE like every draw (D-22); other status steps never lock the lot.
      if tg_op = 'UPDATE' and not v_revived and new.status is distinct from old.status then
        if old.status = 'Delivered' then
          perform 1 from public.stock_lots s where s.id = new.stock_lot_id for no key update;
        end if;
        if coalesce((select coalesce(so.invoiced, sn.invoiced, false)
                       from public.stock_lots s
                       left join public.orders so on so.id = s.order_id
                       left join public.national_orders sn on sn.id = s.nat_order_id
                      where s.id = new.stock_lot_id), false) then
          perform stock_raise('lot_invoiced', 'Η παρτίδα τιμολογήθηκε — η κατάσταση του κομματιού δεν αλλάζει· αναίρεσε πρώτα το τιμολόγιο');
        end if;
      end if;
`, new: `      ${C}the lot's invoice no longer freezes a piece's status (the round-1
      -- freeze assumed the invoice came last; it now comes first). A piece LEAVING Delivered still takes
      -- the lot lock, FOR NO KEY UPDATE like every draw (D-22): the close reads "all delivered".
      if tg_op = 'UPDATE' and not v_revived and new.status is distinct from old.status
         and old.status = 'Delivered' then
        perform 1 from public.stock_lots s where s.id = new.stock_lot_id for no key update;
      end if;
` },
  { fn: 'stock_guard_orders', old: `      select count(*), count(*) filter (where p.delivered), coalesce(sum(p.pallets), 0)
        into v_pieces, v_done, v_drawn
`, new: `      select count(*), coalesce(sum(p.pallets), 0)
        into v_pieces, v_drawn
` },
  { fn: 'stock_guard_orders', old: `        -- Round 1 (critic-2 E2-11, the source side of Σ-08): an invoiced lot's intake stays
        -- delivered — the status of the source no longer changes while «Invoiced» stays on. Clearing
        -- «Invoiced» in the same save passes (the 043 guard decides who may do that).
        if old.invoiced is true and new.invoiced is true and new.status is distinct from old.status then
          perform stock_raise('lot_invoiced', 'Η παρτίδα τιμολογήθηκε — η κατάσταση της παραλαβής δεν αλλάζει· αναίρεσε πρώτα το τιμολόγιο');
        end if;
`, new: `        ${C}the intake's status follows the warehouse after the invoice too.
` },
  { fn: 'stock_guard_orders', old: `Clearing
        -- «Invoiced» in the same save passes, like the status freeze above.`, new: `Clearing
        -- the invoice in the same save passes. 071a keeps THIS rule: the invoice states the price.` },
  { fn: 'stock_guard_orders', old: `      -- ONE invoice for the whole lot, only when everything arrived (owner 3–4/10): judged with the
      -- NEW status, so «Delivered + Invoiced» in one save is judged as the save would leave it.
      if new.invoiced is true and (tg_op = 'INSERT' or old.invoiced is not true) then
        if not coalesce(new.status = 'Delivered' and v_pieces = v_done
                        and (v_new_p - v_drawn = 0 or v_lot.closed_at is not null), false) then
          perform stock_raise('invoice_incomplete',
            format('Η παρτίδα δεν τιμολογείται ακόμη: %s παλέτες στην αποθήκη, %s κομμάτια σε εξέλιξη',
                   trim_scale(v_new_p - v_drawn), v_pieces - v_done));
        end if;
      end if;
`, new: `      ${C}a lot is invoiced like any order, from its registration. The
      -- old "one invoice only when everything arrived" refusal (invoice_incomplete) is gone.
` },
  // ── stock_guard_natl ───────────────────────────────────────────────────────────────────────────
  { fn: 'stock_guard_natl', old: '    v_done    bigint;\n', new: '' },
  { fn: 'stock_guard_natl', old: `        perform 1 from public.stock_lots s where s.id = new.stock_lot_id for no key update;
        if coalesce((select coalesce(so.invoiced, sn.invoiced, false)
                       from public.stock_lots s
                       left join public.orders so on so.id = s.order_id
                       left join public.national_orders sn on sn.id = s.nat_order_id
                      where s.id = new.stock_lot_id), false) then
          perform stock_raise('lot_invoiced', 'Η παρτίδα τιμολογήθηκε — αναίρεσε πρώτα το τιμολόγιο');
        end if;
        if old.status = 'In Transit'`, new: `        perform 1 from public.stock_lots s where s.id = new.stock_lot_id for no key update;
        ${C}the lot's invoice no longer refuses a delete.
        if old.status = 'In Transit'` },
  { fn: 'stock_guard_natl', old: 'select v.client_id, v.warehouse_location_id, v.ops_status, v.invoiced, v.closed_at, v.stock_pallets, v.intake_status',
    new: 'select v.client_id, v.warehouse_location_id, v.ops_status, v.closed_at, v.stock_pallets, v.intake_status' },
  { fn: 'stock_guard_natl', old: `        if st.invoiced then
          perform stock_raise('lot_invoiced', 'Η παρτίδα τιμολογήθηκε — αναίρεσε πρώτα το τιμολόγιο');
        end if;
`, new: `        ${C}an invoiced lot still gives pieces (invoiced from registration).
` },
  { fn: 'stock_guard_natl', old: `      -- Invoiced lot → the piece's status is frozen (round 1 Σ-08, see stock_guard_orders). National
      -- «delivered» is derived from status AND date, so a delivery date moved past today (delivered
      -- → not) is the same step back as a status change; a date correction that stays delivered passes.
      if tg_op = 'UPDATE' and not v_revived
         and (new.status is distinct from old.status
              or public.stock_natl_delivered(new.status, new.delivery_datetime)
                 is distinct from public.stock_natl_delivered(old.status, old.delivery_datetime)) then
        if public.stock_natl_delivered(old.status, old.delivery_datetime) then
          perform 1 from public.stock_lots s where s.id = new.stock_lot_id for no key update;
        end if;
        if coalesce((select coalesce(so.invoiced, sn.invoiced, false)
                       from public.stock_lots s
                       left join public.orders so on so.id = s.order_id
                       left join public.national_orders sn on sn.id = s.nat_order_id
                      where s.id = new.stock_lot_id), false) then
          perform stock_raise('lot_invoiced', 'Η παρτίδα τιμολογήθηκε — η κατάσταση του κομματιού δεν αλλάζει· αναίρεσε πρώτα το τιμολόγιο');
        end if;
      end if;
`, new: `      ${C}the lot's invoice no longer freezes a piece's status or date
      -- (see stock_guard_orders). A piece LEAVING delivered still takes the lot lock (D-22).
      if tg_op = 'UPDATE' and not v_revived
         and (new.status is distinct from old.status
              or public.stock_natl_delivered(new.status, new.delivery_datetime)
                 is distinct from public.stock_natl_delivered(old.status, old.delivery_datetime))
         and public.stock_natl_delivered(old.status, old.delivery_datetime) then
        perform 1 from public.stock_lots s where s.id = new.stock_lot_id for no key update;
      end if;
` },
  { fn: 'stock_guard_natl', old: `      select count(*), count(*) filter (where p.delivered), coalesce(sum(p.pallets), 0)
        into v_pieces, v_done, v_drawn
`, new: `      select count(*), coalesce(sum(p.pallets), 0)
        into v_pieces, v_drawn
` },
  { fn: 'stock_guard_natl', old: `        -- Round 1 (E2-11, see stock_guard_orders): an invoiced lot's intake stays delivered — status
        -- and the date-derived «delivered» of the national source no longer change while invoiced.
        if old.invoiced is true and new.invoiced is true
           and (new.status is distinct from old.status
                or public.stock_natl_delivered(new.status, new.delivery_datetime)
                   is distinct from public.stock_natl_delivered(old.status, old.delivery_datetime)) then
          perform stock_raise('lot_invoiced', 'Η παρτίδα τιμολογήθηκε — η κατάσταση της παραλαβής δεν αλλάζει· αναίρεσε πρώτα το τιμολόγιο');
        end if;
`, new: `        ${C}the intake's status follows the warehouse after the invoice too.
` },
  { fn: 'stock_guard_natl', old: `      if new.invoiced is true and (tg_op = 'INSERT' or old.invoiced is not true) then
        if not coalesce(public.stock_natl_delivered(new.status, new.delivery_datetime) and v_pieces = v_done
                        and (v_new_p - v_drawn = 0 or v_lot.closed_at is not null), false) then
          perform stock_raise('invoice_incomplete',
            format('Η παρτίδα δεν τιμολογείται ακόμη: %s παλέτες στην αποθήκη, %s κομμάτια σε εξέλιξη',
                   trim_scale(v_new_p - v_drawn), v_pieces - v_done));
        end if;
      end if;
`, new: `      ${C}a lot is invoiced like any order, from its registration
      -- (invoice_incomplete is gone, see stock_guard_orders).
` },
];
export const FNS = ['stock_guard_lots', 'stock_guard_orders', 'stock_guard_natl'];


// Applies SUBS to the live texts: every target exactly once, in order. Throws on any deviation.
export function generate(src057) {
  const out = {};
  for (const fn of FNS) {
    const live = body057(src057, fn);
    if (md5(live) !== LIVE_MD5[fn]) throw new Error(`${fn}: 057's text (md5 ${md5(live)}) is not the live text ${LIVE_MD5[fn]}`);
    const subs = SUBS.filter((s) => s.fn === fn);
    let next = live;
    for (const s of subs) {
      if (count(next, s.old) !== 1) throw new Error(`${fn}: target not exactly once: ${JSON.stringify(s.old.slice(0, 60))}`);
      if (nonAscii(s.new).length) throw new Error(`${fn}: a new text must be ASCII: ${JSON.stringify(s.new.slice(0, 60))}`);
      next = next.replace(s.old, () => s.new);
    }
    out[fn] = { live, next, subs };
  }
  return out;
}

// The auditor rows after 071a, from the ONE source the seed is built from.
export function auditorRows() {
  const { checks, errors } = loadChecks();
  if (errors.length) throw new Error('tms-auditor/checks lint: ' + errors.join('; '));
  const b15 = checks.find((c) => c.id === 'B-15');
  const s03 = checks.find((c) => c.id === 'S-03');
  if (!b15 || !s03) throw new Error('B-15 / S-03 missing from tms-auditor/checks');
  if (s03.enabled) throw new Error('S-03.sql must say "-- enabled: no: <reason>" (071a disables it)');
  if (md5(s03.sql) !== LIVE_S03_MD5) throw new Error('S-03.sql text is not the live one - 071a only disables it');
  if (md5(b15.sql) === LIVE_B15_MD5) throw new Error('B-15.sql still holds the pre-071a text');
  if (md5(LIVE_B15_SQL) !== LIVE_B15_MD5) throw new Error('LIVE_B15_SQL does not match its md5');
  if (nonAscii(b15.sql).length) throw new Error('B-15 text must be ASCII');
  return { b15Sql: b15.sql, s03Reason: s03.disabled_reason };
}

const sqlStr = (s) => "'" + s.replace(/'/g, "''") + "'";
const nonAscii = (s) => [...s].filter((c) => c.charCodeAt(0) > 127);
const want = (g) => FNS.map((fn) => `"${fn}": ["${LIVE_MD5[fn]}", "${md5(g[fn].next)}"]`).join(', ');
const TRIGGERS = `ARRAY['stock_guard_lots', 'stock_guard_orders', 'stock_guard_natl']`;
const COUNT_TRG = `SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public'`;

// The DO block of 071a (shared verbatim by the dry run).
function applyBlock(g, a) {
  const rows = [];
  for (const fn of FNS) g[fn].subs.forEach((s, i) => rows.push(`      ('${fn}', ${i + 1}, ${sqlStr(b64(s.old))}, ${sqlStr(s.new)})`));
  return `DECLARE
  r record; g text; src text; acl_before text; k int; m text;
  trg_before int; trg_after int;
  want CONSTANT jsonb := '{${want(g)}}';
BEGIN
  -- CREATE OR REPLACE FUNCTION waits for no table lock, but a stuck session could still hold the
  -- function: give up after 5 s instead of queueing - the whole block rolls back, run it again later.
  PERFORM set_config('lock_timeout', '5s', true);

  -- 0. GUARDS (read only): the base is what was measured 22/10/2026.
  IF to_regclass('monitoring.checks') IS NULL THEN
    RAISE EXCEPTION '071a: monitoring.checks does not exist (047 must run first)';
  END IF;
  FOREACH g IN ARRAY ${TRIGGERS} LOOP
    SELECT md5(p.prosrc) INTO m FROM pg_proc p WHERE p.oid = to_regprocedure('public.' || g || '()');
    IF m IS NOT DISTINCT FROM want->g->>1 THEN
      RAISE EXCEPTION '071a: % already holds the 071a text - run 071a_invoice_from_registration_verify.sql instead', g;
    END IF;
    IF m IS DISTINCT FROM want->g->>0 THEN
      RAISE EXCEPTION '071a: % is not the 057 text read 22/10 (md5 %) - stop, re-measure', g, m;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure('public.' || g || '()')
                AND (p.prosecdef OR p.proconfig IS DISTINCT FROM ARRAY['search_path=public'])) THEN
      RAISE EXCEPTION '071a: % is SECURITY DEFINER or has another search_path than 057 gave it - stop', g;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled = 'O' AND tgname = ANY (${TRIGGERS})) <> 3 THEN
    RAISE EXCEPTION '071a: the three stock_guard triggers are not all enabled (S-02) - stop';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'S-03' AND enabled AND md5(sql_text) = '${LIVE_S03_MD5}') THEN
    RAISE EXCEPTION '071a: auditor S-03 is not the enabled check read 22/10 - stop, re-measure';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-15' AND md5(sql_text) = '${LIVE_B15_MD5}') THEN
    RAISE EXCEPTION '071a: auditor B-15 is not the text read 22/10 - stop, re-measure';
  END IF;
  ${COUNT_TRG.replace('SELECT count(*) FROM', 'SELECT count(*) INTO trg_before FROM')};
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = trg_before AND baseline IS NULL) THEN
    RAISE EXCEPTION '071a: B-54 red_value is not the live trigger count % - a migration changed triggers without bumping it, re-measure', trg_before;
  END IF;

  -- 1. The three guards, each from its LIVE text with the substitutions of
  --    worker/migrations/drafts/tools/build-071a.mjs (old text as base64: it holds Greek).
  FOREACH g IN ARRAY ${TRIGGERS} LOOP
    SELECT p.prosrc, p.proacl::text INTO src, acl_before FROM pg_proc p WHERE p.oid = ('public.' || g || '()')::regprocedure;
    FOR r IN
      SELECT s.seq, convert_from(decode(s.old_b64, 'base64'), 'UTF8') AS old_t, s.new_t
        FROM (VALUES
${rows.join(',\n')}
        ) AS s(fname, seq, old_b64, new_t)
       WHERE s.fname = g ORDER BY s.seq
    LOOP
      k := (length(src) - length(replace(src, r.old_t, ''))) / length(r.old_t);
      IF k <> 1 THEN
        RAISE EXCEPTION '071a: % substitution % found % times (expected exactly 1) - stop', g, r.seq, k;
      END IF;
      src := replace(src, r.old_t, r.new_t);
    END LOOP;
    IF md5(src) <> want->g->>1 THEN
      RAISE EXCEPTION '071a: the generated % is not the text built and tested (md5 %) - stop', g, md5(src);
    END IF;
    -- CREATE OR REPLACE keeps the oid, the owner, the grants and the trigger that calls it.
    EXECUTE format('CREATE OR REPLACE FUNCTION public.%I() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS %L', g, src);
    IF (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid = ('public.' || g || '()')::regprocedure) <> want->g->>1
       OR (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = ('public.' || g || '()')::regprocedure) IS DISTINCT FROM acl_before THEN
      RAISE EXCEPTION '071a proof: % does not hold the generated text, or its grants changed', g;
    END IF;
  END LOOP;

  -- 2. AUDITOR (text = tms-auditor/checks/S-03.sql and B-15.sql, the files the 047b seed is built from).
  --    S-03 "invoiced lot not complete" was the P1 alarm of the old one-invoice rule: from today it is a
  --    normal state, an hourly false P1 would teach everyone to ignore the true ones. Disabled, never
  --    deleted: a disabled check is reported as a GAP with its reason.
  UPDATE monitoring.checks
     SET enabled = false, disabled_reason = convert_from(decode(${sqlStr(b64(a.s03Reason))}, 'base64'), 'UTF8')
   WHERE id = 'S-03' AND enabled AND md5(sql_text) = '${LIVE_S03_MD5}';
  GET DIAGNOSTICS k = ROW_COUNT;
  IF k <> 1 THEN RAISE EXCEPTION '071a: S-03 not disabled (% rows)', k; END IF;
  --    B-15 (queue, P3): a lot counts from its own delivery like every order - the same rule as the
  --    screen's OrdersData.ageOf (one rule, principle 3). Before: from the day the lot became complete.
  UPDATE monitoring.checks SET sql_text = ${sqlStr(a.b15Sql)}
   WHERE id = 'B-15' AND md5(sql_text) = '${LIVE_B15_MD5}';
  GET DIAGNOSTICS k = ROW_COUNT;
  IF k <> 1 THEN RAISE EXCEPTION '071a: B-15 not updated (% rows)', k; END IF;

  -- 3. B-54: no trigger is added or dropped.
  ${COUNT_TRG.replace('SELECT count(*) FROM', 'SELECT count(*) INTO trg_after FROM')};
  IF trg_after <> trg_before THEN
    RAISE EXCEPTION '071a proof: trigger count % -> % (expected unchanged)', trg_before, trg_after;
  END IF;

  RAISE NOTICE '071a OK: stock_guard_lots/_orders/_natl rewritten (only the lot price still freezes with the invoice), S-03 disabled, B-15 counts lots from their delivery, triggers % unchanged', trg_after;
`;
}

const RESULT_ROW = (g) => `SELECT CASE WHEN (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.stock_guard_lots()'::regprocedure) = '${md5(g.stock_guard_lots.next)}'
             AND (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.stock_guard_orders()'::regprocedure) = '${md5(g.stock_guard_orders.next)}'
             AND (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.stock_guard_natl()'::regprocedure) = '${md5(g.stock_guard_natl.next)}'
            THEN '071a OK' ELSE '071a NOT APPLIED' END AS result,
       (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled = 'O' AND tgname = ANY (${TRIGGERS})) AS guard_triggers,
       (SELECT enabled FROM monitoring.checks WHERE id = 'S-03') AS s03_enabled,
       (SELECT md5(sql_text) FROM monitoring.checks WHERE id = 'B-15') AS b15_md5;`;

export function buildApply(g, a) {
  return `-- 071a - INVOICING FROM REGISTRATION: the stock guards of 057 stop treating "invoiced" as "the lot is finished".
--
-- GENERATED by worker/migrations/drafts/tools/build-071a.mjs - DO NOT EDIT BY HAND (tests/sql-071a-drafts.test.js
-- fails on any drift). EXECUTED 22/10/2026 by the owner. Owner decision 21/10/2026 (spec docs/superpowers/specs/
-- 2026-10-21-national-v5-design.md, "Chrimata" first bullet, phase B0): every order - international and national,
-- a stock lot included - is invoiced as soon as it is registered. Nothing blocks it: not the delivery, not the
-- stock, not the pallet slip.
--
-- WHO / WHEN / ORDER: the owner, in the Supabase SQL editor, AFTER 15:00 (the team works 05:30-14:30), with an
-- explicit yes in the chat, the evening the front end of fix/invoice-from-registration is merged:
--   1. 071a_invoice_from_registration_verify.sql   read only: every line says "before"
--   2. 071a_invoice_from_registration_dryrun.sql   this block + a deliberate error: NOTHING kept
--   3. 071a_invoice_from_registration.sql          (this file)
--   4. 071a_invoice_from_registration_verify.sql   every line says "after"
-- No Worker change goes with it: the Worker maps the hint 'stock:<code>' of any refusal to a 422, and
-- invoiceMarkError (price + ERP number) is untouched. ASCII only (clipboard-safe). ONE DO block = ONE
-- statement: an error anywhere undoes all of it (the SQL editor is not atomic across statements - lesson 056).
--
-- WHY: 057 (4/10) enforced "ONE invoice per lot, only when everything arrived" inside the base, and froze the
-- lot after its invoice. With invoicing from registration the invoice comes FIRST, so every rule that read
-- "invoiced" as "finished" would now stop the lot's ordinary life:
--   stock_guard_orders / stock_guard_natl
--     - invoice_incomplete (a lot invoiced before its pieces arrive)          -> removed
--     - lot_invoiced on a new piece / a pallet change of a piece (the DRAW)   -> removed (else an invoiced lot
--                                                                               could never give a piece)
--     - lot_invoiced on a piece delete                                        -> removed
--     - lot_invoiced on a piece's status (and, national, its delivery date)   -> removed
--     - lot_invoiced on the lot source's own status                           -> removed
--     - lot_invoiced on the lot source's PRICE                                -> KEPT (the invoice states it)
--   stock_guard_lots
--     - an invoiced order may not become a lot (intl + national)              -> removed
--     - an invoiced lot may not be unmarked / reopened / have its close note changed -> removed
-- Unused after that, and removed so the text does not lie (principle 8): v_invoiced (lots), v_done (orders,
-- natl), v_lot's v.invoiced column in the draw select. Every other rule of 057 is byte for byte unchanged
-- (over_draw, piece_no_truck, lot_frozen, close_early, lot_has_pieces, ...).
-- Auditor: S-03 (P1 hourly "invoiced lot not complete") is disabled with its reason; B-15 (queue) counts a
-- lot from its own delivery, as the invoicing screen does.
--
-- MEASURED 22/10/2026 (SELECT only): prosrc of the three guards = 057's text byte for byte (md5 below);
-- 2 live lots, 0 invoiced, 1 international piece, 0 national pieces. No existing row changes: the guards
-- judge only future writes.
--
-- REVERSE: 071a_invoice_from_registration_rollback.sql (the three guards back to 057's text byte for byte,
-- S-03 on, B-15 back). Order: revert the front end first (PR revert + SW_VERSION), then the rollback.
--
-- EXPECTED: NOTICE "071a OK: ..." and ONE result row "071a OK | 3 | false | ${md5(a.b15Sql)}".
-- Anything else (an ERROR): nothing was kept - copy the message to the coordinator.

DO $do$
${applyBlock(g, a)}END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
${RESULT_ROW(g)}
`;
}

export function buildDryRun(g, a) {
  return `-- 071a DRY RUN - GENERATED by worker/migrations/drafts/tools/build-071a.mjs. DO NOT EDIT BY HAND.
-- WHY ONE DO BLOCK: the Supabase SQL editor is NOT atomic across statements (lesson 056), but ONE DO block is
--   ONE statement: its final error undoes everything inside it. ASCII only.
-- WHAT: 071a's own block, statement for statement (every guard, the three rewrites and their proofs, the two
--   auditor rows), then a read of the result, ENDING WITH A DELIBERATE ERROR: NOTHING is kept.
-- WHEN: after 15:00, BEFORE 071a_invoice_from_registration.sql.
-- EXPECTED (the red ERROR is deliberate): a NOTICE "071a OK: ..." and then
--   ERROR: P0001: DRY RUN 071a finished - EVERYTHING UNDONE, nothing kept  ||  lots <md5> orders <md5> natl <md5> S-03 false B-15 <md5>
--   Anything else (an ERROR from one of 071a's guards): do NOT run 071a, copy the message to the coordinator.

DO $dry$
DECLARE
  res text;
BEGIN
  -- ===== 071a_invoice_from_registration.sql, verbatim =====
  DECLARE
  ${applyBlock(g, a).replace(/^DECLARE\n/, '')}  END;
  -- ===== what it did =====
  res := format('lots %s orders %s natl %s S-03 %s B-15 %s',
    (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.stock_guard_lots()'::regprocedure),
    (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.stock_guard_orders()'::regprocedure),
    (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.stock_guard_natl()'::regprocedure),
    (SELECT enabled FROM monitoring.checks WHERE id = 'S-03'),
    (SELECT md5(sql_text) FROM monitoring.checks WHERE id = 'B-15'));
  RAISE EXCEPTION 'DRY RUN 071a finished - EVERYTHING UNDONE, nothing kept  ||  %', res;
END
$dry$;
`;
}

export function buildRollback(g, a) {
  const rows = FNS.map((fn) => `      ('${fn}', ${sqlStr(b64(g[fn].live))})`).join(',\n');
  return `-- 071a ROLLBACK - GENERATED by worker/migrations/drafts/tools/build-071a.mjs. DO NOT EDIT BY HAND.
-- The three stock guards back to 057's text BYTE FOR BYTE (carried whole, as base64: it holds Greek), S-03 enabled
-- again, B-15 back to its 057b text. ONE DO block, ASCII only, after 15:00, explicit yes.
-- ORDER: revert the front end of fix/invoice-from-registration FIRST (PR revert, SW_VERSION bump), then this file,
-- then 071a_invoice_from_registration_verify.sql (every line "before").
-- NO SILENT FREEZE (B0 review #3, owner 22/10/2026): a lot invoiced while 071a was live and still incomplete would,
-- under 057, have its pieces frozen (no draw, no status change) until its invoice is undone, and S-03 red every hour.
-- So this block first counts them (S-03's own predicate) and REFUSES, naming them. The owner decides: undo those
-- invoices first, or accept the freeze by running, in the SAME paste, before the DO block, the exact line the error
-- prints:  SELECT set_config('tms.rollback_071a_accept_freeze', '<the lots, as listed>', false);
-- The acceptance holds only for exactly the lots listed (a new one invoiced meanwhile refuses again).

DO $do$
DECLARE
  r record; src text; m text; k int; acl_before text; stuck text; n_stuck int;
  want CONSTANT jsonb := '{${want(g)}}';
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  SELECT count(*), string_agg(coalesce(legacy_id, id::text), ', ' ORDER BY coalesce(legacy_id, id::text))
    INTO n_stuck, stuck
    FROM stock_v_lots WHERE invoiced AND NOT complete;
  IF n_stuck > 0 AND current_setting('tms.rollback_071a_accept_freeze', true) IS DISTINCT FROM stuck THEN
    RAISE EXCEPTION '071a ROLLBACK refused: % invoiced lot(s) not complete: %. Under 057 their pieces can neither be drawn nor change status until the invoice is undone, and S-03 turns red. The owner decides: undo those invoices first, or accept the freeze by running this line in the same paste, before the DO block: SELECT set_config(''tms.rollback_071a_accept_freeze'', ''%'', false);', n_stuck, stuck, stuck;
  END IF;
  FOR r IN SELECT * FROM (VALUES
${rows}
    ) AS s(fname, body_b64) LOOP
    SELECT md5(p.prosrc), p.proacl::text INTO m, acl_before FROM pg_proc p WHERE p.oid = ('public.' || r.fname || '()')::regprocedure;
    IF m IS DISTINCT FROM want->r.fname->>1 THEN
      RAISE EXCEPTION '071a ROLLBACK: % is not the 071a text (md5 %) - nothing to roll back, or someone changed it since: stop', r.fname, m;
    END IF;
    src := convert_from(decode(r.body_b64, 'base64'), 'UTF8');
    IF md5(src) <> want->r.fname->>0 THEN
      RAISE EXCEPTION '071a ROLLBACK: the carried 057 text of % is damaged (md5 %) - stop', r.fname, md5(src);
    END IF;
    EXECUTE format('CREATE OR REPLACE FUNCTION public.%I() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS %L', r.fname, src);
    IF (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid = ('public.' || r.fname || '()')::regprocedure) <> want->r.fname->>0
       OR (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = ('public.' || r.fname || '()')::regprocedure) IS DISTINCT FROM acl_before THEN
      RAISE EXCEPTION '071a ROLLBACK proof: % is not 057''s text again, or its grants changed', r.fname;
    END IF;
  END LOOP;
  UPDATE monitoring.checks SET enabled = true, disabled_reason = NULL WHERE id = 'S-03' AND NOT enabled AND md5(sql_text) = '${LIVE_S03_MD5}';
  GET DIAGNOSTICS k = ROW_COUNT;
  IF k <> 1 THEN RAISE EXCEPTION '071a ROLLBACK: S-03 not re-enabled (% rows)', k; END IF;
  UPDATE monitoring.checks SET sql_text = ${sqlStr(LIVE_B15_SQL)}
   WHERE id = 'B-15' AND md5(sql_text) = '${md5(a.b15Sql)}';
  GET DIAGNOSTICS k = ROW_COUNT;
  IF k <> 1 THEN RAISE EXCEPTION '071a ROLLBACK: B-15 not restored (% rows)', k; END IF;
  IF n_stuck > 0 THEN
    RAISE NOTICE '071a ROLLBACK: the owner accepted the freeze of % invoiced lot(s) not complete: %', n_stuck, stuck;
  END IF;
  RAISE NOTICE '071a ROLLBACK OK: the three stock guards hold 057''s text again, S-03 enabled, B-15 restored';
END $do$;
`;
}

export function buildAll(src057 = fs.readFileSync(SRC_057, 'utf8')) {
  const g = generate(src057);
  const a = auditorRows();
  const files = { [TARGETS.apply]: buildApply(g, a), [TARGETS.dryrun]: buildDryRun(g, a), [TARGETS.rollback]: buildRollback(g, a) };
  for (const [f, s] of Object.entries(files)) if (nonAscii(s).length) throw new Error(`${f}: not ASCII`);
  return { g, a, files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { g, files } = buildAll();
  const check = process.argv.includes('--check');
  let drift = 0;
  for (const [f, s] of Object.entries(files)) {
    const p = path.join(DIR, f);
    if (check) { if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== s) { console.error('DRIFT: ' + f); drift++; } }
    else { fs.writeFileSync(p, s); console.log('wrote ' + f + ' (' + s.length + ' bytes)'); }
  }
  for (const fn of FNS) console.log(`${fn}: ${LIVE_MD5[fn]} -> ${md5(g[fn].next)}`);
  if (drift) process.exit(1);
}
