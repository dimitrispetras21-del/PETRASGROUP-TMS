-- ============================================================
-- ΠΑΛΕΤΕΣ Φ2 — Migration 004 (PALLETS_F2_FEEDERS §3.3, §5)
-- Τρέξε ΟΛΟΚΛΗΡΟ στο Supabase SQL editor (project gatejgbpyodlepkvqkgf).
-- ============================================================

-- Α. Σύνδεση κίνησης με order (για partner movements που δεν έχουν στάση)
alter table pl_movements add column order_id bigint;
create index pl_mov_order on pl_movements (order_id) where order_id is not null;

-- Β. FKs σε ON DELETE SET NULL: το ιστορικό (confirmed) επιβιώνει της
-- διαγραφής order/στάσης — αλλιώς το cascade delete του order μπλοκάρει.
alter table pl_movements drop constraint pl_movements_order_stop_id_fkey;
alter table pl_movements add constraint pl_movements_order_stop_id_fkey
  foreign key (order_stop_id) references order_stops(id) on delete set null;
alter table pl_movements drop constraint pl_movements_cons_load_id_fkey;
alter table pl_movements add constraint pl_movements_cons_load_id_fkey
  foreign key (cons_load_id) references consolidated_loads(id) on delete set null;
alter table pl_movements add constraint pl_movements_order_id_fkey
  foreign key (order_id) references orders(id) on delete set null;

-- Γ. Private bucket για τα αρχεία δελτίων (upload ΜΟΝΟ μέσω Worker)
insert into storage.buckets (id, name, public)
  values ('pallet-sheets', 'pallet-sheets', false)
  on conflict (id) do nothing;

-- ============================================================
-- ΕΛΕΓΧΟΣ (τρέξε μετά — όλα χωρίς error):
--   select order_id from pl_movements limit 1;
--   select id, public from storage.buckets where id = 'pallet-sheets';  -- 1 γραμμή, public=false
--   -- Το ΚΡΙΣΙΜΟ: τα 3 FKs πρέπει να έχουν confdeltype='n' (SET NULL).
--   -- Χωρίς αυτό, η διαγραφή order με ιστορικό παλετών θα μπλοκάρει.
--   select conname, confdeltype from pg_constraint
--     where conrelid = 'pl_movements'::regclass and contype = 'f' order by conname;
--   -- αναμενόμενο: pl_movements_order_stop_id_fkey / _cons_load_id_fkey /
--   -- _order_id_fkey → 'n' · τα υπόλοιπα (client/partner/location/reversal) → 'a'
-- ============================================================

-- 004_rollback (ΜΟΝΟ αν χρειαστεί — επαναφέρει ΚΑΙ τα FKs στο NO ACTION):
-- alter table pl_movements drop constraint pl_movements_order_stop_id_fkey;
-- alter table pl_movements add constraint pl_movements_order_stop_id_fkey
--   foreign key (order_stop_id) references order_stops(id);
-- alter table pl_movements drop constraint pl_movements_cons_load_id_fkey;
-- alter table pl_movements add constraint pl_movements_cons_load_id_fkey
--   foreign key (cons_load_id) references consolidated_loads(id);
-- alter table pl_movements drop column if exists order_id;  -- παίρνει μαζί index + FK
-- delete from storage.buckets where id = 'pallet-sheets';
