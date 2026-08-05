-- Webshop: a regisztráció atomi legyen (email-megerősítéstől függetlenül).
-- A handle_new_user a signup-metaadatból (ceg_nev, ...) egyből létrehozza a
-- customers sort is, ha az cégadatot tartalmaz (azaz a shop felől regisztráltak).
-- Admin által létrehozott staff/admin usernél nincs ceg_nev metaadat -> nincs
-- customers sor, és a role-t a createUserAction utólag staff/admin-ra állítja.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nev, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nev', new.email), 'customer')
  on conflict (id) do nothing;

  if new.raw_user_meta_data ? 'ceg_nev' then
    insert into public.customers (id, ceg_nev, adoszam, cim, telefon, kapcsolattarto)
    values (
      new.id,
      new.raw_user_meta_data ->> 'ceg_nev',
      new.raw_user_meta_data ->> 'adoszam',
      new.raw_user_meta_data ->> 'cim',
      new.raw_user_meta_data ->> 'telefon',
      new.raw_user_meta_data ->> 'kapcsolattarto'
    )
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;
