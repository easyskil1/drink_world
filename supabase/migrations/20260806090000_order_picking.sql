-- Rendelés <-> kigyűjtés/kiadás összekötés (készletpontos).
-- A rendeléshez kigyűjtött készlet a stock_items.order_id-vel kötődik a rendeléshez.
-- Picking: betárolt tétel (base egységben) kigyűjtése egy rendeléshez.
-- Kiadás: a rendeléshez kigyűjtött tételek kiadása a vevőnek + rendelés 'teljesitve'.

alter table public.stock_items
  add column if not exists order_id uuid references public.orders (id) on delete set null;
create index if not exists stock_items_order_idx on public.stock_items (order_id);

-- ---------------------------------------------------------------------------
-- kigyujt_rendeleshez: mint a kigyujt, de a kigyűjtött sort a rendeléshez tageli.
--   p_mennyiseg base egységben. Rész/teljes kigyűjtést is kezel.
-- ---------------------------------------------------------------------------
create or replace function public.kigyujt_rendeleshez(
  p_stock_item_id uuid,
  p_mennyiseg integer,
  p_order_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v stock_items%rowtype;
  v_target uuid;
begin
  if not public.is_staff() then
    raise exception 'Nincs jogosultság.';
  end if;

  select * into v from public.stock_items where id = p_stock_item_id for update;
  if v.id is null then
    raise exception 'Ismeretlen készlettétel.';
  end if;
  if v.statusz <> 'betarolva' then
    raise exception 'Csak betárolt tétel gyűjthető ki.';
  end if;
  if p_mennyiseg <= 0 or p_mennyiseg > v.mennyiseg_alapegysegben then
    raise exception 'Érvénytelen mennyiség (elérhető: %).', v.mennyiseg_alapegysegben;
  end if;

  if p_mennyiseg = v.mennyiseg_alapegysegben then
    update public.stock_items set statusz = 'kigyujtve', order_id = p_order_id where id = v.id;
    v_target := v.id;
  else
    update public.stock_items
      set mennyiseg_alapegysegben = mennyiseg_alapegysegben - p_mennyiseg
      where id = v.id;

    insert into public.stock_items
      (product_id, product_unit_id, lot_szam, lejarat_datum, location_id, mennyiseg_alapegysegben, statusz, order_id, created_by)
    values
      (v.product_id, v.product_unit_id, v.lot_szam, v.lejarat_datum, v.location_id, p_mennyiseg, 'kigyujtve', p_order_id, auth.uid())
    returning id into v_target;
  end if;

  insert into public.movement_log
    (tipus, stock_item_id, mennyiseg, forras_location_id, user_id)
  values
    ('kigyujtes', v_target, p_mennyiseg, v.location_id, auth.uid());

  return v_target;
end;
$$;

-- ---------------------------------------------------------------------------
-- kiad_rendeles: a rendeléshez kigyűjtött (kigyujtve) tételek kiadása.
--   Létrehoz egy KIAD szállítólevelet a vevő nevére, a tételek 'kiadva' lesznek,
--   a rendelés 'teljesitve'. Visszaad: delivery_note id.
-- ---------------------------------------------------------------------------
create or replace function public.kiad_rendeles(p_order_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_note_id uuid;
  v_sorszam text;
  v_vevo text;
  v stock_items%rowtype;
  v_count int;
begin
  if not public.is_staff() then
    raise exception 'Nincs jogosultság.';
  end if;

  select coalesce(c.ceg_nev, 'Webshop vevő') into v_vevo
  from public.orders o
  left join public.customers c on c.id = o.customer_id
  where o.id = p_order_id;
  if v_vevo is null then
    raise exception 'Ismeretlen rendelés.';
  end if;

  select count(*) into v_count from public.stock_items
  where order_id = p_order_id and statusz = 'kigyujtve';
  if v_count = 0 then
    raise exception 'Nincs a rendeléshez kigyűjtött tétel.';
  end if;

  v_sorszam := 'KIAD-' || to_char(current_date, 'YYYY')
    || '-' || lpad(nextval('public.delivery_kiad_seq')::text, 5, '0');

  insert into public.delivery_notes (irany, vevo_nev, datum, sorszam, created_by)
  values ('kiadas', v_vevo, current_date, v_sorszam, auth.uid())
  returning id into v_note_id;

  for v in
    select * from public.stock_items
    where order_id = p_order_id and statusz = 'kigyujtve' for update
  loop
    update public.stock_items set statusz = 'kiadva' where id = v.id;
    insert into public.movement_log
      (tipus, stock_item_id, mennyiseg, forras_location_id, delivery_note_id, user_id)
    values
      ('kiadas', v.id, v.mennyiseg_alapegysegben, v.location_id, v_note_id, auth.uid());
  end loop;

  update public.orders set statusz = 'teljesitve' where id = p_order_id;

  return v_note_id;
end;
$$;

grant execute on function public.kigyujt_rendeleshez(uuid, integer, uuid) to authenticated;
grant execute on function public.kiad_rendeles(uuid) to authenticated;
