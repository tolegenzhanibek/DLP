-- 0010_admin_daily: analytics for the admin overview charts.
-- admin_stats(p_days) adds a per-day series (sign-ups, scans, active users) for the
-- chosen period (7–90 days). Disputes are no longer part of the admin area.

drop function if exists public.admin_stats();

create or replace function public.admin_stats(p_days int default 14)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  n int := least(greatest(coalesce(p_days, 14), 7), 90);
begin
  perform private.assert_admin();
  return jsonb_build_object(
    'days',            n,
    'users_total',     (select count(*) from public.profiles),
    'users_new_7d',    (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'users_active_7d', (select count(*) from public.profiles where last_seen_at > now() - interval '7 days'),
    'users_blocked',   (select count(*) from public.profiles where status = 'blocked'),
    'scans_total',     (select count(*) from public.scans),
    'scans_7d',        (select count(*) from public.scans where created_at > now() - interval '7 days'),
    'ai_unavailable',  (select count(*) from public.scans where ai_status <> 'ok'
                          and created_at > now() - interval '7 days'),
    'by_level',        (select coalesce(jsonb_object_agg(final_level, c), '{}'::jsonb)
                          from (select final_level, count(*) c from public.scans
                                 where created_at >= date_trunc('day', now()) - make_interval(days => n - 1)
                                 group by 1) t),
    'daily',           (select coalesce(jsonb_agg(jsonb_build_object(
                                 'day', g.d::date,
                                 'signups', (select count(*) from public.profiles p
                                              where p.created_at >= g.d and p.created_at < g.d + interval '1 day'),
                                 'scans',   (select count(*) from public.scans s
                                              where s.created_at >= g.d and s.created_at < g.d + interval '1 day'),
                                 'active',  (select count(distinct s.owner_id) from public.scans s
                                              where s.created_at >= g.d and s.created_at < g.d + interval '1 day'))
                               order by g.d), '[]'::jsonb)
                          from generate_series(date_trunc('day', now()) - make_interval(days => n - 1),
                                               date_trunc('day', now()), interval '1 day') g(d)));
end $$;
revoke all on function public.admin_stats(int) from public, anon;
grant execute on function public.admin_stats(int) to authenticated;
