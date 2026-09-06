-- 015 — One country vocabulary: ISO 3166-1 alpha-2 codes (owner 5/9/2026)
--
-- «Αν είναι ελεύθερο κείμενο, σε άλλο γράφει GR, σε άλλο gree, σε άλλο Ελλάδα, και
-- μετά το φίλτρο δεν δουλεύει.» Measured 5/9: clients/workshops store codes
-- (GR 1598, BG 93 …) with strays «EU-Other» 143, «GREECE», «ROMANIA», «ΕΛΛΑΔΑ»;
-- locations/partners store English names («Greece» 390 …) with strays «GR»,
-- «MK», «NORTH MACEDONIA», «POLAND»; 88 locations + 22 partners have none.
--
-- Rule as low as it goes (αρχή 4): a `countries` table and a foreign key on the
-- four `country` columns, so no form, import or manual fix can write a value
-- outside the list. Screens store the code and show the name (core/countries.js).
-- Unknown stays NULL (K3): «EU-Other» is not a country and becomes NULL — those
-- 143 clients are listed at the end for the team to fill in.
-- Names come from Intl (en) so the seed matches core/countries.js exactly.

begin;

create table if not exists countries (
  code    char(2) primary key check (code ~ '^[A-Z]{2}$'),
  name_en text not null
);
revoke all on countries from public, anon, authenticated;
grant select on countries to service_role;

insert into countries (code, name_en) values
  ('AD', 'Andorra'),
  ('AE', 'United Arab Emirates'),
  ('AF', 'Afghanistan'),
  ('AG', 'Antigua & Barbuda'),
  ('AI', 'Anguilla'),
  ('AL', 'Albania'),
  ('AM', 'Armenia'),
  ('AO', 'Angola'),
  ('AQ', 'Antarctica'),
  ('AR', 'Argentina'),
  ('AS', 'American Samoa'),
  ('AT', 'Austria'),
  ('AU', 'Australia'),
  ('AW', 'Aruba'),
  ('AX', 'Åland Islands'),
  ('AZ', 'Azerbaijan'),
  ('BA', 'Bosnia & Herzegovina'),
  ('BB', 'Barbados'),
  ('BD', 'Bangladesh'),
  ('BE', 'Belgium'),
  ('BF', 'Burkina Faso'),
  ('BG', 'Bulgaria'),
  ('BH', 'Bahrain'),
  ('BI', 'Burundi'),
  ('BJ', 'Benin'),
  ('BL', 'St. Barthélemy'),
  ('BM', 'Bermuda'),
  ('BN', 'Brunei'),
  ('BO', 'Bolivia'),
  ('BQ', 'Caribbean Netherlands'),
  ('BR', 'Brazil'),
  ('BS', 'Bahamas'),
  ('BT', 'Bhutan'),
  ('BV', 'Bouvet Island'),
  ('BW', 'Botswana'),
  ('BY', 'Belarus'),
  ('BZ', 'Belize'),
  ('CA', 'Canada'),
  ('CC', 'Cocos (Keeling) Islands'),
  ('CD', 'Congo - Kinshasa'),
  ('CF', 'Central African Republic'),
  ('CG', 'Congo - Brazzaville'),
  ('CH', 'Switzerland'),
  ('CI', 'Côte d’Ivoire'),
  ('CK', 'Cook Islands'),
  ('CL', 'Chile'),
  ('CM', 'Cameroon'),
  ('CN', 'China'),
  ('CO', 'Colombia'),
  ('CR', 'Costa Rica'),
  ('CU', 'Cuba'),
  ('CV', 'Cape Verde'),
  ('CW', 'Curaçao'),
  ('CX', 'Christmas Island'),
  ('CY', 'Cyprus'),
  ('CZ', 'Czechia'),
  ('DE', 'Germany'),
  ('DJ', 'Djibouti'),
  ('DK', 'Denmark'),
  ('DM', 'Dominica'),
  ('DO', 'Dominican Republic'),
  ('DZ', 'Algeria'),
  ('EC', 'Ecuador'),
  ('EE', 'Estonia'),
  ('EG', 'Egypt'),
  ('EH', 'Western Sahara'),
  ('ER', 'Eritrea'),
  ('ES', 'Spain'),
  ('ET', 'Ethiopia'),
  ('FI', 'Finland'),
  ('FJ', 'Fiji'),
  ('FK', 'Falkland Islands'),
  ('FM', 'Micronesia'),
  ('FO', 'Faroe Islands'),
  ('FR', 'France'),
  ('GA', 'Gabon'),
  ('GB', 'United Kingdom'),
  ('GD', 'Grenada'),
  ('GE', 'Georgia'),
  ('GF', 'French Guiana'),
  ('GG', 'Guernsey'),
  ('GH', 'Ghana'),
  ('GI', 'Gibraltar'),
  ('GL', 'Greenland'),
  ('GM', 'Gambia'),
  ('GN', 'Guinea'),
  ('GP', 'Guadeloupe'),
  ('GQ', 'Equatorial Guinea'),
  ('GR', 'Greece'),
  ('GS', 'South Georgia & South Sandwich Islands'),
  ('GT', 'Guatemala'),
  ('GU', 'Guam'),
  ('GW', 'Guinea-Bissau'),
  ('GY', 'Guyana'),
  ('HK', 'Hong Kong SAR China'),
  ('HM', 'Heard & McDonald Islands'),
  ('HN', 'Honduras'),
  ('HR', 'Croatia'),
  ('HT', 'Haiti'),
  ('HU', 'Hungary'),
  ('ID', 'Indonesia'),
  ('IE', 'Ireland'),
  ('IL', 'Israel'),
  ('IM', 'Isle of Man'),
  ('IN', 'India'),
  ('IO', 'British Indian Ocean Territory'),
  ('IQ', 'Iraq'),
  ('IR', 'Iran'),
  ('IS', 'Iceland'),
  ('IT', 'Italy'),
  ('JE', 'Jersey'),
  ('JM', 'Jamaica'),
  ('JO', 'Jordan'),
  ('JP', 'Japan'),
  ('KE', 'Kenya'),
  ('KG', 'Kyrgyzstan'),
  ('KH', 'Cambodia'),
  ('KI', 'Kiribati'),
  ('KM', 'Comoros'),
  ('KN', 'St. Kitts & Nevis'),
  ('KP', 'North Korea'),
  ('KR', 'South Korea'),
  ('KW', 'Kuwait'),
  ('KY', 'Cayman Islands'),
  ('KZ', 'Kazakhstan'),
  ('LA', 'Laos'),
  ('LB', 'Lebanon'),
  ('LC', 'St. Lucia'),
  ('LI', 'Liechtenstein'),
  ('LK', 'Sri Lanka'),
  ('LR', 'Liberia'),
  ('LS', 'Lesotho'),
  ('LT', 'Lithuania'),
  ('LU', 'Luxembourg'),
  ('LV', 'Latvia'),
  ('LY', 'Libya'),
  ('MA', 'Morocco'),
  ('MC', 'Monaco'),
  ('MD', 'Moldova'),
  ('ME', 'Montenegro'),
  ('MF', 'St. Martin'),
  ('MG', 'Madagascar'),
  ('MH', 'Marshall Islands'),
  ('MK', 'North Macedonia'),
  ('ML', 'Mali'),
  ('MM', 'Myanmar (Burma)'),
  ('MN', 'Mongolia'),
  ('MO', 'Macao SAR China'),
  ('MP', 'Northern Mariana Islands'),
  ('MQ', 'Martinique'),
  ('MR', 'Mauritania'),
  ('MS', 'Montserrat'),
  ('MT', 'Malta'),
  ('MU', 'Mauritius'),
  ('MV', 'Maldives'),
  ('MW', 'Malawi'),
  ('MX', 'Mexico'),
  ('MY', 'Malaysia'),
  ('MZ', 'Mozambique'),
  ('NA', 'Namibia'),
  ('NC', 'New Caledonia'),
  ('NE', 'Niger'),
  ('NF', 'Norfolk Island'),
  ('NG', 'Nigeria'),
  ('NI', 'Nicaragua'),
  ('NL', 'Netherlands'),
  ('NO', 'Norway'),
  ('NP', 'Nepal'),
  ('NR', 'Nauru'),
  ('NU', 'Niue'),
  ('NZ', 'New Zealand'),
  ('OM', 'Oman'),
  ('PA', 'Panama'),
  ('PE', 'Peru'),
  ('PF', 'French Polynesia'),
  ('PG', 'Papua New Guinea'),
  ('PH', 'Philippines'),
  ('PK', 'Pakistan'),
  ('PL', 'Poland'),
  ('PM', 'St. Pierre & Miquelon'),
  ('PN', 'Pitcairn Islands'),
  ('PR', 'Puerto Rico'),
  ('PS', 'Palestinian Territories'),
  ('PT', 'Portugal'),
  ('PW', 'Palau'),
  ('PY', 'Paraguay'),
  ('QA', 'Qatar'),
  ('RE', 'Réunion'),
  ('RO', 'Romania'),
  ('RS', 'Serbia'),
  ('RU', 'Russia'),
  ('RW', 'Rwanda'),
  ('SA', 'Saudi Arabia'),
  ('SB', 'Solomon Islands'),
  ('SC', 'Seychelles'),
  ('SD', 'Sudan'),
  ('SE', 'Sweden'),
  ('SG', 'Singapore'),
  ('SH', 'St. Helena'),
  ('SI', 'Slovenia'),
  ('SJ', 'Svalbard & Jan Mayen'),
  ('SK', 'Slovakia'),
  ('SL', 'Sierra Leone'),
  ('SM', 'San Marino'),
  ('SN', 'Senegal'),
  ('SO', 'Somalia'),
  ('SR', 'Suriname'),
  ('SS', 'South Sudan'),
  ('ST', 'São Tomé & Príncipe'),
  ('SV', 'El Salvador'),
  ('SX', 'Sint Maarten'),
  ('SY', 'Syria'),
  ('SZ', 'Eswatini'),
  ('TC', 'Turks & Caicos Islands'),
  ('TD', 'Chad'),
  ('TF', 'French Southern Territories'),
  ('TG', 'Togo'),
  ('TH', 'Thailand'),
  ('TJ', 'Tajikistan'),
  ('TK', 'Tokelau'),
  ('TL', 'Timor-Leste'),
  ('TM', 'Turkmenistan'),
  ('TN', 'Tunisia'),
  ('TO', 'Tonga'),
  ('TR', 'Türkiye'),
  ('TT', 'Trinidad & Tobago'),
  ('TV', 'Tuvalu'),
  ('TW', 'Taiwan'),
  ('TZ', 'Tanzania'),
  ('UA', 'Ukraine'),
  ('UG', 'Uganda'),
  ('UM', 'U.S. Outlying Islands'),
  ('US', 'United States'),
  ('UY', 'Uruguay'),
  ('UZ', 'Uzbekistan'),
  ('VA', 'Vatican City'),
  ('VC', 'St. Vincent & Grenadines'),
  ('VE', 'Venezuela'),
  ('VG', 'British Virgin Islands'),
  ('VI', 'U.S. Virgin Islands'),
  ('VN', 'Vietnam'),
  ('VU', 'Vanuatu'),
  ('WF', 'Wallis & Futuna'),
  ('WS', 'Samoa'),
  ('YE', 'Yemen'),
  ('YT', 'Mayotte'),
  ('ZA', 'South Africa'),
  ('ZM', 'Zambia'),
  ('ZW', 'Zimbabwe')
on conflict (code) do nothing;

-- Legacy spellings seen in the data (5/9) that Intl names do not cover.
create temp table country_alias (raw text primary key, code char(2));
insert into country_alias values
  ('GREECE','GR'), ('ΕΛΛΑΔΑ','GR'), ('Ελλάδα','GR'), ('ROMANIA','RO'), ('POLAND','PL'),
  ('NORTH MACEDONIA','MK'), ('North Macedonia','MK'), ('FYROM','MK'),
  ('Czech Republic','CZ'), ('Bosnia and Herzegovina','BA'), ('UK','GB'), ('Great Britain','GB'), ('Holland','NL');

do $$
declare t text;
begin
  foreach t in array array['clients','partners','locations','workshops'] loop
    -- 1. English names (case-insensitive) → code
    execute format('update %I x set country = c.code from countries c where x.country is not null and upper(trim(x.country)) = upper(c.name_en) and x.country <> c.code', t);
    -- 2. known legacy spellings → code
    execute format('update %I x set country = a.code from country_alias a where x.country = a.raw', t);
    -- 3. lower-case / padded codes → clean code
    execute format('update %I set country = upper(trim(country)) where country ~* ''^\s*[a-z]{2}\s*$'' and country <> upper(trim(country))', t);
    -- 4. not a country → unknown
    execute format('update %I set country = null where country in (''EU-Other'', '''')', t);
  end loop;
end $$;

-- Anything still outside the list stops the migration here (transaction) — read it, extend the alias table, rerun.
do $$
declare bad text;
begin
  select string_agg(t || ':' || country || '×' || n, ', ') into bad from (
    select 'clients' t, country, count(*) n from clients where country is not null and country not in (select code from countries) group by 2
    union all select 'partners', country, count(*) from partners where country is not null and country not in (select code from countries) group by 2
    union all select 'locations', country, count(*) from locations where country is not null and country not in (select code from countries) group by 2
    union all select 'workshops', country, count(*) from workshops where country is not null and country not in (select code from countries) group by 2) x;
  if bad is not null then raise exception 'country values outside the list: %', bad; end if;
end $$;

alter table clients   drop constraint if exists clients_country_fkey;
alter table partners  drop constraint if exists partners_country_fkey;
alter table locations drop constraint if exists locations_country_fkey;
alter table workshops drop constraint if exists workshops_country_fkey;
alter table clients   add constraint clients_country_fkey   foreign key (country) references countries(code);
alter table partners  add constraint partners_country_fkey  foreign key (country) references countries(code);
alter table locations add constraint locations_country_fkey foreign key (country) references countries(code);
alter table workshops add constraint workshops_country_fkey foreign key (country) references countries(code);

commit;

-- Proof: every non-null country is a code (expect 4 rows, all bad=0), and the list to fill in.
-- select 'clients' t, count(*) filter (where country is not null and country !~ '^[A-Z]{2}$') bad, count(*) filter (where country is null) unknown from clients where deleted_at is null
-- union all select 'partners', count(*) filter (where country !~ '^[A-Z]{2}$'), count(*) filter (where country is null) from partners where deleted_at is null
-- union all select 'locations', count(*) filter (where country !~ '^[A-Z]{2}$'), count(*) filter (where country is null) from locations where deleted_at is null
-- union all select 'workshops', count(*) filter (where country !~ '^[A-Z]{2}$'), count(*) filter (where country is null) from workshops where deleted_at is null;
-- select id, name from clients where deleted_at is null and country is null order by name;  -- the 143 «EU-Other» + any blanks
