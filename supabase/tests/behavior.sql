\set ON_ERROR_STOP 1
insert into vault.decrypted_secrets values ('sheets_webhook_url','https://script.google.com/x'),('sheets_webhook_secret','s3cret');
insert into auth.users (id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','alice@x.kz', extensions.crypt('Password1!', extensions.gen_salt('bf')), now(), '{"nickname":"Alice","phone":"+7 701 111 22 33","language":"ru"}'),
 ('22222222-2222-2222-2222-222222222222','bob@x.kz', extensions.crypt('Password2!', extensions.gen_salt('bf')), now(), '{"nickname":"bob"}'),
 ('33333333-3333-3333-3333-333333333333','admin@x.kz', extensions.crypt('Password3!', extensions.gen_salt('bf')), now(), '{"nickname":"admin"}');
select nickname, phone, status, language from public.profiles order by nickname;
select 'sheets calls after signup', count(*), bool_and(not (body->'profile' ? 'bio')) no_bio from net.calls;
update public.profiles set role='admin', status='active' where nickname='admin';
update public.profiles set status='active' where nickname='bob';

-- bad nickname rejected
do $$ begin
  insert into auth.users (email, raw_user_meta_data) values ('bad@x','{"nickname":"a b"}');
  raise exception 'should have failed';
exception when sqlstate '22023' then raise notice 'OK invalid nickname rejected'; end $$;

-- act as alice (pending)
set role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","aal":"aal1","session_id":"x"}',false);
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select 'alice sees rows', count(*) from public.profiles;  -- own + active (bob, admin) = 3
do $$ begin perform phone from public.profiles; raise exception 'phone leaked';
exception when insufficient_privilege then raise notice 'OK phone column not selectable'; end $$;
do $$ begin perform email from public.profiles; raise exception 'email leaked';
exception when insufficient_privilege then raise notice 'OK email column not selectable'; end $$;
do $$ begin update public.profiles set role='admin'; raise exception 'direct update allowed';
exception when insufficient_privilege then raise notice 'OK direct update denied'; end $$;
select 'my_profile', (public.my_profile())->>'phone' phone, (public.my_profile())->>'email_confirmed' conf;
select 'nick avail bob', public.nickname_available('BOB'), public.nickname_available('newnick');
select 'update profile', (public.update_my_profile('{"display_name":"Алиса","links":["https://t.me/alice"],"gender":"female"}'))->>'gender';
do $$ begin perform public.update_my_profile('{"links":["javascript:alert(1)"]}'); raise exception 'bad link ok';
exception when sqlstate '22023' then raise notice 'OK bad link rejected'; end $$;
do $$ begin perform public.update_my_profile('{"avatar_url":"https://evil/storage/v1/object/public/avatars/2222/x.png"}'); raise exception 'foreign avatar ok';
exception when sqlstate '22023' then raise notice 'OK foreign avatar rejected'; end $$;
do $$ begin perform public.update_my_profile('{"nickname":"bob"}'); raise exception 'dup nick ok';
exception when sqlstate '23505' then raise notice 'OK duplicate nickname rejected'; end $$;
select 'verify pw', public.verify_my_password('Password1!') ok, public.verify_my_password('nope') bad;
do $$ begin perform public.confirm_scan(gen_random_uuid()); raise exception 'pending user acted';
exception when insufficient_privilege then raise notice 'OK pending user cannot act on scans'; end $$;
do $$ begin perform public.resolve_login_email('bob'); raise exception 'resolve exposed';
exception when insufficient_privilege then raise notice 'OK resolve_login_email not exposed'; end $$;
do $$ begin perform public.admin_stats(); raise exception 'admin open';
exception when insufficient_privilege then raise notice 'OK non-admin denied admin_stats'; end $$;
reset role;

-- service role records a scan for bob
set role service_role;
select 'resolve', public.resolve_login_email('BOB');
select 'rate', public.check_rate_limit('t',2,60), public.check_rate_limit('t',2,60), public.check_rate_limit('t',2,60);
select 'record', (public.record_scan('22222222-2222-2222-2222-222222222222',
  '{"file_name":"a.pdf","char_count":10,"rule_level":"confidential","ai_level":"internal","final_level":"confidential","ai_status":"ok","categories":["pii"],"findings":[{"type":"iin","count":2}]}')).review_status;
reset role;

-- bob disputes
set role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","aal":"aal1"}',false);
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select 'bob scans', count(*) from public.scans;
select 'dispute', (public.dispute_scan((select id from public.scans limit 1),'internal','just names')).review_status;
reset role;

-- admin WITHOUT mfa
set role authenticated;
select set_config('request.jwt.claims','{"sub":"33333333-3333-3333-3333-333333333333","aal":"aal1"}',false);
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
do $$ begin perform public.admin_stats(); raise exception 'aal1 admin allowed';
exception when insufficient_privilege then raise notice 'OK admin without TOTP denied'; end $$;
select 'admin aal1 sees scans', count(*) from public.scans;
-- admin WITH mfa
select set_config('request.jwt.claims','{"sub":"33333333-3333-3333-3333-333333333333","aal":"aal2"}',false);
select 'stats', public.admin_stats()->>'disputes_open' disputes, public.admin_stats()->>'users_pending' pending;
select 'admin sees scans', count(*) from public.scans;
select 'resolve', (public.admin_resolve_scan((select id from public.scans limit 1), true, 'ok')).final_level;
select public.admin_set_user_status('11111111-1111-1111-1111-111111111111','active');
do $$ begin perform public.admin_set_user_status('33333333-3333-3333-3333-333333333333','blocked'); raise exception 'self block';
exception when sqlstate '22023' then raise notice 'OK cannot block self'; end $$;
select 'rule', (public.admin_upsert_rule('{"name":"Falcon","keywords":["Project Falcon","  falcon-x "],"level":"restricted"}')).keywords;
select 'users', count(*) from public.admin_list_users(null,null);
reset role;
select kind, user_id from public.notifications order by created_at;
select 'sheets calls total', count(*) from net.calls;

-- OAuth sign-up (no nickname / phone in metadata) -> needs_setup
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
 ('44444444-4444-4444-4444-444444444444', 'g@gmail.com', now(), '{"full_name":"Google User","avatar_url":"https://x"}');
select 'oauth profile', nickname like 'user_%' tmp_nick, display_name, needs_setup from public.profiles where id = '44444444-4444-4444-4444-444444444444';
set role authenticated;
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-4444-444444444444","aal":"aal1"}',false);
select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',false);
do $$ begin perform public.complete_my_profile('bob', '+77011112233'); raise exception 'dup nick ok';
exception when sqlstate '23505' then raise notice 'OK complete_my_profile rejects taken nickname'; end $$;
do $$ begin perform public.complete_my_profile('googler', '12'); raise exception 'bad phone ok';
exception when sqlstate '22023' then raise notice 'OK complete_my_profile rejects bad phone'; end $$;
select 'completed', (public.complete_my_profile('Googler', '+7 702 000 11 22'))->>'needs_setup' needs_setup;
reset role;

set role service_role;
select 'account_exists', public.account_exists('ALICE@x.kz') email_yes, public.account_exists('nobody@x.kz') email_no,
       public.account_exists('Bob') nick_yes, public.account_exists('ghost') nick_no;
reset role;
set role authenticated;
do $$ begin perform public.account_exists('bob'); raise exception 'exposed';
exception when insufficient_privilege then raise notice 'OK account_exists not exposed to clients'; end $$;
reset role;
