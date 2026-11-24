-- 0004_integrations: avatars storage, web push, Google Sheets mirror.
-- External calls go through pg_net (async). A failing external service never blocks
-- sign-up or saving: every call is wrapped in an exception handler.

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------- avatars
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------- secrets helper
-- Secrets are created by the owner in Supabase Vault (see docs/SETUP.md), never in git.
create or replace function private.secret(p_name text)
returns text
language sql stable security definer set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1;
$$;

-- ---------------------------------------------------------------- web push
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  endpoint   text not null unique check (endpoint ~ '^https://'),
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon, authenticated;
-- No client policies: subscriptions are managed through the RPCs below only.

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  select auth.uid(), p_endpoint, p_p256dh, p_auth where auth.uid() is not null
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
$$;
revoke all on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;
revoke all on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.delete_push_subscription(text) to authenticated;

create or replace function private.dispatch_push()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  if not exists (select 1 from public.profiles p
                  where p.id = new.user_id and p.push_enabled
                    and exists (select 1 from public.push_subscriptions s where s.user_id = p.id)) then
    return new;
  end if;
  begin
    v_url    := private.secret('push_function_url');
    v_secret := private.secret('push_webhook_secret');
    if v_url is not null and v_secret is not null then
      perform net.http_post(
        url     := v_url,
        body    := jsonb_build_object('notification_id', new.id),
        headers := jsonb_build_object('content-type', 'application/json', 'x-webhook-secret', v_secret),
        timeout_milliseconds := 5000);
    end if;
  exception when others then
    raise warning 'push dispatch failed: %', sqlerrm;
  end;
  return new;
end $$;

create trigger notifications_push after insert on public.notifications
  for each row execute function private.dispatch_push();

-- Used by the send-push edge function (service role).
create or replace function public.push_payload(p_notification uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
           'kind', n.kind, 'data', n.data, 'language', p.language,
           'subscriptions', coalesce((select jsonb_agg(jsonb_build_object(
                                 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                               from public.push_subscriptions s where s.user_id = n.user_id), '[]'::jsonb))
    from public.notifications n join public.profiles p on p.id = n.user_id
   where n.id = p_notification and p.push_enabled;
$$;
revoke all on function public.push_payload(uuid) from public, anon, authenticated;
grant execute on function public.push_payload(uuid) to service_role;

create or replace function public.drop_push_subscription(p_endpoint text)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;
revoke all on function public.drop_push_subscription(text) from public, anon, authenticated;
grant execute on function public.drop_push_subscription(text) to service_role;

-- ---------------------------------------------------------------- Google Sheets mirror
-- Every new user and every profile change is sent to an Apps Script web app.
-- "bio" and "links" are deliberately NOT sent.
create or replace function private.sync_profile_to_sheets()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  begin
    v_url    := private.secret('sheets_webhook_url');
    v_secret := private.secret('sheets_webhook_secret');
    if v_url is null or v_secret is null then
      return new;
    end if;
    perform net.http_post(
      url     := v_url,
      -- Apps Script doPost(e) cannot read request headers, so the secret travels in the body.
      body    := jsonb_build_object(
                   'secret', v_secret,
                   'event', lower(tg_op),
                   'profile', jsonb_build_object(
                     'id', new.id, 'nickname', new.nickname, 'display_name', new.display_name,
                     'email', new.email, 'phone', new.phone, 'gender', new.gender, 'city', new.city,
                     'role', new.role, 'status', new.status, 'language', new.language,
                     'created_at', new.created_at, 'updated_at', new.updated_at)),
      headers := jsonb_build_object('content-type', 'application/json'),
      timeout_milliseconds := 5000);
  exception when others then
    raise warning 'sheets sync failed: %', sqlerrm;
  end;
  return new;
end $$;

create trigger profiles_sheets_insert after insert on public.profiles
  for each row execute function private.sync_profile_to_sheets();

create trigger profiles_sheets_update after update on public.profiles
  for each row
  when ((old.nickname, old.display_name, old.email, old.phone, old.gender, old.city,
         old.role, old.status, old.language)
        is distinct from
        (new.nickname, new.display_name, new.email, new.phone, new.gender, new.city,
         new.role, new.status, new.language))
  execute function private.sync_profile_to_sheets();
