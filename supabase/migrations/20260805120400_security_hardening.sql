-- Biztonsági hardening a Supabase advisor alapján.
-- 1) set_updated_at: rögzített search_path (function_search_path_mutable lint).
-- 2) Trigger-függvények: EXECUTE elvétele anon/authenticated/public-tól, hogy ne
--    legyenek közvetlenül hívhatók a PostgREST rpc-n át (0028/0029 lint). A
--    triggerek EXECUTE nélkül is lefutnak (tesztelve), így ez biztonságos.
--
-- MEGJEGYZÉS: az RLS-helpereket (is_staff/is_admin/is_customer/is_approved_customer)
-- SZÁNDÉKOSAN NEM érintjük: az EXECUTE elvétele tőlük "permission denied for
-- function"-t okoz a policy-kiértékeléskor (tesztelve), tehát megtörné az RLS-t.
-- Ezek csak a hívóról adnak vissza bool-t, adatot nem szivárogtatnak.

alter function public.set_updated_at() set search_path = public;

revoke execute on function public.set_updated_at()               from anon, authenticated, public;
revoke execute on function public.handle_new_user()              from anon, authenticated, public;
revoke execute on function public.prevent_customer_self_approve() from anon, authenticated, public;
