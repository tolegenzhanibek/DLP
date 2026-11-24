-- 0003_admin: admin RPCs. Every function re-checks public.is_admin(), which requires
-- role = 'admin' AND a TOTP-verified session (JWT aal = 'aal2').

create or replace function private.assert_admin()
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin_mfa_required' using errcode = '42501';
  end if;
end $$;

create or replace function public.admin_stats()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.assert_admin();
  return jsonb_build_object(
    'users_total',    (select count(*) from public.profiles),
    'users_pending',  (select count(*) from public.profiles where status = 'pending'),
    'users_blocked',  (select count(*) from public.profiles where status = 'blocked'),
    'scans_total',    (select count(*) from public.scans),
    'scans_7d',       (select count(*) from public.scans where created_at > now() - interval '7 days'),
    'disputes_open',  (select count(*) from public.scans where review_status = 'disputed'),
    'by_level',       (select coalesce(jsonb_object_agg(final_level, n), '{}'::jsonb)
                         from (select final_level, count(*) n from public.scans group by 1) t),
    'ai_unavailable', (select count(*) from public.scans where ai_status <> 'ok'
                         and created_at > now() - interval '7 days'));
end $$;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;

create or replace function public.admin_list_users(p_search text default null,
                                                   p_status public.account_status default null)
returns table (id uuid, nickname text, display_name text, avatar_url text, email text, phone text,
               city text, role public.user_role, status public.account_status, blocked_reason text,
               created_at timestamptz, last_seen_at timestamptz, scans_count bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.assert_admin();
  return query
    select p.id, p.nickname, p.display_name, p.avatar_url, p.email, p.phone, p.city, p.role, p.status,
           p.blocked_reason, p.created_at,
           case when p.online_visibility in ('everyone', 'admins') then p.last_seen_at end,
           (select count(*) from public.scans s where s.owner_id = p.id)
      from public.profiles p
     where (p_status is null or p.status = p_status)
       and (p_search is null or p_search = ''
            or p.nickname ilike '%' || p_search || '%'
            or p.email ilike '%' || p_search || '%'
            or p.display_name ilike '%' || p_search || '%')
     order by (p.status = 'pending') desc, p.created_at desc
     limit 200;
end $$;
revoke all on function public.admin_list_users(text, public.account_status) from public, anon;
grant execute on function public.admin_list_users(text, public.account_status) to authenticated;

create or replace function public.admin_set_user_status(p_user uuid, p_status public.account_status,
                                                        p_reason text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_old public.account_status;
begin
  perform private.assert_admin();
  if p_user = auth.uid() then raise exception 'cannot_change_self' using errcode = '22023'; end if;
  if exists (select 1 from public.profiles where id = p_user and role = 'admin') then
    raise exception 'cannot_change_admin' using errcode = '22023';
  end if;

  select status into v_old from public.profiles where id = p_user for update;
  if v_old is null then raise exception 'not_found' using errcode = 'P0002'; end if;

  update public.profiles
     set status = p_status,
         blocked_reason = case when p_status = 'blocked' then left(nullif(trim(p_reason), ''), 300) end
   where id = p_user;

  if p_status = 'blocked' then
    -- Kill refresh tokens so the user is logged out everywhere within the access-token TTL.
    delete from auth.sessions where user_id = p_user;
    perform private.notify(p_user, 'account_blocked', '{}'::jsonb);
  elsif p_status = 'active' and v_old <> 'active' then
    perform private.notify(p_user, 'account_approved', '{}'::jsonb);
  end if;
end $$;
revoke all on function public.admin_set_user_status(uuid, public.account_status, text) from public, anon;
grant execute on function public.admin_set_user_status(uuid, public.account_status, text) to authenticated;

-- Resolve a dispute: accept -> owner's level becomes final; reject -> system verdict stands.
create or replace function public.admin_resolve_scan(p_scan uuid, p_accept boolean, p_comment text default null)
returns public.scans
language plpgsql security definer set search_path = ''
as $$
declare
  v_scan public.scans;
begin
  perform private.assert_admin();
  update public.scans
     set review_status = case when p_accept then 'confirmed'::public.review_status
                              else 'rejected'::public.review_status end,
         final_level   = case when p_accept then user_suggested_level else final_level end,
         reviewed_by   = auth.uid(),
         reviewed_at   = now(),
         admin_comment = left(nullif(trim(p_comment), ''), 500)
   where id = p_scan and review_status = 'disputed'
  returning * into v_scan;
  if v_scan.id is null then raise exception 'invalid_state' using errcode = '22023'; end if;

  perform private.notify(v_scan.owner_id, 'scan_resolved',
    jsonb_build_object('scan_id', v_scan.id, 'file_name', v_scan.file_name,
                       'accepted', p_accept, 'level', v_scan.final_level));
  return v_scan;
end $$;
revoke all on function public.admin_resolve_scan(uuid, boolean, text) from public, anon;
grant execute on function public.admin_resolve_scan(uuid, boolean, text) to authenticated;

create or replace function public.admin_list_scans(p_status public.review_status default null)
returns table (id uuid, owner_id uuid, owner_nickname text, file_name text, final_level public.sensitivity,
               rule_level public.sensitivity, ai_level public.sensitivity, ai_status text,
               review_status public.review_status, user_suggested_level public.sensitivity,
               user_comment text, categories text[], findings jsonb, summary text, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.assert_admin();
  return query
    select s.id, s.owner_id, p.nickname, s.file_name, s.final_level, s.rule_level, s.ai_level, s.ai_status,
           s.review_status, s.user_suggested_level, s.user_comment, s.categories, s.findings, s.summary,
           s.created_at
      from public.scans s join public.profiles p on p.id = s.owner_id
     where p_status is null or s.review_status = p_status
     order by s.created_at desc
     limit 200;
end $$;
revoke all on function public.admin_list_scans(public.review_status) from public, anon;
grant execute on function public.admin_list_scans(public.review_status) to authenticated;

create or replace function public.admin_upsert_rule(p jsonb)
returns public.policy_rules
language plpgsql security definer set search_path = ''
as $$
declare
  v_rule     public.policy_rules;
  v_keywords text[];
begin
  perform private.assert_admin();
  select array_agg(distinct lower(trim(k)))
    into v_keywords
    from jsonb_array_elements_text(coalesce(p -> 'keywords', '[]'::jsonb)) k
   where char_length(trim(k)) between 2 and 100;
  if v_keywords is null then raise exception 'invalid_keywords' using errcode = '22023'; end if;

  if p ? 'id' and nullif(p ->> 'id', '') is not null then
    update public.policy_rules
       set name = trim(p ->> 'name'), keywords = v_keywords,
           level = (p ->> 'level')::public.sensitivity,
           enabled = coalesce((p ->> 'enabled')::boolean, true)
     where id = (p ->> 'id')::uuid
    returning * into v_rule;
  else
    insert into public.policy_rules (name, keywords, level, enabled, created_by)
    values (trim(p ->> 'name'), v_keywords, (p ->> 'level')::public.sensitivity,
            coalesce((p ->> 'enabled')::boolean, true), auth.uid())
    returning * into v_rule;
  end if;
  return v_rule;
end $$;
revoke all on function public.admin_upsert_rule(jsonb) from public, anon;
grant execute on function public.admin_upsert_rule(jsonb) to authenticated;

create or replace function public.admin_delete_rule(p_rule uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.assert_admin();
  delete from public.policy_rules where id = p_rule;
end $$;
revoke all on function public.admin_delete_rule(uuid) from public, anon;
grant execute on function public.admin_delete_rule(uuid) to authenticated;
