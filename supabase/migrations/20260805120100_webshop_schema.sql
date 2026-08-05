-- Webshop (B2B rendelőoldal) — 2/2: vevők, rendelések, katalógus nézet, RLS.
-- Közös DB, a shop csak az anon kulcsot használja; minden hozzáférést RLS szabályoz.
-- Idempotens (create or replace / if not exists / drop policy if exists).

-- ---------------------------------------------------------------------------
-- 1. handle_new_user: az önregisztráló felhasználó CUSTOMER legyen (nem staff).
--    Admin által létrehozott usernél a createUserAction utólag felülírja a role-t,
--    így a staff/admin létrehozás változatlanul működik.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nev, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nev', new.email), 'customer')
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. customers (vevő cégadatok, 1:1 az auth userrel)
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id             uuid primary key references auth.users (id) on delete cascade,
  ceg_nev        text,
  adoszam        text,
  cim            text,
  telefon        text,
  kapcsolattarto text,
  jovahagyva     boolean not null default false,   -- admin engedélyezte-e rendelésre
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- A vevő NEM hagyhatja jóvá saját magát: nem-staff update esetén a jovahagyva
-- mező visszaáll az eredetire.
create or replace function public.prevent_customer_self_approve()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_staff() and new.jovahagyva is distinct from old.jovahagyva then
    new.jovahagyva := old.jovahagyva;
  end if;
  return new;
end;
$$;

drop trigger if exists customers_guard_approve on public.customers;
create trigger customers_guard_approve
  before update on public.customers
  for each row execute function public.prevent_customer_self_approve();

-- ---------------------------------------------------------------------------
-- 3. orders + order_items
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'order_statusz') then
    create type public.order_statusz as enum ('uj', 'visszaigazolt', 'teljesitve', 'torolt');
  end if;
end $$;

create table if not exists public.orders (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references public.customers (id) on delete cascade,
  statusz          public.order_statusz not null default 'uj',
  kivant_szallitas date,
  megjegyzes       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists orders_customer_idx on public.orders (customer_id);
create index if not exists orders_statusz_idx on public.orders (statusz);

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create table if not exists public.order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders (id) on delete cascade,
  product_unit_id uuid not null references public.product_units (id),
  mennyiseg       integer not null check (mennyiseg > 0),
  egysegar_brutto numeric(12, 2),                  -- ár-pillanatkép a rendeléskor
  created_at      timestamptz not null default now()
);
create index if not exists order_items_order_idx on public.order_items (order_id);

-- ---------------------------------------------------------------------------
-- 4. catalog nézet — a vevő EZT látja, a költség-oszlopok nélkül.
--    A nézet a base táblák RLS-ét megkerüli (owner=postgres), de beszerzesi_ar
--    / beszállító / raktár nincs benne, így nincs szivárgás. A base products/
--    product_units táblák maradnak staff-only (RLS), tehát a vevő közvetlenül
--    semmit sem lát belőlük.
-- ---------------------------------------------------------------------------
create or replace view public.catalog as
select
  p.id            as product_id,
  p.nev,
  p.kategoria,
  p.kep_url,
  pu.id           as product_unit_id,
  pu.kiszereles,
  pu.vonalkod,
  pu.mennyiseg_alapegysegben,
  pu.netto_urtartalom,
  pu.urtartalom_egyseg,
  pu.netto_ar,
  pu.brutto_ar,
  pu.afa_kulcs,
  pu.betetdij_tipus,
  pu.betetdij_osszeg
from public.products p
join public.product_units pu on pu.product_id = p.id
where p.aktiv = true;

-- ---------------------------------------------------------------------------
-- 5. Jogosultság-helperek (a meglévő is_staff()/is_admin() mintájára)
-- ---------------------------------------------------------------------------
create or replace function public.is_customer()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.aktiv and p.role = 'customer'
  );
$$;

create or replace function public.is_approved_customer()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.customers c
    where c.id = auth.uid() and c.jovahagyva = true
  );
$$;

-- ---------------------------------------------------------------------------
-- 6. RLS + policy-k
-- ---------------------------------------------------------------------------
alter table public.customers   enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

-- customers: a vevő a sajátját; staff mindent
drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers
  for select using (id = auth.uid() or public.is_staff());

drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers
  for insert with check (id = auth.uid() or public.is_staff());

drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers
  for update using (id = auth.uid() or public.is_staff())
  with check (id = auth.uid() or public.is_staff());

drop policy if exists customers_delete on public.customers;
create policy customers_delete on public.customers
  for delete using (public.is_staff());

-- orders: a vevő a sajátját olvassa/hozza létre (jóváhagyott vevőként); staff mindent
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select using (customer_id = auth.uid() or public.is_staff());

drop policy if exists orders_insert on public.orders;
create policy orders_insert on public.orders
  for insert with check (customer_id = auth.uid() and public.is_approved_customer());

drop policy if exists orders_update_staff on public.orders;
create policy orders_update_staff on public.orders
  for update using (public.is_staff()) with check (public.is_staff());

drop policy if exists orders_delete_staff on public.orders;
create policy orders_delete_staff on public.orders
  for delete using (public.is_staff());

-- order_items: a saját rendeléshez kötve; staff mindent
drop policy if exists order_items_select on public.order_items;
create policy order_items_select on public.order_items
  for select using (
    public.is_staff() or exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.customer_id = auth.uid()
    )
  );

drop policy if exists order_items_insert on public.order_items;
create policy order_items_insert on public.order_items
  for insert with check (
    public.is_approved_customer() and exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.customer_id = auth.uid()
    )
  );

drop policy if exists order_items_write_staff on public.order_items;
create policy order_items_write_staff on public.order_items
  for all using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- 7. GRANT-ok (a sor-szintű szűrést az RLS végzi; a GRANT csak a tábla elérése)
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.customers   to authenticated;
grant select, insert, update, delete on public.orders      to authenticated;
grant select, insert, update, delete on public.order_items to authenticated;
grant select on public.catalog to authenticated;
