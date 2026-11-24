-- 0001_core: profiles, settings, auth helpers, rate limiting.
-- Principle: clients never write tables directly. Every write goes through a
-- SECURITY DEFINER function that checks auth.uid(). RLS is on for every table.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------- types
create type public.user_role         as enum ('user', 'admin');
create type public.account_status    as enum ('pending', 'active', 'blocked');
create type public.gender            as enum ('male', 'female', 'unspecified');
create type public.online_visibility as enum ('everyone', 'admins', 'nobody');
create type public.theme_pref        as enum ('light', 'dark', 'system');

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  nickname          text not null check (nickname ~ '^[a-z0-9_.]{3,24}$'),
  display_name      text check (char_length(display_name) <= 60),
  avatar_url        text check (char_length(avatar_url) <= 500),
  bio               text check (char_length(bio) <= 300),
  links             jsonb not null default '[]'::jsonb
                      check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 5),
  -- private (owner + admin only)
  gender            public.gender not null default 'unspecified',
  city              text check (char_length(city) <= 60),
  phone             text check (phone ~ '^\+?[0-9]{10,15}$'),
  email             text,
  -- account
  role              public.user_role not null default 'user',
  status            public.account_status not null default 'pending',
  blocked_reason    text check (char_length(blocked_reason) <= 300),
  -- settings
  theme             public.theme_pref not null default 'system',
  language          text not null default 'kk' check (language in ('kk', 'ru', 'en')),
  online_visibility public.online_visibility not null default 'everyone',
  push_enabled      boolean not null default false,
  onboarded_at      timestamptz,
  last_seen_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index profiles_nickname_key on public.profiles (nickname);

alter table public.profiles enable row level security;

-- Column-level privacy: table-wide SELECT is revoked, only public columns are granted.
-- (A column-level REVOKE alone has no effect while a table-level GRANT exists.)
revoke all on table public.profiles from anon, authenticated;
grant select (id, nickname, display_name, avatar_url, bio, links, created_at)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------- helpers
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select p.role = 'admin' and p.status = 'active'
       from public.profiles p where p.id = auth.uid()),
    false)
  and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.is_active_user()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active');
$$;
revoke all on function public.is_active_user() from public, anon;
grant execute on function public.is_active_user() to authenticated;

-- Other users see public columns of active accounts only; owner and admins see the row.
create policy profiles_select on public.profiles
  for select to authenticated
  using (status = 'active' or id = auth.uid() or public.is_admin());

create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------- rate limiting
create table private.rate_limits (
  key          text primary key,
  window_start timestamptz not null,
  hits         integer not null
);

-- Fixed-window counter. Returns true when the call is ALLOWED.
create or replace function private.hit_rate_limit(p_key text, p_max integer, p_window interval)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_hits integer;
begin
  insert into private.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set hits = case when r.window_start < now() - p_window then 1 else r.hits + 1 end,
        window_start = case when r.window_start < now() - p_window then now() else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end $$;

-- Exposed only to the service role (edge functions).
create or replace function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language sql security definer set search_path = ''
as $$
  select private.hit_rate_limit(p_key, p_max, make_interval(secs => p_window_seconds));
$$;
revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- ---------------------------------------------------------------- new user
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_nick  text := lower(trim(coalesce(new.raw_user_meta_data ->> 'nickname', '')));
  v_phone text := regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone', ''), '[^0-9+]', '', 'g');
  v_lang  text := coalesce(new.raw_user_meta_data ->> 'language', 'kk');
begin
  if v_nick = '' then
    v_nick := 'user_' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;
  if v_nick !~ '^[a-z0-9_.]{3,24}$' then
    raise exception 'invalid_nickname' using errcode = '22023';
  end if;
  if v_lang not in ('kk', 'ru', 'en') then
    v_lang := 'kk';
  end if;

  insert into public.profiles (id, nickname, phone, email, language)
  values (new.id, v_nick, nullif(v_phone, ''), new.email, v_lang);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.handle_user_email_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

-- ---------------------------------------------------------------- public RPCs
create or replace function public.nickname_available(p_nickname text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select lower(trim(p_nickname)) ~ '^[a-z0-9_.]{3,24}$'
     and not exists (select 1 from public.profiles where nickname = lower(trim(p_nickname)));
$$;
revoke all on function public.nickname_available(text) from public;
grant execute on function public.nickname_available(text) to anon, authenticated;

-- Used by the `login` edge function only (nickname -> email). Never exposed to clients.
create or replace function public.resolve_login_email(p_identifier text)
returns text
language sql stable security definer set search_path = ''
as $$
  select u.email
    from public.profiles p join auth.users u on u.id = p.id
   where p.nickname = lower(trim(p_identifier))
   limit 1;
$$;
revoke all on function public.resolve_login_email(text) from public, anon, authenticated;
grant execute on function public.resolve_login_email(text) to service_role;

-- ---------------------------------------------------------------- owner RPCs
create or replace function public.my_profile()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select to_jsonb(p) - 'blocked_reason'
         || jsonb_build_object(
              'blocked_reason', p.blocked_reason,
              'email_confirmed', (select u.email_confirmed_at is not null from auth.users u where u.id = p.id),
              'new_email', (select u.email_change from auth.users u where u.id = p.id and u.email_change <> ''))
    from public.profiles p
   where p.id = auth.uid();
$$;
revoke all on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

create or replace function public.update_my_profile(p jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_links jsonb;
  v_link  jsonb;
  v_url   text;
  v_nick  text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

  if p ? 'links' then
    v_links := coalesce(p -> 'links', '[]'::jsonb);
    if jsonb_typeof(v_links) <> 'array' or jsonb_array_length(v_links) > 5 then
      raise exception 'invalid_links' using errcode = '22023';
    end if;
    for v_link in select * from jsonb_array_elements(v_links) loop
      if jsonb_typeof(v_link) <> 'string'
         or (v_link #>> '{}') !~ '^https?://[^\s<>"]{3,200}$' then
        raise exception 'invalid_links' using errcode = '22023';
      end if;
    end loop;
  end if;

  if p ? 'avatar_url' then
    v_url := nullif(p ->> 'avatar_url', '');
    if v_url is not null
       and position(('/storage/v1/object/public/avatars/' || v_uid::text || '/') in v_url) = 0 then
      raise exception 'invalid_avatar' using errcode = '22023';
    end if;
  end if;

  if p ? 'nickname' then
    v_nick := lower(trim(p ->> 'nickname'));
    if v_nick !~ '^[a-z0-9_.]{3,24}$' then
      raise exception 'invalid_nickname' using errcode = '22023';
    end if;
    if exists (select 1 from public.profiles where nickname = v_nick and id <> v_uid) then
      raise exception 'nickname_taken' using errcode = '23505';
    end if;
  end if;

  update public.profiles set
    nickname     = case when p ? 'nickname' then v_nick else nickname end,
    display_name = case when p ? 'display_name' then nullif(trim(p ->> 'display_name'), '') else display_name end,
    bio          = case when p ? 'bio' then nullif(trim(p ->> 'bio'), '') else bio end,
    city         = case when p ? 'city' then nullif(trim(p ->> 'city'), '') else city end,
    phone        = case when p ? 'phone'
                        then nullif(regexp_replace(coalesce(p ->> 'phone', ''), '[^0-9+]', '', 'g'), '')
                        else phone end,
    gender       = case when p ? 'gender' then (p ->> 'gender')::public.gender else gender end,
    links        = case when p ? 'links' then v_links else links end,
    avatar_url   = case when p ? 'avatar_url' then v_url else avatar_url end
  where id = v_uid;

  return public.my_profile();
end $$;
revoke all on function public.update_my_profile(jsonb) from public, anon;
grant execute on function public.update_my_profile(jsonb) to authenticated;

create or replace function public.update_my_settings(p jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p ? 'language' and (p ->> 'language') not in ('kk', 'ru', 'en') then
    raise exception 'invalid_language' using errcode = '22023';
  end if;

  update public.profiles set
    theme             = case when p ? 'theme' then (p ->> 'theme')::public.theme_pref else theme end,
    language          = case when p ? 'language' then p ->> 'language' else language end,
    online_visibility = case when p ? 'online_visibility'
                             then (p ->> 'online_visibility')::public.online_visibility
                             else online_visibility end,
    push_enabled      = case when p ? 'push_enabled' then (p ->> 'push_enabled')::boolean else push_enabled end
  where id = auth.uid();

  return public.my_profile();
end $$;
revoke all on function public.update_my_settings(jsonb) from public, anon;
grant execute on function public.update_my_settings(jsonb) to authenticated;

-- Onboarding "seen" flag lives on the server, so the tour never repeats on another device.
create or replace function public.mark_onboarded()
returns void
language sql security definer set search_path = ''
as $$
  update public.profiles set onboarded_at = coalesce(onboarded_at, now()) where id = auth.uid();
$$;
revoke all on function public.mark_onboarded() from public, anon;
grant execute on function public.mark_onboarded() to authenticated;

create or replace function public.touch_last_seen()
returns void
language sql security definer set search_path = ''
as $$
  update public.profiles set last_seen_at = now()
   where id = auth.uid() and (last_seen_at is null or last_seen_at < now() - interval '45 seconds');
$$;
revoke all on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;

-- Re-authentication check before email/password change. 5 attempts per 15 minutes.
create or replace function public.verify_my_password(p_password text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_ok boolean;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not private.hit_rate_limit('verify_pw:' || auth.uid()::text, 5, interval '15 minutes') then
    raise exception 'rate_limited' using errcode = 'P0429';
  end if;
  select u.encrypted_password = extensions.crypt(p_password, u.encrypted_password)
    into v_ok
    from auth.users u where u.id = auth.uid();
  return coalesce(v_ok, false);
end $$;
revoke all on function public.verify_my_password(text) from public, anon;
grant execute on function public.verify_my_password(text) to authenticated;

-- Active sessions of the current user.
create or replace function public.my_sessions()
returns table (id uuid, created_at timestamptz, updated_at timestamptz,
               user_agent text, ip text, aal text, is_current boolean)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.created_at, coalesce(s.refreshed_at::timestamptz, s.updated_at), s.user_agent,
         host(s.ip), s.aal::text, s.id::text = coalesce(auth.jwt() ->> 'session_id', '')
    from auth.sessions s
   where s.user_id = auth.uid()
     and (s.not_after is null or s.not_after > now())
   order by coalesce(s.refreshed_at::timestamptz, s.updated_at) desc nulls last;
$$;
revoke all on function public.my_sessions() from public, anon;
grant execute on function public.my_sessions() to authenticated;

-- Revoking a session kills its refresh token; its access token expires on its own (<= 1h).
create or replace function public.revoke_my_session(p_session uuid)
returns void
language sql security definer set search_path = ''
as $$
  delete from auth.sessions where id = p_session and user_id = auth.uid();
$$;
revoke all on function public.revoke_my_session(uuid) from public, anon;
grant execute on function public.revoke_my_session(uuid) to authenticated;

-- Public profile with online status that respects the owner's visibility setting.
create or replace function public.public_profile(p_nickname text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
           'id', p.id, 'nickname', p.nickname, 'display_name', p.display_name,
           'avatar_url', p.avatar_url, 'bio', p.bio, 'links', p.links, 'created_at', p.created_at,
           'last_seen_at',
             case when p.id = auth.uid()
                    or p.online_visibility = 'everyone'
                    or (p.online_visibility = 'admins' and public.is_admin())
                  then p.last_seen_at end)
    from public.profiles p
   where p.nickname = lower(trim(p_nickname))
     and (p.status = 'active' or p.id = auth.uid() or public.is_admin())
     and auth.uid() is not null;
$$;
revoke all on function public.public_profile(text) from public, anon;
grant execute on function public.public_profile(text) to authenticated;
