-- ⛔ ΑΝΑΒΛΗΘΗΚΕ 20/9/2026 (owner, μέσω συντονιστή): ΛΑΘΟΣ ΥΠΟΘΕΣΗ — «Έξοδα Μ» της
-- μισθοδοσίας = ΜΟΝΟ τα έξοδα που πλήρωσε ο οδηγός ΧΩΡΙΣ απόδειξη, δηλαδή
-- ΥΠΟΣΥΝΟΛΟ των γραμμών με μετρητά (Έξοδα Μ ⊂ CASH) — όχι το άθροισμά τους.
-- Μετρητά ΜΕ απόδειξη είναι κόστος δρομολογίου, όχι οφειλή προς τον οδηγό
-- μέσω «Έξοδα Μ». Ο owner θέλει μία πηγή αλήθειας «αργότερα», αφού πρώτα
-- οριστεί το «χωρίς απόδειξη» ανά γραμμή (πιθανόν σημαία, συγγενής με το D
-- «αναμόρφωση»). ΔΕΝ ΤΡΕΧΕΙ. Κρατιέται ως σχέδιο: ο μηχανισμός (trigger, lock,
-- expenses_auto, backfill με needs_review) μένει σωστός αν το φίλτρο γίνει
-- «CASH ΚΑΙ χωρίς απόδειξη». Η στήλη rt_scope της όψης dl_v_entries που
-- χρειαζόταν το «Εθνικό» (B) μεταφέρθηκε στη 038_dl_v_entries_rt_scope.sql.
-- ─────────────────────────────────────────────────────────────────────────
-- 038 — «Μετρητά Μ» of a round trip = Σ of its CASH cost lines (owner 19/9/2026,
--        Alexia's request C, option 1 — DECISION_LOG 19/9).
--
-- ΕΓΚΕΚΡΙΜΕΝΗ 19/9 (μέσω συντονιστή) — ΔΕΝ ΕΧΕΙ ΤΡΕΞΕΙ. Εκτελεί ΜΟΝΟ ο owner,
-- Supabase SQL editor, μετά τις 15:00. Σειρά w10: 034 → 037 → 038.
--
-- ΣΕΙΡΑ DEPLOY ↔ MIGRATION (και τι σπάει αν αντιστραφεί):
--   1. Worker deploy (πηγή worker/src/index.js: PATCH/POST /costs/ledger
--      απορρίπτουν με 400 χειροκίνητο `expenses` σε RT που έχει γραμμές CASH)
--   2. αυτή η migration (trigger + backfill)
--   3. front end (ίδιο push: καρτέλα οδηγού read-only, κάδρο Εξόδων read-only)
--   Migration ΠΡΙΝ τον Worker: ο φρουρός της βάσης (dl_cash_lock) απορρίπτει
--   τη χειροκίνητη τιμή, ο παλιός Worker τη γυρίζει ως γενικό 500 → η οθόνη
--   λέει «Δεν αποθηκεύτηκε» χωρίς να πει γιατί, ώσπου να γίνει το deploy.
--   Τίποτα δεν γράφεται λάθος. Worker ΠΡΙΝ τη migration: το 400 είναι σαφές,
--   αλλά τα ποσά δεν συγχρονίζονται ακόμη — το κάδρο των Εξόδων δείχνει
--   «≠ γραμμές CASH» δίπλα στο Μετρητά Μ μέχρι να τρέξει το backfill (αρχή 1).
--   Front end πριν από όλα: αβλαβές — διαβάζει `cash_lines` που δεν υπάρχει
--   ακόμη στην όψη (undefined = επεξεργάσιμο) και ο Worker/βάση αρνούνται.
--
-- WHY (measured 19/9, docs/data-audit/2026-09/2026-09-19-w10-expenses.md §3):
--   10 ct_cost_lines with pay_source='CASH' (292 €) on 5 RTs — money the
--   driver paid from his pocket — and 39 RTs with a hand-typed «Μετρητά Μ»
--   (dl_entries.expenses). 4 RTs carry both, NEVER the same amount. So the
--   cash receipts entered on the expenses screen do not reach the driver's
--   balance unless someone retypes them. One euro, one place (αρχή 3): the
--   receipt lives in ct_cost_lines; the payroll reads it from there.
--
-- Rejected: «Alexia must not enter CASH when Thodoris typed ΕΞΟΔΑ» (a rule on
-- a human, αρχή 4); option 2 (one ledger movement per receipt: a new
-- entry_type touching six code paths — view, balance, A4, CSV, KPI, screen).
--
-- RULE (as low as it can go, αρχή 4):
--   • dl_cash_sync(rt): the live trip line of the RT gets expenses = Σ CASH
--     (net + vat) whenever the RT has ≥1 CASH line; expenses_auto marks that
--     the value came from the lines. When the last CASH line goes, an auto
--     value is cleared (a hand-typed one is left alone — it was never ours).
--   • a hand-typed expenses that differs from the Σ is OVERWRITTEN, but the
--     line gets needs_review + review_note carrying the old amount, and the
--     audit row keeps both — never silent (αρχή 1). Alexia clears the review.
--   • dl_cash_lock: BEFORE UPDATE of expenses on a line whose RT has CASH
--     lines → exception (every path: Worker, SQL editor, a future import).
--     dl_cash_sync itself passes through a transaction-local setting.
--   • ct_cost_lines has no soft delete (DELETE is real) — the trigger covers
--     INSERT / UPDATE (rt_id, pay_source, net, vat) / DELETE and resyncs BOTH
--     the old and the new RT of a moved line.
--   • dl_entries: a trip line inserted or linked to an RT (rt_id set) or
--     restored (deleted_at cleared) is synced too — otherwise an RT whose
--     lines were entered before its payroll line existed would stay at NULL.
--   • dl_v_entries gains cash_lines, cash_sum, expenses_auto, rt_scope (the
--     last one for the word «Εθνικό» on the driver card — B, same day).

begin;

alter table dl_entries add column if not exists expenses_auto boolean not null default false;

create or replace function dl_cash_sync(p_rt bigint) returns void
language plpgsql security definer set search_path = public as $$
declare e dl_entries%rowtype; n int; s numeric;
begin
  if p_rt is null then return; end if;
  select count(*), coalesce(sum(net + coalesce(vat, 0)), 0) into n, s
    from ct_cost_lines where rt_id = p_rt and pay_source = 'CASH';
  select * into e from dl_entries where rt_id = p_rt and deleted_at is null and entry_type = 'trip' limit 1;
  if e.id is null then return; end if;   -- no live payroll line: dl_v_rt_gap already says so

  perform set_config('dl.cash_sync', '1', true);   -- lets dl_cash_lock through, this transaction only
  if n > 0 then
    if e.expenses is distinct from s then
      update dl_entries
         set expenses = s, expenses_auto = true, updated_at = now(),
             needs_review = case when e.expenses is not null and not e.expenses_auto then true else needs_review end,
             review_note  = case when e.expenses is not null and not e.expenses_auto
                              then concat_ws(' · ', review_note,
                                   'Μετρητά Μ ' || e.expenses || ' € χειροκίνητο ≠ γραμμές CASH ' || s || ' € (' || n || ') — ξαναγράφτηκε από τις γραμμές ' || to_char(now(), 'DD/MM/YYYY') || ' (038)')
                              else review_note end
       where id = e.id;
      perform rt_sync_audit('update', 'dl_entries', e.id::text,
        jsonb_build_object('expenses', e.expenses, 'expenses_auto', e.expenses_auto),
        jsonb_build_object('expenses', s, 'expenses_auto', true, 'cash_lines', n, 'rt_id', p_rt,
                           'reason', 'Μετρητά Μ = Σ CASH lines of the round trip (038)'));
    elsif not e.expenses_auto then
      update dl_entries set expenses_auto = true where id = e.id;   -- equal already: just mark the source
    end if;
  elsif e.expenses_auto then
    update dl_entries set expenses = null, expenses_auto = false, updated_at = now() where id = e.id;
    perform rt_sync_audit('update', 'dl_entries', e.id::text,
      jsonb_build_object('expenses', e.expenses, 'expenses_auto', true),
      jsonb_build_object('expenses', null, 'expenses_auto', false, 'rt_id', p_rt,
                         'reason', 'last CASH line of the round trip removed — auto Μετρητά Μ cleared (038)'));
  end if;
  perform set_config('dl.cash_sync', '0', true);
end $$;

-- ct_cost_lines → payroll
create or replace function dl_cash_sync_line() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.pay_source = 'CASH' then perform dl_cash_sync(old.rt_id); end if;
  if tg_op in ('INSERT', 'UPDATE') and new.pay_source = 'CASH'
     and (tg_op = 'INSERT' or new.rt_id is distinct from old.rt_id or old.pay_source is distinct from 'CASH'
          or new.net is distinct from old.net or new.vat is distinct from old.vat) then
    perform dl_cash_sync(new.rt_id);
  end if;
  return null;
end $$;

drop trigger if exists dl_cash_sync_line on ct_cost_lines;
create trigger dl_cash_sync_line
  after insert or update of rt_id, pay_source, net, vat or delete on ct_cost_lines
  for each row execute function dl_cash_sync_line();

-- payroll line born / linked / restored → pull the RT's CASH lines
create or replace function dl_cash_sync_entry() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.rt_id is not null and new.deleted_at is null and new.entry_type = 'trip' then perform dl_cash_sync(new.rt_id); end if;
  return null;
end $$;

drop trigger if exists dl_cash_sync_entry on dl_entries;
create trigger dl_cash_sync_entry
  after insert or update of rt_id, deleted_at on dl_entries
  for each row execute function dl_cash_sync_entry();

-- the lock: a hand-typed Μετρητά Μ on an RT that has CASH lines is refused,
-- whoever writes it. Message carries the ASCII marker dl_cash_lock so the
-- Worker (and any future caller) can recognise it without parsing Greek.
create or replace function dl_cash_lock() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; s numeric;
begin
  if current_setting('dl.cash_sync', true) = '1' then return new; end if;
  if new.rt_id is null or new.expenses is not distinct from old.expenses then return new; end if;
  select count(*), coalesce(sum(net + coalesce(vat, 0)), 0) into n, s
    from ct_cost_lines where rt_id = new.rt_id and pay_source = 'CASH';
  if n > 0 then
    raise exception 'dl_cash_lock: Μετρητά Μ = γραμμές CASH του δρομολογίου (% γραμμές, % €) — καταχώρησε ή διόρθωσε τη γραμμή στα Έξοδα Δρομολογίων', n, s
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists dl_cash_lock on dl_entries;
create trigger dl_cash_lock before update of expenses on dl_entries
  for each row execute function dl_cash_lock();

-- view: same columns as 012 + four appended (CREATE OR REPLACE allows appending)
create or replace view dl_v_entries with (security_invoker = true) as
select e.id, e.driver_id, e.entry_type, e.entry_date, e.date_end, e.rt_id, rt.code as rt_code,
       coalesce(e.route, rr.route_text, rt.code) as route_text,
       e.trip_value, e.advance, e.expenses, e.amount, e.balance_delta,
       e.source, e.import_batch, e.needs_review, e.review_note, e.note,
       e.deleted_at, e.deleted_reason, e.created_by, e.created_at, e.updated_at,
       (e.deleted_at is not null) as cancelled,
       (e.entry_type = 'trip' and e.trip_value is null and e.deleted_at is null) as pending,
       sum(case when e.deleted_at is null then e.balance_delta else 0 end)
         over (partition by e.driver_id order by e.entry_date, e.id rows unbounded preceding) as running_balance,
       case when e.route is null then rr.route_legs end as route_legs,
       coalesce(c.n, 0)::int as cash_lines,
       coalesce(c.s, 0)     as cash_sum,
       e.expenses_auto,
       rt.scope             as rt_scope
from dl_entries e
left join ct_round_trips rt on rt.id = e.rt_id
left join dl_v_rt_route rr  on rr.rt_id = e.rt_id
left join lateral (select count(*) n, sum(net + coalesce(vat, 0)) s
                   from ct_cost_lines l where l.rt_id = e.rt_id and l.pay_source = 'CASH') c on e.rt_id is not null;

revoke all on dl_v_entries from public, anon, authenticated;
grant select on dl_v_entries to service_role;

-- Backfill: every RT that has CASH lines today (5 on 19/9; 4 of them with a
-- different hand-typed amount → overwritten + needs_review + note).
do $$
declare r record;
begin
  for r in select distinct rt_id from ct_cost_lines where pay_source = 'CASH' and rt_id is not null order by rt_id loop
    perform dl_cash_sync(r.rt_id);
  end loop;
end $$;

commit;

-- ═══ ΠΡΙΝ (μόνο ανάγνωση) — 19/9: 5 RT, ids 123/124/166/167 + 1 ═══
-- select c.rt_id, c.n, c.s, e.id entry, e.expenses, e.needs_review, e.balance_delta
-- from (select rt_id, count(*) n, sum(net+coalesce(vat,0)) s from ct_cost_lines where pay_source='CASH' group by rt_id) c
-- left join dl_entries e on e.rt_id = c.rt_id and e.deleted_at is null and e.entry_type = 'trip' order by 1;
-- ═══ ΜΕΤΑ ═══
-- 1. ίδιο SELECT: κάθε γραμμή expenses = s, expenses_auto true· needs_review true σε όσες είχαν διαφορετικό χειροκίνητο (4)·
--    review_note με «… ≠ γραμμές CASH …»· balance_delta = trip_value + expenses − advance (011 computes it).
-- 2. select count(*) from audit_log where actor='trigger:rt_sync' and after_data->>'reason' like '%(038)%'
--    and created_at > now() - interval '10 minutes';                      -- = πλήθος RT που άλλαξαν (≤5)
-- 3. Ο φρουρός: (ΜΗΝ το τρέξεις σε παραγωγή χωρίς rollback)
--    begin; update dl_entries set expenses = 1 where rt_id = 124 and deleted_at is null; rollback;
--    -- αναμένεται: ERROR dl_cash_lock: …
-- 4. select cash_lines, cash_sum, expenses_auto, rt_scope from dl_v_entries where rt_id = 124 and deleted_at is null;
-- 5. select count(*) from dl_v_rt_gap;                                    -- αμετάβλητο (0)
