-- 038 — ct_cost_lines.details (jsonb) + aggregation of the three imported DKV
--        statements: ONE toll line per RT × country × document, ONE «Τέλη DKV»
--        line per RT × document (owner 21/9/2026, Alexia's request 9).
--
-- ✅ ΕΚΤΕΛΕΣΤΗΚΕ 21/9/2026 ~15:00 UTC (owner, μετά το deploy Worker 826e33c1) και
-- επαληθεύτηκε (owner + session w11 ανεξάρτητα): doc 1 302→175, doc 2 489→140,
-- doc 3 634→149 γραμμές, net/vat ΤΑΥΤΟΣΗΜΑ (13.972,53/2.226,82 · 13.865,47/
-- 2.001,57 · 15.621,85/2.603,06), τέλη χωρίς φορτηγό 531→0, details 162 = audit
-- 162, lines_total ενημερωμένα.
-- (Ιστορικό:) ΕΓΚΕΚΡΙΜΕΝΗ 21/9 (owner μέσω συντονιστή, αποφάσεις i–iv).
-- Εκτελεί ΜΟΝΟ ο owner, Supabase SQL editor, μετά τις 15:00, ΜΕΤΑ το deploy
-- του Worker w11 (ο νέος Worker γράφει `details` μόνο αν η στήλη υπάρχει —
-- guard 42703 όπως το import_key· ο παλιός Worker αγνοεί τη στήλη). Σειρά
-- w11: Worker deploy → 038 → 039 → 040 → 041 → 042 → push front end.
--
-- WHY (measured 21/9): the Serbian toll statement lists every passage —
-- 115 / 75 / 118 lines on docs 1 / 2 / 3 for 18 / 11 / 19 (RT, day) groups,
-- up to 10 a day; allocateFees split every general fee into every RT of the
-- period — 531 fee lines without a truck, 220 with net 0, shares of
-- 0,00–0,07 €. The accountant reads «Διόδια RS 250 €», not eleven rows. Fuel /
-- AdBlue / reefer are NEVER aggregated (Κ2 odometer, liters per fill, twin
-- check per fill). Amounts: exact — members carry 2 decimals, Σ is Σ.
--
-- WHAT: (1) column `details jsonb` (members per passage / per fee source);
-- (2) for every (doc_id, rt_id, toll_country) toll group with >1 line and
-- every (doc_id, rt_id) fee group with >1 line: the lowest id becomes the
-- aggregate (net/vat = Σ, line_date = max, note rewritten, import_key =
-- stable AGG key, details = members incl. their old ids/keys/notes), the
-- other ids are DELETED (real delete — ct_cost_lines has no soft delete)
-- with one audit row per group listing the removed ids. The E-SUMMARY
-- totals of each document are unchanged (proof 3). Unallocated lines
-- (rt_id NULL) are untouched — the accountant still assigns them one by one
-- and the Worker merges them into their group at that moment.

begin;

alter table ct_cost_lines add column if not exists details jsonb;
comment on column ct_cost_lines.details is 'w11 (038): members of an aggregated DKV line — per passage (tolls) or per fee source (Τέλη DKV): [{id?, date, seq, ref, doc_no, product, country, net_eur, vat_eur, gross_eur, import_key, note?}]';

-- ── proof snapshot BEFORE (per document Σ, kept in a temp table for the AFTER check) ──
create temp table _038_before as
select doc_id, count(*) as lines, round(sum(net)::numeric, 2) as net, round(sum(coalesce(vat, 0))::numeric, 2) as vat
from ct_cost_lines where doc_id is not null group by doc_id;

do $$
declare g record; keep ct_cost_lines%rowtype; members jsonb; removed bigint[]; n int; span text;
begin
  -- tolls: doc × RT × country
  for g in
    select doc_id, rt_id, toll_country, min(id) as keep_id, count(*) as n
    from ct_cost_lines
    where doc_id is not null and rt_id is not null and category = 'tolls'
    group by doc_id, rt_id, toll_country having count(*) > 1
  loop
    select * into keep from ct_cost_lines where id = g.keep_id;
    select jsonb_agg(jsonb_build_object('id', l.id, 'date', l.line_date, 'net_eur', l.net, 'vat_eur', coalesce(l.vat, 0),
                                        'gross_eur', round((l.net + coalesce(l.vat, 0))::numeric, 2), 'import_key', l.import_key,
                                        'note', l.note, 'product', split_part(l.note, ' · ', 3), 'doc_no', split_part(l.note, ' · ', 2), 'country', l.toll_country)
                     order by l.line_date, l.id),
           array_agg(l.id order by l.id) filter (where l.id <> g.keep_id)
      into members, removed
    from ct_cost_lines l where l.doc_id = g.doc_id and l.rt_id = g.rt_id and l.toll_country is not distinct from g.toll_country and l.category = 'tolls';
    select case when min(line_date) = max(line_date) then to_char(max(line_date), 'DD/MM')
                else to_char(min(line_date), 'DD/MM') || '–' || to_char(max(line_date), 'DD/MM') end
      into span
    from ct_cost_lines l where l.doc_id = g.doc_id and l.rt_id = g.rt_id and l.toll_country is not distinct from g.toll_country and l.category = 'tolls';
    update ct_cost_lines set
      net = (select round(sum(net)::numeric, 2) from ct_cost_lines l where l.doc_id = g.doc_id and l.rt_id = g.rt_id and l.toll_country is not distinct from g.toll_country and l.category = 'tolls'),
      vat = (select round(sum(coalesce(vat, 0))::numeric, 2) from ct_cost_lines l where l.doc_id = g.doc_id and l.rt_id = g.rt_id and l.toll_country is not distinct from g.toll_country and l.category = 'tolls'),
      line_date = (select max(line_date) from ct_cost_lines l where l.doc_id = g.doc_id and l.rt_id = g.rt_id and l.toll_country is not distinct from g.toll_country and l.category = 'tolls'),
      note = 'Διόδια ' || coalesce(g.toll_country, '') || ' · ' || span || ' · ' || g.n || ' διελεύσεις · DKV ' || coalesce(split_part(keep.note, ' · ', 2), ''),
      import_key = coalesce(split_part(keep.note, ' · ', 2), 'doc' || g.doc_id) || '|AGG|' || coalesce(keep.plate_raw, '') || '|' || g.rt_id || '|tolls|' || coalesce(g.toll_country, ''),
      details = members
    where id = g.keep_id;
    delete from ct_cost_lines where id = any(removed);
    insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
    values ('migration:038', 'system', 'update', 'ct_cost_lines', g.keep_id::text,
            jsonb_build_object('lines', g.n, 'removed_ids', to_jsonb(removed)),
            jsonb_build_object('reason', 'tolls aggregated per RT × country × document (038)', 'doc_id', g.doc_id, 'rt_id', g.rt_id, 'toll_country', g.toll_country), now());
  end loop;

  -- fees: doc × RT
  for g in
    select doc_id, rt_id, min(id) as keep_id, count(*) as n
    from ct_cost_lines
    where doc_id is not null and rt_id is not null and category = 'dkv'
    group by doc_id, rt_id having count(*) > 1
  loop
    select * into keep from ct_cost_lines where id = g.keep_id;
    select jsonb_agg(jsonb_build_object('id', l.id, 'date', l.line_date, 'net_eur', l.net, 'vat_eur', coalesce(l.vat, 0),
                                        'gross_eur', round((l.net + coalesce(l.vat, 0))::numeric, 2), 'import_key', l.import_key,
                                        'note', l.note, 'country', l.toll_country) order by l.id),
           array_agg(l.id order by l.id) filter (where l.id <> g.keep_id)
      into members, removed
    from ct_cost_lines l where l.doc_id = g.doc_id and l.rt_id = g.rt_id and l.category = 'dkv';
    update ct_cost_lines set
      net = (select round(sum(net)::numeric, 2) from ct_cost_lines l where l.doc_id = g.doc_id and l.rt_id = g.rt_id and l.category = 'dkv'),
      vat = (select round(sum(coalesce(vat, 0))::numeric, 2) from ct_cost_lines l where l.doc_id = g.doc_id and l.rt_id = g.rt_id and l.category = 'dkv'),
      line_date = (select max(line_date) from ct_cost_lines l where l.doc_id = g.doc_id and l.rt_id = g.rt_id and l.category = 'dkv'),
      toll_country = null,
      truck_id = coalesce(keep.truck_id, (select truck_id from ct_round_trips where id = g.rt_id)),
      note = 'Τέλη DKV · κατάσταση ' || coalesce((select invoice_no from ct_cost_docs where id = g.doc_id), 'doc ' || g.doc_id) || ' · ' || g.n || ' πηγές · επιμερισμός κατά καθαρό',
      import_key = coalesce((select invoice_no from ct_cost_docs where id = g.doc_id), 'doc' || g.doc_id) || '|AGG|' || g.rt_id || '|dkv',
      details = members
    where id = g.keep_id;
    delete from ct_cost_lines where id = any(removed);
    insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
    values ('migration:038', 'system', 'update', 'ct_cost_lines', g.keep_id::text,
            jsonb_build_object('lines', g.n, 'removed_ids', to_jsonb(removed)),
            jsonb_build_object('reason', 'DKV fees aggregated per RT × document (038)', 'doc_id', g.doc_id, 'rt_id', g.rt_id), now());
  end loop;
end $$;

-- ── AFTER: Σ per document must be identical (net and vat) ──
do $$
declare bad int;
begin
  select count(*) into bad
  from _038_before b
  join (select doc_id, round(sum(net)::numeric, 2) net, round(sum(coalesce(vat, 0))::numeric, 2) vat from ct_cost_lines where doc_id is not null group by doc_id) a using (doc_id)
  where a.net <> b.net or a.vat <> b.vat;
  if bad > 0 then raise exception '038: Σ per document changed after aggregation — rolled back'; end if;
end $$;

-- ct_cost_docs.lines_total follows the stored rows (the E-SUMMARY totals do not change)
update ct_cost_docs d set lines_total = (select count(*) from ct_cost_lines l where l.doc_id = d.id) where d.status = 'confirmed';

commit;

-- ═══ ΠΡΙΝ (μόνο ανάγνωση) — 21/9: doc 1: 302 γραμμές, doc 2: 489, doc 3: 634 ═══
-- select doc_id, count(*), round(sum(net)::numeric,2) net, round(sum(coalesce(vat,0))::numeric,2) vat from ct_cost_lines where doc_id is not null group by 1 order by 1;
-- select count(*) from ct_cost_lines where category='dkv' and rt_id is not null and truck_id is null;   -- 531 (owner 21/9: αναμενόμενο ΜΕΤΑ = 0, παίρνουν το φορτηγό του RT)
-- select count(*) from ct_cost_lines where category='dkv' and net = 0;                                  -- 220
-- ═══ ΜΕΤΑ ═══
-- 1. ίδιο SELECT Σ ανά έγγραφο: net και vat ΙΔΙΑ με το ΠΡΙΝ, πλήθος γραμμών μικρότερο (αναμενόμενο ≈ 110 / ≈ 250 / ≈ 320).
-- 2. select count(*) from ct_cost_lines where category='dkv' and rt_id is not null and truck_id is null;  -- 0
-- 3. select count(*) from ct_cost_lines where details is not null;      -- = πλήθος ομάδων (toll + fee)
-- 4. select count(*) from audit_log where actor='migration:038';        -- = ίδιο πλήθος
-- 5. select id, rt_id, toll_country, net, vat, line_date, note, jsonb_array_length(details) from ct_cost_lines where details is not null order by doc_id, rt_id limit 20;
-- 6. select id, lines_total from ct_cost_docs where status='confirmed';  -- ενημερωμένα πλήθη
