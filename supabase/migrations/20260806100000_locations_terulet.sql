-- Raktári helyek átalakítása:
--   * mezők: polcsor -> terulet, új sorrend (terulet, sor, polc, tarhely)
--   * teljes_kod elválasztó: '-' helyett '|' (függőleges vonal)
--   * a komponensek már nem kötelezők (üres string megengedett)

begin;

-- A generált teljes_kod a régi oszlopokra hivatkozik, ezért előbb eldobjuk
-- (a rá épülő unique index automatikusan törlődik).
alter table public.locations drop column teljes_kod;

-- A régi (sor, polc, polcsor, tarhely) unicitás megszűnik.
alter table public.locations
  drop constraint if exists locations_sor_polc_polcsor_tarhely_key;

-- polcsor -> terulet váltás. Az egy tesztsoron kívül nincs éles adat, ezért
-- a polcsort eldobjuk és üres terulet oszlopot veszünk fel.
alter table public.locations drop column polcsor;

-- A komponensek nem kötelezők: NOT NULL marad, de üres string az alapérték,
-- így a teljes_kod konkatenáció sosem lesz NULL.
alter table public.locations
  add column terulet text not null default '';

alter table public.locations alter column sor set default '';
alter table public.locations alter column polc set default '';
alter table public.locations alter column tarhely set default '';

-- Új teljes_kod: terület|sor|polc|tárhely, pl. A|01|02|03
alter table public.locations
  add column teljes_kod text
  generated always as (terulet || '|' || sor || '|' || polc || '|' || tarhely)
  stored;

create unique index locations_teljes_kod_key
  on public.locations (teljes_kod);

alter table public.locations
  add constraint locations_terulet_sor_polc_tarhely_key
  unique (terulet, sor, polc, tarhely);

commit;
