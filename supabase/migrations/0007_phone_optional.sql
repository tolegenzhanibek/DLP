-- 0007_phone_optional: the phone number is no longer asked at sign-up.
-- Only a missing nickname (OAuth sign-up) triggers the one-time setup step.
-- The phone stays an optional profile field.

create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_nick  text := lower(trim(coalesce(new.raw_user_meta_data ->> 'nickname', '')));
  v_phone text := regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone', ''), '[^0-9+]', '', 'g');
  v_lang  text := coalesce(new.raw_user_meta_data ->> 'language', 'kk');
  v_name  text := left(trim(coalesce(new.raw_user_meta_data ->> 'full_name',
                                     new.raw_user_meta_data ->> 'name', '')), 60);
  v_setup boolean := false;
begin
  if v_nick = '' then
    v_nick  := 'user_' || substr(replace(new.id::text, '-', ''), 1, 10);
    v_setup := true;
  end if;
  if v_nick !~ '^[a-z0-9_.]{3,24}$' then
    raise exception 'invalid_nickname' using errcode = '22023';
  end if;
  if v_lang not in ('kk', 'ru', 'en') then
    v_lang := 'kk';
  end if;
  if v_phone !~ '^\+?[0-9]{10,15}$' then
    v_phone := '';
  end if;

  insert into public.profiles (id, nickname, display_name, phone, email, language, needs_setup)
  values (new.id, v_nick, nullif(v_name, ''), nullif(v_phone, ''), new.email, v_lang, v_setup);
  return new;
end $$;

-- Phone is optional; when given it must be valid.
create or replace function public.complete_my_profile(p_nickname text, p_phone text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_nick  text := lower(trim(coalesce(p_nickname, '')));
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if v_nick !~ '^[a-z0-9_.]{3,24}$' then raise exception 'invalid_nickname' using errcode = '22023'; end if;
  if v_phone is not null and v_phone !~ '^\+?[0-9]{10,15}$' then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles where nickname = v_nick and id <> v_uid) then
    raise exception 'nickname_taken' using errcode = '23505';
  end if;

  update public.profiles
     set nickname = v_nick, phone = coalesce(v_phone, phone), needs_setup = false
   where id = v_uid;
  return public.my_profile();
end $$;
revoke all on function public.complete_my_profile(text, text) from public, anon;
grant execute on function public.complete_my_profile(text, text) to authenticated;

-- Accounts that were held only because of a missing phone are released.
update public.profiles set needs_setup = false
 where needs_setup and nickname !~ '^user_[0-9a-f]{10}$';
