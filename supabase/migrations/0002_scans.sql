-- 0002_scans: classification results, admin policy rules, in-app notifications.
-- Document text is NEVER stored. Only metadata, masked samples and the verdict.

create type public.sensitivity   as enum ('public', 'internal', 'confidential', 'restricted');
create type public.review_status as enum ('pending', 'confirmed', 'disputed', 'rejected');
-- pending   : AI verdict waiting for the owner
-- confirmed : owner accepted, or admin accepted the owner's dispute
-- disputed  : owner proposed another level, waiting for an admin
-- rejected  : admin rejected the dispute, the system verdict stands

-- ---------------------------------------------------------------- scans
create table public.scans (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references public.profiles (id) on delete cascade,
  file_name            text not null check (char_length(file_name) between 1 and 255),
  file_type            text check (char_length(file_type) <= 100),
  file_size            integer check (file_size >= 0),
  char_count           integer not null check (char_count >= 0),
  sha256               text check (sha256 ~ '^[a-f0-9]{64}$'),
  rule_level           public.sensitivity not null,
  ai_level             public.sensitivity,
  final_level          public.sensitivity not null,
  ai_status            text not null check (ai_status in ('ok', 'unavailable', 'refused', 'skipped')),
  ai_confidence        numeric(4, 3) check (ai_confidence between 0 and 1),
  categories           text[] not null default '{}',
  findings             jsonb not null default '[]'::jsonb,
  summary              text check (char_length(summary) <= 1000),
  rationale            text check (char_length(rationale) <= 2000),
  model                text,
  review_status        public.review_status not null default 'pending',
  user_suggested_level public.sensitivity,
  user_comment         text check (char_length(user_comment) <= 500),
  reviewed_by          uuid references public.profiles (id) on delete set null,
  reviewed_at          timestamptz,
  admin_comment        text check (char_length(admin_comment) <= 500),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index scans_owner_created_idx on public.scans (owner_id, created_at desc);
create index scans_review_idx on public.scans (review_status, created_at);

alter table public.scans enable row level security;
revoke all on table public.scans from anon, authenticated;
grant select on public.scans to authenticated;

create policy scans_select on public.scans
  for select to authenticated
  using (owner_id = auth.uid() or public.is_admin());

create trigger scans_touch before update on public.scans
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------- policy rules
-- Admin-defined keyword rules (e.g. internal project code names). Plain keywords only:
-- user-supplied regexes would open a ReDoS hole in the classifier.
create table public.policy_rules (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  keywords    text[] not null check (cardinality(keywords) between 1 and 50),
  level       public.sensitivity not null,
  enabled     boolean not null default true,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.policy_rules enable row level security;
revoke all on table public.policy_rules from anon, authenticated;
grant select on public.policy_rules to authenticated;

-- The rules themselves are sensitive (they list secret code names) -> admins only.
create policy policy_rules_select on public.policy_rules
  for select to authenticated using (public.is_admin());

create trigger policy_rules_touch before update on public.policy_rules
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------- notifications
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('scan_done', 'scan_resolved', 'dispute_new',
                                           'account_approved', 'account_blocked')),
  data       jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on table public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;

create policy notifications_select on public.notifications
  for select to authenticated using (user_id = auth.uid());

create or replace function private.notify(p_user uuid, p_kind text, p_data jsonb)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.notifications (user_id, kind, data) values (p_user, p_kind, coalesce(p_data, '{}'::jsonb));
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void
language sql security definer set search_path = ''
as $$
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null
     and (p_ids is null or id = any (p_ids));
$$;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- ---------------------------------------------------------------- scan lifecycle
-- Called by the `classify` edge function (service role) after detectors + AI ran.
create or replace function public.record_scan(p_owner uuid, p jsonb)
returns public.scans
language plpgsql security definer set search_path = ''
as $$
declare
  v_scan public.scans;
begin
  insert into public.scans (owner_id, file_name, file_type, file_size, char_count, sha256,
                            rule_level, ai_level, final_level, ai_status, ai_confidence,
                            categories, findings, summary, rationale, model)
  values (p_owner,
          left(p ->> 'file_name', 255),
          left(p ->> 'file_type', 100),
          (p ->> 'file_size')::integer,
          (p ->> 'char_count')::integer,
          nullif(p ->> 'sha256', ''),
          (p ->> 'rule_level')::public.sensitivity,
          (p ->> 'ai_level')::public.sensitivity,
          (p ->> 'final_level')::public.sensitivity,
          p ->> 'ai_status',
          (p ->> 'ai_confidence')::numeric,
          coalesce((select array_agg(x) from jsonb_array_elements_text(p -> 'categories') x), '{}'),
          coalesce(p -> 'findings', '[]'::jsonb),
          left(p ->> 'summary', 1000),
          left(p ->> 'rationale', 2000),
          p ->> 'model')
  returning * into v_scan;

  perform private.notify(p_owner, 'scan_done',
    jsonb_build_object('scan_id', v_scan.id, 'file_name', v_scan.file_name, 'level', v_scan.final_level));
  return v_scan;
end $$;
revoke all on function public.record_scan(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_scan(uuid, jsonb) to service_role;

-- Enabled rules for the classifier (service role only).
create or replace function public.active_policy_rules()
returns table (id uuid, name text, keywords text[], level public.sensitivity)
language sql stable security definer set search_path = ''
as $$
  select id, name, keywords, level from public.policy_rules where enabled;
$$;
revoke all on function public.active_policy_rules() from public, anon, authenticated;
grant execute on function public.active_policy_rules() to service_role;

create or replace function public.confirm_scan(p_scan uuid)
returns public.scans
language plpgsql security definer set search_path = ''
as $$
declare
  v_scan public.scans;
begin
  if not public.is_active_user() then raise exception 'not_allowed' using errcode = '42501'; end if;
  update public.scans set review_status = 'confirmed'
   where id = p_scan and owner_id = auth.uid() and review_status = 'pending'
  returning * into v_scan;
  if v_scan.id is null then raise exception 'invalid_state' using errcode = '22023'; end if;
  return v_scan;
end $$;
revoke all on function public.confirm_scan(uuid) from public, anon;
grant execute on function public.confirm_scan(uuid) to authenticated;

create or replace function public.dispute_scan(p_scan uuid, p_level public.sensitivity, p_comment text)
returns public.scans
language plpgsql security definer set search_path = ''
as $$
declare
  v_scan  public.scans;
  v_admin uuid;
begin
  if not public.is_active_user() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if char_length(coalesce(p_comment, '')) > 500 then raise exception 'comment_too_long' using errcode = '22023'; end if;

  update public.scans
     set review_status = 'disputed', user_suggested_level = p_level,
         user_comment = nullif(trim(p_comment), '')
   where id = p_scan and owner_id = auth.uid() and review_status = 'pending'
     and p_level is distinct from final_level
  returning * into v_scan;
  if v_scan.id is null then raise exception 'invalid_state' using errcode = '22023'; end if;

  for v_admin in select id from public.profiles where role = 'admin' and status = 'active' loop
    perform private.notify(v_admin, 'dispute_new',
      jsonb_build_object('scan_id', v_scan.id, 'file_name', v_scan.file_name));
  end loop;
  return v_scan;
end $$;
revoke all on function public.dispute_scan(uuid, public.sensitivity, text) from public, anon;
grant execute on function public.dispute_scan(uuid, public.sensitivity, text) to authenticated;

create or replace function public.delete_my_scan(p_scan uuid)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.scans where id = p_scan and owner_id = auth.uid();
$$;
revoke all on function public.delete_my_scan(uuid) from public, anon;
grant execute on function public.delete_my_scan(uuid) to authenticated;

-- Realtime: owners get their scan and notification rows live (RLS applies to realtime too).
alter publication supabase_realtime add table public.notifications, public.scans;
