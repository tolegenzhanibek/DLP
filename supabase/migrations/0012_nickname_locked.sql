-- 0012_nickname_locked: a nickname is chosen once (sign-up or OAuth profile completion)
-- and cannot be changed by the user afterwards. Server-side maintenance (no auth.uid())
-- can still rename if ever needed.
create or replace function private.lock_nickname()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.nickname is distinct from old.nickname
     and not old.needs_setup
     and auth.uid() is not null then
    raise exception 'nickname_locked' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists profiles_lock_nickname on public.profiles;
create trigger profiles_lock_nickname before update of nickname on public.profiles
  for each row execute function private.lock_nickname();
