-- 0008_open_signup: no approval step. Every new account is active immediately.
-- The admin area is for user analytics (and blocking abuse), not for approving sign-ups.

alter table public.profiles alter column status set default 'active';
update public.profiles set status = 'active' where status = 'pending';

-- Analytics for the admin overview.
create or replace function public.admin_stats()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.assert_admin();
  return jsonb_build_object(
    'users_total',     (select count(*) from public.profiles),
    'users_new_7d',    (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'users_active_7d', (select count(*) from public.profiles where last_seen_at > now() - interval '7 days'),
    'users_blocked',   (select count(*) from public.profiles where status = 'blocked'),
    'scans_total',     (select count(*) from public.scans),
    'scans_7d',        (select count(*) from public.scans where created_at > now() - interval '7 days'),
    'disputes_open',   (select count(*) from public.scans where review_status = 'disputed'),
    'by_level',        (select coalesce(jsonb_object_agg(final_level, n), '{}'::jsonb)
                          from (select final_level, count(*) n from public.scans group by 1) t),
    'signups_14d',     (select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'n', n) order by d), '[]'::jsonb)
                          from (select g.d, (select count(*) from public.profiles p
                                              where p.created_at >= g.d and p.created_at < g.d + interval '1 day') n
                                  from generate_series(date_trunc('day', now()) - interval '13 days',
                                                       date_trunc('day', now()), interval '1 day') g(d)) s),
    'ai_unavailable',  (select count(*) from public.scans where ai_status <> 'ok'
                          and created_at > now() - interval '7 days'));
end $$;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
