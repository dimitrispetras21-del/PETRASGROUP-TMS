-- COSTS Φ1 — Migration 002: συμπληρώματα από column audit (2026-08-10)
-- 1. notes στα round trips (υπήρχε στο παλιό μοντέλο, το χρειάζονται οι άνθρωποι)
-- 2. aliases και για ΤΡΕΙΛΕΡ: τα reefer τιμολόγια γράφουν πινακίδα τρέιλερ,
--    και το RT έχει trailer_id ⇒ ο allocation engine ταιριάζει και μέσω αυτού.

alter table ct_round_trips add column notes text;

alter table ct_plate_aliases add column trailer_id bigint references trailers(id);
alter table ct_plate_aliases alter column truck_id drop not null;
alter table ct_plate_aliases add constraint alias_one_target
  check ((truck_id is null) <> (trailer_id is null));

select 'MIGRATION 002 OK' as status;
