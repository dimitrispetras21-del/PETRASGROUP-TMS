-- ΕΚΤΕΛΕΣΜΕΝΗ 2026-09-08 ~13:05 από τον owner στον SQL editor. Απόδειξη (owner + SELECT Fable):
-- ct_import_rules = 0 γραμμές, 6 νέες στήλες στο ct_cost_docs, index ct_cost_lines_import_key_uidx = 1,
-- bucket storage `cost-docs` private (μαζί με το pallet-sheets, και τα δύο public=false).
-- Spec: docs/superpowers/specs/2026-09-08-dkv-import-design.md (§4, §6).
-- Εισαγωγή παραστατικών προμηθευτών (DKV, μετά DADI): οι τρεις μνήμες της «μάθησης» και οι
-- πύλες ιδιοποίησης. Τίποτα εδώ δεν αγγίζει υπάρχουσες γραμμές — μόνο νέες στήλες/πίνακες.
begin;

-- 1. Λεξικά (η πρώτη μνήμη). Κάθε διόρθωση της λογίστριας που απαντιέται «ναι, στο εξής»
--    γίνεται γραμμή εδώ — δεδομένα, όχι κώδικας, ώστε να τα βλέπει και να τα σβήνει χωρίς
--    προγραμματιστή. `kind`: plate (πινακίδα → truck), product (κωδ. προϊόντος → κατηγορία),
--    station (σταθμός → χώρα/ΦΠΑ), category (κείμενο → κατηγορία), rt_pref (τι διάλεξε όταν
--    υπήρχαν δύο δρομολόγια). `hits` μετρά πόσες φορές έπιασε — για να φαίνεται τι μαθαίνει.
create table if not exists ct_import_rules (
  id          bigserial primary key,
  source      text not null check (source in ('DKV', 'DADI', 'ANY')),
  kind        text not null check (kind in ('plate', 'product', 'station', 'category', 'rt_pref')),
  key         text not null,
  value       jsonb not null,
  hits        integer not null default 0,
  created_by  text,
  created_at  timestamptz not null default now(),
  unique (source, kind, key)
);
alter table ct_import_rules enable row level security;
revoke all on ct_import_rules from public, anon, authenticated;
grant select, insert, update, delete on ct_import_rules to service_role;
grant usage, select on sequence ct_import_rules_id_seq to service_role;

-- 2. Το έγγραφο θυμάται τι έγινε: hash του ZIP (το ίδιο αρχείο δεύτερη φορά = 409, όχι διπλές
--    γραμμές) και οι μετρικές που δείχνουν αν το scan γίνεται πιο έξυπνο («διορθώσεις ανά 100»).
alter table ct_cost_docs add column if not exists zip_sha256        text;
alter table ct_cost_docs add column if not exists lines_total       integer;
alter table ct_cost_docs add column if not exists lines_sure        integer;
alter table ct_cost_docs add column if not exists lines_corrected   integer;
alter table ct_cost_docs add column if not exists lines_unallocated integer;
alter table ct_cost_docs add column if not exists parser_version    text;
create unique index if not exists ct_cost_docs_zip_sha256_uidx on ct_cost_docs (zip_sha256) where zip_sha256 is not null;

-- 3. Κάθε εισαγόμενη γραμμή έχει ταυτότητα από το παραστατικό (doc_no|ref|plate|date|product):
--    η ίδια συναλλαγή δεν ξαναγράφεται ποτέ, ακόμη κι αν κάποιος ξαναπεράσει το αρχείο
--    από άλλη διαδρομή. Οι χειροκίνητες γραμμές μένουν NULL και δεν επηρεάζονται.
alter table ct_cost_lines add column if not exists import_key text;
create unique index if not exists ct_cost_lines_import_key_uidx on ct_cost_lines (import_key) where import_key is not null;

commit;

-- Απόδειξη μετά την εκτέλεση:
-- select count(*) from ct_import_rules;                                   -- 0
-- select column_name from information_schema.columns
--   where table_name='ct_cost_docs' and column_name like 'lines_%';       -- 4 γραμμές
-- select indexname from pg_indexes where tablename='ct_cost_lines'
--   and indexname='ct_cost_lines_import_key_uidx';                        -- 1 γραμμή
