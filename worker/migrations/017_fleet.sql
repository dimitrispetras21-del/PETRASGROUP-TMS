begin;
alter table trucks   add column if not exists tachograph_expiry date;
alter table trucks   add column if not exists next_maintenance  date;
alter table trucks   add column if not exists country text;
alter table trailers add column if not exists country text;
alter table trucks   drop constraint if exists trucks_country_iso2;
alter table trucks   add constraint trucks_country_iso2   check (country is null or country ~ '^[A-Z]{2}$');
alter table trailers drop constraint if exists trailers_country_iso2;
alter table trailers add constraint trailers_country_iso2 check (country is null or country ~ '^[A-Z]{2}$');
-- Prefill from plate shape (owner 6/9): GR trucks ΑΒΓ1234 (3 letters+4 digits), GR trailers Ρ12345 (P+5 digits),
-- BG plates 1-2 letters + 4 digits + 2 letters (CB0138HO, E3714EE). Anything else stays NULL for the owner.
update trucks   set country='GR' where country is null and deleted_at is null and license_plate ~ '^[A-Z]{3}[0-9]{4}$';
update trucks   set country='BG' where country is null and deleted_at is null and license_plate ~ '^[A-Z]{1,2}[0-9]{4}[A-Z]{2}$';
update trailers set country='GR' where country is null and deleted_at is null and license_plate ~ '^P[0-9]{5}$';
update trailers set country='BG' where country is null and deleted_at is null and license_plate ~ '^[A-Z]{1,2}[0-9]{4}[A-Z]{2}$';
comment on column trucks.tachograph_expiry is 'Tachograph calibration valid until (owner 6/9/2026)';
comment on column trucks.next_maintenance  is 'Next planned service date (owner 6/9/2026)';
comment on column trucks.country   is 'Registration country, ISO-3166 alpha-2 (owner 6/9/2026)';
comment on column trailers.country is 'Registration country, ISO-3166 alpha-2 (owner 6/9/2026)';
commit;
-- Proof: select country, count(*) from trucks where deleted_at is null group by 1;   -- expect GR≈25, BG≈11, NULL=0..1 (TB53142?)
--        select country, count(*) from trailers where deleted_at is null group by 1; -- expect GR≈23 (P…), BG≈16, NULL≈1 (TB53142)
