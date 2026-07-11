-- Optional: local demo login (dev builds only).
-- Creates demo@paidup.local / paidup-demo-2026 for /api/dev/login.
do $$
declare uid uuid := gen_random_uuid();
begin
  if exists (select 1 from auth.users where email = 'demo@paidup.local') then
    raise notice 'demo user already exists';
    return;
  end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
    'demo@paidup.local', crypt('paidup-demo-2026', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text,
    jsonb_build_object('sub', uid::text, 'email', 'demo@paidup.local', 'email_verified', true),
    'email', now(), now(), now());
end $$;
