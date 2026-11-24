-- 0006_account_check: email-first sign-in ("Log in or sign up").
-- Tells the login edge function whether an e-mail or nickname already has an account,
-- so the modal can show either the password step or the sign-up step.
-- Service role only; the edge function rate-limits it per IP.
create or replace function public.account_exists(p_identifier text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when position('@' in coalesce(p_identifier, '')) > 0 then
      exists (select 1 from auth.users u where lower(u.email) = lower(trim(p_identifier)))
    else
      exists (select 1 from public.profiles p where p.nickname = lower(trim(p_identifier)))
  end;
$$;
revoke all on function public.account_exists(text) from public, anon, authenticated;
grant execute on function public.account_exists(text) to service_role;
