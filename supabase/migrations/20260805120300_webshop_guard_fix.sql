-- A jóváhagyás-guard csak BEJELENTKEZETT, nem-staff felhasználót tiltson.
-- Backend (service_role, auth.uid() IS NULL) és staff jóváhagyhat.
create or replace function public.prevent_customer_self_approve()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is not null
     and not public.is_staff()
     and new.jovahagyva is distinct from old.jovahagyva then
    new.jovahagyva := old.jovahagyva;
  end if;
  return new;
end;
$$;
