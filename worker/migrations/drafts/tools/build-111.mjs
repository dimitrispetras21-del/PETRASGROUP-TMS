// 111 = the base of the new international order form (owner 8/11, change 13; design docs/design/intl-order-form-2026-11-08.md
// section 4, the three answers). Generated, never hand-edited: worker/test/migration-111.test.mjs compares every file with
// this output, so the old bodies in the rollback stay byte for byte what 074 / 107 / 108 wrote (their md5 = the guard).
//   (a) two optional hours per stop: order_stops.time_from / time_to, text 'HH:MM' as local_moves (060), NULL = all day;
//   (b) via_hub = the international desk's choice per stop: NULL = follows the VS (every national-side stop, today's
//       rule), true = through Veroia, false = direct. The bridge (074) reads it and never writes it any more;
//   (c) 108: the delivery movement follows the stop's pallets_exchanged (0 = no movement, NULL = every pallet, a whole
//       number 1..pallets = that many), the same rule as the loading feeder (core/pallet-feed.js _plLoadTaken, U6).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIG = path.resolve(HERE, '../..');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

// the live bodies (md5 of pg_proc.prosrc, measured on production 8/11 by SELECT) and the file that wrote each
export const LIVE = {
  wanted: { md5: 'b53c50f4398f90c43bf9912b41a94271', file: 'drafts/074_plan_cutover.sql', sig: 'public.plan_h_bridge_wanted(bigint)' },
  sync: { md5: '3a94d6925b43dec17e26da59447d517c', file: 'drafts/074_plan_cutover.sql', sig: 'public.plan_bridge_sync(bigint,text)' },
  onStop: { md5: 'c133ef3f4928da5a625af58072e5af32', file: 'drafts/074_plan_cutover.sql', sig: 'public.plan_bridge_on_stop()' },
  delivery: { md5: '51c77086b10c4db8f04f1747199cad5a', file: '108_pl_delivery_trigger.sql', sig: 'public.pl_h_delivery_write(bigint,bigint,text)' },
};
export const LIVE_VIEW_MD5 = '6f8cc4d6b045a8679dd63a7bfe3cec6e';   // md5(pg_get_viewdef('pl_v_missing_delivery', true)), 8/11
export const LIVE_CHECK_MD5 = {   // md5 of monitoring.checks sql_text / ids_sql, 8/11
  'B-95': ['f255e0226bc9378644f86bcb533d4a69', '70eb6d174a4ab69dd3f5bb4127cc9b52'],
  'B-99': ['df11dab3bee7650c32d3cc41070ec4d6', '54aac1f418680ee5bc1136c92c247852'],
};

const read = (f) => fs.readFileSync(path.join(MIG, f), 'utf8');
function bodyByMd5(file, want) {
  const parts = read(file).split('$f$');
  for (let i = 1; i < parts.length; i += 2) if (md5(parts[i]) === want) return parts[i];
  throw new Error(`111: no $f$ body with md5 ${want} in ${file}`);
}
function once(text, from, to, what) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error(`111: ${what}: expected once, found ${n}`);
  return text.replace(from, () => to);
}
export function oldBodies() {
  const o = {};
  for (const [k, v] of Object.entries(LIVE)) o[k] = bodyByMd5(v.file, v.md5);
  return o;
}
export function oldView() {
  const t = read('107_pl_missing_delivery.sql');
  const a = t.indexOf('  CREATE VIEW public.pl_v_missing_delivery');
  const b = t.indexOf(";\n", a);
  if (a < 0 || b < 0) throw new Error('111: 107 view not found');
  return t.slice(a, b + 1);
}

export function newBodies() {
  const o = oldBodies();
  const wanted = once(o.wanted,
    "    select s.deleted_at is null and coalesce(s.pallets, 0) > 0 and plan_h_vs_nat_side(o.direction, s.stop_type)\n",
    "    -- 111: and the international desk did not take it out of Veroia (via_hub false = direct; NULL = follows the VS)\n"
    + "    select s.deleted_at is null and coalesce(s.pallets, 0) > 0 and s.via_hub is distinct from false\n"
    + "       and plan_h_vs_nat_side(o.direction, s.stop_type)\n", 'wanted');
  let sync = once(o.sync, 'for st in select s.id, s.via_hub, s.pallets from order_stops s',
    'for st in select s.id, s.pallets from order_stops s', 'sync select');
  sync = once(sync,
    "    if st.via_hub is distinct from v_w then\n      update order_stops set via_hub = v_w where id = st.id;\n    end if;\n",
    "    -- 111: via_hub is the international desk's choice, read by plan_h_bridge_wanted and never written here\n", 'sync echo');
  const onStop = once(o.onStop,
    "  -- the common case first, as plan_bridge_on_order: a stop of an order that is not a VS and has no bridge, written\n"
    + "  -- without via_hub, is not the bridge's (a non-VS stop WITH via_hub is set back by the sync, B-99's rule)\n"
    + "  if (tg_op = 'INSERT' or old.order_id is not distinct from new.order_id) and not new.via_hub\n",
    "  -- the common case first, as plan_bridge_on_order: a stop of an order that is not a VS and has no bridge is not the\n"
    + "  -- bridge's (111: via_hub is the desk's choice and wants a VS, so it no longer decides here)\n"
    + "  if (tg_op = 'INSERT' or old.order_id is not distinct from new.order_id)\n", 'on_stop');
  let delivery = once(o.delivery,
    "    FOR v_s IN SELECT id, location_id, round(pallets)::int AS pallets, datetime FROM order_stops\n",
    "    -- 111: the pallets with exchange of the stop (the form's tick, owner 8/11): NULL = every pallet, as before; a whole\n"
    + "    -- number 1..pallets = that many; any other value is never trusted (all pallets, and the value goes in the trace)\n"
    + "    FOR v_s IN SELECT id, location_id, round(pallets)::int AS pallets, datetime, pallets_exchanged AS ex,\n"
    + "                      CASE WHEN pallets_exchanged = trunc(pallets_exchanged) AND pallets_exchanged >= 1\n"
    + "                                AND pallets_exchanged <= round(pallets) THEN pallets_exchanged::int\n"
    + "                           ELSE round(pallets)::int END AS exch\n"
    + "                 FROM order_stops\n", 'delivery select');
  delivery = once(delivery,
    "                  AND (p_stop IS NULL OR id = p_stop)\n",
    "                  AND (p_stop IS NULL OR id = p_stop)\n"
    + "                  -- 111: a stop the form says has no exchange (0) gets no delivery movement\n"
    + "                  AND pallets_exchanged IS DISTINCT FROM 0\n", 'delivery where');
  delivery = once(delivery, "'CLIENT', v_o.client_id, v_s.location_id, 'DELIVERY', v_s.pallets, v_s.pallets,",
    "'CLIENT', v_o.client_id, v_s.location_id, 'DELIVERY', v_s.exch, v_s.exch,", 'delivery values');
  delivery = once(delivery, "jsonb_build_object('source', 'trigger:108', 'why', p_why));",
    "jsonb_build_object('source', 'trigger:108', 'why', p_why, 'stop_exchanged', v_s.ex));", 'delivery audit');
  return { wanted, sync, onStop, delivery };
}
export function newView() {
  let v = oldView().replace('  CREATE VIEW public.pl_v_missing_delivery WITH (security_invoker = true) AS',
    '  CREATE OR REPLACE VIEW public.pl_v_missing_delivery WITH (security_invoker = true) AS');
  v = once(v, "    JOIN public.order_stops s ON s.order_id = o.id AND s.deleted_at IS NULL AND s.stop_type = 'Unloading' AND coalesce(s.pallets, 0) > 0\n",
    "    JOIN public.order_stops s ON s.order_id = o.id AND s.deleted_at IS NULL AND s.stop_type = 'Unloading' AND coalesce(s.pallets, 0) > 0\n"
    + "                             AND s.pallets_exchanged IS DISTINCT FROM 0   -- 111: no exchange at this stop = nothing missing\n", 'view');
  return v;
}

// B-95 / B-99, rewritten without TMS functions (the auditor never calls them). NAT = the national side, IN_V5 = the cut.
const NAT = "coalesce((o.direction = 'Import' AND s.stop_type = 'Unloading') OR (o.direction = 'Export' AND s.stop_type = 'Loading'), false)";
const IN_V5 = "EXISTS (SELECT 1 FROM plan_config c WHERE coalesce(o.cross_dock_date >= c.cutover_day, false) OR EXISTS (SELECT 1 FROM shipments b0 WHERE b0.order_id = o.id AND b0.order_stop_id IS NOT NULL AND b0.deleted_reason IS DISTINCT FROM '074 rollback'))";
const WANTED = `(o.deleted_at IS NULL AND coalesce(o.veroia_switch, false) AND o.status IS DISTINCT FROM 'Cancelled' AND s.deleted_at IS NULL AND coalesce(s.pallets, 0) > 0 AND s.via_hub IS DISTINCT FROM false AND ${NAT} AND ${IN_V5})`;
const B95_WHERE = `EXISTS (SELECT 1 FROM order_stops s WHERE s.order_id = o.id AND (${WANTED} <> EXISTS (SELECT 1 FROM shipments b WHERE b.order_stop_id = s.id AND b.deleted_at IS NULL)))`;
export const CHECKS = {
  'B-95': {
    sql_text: `SELECT count(*) FROM orders o WHERE ${B95_WHERE}`,
    ids_sql: `SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT coalesce(o.legacy_id, o.id::text) AS x FROM orders o WHERE ${B95_WHERE} ORDER BY 1 LIMIT 50) s`,
    b64: { exceptions: 'zp8gzrrOsc69z4zOvc6xz4Igz4TOv8+FIHNwZWMgOCDOus6xzrkgz4TOt8+CIDA3NCAocGxhbl9oX2JyaWRnZV93YW50ZWQpLCDOvs6xzr3Osc6zz4HOsc68zrzOrc69zr/PgiDOtc60z44gz4fPic+Bzq/PgiDPg8+Fzr3Osc+Bz4TOrs+DzrXOuc+CIM+Ezr/PhSBUTVMgKM6/IM61zrvOtc6zzrrPhM6uz4IgzrTOtc69IM+EzrnPgiDOus6xzrvOtc6vKTogzrbPic69z4TOsc69zq4gVlMsIM+Mz4fOuSBDYW5jZWxsZWQsIM68zrUgz4TOt869IM63zrzOrc+BzrEgTCDPg8+Ezr8gcGxhbl9jb25maWc6IM63zrzOrc+BzrEgzrrPjM68zrLOv8+FIOKJpSBMIM6uIMKrzrzOuc6xIM+Gzr/Pgc6sIHY1LCDPgM6szr3PhM6xIHY1wrssIM+Dz4TOrM+DzrcgzrbPic69z4TOsc69zq4gzrzOtSDPgM6xzrvOrc+EzrXPgiDPg8+EzrfOvSDOtc64zr3Ouc66zq4gz4DOu861z4XPgc6sICjOtc65z4POsc6zz4nOs86uIFVubG9hZGluZywgzrXOvs6xzrPPic6zzq4gTG9hZGluZyksIM+Azr/PhSDOvyDOtM65zrXOuM69z47OvSDOtM61zr0gz4TOt869IM6tzrLOs86xzrvOtSDOsc+Az4wgz4TOtyDOks6tz4HOv865zrEgKDExMTogdmlhX2h1YiDPjM+HzrkgZmFsc2UpLiDOoM+BzrnOvSDOsc+Az4wgz4TOvyBMOiAwLg==' },
  },
  'B-99': {
    sql_text: `SELECT count(*) FROM order_stops s JOIN orders o ON o.id = s.order_id WHERE s.via_hub IS NOT NULL AND NOT ${NAT}`,
    ids_sql: `SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT coalesce(s.legacy_id, s.id::text) AS x FROM order_stops s JOIN orders o ON o.id = s.order_id WHERE s.via_hub IS NOT NULL AND NOT ${NAT} ORDER BY 1 LIMIT 50) s`,
    b64: {
      title: 'wqvOnM6tz4PPiSDOks6tz4HOv865zrHPgsK7IM+DzrUgz4PPhM6sz4POtyDPgM6/z4UgzrTOtc69IM61zq/Ovc6xzrkgzrXOuM69zrnOus6uIM+AzrvOtc+Fz4HOrA==',
      impact: 'zqTOvyBvcmRlcl9zdG9wcy52aWFfaHViIM61zq/Ovc6xzrkgzrcgzrXPgM65zrvOv86zzq4gz4TOv8+FIM60zrnOtc64zr3Pjs69IM6xzr3OrCDPg8+EzqzPg863ICjPhs+Mz4HOvM6xIM60zrnOtc64zr3Pjs69LCAxMTEpOiBOVUxMID0gzrHOus6/zrvOv8+FzrjOtc6vIM+EzrcgVlMsIHRydWUgPSDOvM6tz4PPiSDOks6tz4HOv865zrHPgiwgZmFsc2UgPSDOsc+AzrXPhc64zrXOr86xz4IuIM6kzrnOvM6uIM+DzrUgz4PPhM6sz4POtyDPgM6/z4UgzrTOtc69IM61zq/Ovc6xzrkgzrXOuM69zrnOus6uIM+AzrvOtc+Fz4HOrCAozrXOuc+DzrHOs8+JzrPOrjogz4DOsc+BzqzOtM6/z4POtywgzrXOvs6xzrPPic6zzq46IM+Gz4zPgc+Ez4nPg863KSDPg863zrzOsc6vzr3Otc65IM+Mz4TOuSDOus6sz4TOuSDPhM6/IM6tzrPPgc6xz4jOtSDPgM6xz4HOsc66zqzOvM+Az4TOv869z4TOsc+CIM+Ezrcgz4bPjM+BzrzOsS4=',
      next_step: 'T3duZXI6IM+Azr/Ouc6xIM60zrnOsc60z4HOv868zq4gz4TOvyDOrc6zz4HOsc+IzrUgKM63IM+Gz4zPgc68zrEgz4TOvyDPg8+Ezq3Ou869zrXOuSDOvM+Mzr3OvyDPg8+EzrnPgiDPg8+EzqzPg861zrnPgiDOtc64zr3Ouc66zq7PgiDPgM67zrXPhc+BzqzPgiku',
      exceptions: 'zpHPgM+MIM+EzrfOvSAxMTE6IM68zrnOsSBWUyDPgM6/z4Ugzq3Ous67zrXOuc+DzrUgzrrPgc6xz4TOrCDPhM65z4IgzrXPgM65zrvOv86zzq3PgiDPhM63z4Igz4fPic+Bzq/PgiDOss67zqzOss63ICjOtyDOs86tz4bPhc+BzrEgzrjOrc67zrXOuSDOts+Jzr3PhM6xzr3OriBWUyksIM6zzrkgzrHPhc+Ez4wgzr8gzq3Ou861zrPPh86/z4IgzrrOv865z4TOrCDOvM+Mzr3OvyDPhM63zr0gz4DOu861z4XPgc6sLg==',
    },
  },
};
const q = (s) => "'" + s.replace(/'/g, "''") + "'";
const b64 = (s) => `convert_from(decode('${s}', 'base64'), 'UTF8')`;

const fnHeads = {
  wanted: "  CREATE OR REPLACE FUNCTION public.plan_h_bridge_wanted(p_stop bigint) RETURNS boolean\n    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$",
  sync: "  CREATE OR REPLACE FUNCTION public.plan_bridge_sync(p_order bigint, p_why text) RETURNS void\n    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$",
  onStop: "  CREATE OR REPLACE FUNCTION public.plan_bridge_on_stop() RETURNS trigger\n    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$",
  delivery: "  CREATE OR REPLACE FUNCTION public.pl_h_delivery_write(p_order bigint, p_stop bigint, p_why text) RETURNS int\n    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$",
};
const fns = (b) => ['wanted', 'sync', 'onStop', 'delivery'].map((k) => `${fnHeads[k]}${b[k]}$f$;`).join('\n');
const TRIGGER_NEW = "  CREATE TRIGGER plan_bridge_on_stop AFTER INSERT OR UPDATE OF location_id, pallets, deleted_at, stop_type, datetime, order_id, via_hub\n    ON public.order_stops FOR EACH ROW EXECUTE FUNCTION public.plan_bridge_on_stop();";
const TRIGGER_OLD = "  CREATE TRIGGER plan_bridge_on_stop AFTER INSERT OR UPDATE OF location_id, pallets, deleted_at, stop_type, datetime, order_id\n    ON public.order_stops FOR EACH ROW EXECUTE FUNCTION public.plan_bridge_on_stop();";
const HHMM = "'^([01][0-9]|2[0-3]):[0-5][0-9]$'";

const GUARDS = () => `  -- ===== PART 0: GUARDS (nothing written before them) =====
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_stops' AND column_name IN ('time_from', 'time_to')) THEN
    RAISE EXCEPTION '111: order_stops.time_from / time_to already exist - 111 has run, nothing to do';
  END IF;
  -- the LIVE texts 111 replaces, as 074 / 107 / 108 left them (md5 measured on production 8/11 by SELECT): a body
  -- changed since is not overwritten blind
  FOR v_g IN SELECT * FROM (VALUES
${Object.values(LIVE).map((v) => `      ('${v.sig}', '${v.md5}')`).join(',\n')}) g(sig, h) LOOP
    IF to_regprocedure(v_g.sig) IS NULL OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig)) <> v_g.h THEN
      RAISE EXCEPTION '111: % is not the text 111 was written against - stop, re-measure', v_g.sig;
    END IF;
  END LOOP;
  IF md5(pg_get_viewdef('public.pl_v_missing_delivery'::regclass, true)) <> '${LIVE_VIEW_MD5}' THEN
    RAISE EXCEPTION '111: pl_v_missing_delivery is not 107''s text (md5 %) - stop', md5(pg_get_viewdef('public.pl_v_missing_delivery'::regclass, true));
  END IF;
  IF (SELECT count(*) FROM monitoring.checks WHERE (id = 'B-95' AND md5(sql_text) = '${LIVE_CHECK_MD5['B-95'][0]}' AND md5(ids_sql) = '${LIVE_CHECK_MD5['B-95'][1]}')
                                              OR (id = 'B-99' AND md5(sql_text) = '${LIVE_CHECK_MD5['B-99'][0]}' AND md5(ids_sql) = '${LIVE_CHECK_MD5['B-99'][1]}')) <> 2 THEN
    RAISE EXCEPTION '111: B-95 / B-99 are not 074b''s text - stop, re-measure';
  END IF;
  -- the bridge must be whole before: a gap already there is not 111's, and the proof after must not hide it
  EXECUTE (SELECT sql_text FROM monitoring.checks WHERE id = 'B-95') INTO v_b95;
  IF v_b95 <> 0 THEN RAISE EXCEPTION '111: B-95 is red before 111 (% orders) - stop, ask', v_b95; END IF;
  SELECT count(*) FILTER (WHERE via_hub), count(*) FILTER (WHERE NOT via_hub) INTO v_true0, v_false0 FROM public.order_stops;
  SELECT count(*) INTO v_sh0 FROM public.shipments WHERE deleted_at IS NULL;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
`;

export function build111() {
  const b = newBodies();
  return `-- 111 - THE NEW INTERNATIONAL ORDER FORM: THE BASE (owner 8/11, change 13; docs/design/intl-order-form-2026-11-08.md,
-- section 4: the three answers). Generated by drafts/tools/build-111.mjs - never hand-edited.
-- The owner runs it in the Supabase SQL editor AFTER 15:00, with an explicit yes, one step at a time:
--   1. 111_intl_form_stops_dryrun.sql   this block + the proofs, then a deliberate error: NOTHING kept
--   2. 111_intl_form_stops.sql          (this file)
--   3. 111_intl_form_stops_verify.sql   read-only, one row
-- THEN the Worker (labels Time From / Time To, Via Hub out of dbOnly), THEN the front end. Never the Worker first: its
-- labels name columns that would not exist, and every save of an order's stops would fail.
-- ASCII only. ONE DO block = ONE statement: an error anywhere undoes all of it.
--
-- WHAT IT CHANGES
--   (a) order_stops.time_from / time_to: text 'HH:MM' (the same CHECK as local_moves, 060), NULL = all day. Optional
--       (owner 8/11: "mi ypoxreotiko"); from > to is a night window and allowed (as the national form, 094).
--   (b) order_stops.via_hub becomes the international desk's choice per stop: NULL = follows the VS (every national-
--       side stop of a VS, the rule of today), true = through Veroia, false = direct. Every stop is decided on its own,
--       so a save that writes its stops one by one never passes through a wrong state. DROP NOT NULL + DROP DEFAULT,
--       and every value of today goes to NULL: none was a choice (the facade refused the label, Q-6) - each was the
--       bridge's echo of its own rule, so the bridges stay exactly as they are (proof: B-95 = 0 after, shipments
--       unchanged). plan_h_bridge_wanted reads it (one definition); plan_bridge_sync no longer writes it; the stop
--       trigger also fires on a change of via_hub. B-95 reads the same rule; B-99 now says a choice on a stop that is
--       not the national side.
--   (c) pl_h_delivery_write (108) follows the stop's pallets_exchanged: 0 = no delivery movement, NULL = every pallet,
--       a whole number 1..pallets = that many, anything else = every pallet with the value in the audit row (the
--       loading feeder's rule, core/pallet-feed.js _plLoadTaken). pl_v_missing_delivery (107) no longer lists a stop
--       with 0 (nothing is missing there). Today 0 of 812 stops have a value: nothing changes until the form writes.
-- RUNTIME: one ALTER TABLE (a short lock on order_stops, lock_timeout 5s), one UPDATE of via_hub on ~1.7k rows (no
-- trigger fires: the stop trigger is recreated after it), four function bodies, one view, two checks.
-- statement_timeout 60s. Triggers: the count does not change (B-54 untouched).
-- REVERSE: 111_intl_form_stops_rollback.sql (old bodies verbatim; via_hub back to the bridge's echo; the hour columns
-- are dropped only while empty).
-- EXPECTED: NOTICE "111 OK: ..." ; then verify: result = '111 in place'.

DO $do$
DECLARE
  v_g record; v_b95 int; v_b99 int; v_true0 int; v_false0 int; v_sh0 int; v_sh1 int; v_trg0 int; v_trg1 int; v_k int;
  v_t0 timestamptz := clock_timestamp();
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  PERFORM set_config('statement_timeout', '60s', true);
  PERFORM set_config('search_path', 'public', true);

${GUARDS()}
  -- ===== PART 1 (a): THE HOURS =====
  ALTER TABLE public.order_stops
    ADD COLUMN time_from text, ADD COLUMN time_to text,
    ADD CONSTRAINT order_stops_time_from_fmt CHECK (time_from IS NULL OR time_from ~ ${HHMM}),
    ADD CONSTRAINT order_stops_time_to_fmt CHECK (time_to IS NULL OR time_to ~ ${HHMM}),
    ALTER COLUMN via_hub DROP NOT NULL, ALTER COLUMN via_hub DROP DEFAULT;
  COMMENT ON COLUMN public.order_stops.time_from IS 'HH:MM, optional (owner 8/11): NULL = from the start of the day (111)';
  COMMENT ON COLUMN public.order_stops.time_to IS 'HH:MM, optional (owner 8/11): NULL = to the end of the day; from > to = a night window (111)';

  -- ===== PART 2 (b): VIA HUB = THE DESK'S CHOICE =====
  COMMENT ON COLUMN public.order_stops.via_hub IS 'The international desk''s choice per stop (111): NULL = follows the VS, true = through Veroia, false = direct';
  -- the bridge's echo goes; the old stop trigger does not fire on via_hub, so nothing is synced by this UPDATE
  UPDATE public.order_stops SET via_hub = NULL WHERE via_hub IS NOT NULL;
  GET DIAGNOSTICS v_k = ROW_COUNT;
  IF v_k <> v_true0 + v_false0 THEN RAISE EXCEPTION '111: via_hub reset % rows, expected %', v_k, v_true0 + v_false0; END IF;
${fns(b)}
  DROP TRIGGER plan_bridge_on_stop ON public.order_stops;
${TRIGGER_NEW}
  UPDATE monitoring.checks SET sql_text = ${q(CHECKS['B-95'].sql_text)},
         ids_sql = ${q(CHECKS['B-95'].ids_sql)},
         exceptions = ${b64(CHECKS['B-95'].b64.exceptions)}
   WHERE id = 'B-95';
  UPDATE monitoring.checks SET sql_text = ${q(CHECKS['B-99'].sql_text)},
         ids_sql = ${q(CHECKS['B-99'].ids_sql)},
         title = ${b64(CHECKS['B-99'].b64.title)},
         impact = ${b64(CHECKS['B-99'].b64.impact)},
         next_step = ${b64(CHECKS['B-99'].b64.next_step)},
         exceptions = ${b64(CHECKS['B-99'].b64.exceptions)}
   WHERE id = 'B-99';

  -- ===== PART 3 (c): THE DELIVERY FOLLOWS THE STOP'S EXCHANGE =====
  -- pl_h_delivery_write is above (with the bridge bodies); the list of 107 follows the same rule
${newView()}
  REVOKE ALL ON public.pl_v_missing_delivery FROM PUBLIC, anon, authenticated;
  GRANT SELECT ON public.pl_v_missing_delivery TO service_role, tms_check_runner;

  -- ===== PART 4: CLOSED, AND THE PROOFS =====
  -- CREATE OR REPLACE keeps each function's grants (074 / 108 left them closed); said again, born closed (principle 5)
  REVOKE ALL ON FUNCTION public.plan_h_bridge_wanted(bigint) FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.plan_bridge_sync(bigint, text) FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.plan_bridge_on_stop() FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.pl_h_delivery_write(bigint, bigint, text) FROM PUBLIC, anon, authenticated;
  EXECUTE (SELECT sql_text FROM monitoring.checks WHERE id = 'B-95') INTO v_b95;
  EXECUTE (SELECT sql_text FROM monitoring.checks WHERE id = 'B-99') INTO v_b99;
  SELECT count(*) INTO v_sh1 FROM public.shipments WHERE deleted_at IS NULL;
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_b95 <> 0 OR v_b99 <> 0 OR v_sh1 <> v_sh0 OR v_trg1 <> v_trg0 THEN
    RAISE EXCEPTION '111: after - B-95 %, B-99 %, live shipments % -> %, triggers % -> % (expected 0, 0, equal, equal)', v_b95, v_b99, v_sh0, v_sh1, v_trg0, v_trg1;
  END IF;

  RAISE NOTICE '111 OK: time_from / time_to added; via_hub = the desk''s choice (% true + % false echoes -> NULL); bridge, B-95 / B-99, delivery and its list follow; B-95 %, B-99 %, live shipments % = %; % ms',
    v_true0, v_false0, v_b95, v_b99, v_sh0, v_sh1, round(extract(epoch FROM clock_timestamp() - v_t0) * 1000);
END
$do$;
`;
}

// The dry run = 111 verbatim + proofs inside the transaction + a deliberate error, so NOTHING is kept.
//   1. a stop the desk takes out of Veroia (false) loses its bridge; back to NULL, it gets one again; the order's other
//      bridges never move (one VS order with two live bridges, none executed: none = this proof skipped);
//   2. a delivery with exchange on an order of the missing list writes nothing for a stop marked 0 and stops listing it.
export function build111Dryrun(main) {
  const tail = "  RAISE NOTICE '111 OK:";
  if (!main.includes(tail)) throw new Error('111: tail not found');
  const proofs = `  -- DRY RUN ONLY: the proofs, then everything is undone.
  SELECT s.id, s.order_id INTO v_stop, v_oid FROM public.order_stops s JOIN public.shipments b ON b.order_stop_id = s.id AND b.deleted_at IS NULL
   WHERE NOT public.plan_h_bridge_executed(b.id)
     AND (SELECT count(*) FROM public.shipments b2 WHERE b2.order_id = s.order_id AND b2.deleted_at IS NULL) >= 2
   ORDER BY s.order_id DESC, s.id LIMIT 1;
  IF v_stop IS NOT NULL THEN
    SELECT count(*) INTO v_before FROM public.shipments WHERE order_id = v_oid AND deleted_at IS NULL;
    UPDATE public.order_stops SET via_hub = false WHERE id = v_stop;
    SELECT count(*) INTO v_off FROM public.shipments WHERE order_id = v_oid AND deleted_at IS NULL;
    IF v_off <> v_before - 1 OR EXISTS (SELECT 1 FROM public.shipments WHERE order_stop_id = v_stop AND deleted_at IS NULL) THEN
      RAISE EXCEPTION '111 DRY RUN FAILED: stop % set direct, order % bridges % -> %', v_stop, v_oid, v_before, v_off;
    END IF;
    UPDATE public.order_stops SET via_hub = NULL WHERE id = v_stop;
    SELECT count(*) INTO v_on FROM public.shipments WHERE order_id = v_oid AND deleted_at IS NULL;
    IF v_on <> v_before OR NOT EXISTS (SELECT 1 FROM public.shipments WHERE order_stop_id = v_stop AND deleted_at IS NULL) THEN
      RAISE EXCEPTION '111 DRY RUN FAILED: stop % back to NULL, order % bridges % (expected %)', v_stop, v_oid, v_on, v_before;
    END IF;
  END IF;
  SELECT count(*) INTO v_m0 FROM public.pl_v_missing_delivery;
  SELECT v.order_stop_id, v.order_id INTO v_dstop, v_doid FROM public.pl_v_missing_delivery v JOIN public.orders o ON o.id = v.order_id
   WHERE v.client_id IS NOT NULL AND o.stock_lot_id IS NULL ORDER BY v.delivered_on DESC, v.order_stop_id LIMIT 1;
  IF v_dstop IS NOT NULL THEN
    UPDATE public.order_stops SET pallets_exchanged = 0 WHERE id = v_dstop;
    IF EXISTS (SELECT 1 FROM public.pl_v_missing_delivery WHERE order_stop_id = v_dstop) THEN
      RAISE EXCEPTION '111 DRY RUN FAILED: stop % marked 0 is still listed as missing', v_dstop;
    END IF;
    UPDATE public.orders SET pallet_exchange = false WHERE id = v_doid;
    UPDATE public.orders SET pallet_exchange = true WHERE id = v_doid;
    IF EXISTS (SELECT 1 FROM public.pl_movements WHERE order_stop_id = v_dstop AND event_type = 'DELIVERY' AND status <> 'reversed') THEN
      RAISE EXCEPTION '111 DRY RUN FAILED: stop % marked 0 got a delivery', v_dstop;
    END IF;
    SELECT count(*) INTO v_m1 FROM public.pl_v_missing_delivery;
  END IF;
  RAISE EXCEPTION 'DRY RUN 111 finished: via_hub % true + % false -> NULL; B-95 %, B-99 %, shipments % = %; stop % of order % direct and back (bridges % -> % -> %); delivery stop % of order % at 0: no movement, list % -> %; % ms - NOTHING kept',
    v_true0, v_false0, v_b95, v_b99, v_sh0, v_sh1, coalesce(v_stop::text, 'none'), coalesce(v_oid::text, 'none'),
    coalesce(v_before, 0), coalesce(v_off, 0), coalesce(v_on, 0), coalesce(v_dstop::text, 'none'), coalesce(v_doid::text, 'none'),
    v_m0, coalesce(v_m1, v_m0), round(extract(epoch FROM clock_timestamp() - v_t0) * 1000);
`;
  return main
    .replace(/^-- 111 - /, '-- 111 DRY RUN (generated by drafts/tools/build-111.mjs: 111 + the proofs + a deliberate error) - ')
    .replace('  v_t0 timestamptz := clock_timestamp();\n',
      '  v_t0 timestamptz := clock_timestamp();\n  v_stop bigint; v_oid bigint; v_before int; v_off int; v_on int; v_m0 int; v_m1 int; v_dstop bigint; v_doid bigint;\n')
    .replace(/  RAISE NOTICE '111 OK:[\s\S]*?v_t0\) \* 1000\);\n/, () => proofs);
}

// B-95 / B-99 as 074b wrote them (their md5 = LIVE_CHECK_MD5; the rollback writes these back, the test seeds them)
const OLD_WANTED = `(o.deleted_at IS NULL AND coalesce(o.veroia_switch, false) AND o.status IS DISTINCT FROM 'Cancelled' AND s.deleted_at IS NULL AND coalesce(s.pallets, 0) > 0 AND ${NAT} AND ${IN_V5})`;
const OLD_B95_WHERE = `EXISTS (SELECT 1 FROM order_stops s WHERE s.order_id = o.id AND (${OLD_WANTED} <> EXISTS (SELECT 1 FROM shipments b WHERE b.order_stop_id = s.id AND b.deleted_at IS NULL) OR s.via_hub <> ${OLD_WANTED}))`;
const OLD_B99_WHERE = `s.via_hub AND (o.veroia_switch IS NOT TRUE OR o.deleted_at IS NOT NULL OR NOT ${NAT})`;
export const OLD_CHECKS = {
  'B-95': {
    sql_text: `SELECT count(*) FROM orders o WHERE ${OLD_B95_WHERE}`,
    ids_sql: `SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT coalesce(o.legacy_id, o.id::text) AS x FROM orders o WHERE ${OLD_B95_WHERE} ORDER BY 1 LIMIT 50) s`,
  },
  'B-99': {
    sql_text: `SELECT count(*) FROM order_stops s JOIN orders o ON o.id = s.order_id WHERE ${OLD_B99_WHERE}`,
    ids_sql: `SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT coalesce(s.legacy_id, s.id::text) AS x FROM order_stops s JOIN orders o ON o.id = s.order_id WHERE ${OLD_B99_WHERE} ORDER BY 1 LIMIT 50) s`,
  },
};

export function build111Rollback() {
  const o = oldBodies();
  return `-- 111 ROLLBACK (generated by drafts/tools/build-111.mjs) - puts back what 074 / 107 / 108 wrote, byte for byte.
-- Order: the front end and the Worker FIRST (the Worker's Time From / Time To labels name the hour columns; with the
-- columns gone every save of a stop that names them fails). Then this file, then 111_intl_form_stops_verify.sql
-- (expected: result = '111 NOT in place').
-- What it does: the four old bodies and the old stop trigger; via_hub back to the bridge's echo (every stop false, then
-- the old sync of every order that has a stop with a choice or a live bridge: a stop the desk had set direct gets its
-- bridge back, as the rule of 074 wants, and the sync writes via_hub = wanted again); NOT NULL DEFAULT false again;
-- the 107 view; B-95 / B-99 as 074b wrote them (the Greek texts 111 wrote stay: said here, they only describe). The
-- hour columns are dropped only while no stop has an hour; otherwise they stay (nothing reads them without the
-- Worker) and the NOTICE says how many. ASCII only, one DO block.
DO $do$
DECLARE v_o bigint; v_n int := 0; v_h int; v_orders bigint[];
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  PERFORM set_config('statement_timeout', '120s', true);
  PERFORM set_config('search_path', 'public', true);
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_stops' AND column_name = 'time_from') THEN
    RAISE EXCEPTION '111 rollback: 111 is not applied - nothing to do';
  END IF;
${fns(o)}
  DROP TRIGGER plan_bridge_on_stop ON public.order_stops;
${TRIGGER_OLD}
${oldView().replace('  CREATE VIEW public.pl_v_missing_delivery WITH (security_invoker = true) AS', '  CREATE OR REPLACE VIEW public.pl_v_missing_delivery WITH (security_invoker = true) AS')}
  REVOKE ALL ON public.pl_v_missing_delivery FROM PUBLIC, anon, authenticated;
  GRANT SELECT ON public.pl_v_missing_delivery TO service_role, tms_check_runner;
  -- the orders to re-sync, taken before via_hub is reset: a stop with a choice, or a live bridge
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}') INTO v_orders FROM (
    SELECT order_id AS x FROM public.order_stops WHERE via_hub IS NOT NULL AND order_id IS NOT NULL
    UNION SELECT order_id FROM public.shipments WHERE deleted_at IS NULL AND order_id IS NOT NULL) u;
  UPDATE public.order_stops SET via_hub = false WHERE via_hub IS DISTINCT FROM false;
  ALTER TABLE public.order_stops ALTER COLUMN via_hub SET DEFAULT false, ALTER COLUMN via_hub SET NOT NULL;
  FOREACH v_o IN ARRAY v_orders LOOP
    PERFORM public.plan_bridge_sync(v_o, '111 rollback');
    v_n := v_n + 1;
  END LOOP;
  COMMENT ON COLUMN public.order_stops.via_hub IS NULL;
  UPDATE monitoring.checks SET sql_text = ${q(OLD_CHECKS['B-95'].sql_text)}, ids_sql = ${q(OLD_CHECKS['B-95'].ids_sql)} WHERE id = 'B-95';
  UPDATE monitoring.checks SET sql_text = ${q(OLD_CHECKS['B-99'].sql_text)}, ids_sql = ${q(OLD_CHECKS['B-99'].ids_sql)} WHERE id = 'B-99';
  IF (SELECT count(*) FROM monitoring.checks WHERE (id = 'B-95' AND md5(sql_text) = '${LIVE_CHECK_MD5['B-95'][0]}' AND md5(ids_sql) = '${LIVE_CHECK_MD5['B-95'][1]}')
                                              OR (id = 'B-99' AND md5(sql_text) = '${LIVE_CHECK_MD5['B-99'][0]}' AND md5(ids_sql) = '${LIVE_CHECK_MD5['B-99'][1]}')) <> 2 THEN
    RAISE EXCEPTION '111 rollback: B-95 / B-99 did not come back to 074b''s text';
  END IF;
  SELECT count(*) INTO v_h FROM public.order_stops WHERE time_from IS NOT NULL OR time_to IS NOT NULL;
  IF v_h = 0 THEN
    ALTER TABLE public.order_stops DROP CONSTRAINT order_stops_time_from_fmt, DROP CONSTRAINT order_stops_time_to_fmt,
      DROP COLUMN time_from, DROP COLUMN time_to;
  END IF;
  RAISE NOTICE '111 ROLLBACK OK: old bodies, trigger, view, B-95 / B-99 back; % orders re-synced; hour columns %', v_n,
    CASE WHEN v_h = 0 THEN 'dropped (empty)' ELSE 'KEPT: ' || v_h || ' stops have an hour' END;
END
$do$;
`;
}

export const VERIFY = `-- 111 VERIFY - read-only, one row. Expected: result = '111 in place', b95 = 0, b99 = 0, anon_execute = false.
-- stops_with_hour / stops_with_choice / stops_exchange_set count what the new form has written since (0 right after 111).
SELECT CASE WHEN (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_stops'
                    AND column_name IN ('time_from', 'time_to')) = 2
             AND (SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_stops' AND column_name = 'via_hub') = 'YES'
             AND (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.order_stops'::regclass AND conname IN ('order_stops_time_from_fmt', 'order_stops_time_to_fmt')) = 2
             AND (SELECT prosrc FROM pg_proc WHERE oid = 'public.plan_h_bridge_wanted(bigint)'::regprocedure) LIKE '%s.via_hub is distinct from false%'
             AND (SELECT prosrc FROM pg_proc WHERE oid = 'public.plan_bridge_sync(bigint,text)'::regprocedure) NOT LIKE '%update order_stops set via_hub%'
             AND (SELECT prosrc FROM pg_proc WHERE oid = 'public.pl_h_delivery_write(bigint,bigint,text)'::regprocedure) LIKE '%pallets_exchanged IS DISTINCT FROM 0%'
             AND pg_get_triggerdef((SELECT oid FROM pg_trigger WHERE tgname = 'plan_bridge_on_stop' AND tgrelid = 'public.order_stops'::regclass)) LIKE '%order_id, via_hub ON%'
             AND pg_get_viewdef('public.pl_v_missing_delivery'::regclass, true) LIKE '%pallets_exchanged IS DISTINCT FROM 0%'
        THEN '111 in place' ELSE '111 NOT in place' END AS result,
       (SELECT count(*) FROM orders o WHERE ${B95_WHERE}) AS b95,
       (SELECT count(*) FROM order_stops s JOIN orders o ON o.id = s.order_id WHERE s.via_hub IS NOT NULL AND NOT ${NAT}) AS b99,
       has_function_privilege('anon', 'public.pl_h_delivery_write(bigint,bigint,text)', 'EXECUTE')
         OR has_function_privilege('anon', 'public.plan_bridge_sync(bigint,text)', 'EXECUTE') AS anon_execute,
       (SELECT count(*) FROM order_stops WHERE time_from IS NOT NULL OR time_to IS NOT NULL) AS stops_with_hour,
       (SELECT count(*) FROM order_stops WHERE via_hub IS NOT NULL) AS stops_with_choice,
       (SELECT count(*) FROM order_stops WHERE pallets_exchanged IS NOT NULL) AS stops_exchange_set;
`;

export function buildAll() {
  const main = build111();
  return {
    '111_intl_form_stops.sql': main,
    '111_intl_form_stops_dryrun.sql': build111Dryrun(main),
    '111_intl_form_stops_rollback.sql': build111Rollback(),
    '111_intl_form_stops_verify.sql': VERIFY,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [f, t] of Object.entries(buildAll())) fs.writeFileSync(path.join(MIG, 'drafts', f), t);
  console.log('111 written to drafts/');
}
