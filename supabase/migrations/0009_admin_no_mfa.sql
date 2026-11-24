-- 0009_admin_no_mfa: the admin area no longer requires a TOTP-verified session.
-- An admin is an active profile with role = 'admin'.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select p.role = 'admin' and p.status = 'active'
       from public.profiles p where p.id = auth.uid()),
    false);
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
