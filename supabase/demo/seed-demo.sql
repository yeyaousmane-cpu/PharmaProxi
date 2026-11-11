-- SantéProxi — comptes et données FICTIVES du projet de démonstration « santeproxi-demo ».
-- Ne jamais exécuter en production : le script s'arrête si la base contient un compte non fictif.
-- Remplacer __MOT_DE_PASSE__ par le mot de passe de démonstration (le même que DEMO_PASSWORD sur Vercel).
do $$
declare
  pw text := '__MOT_DE_PASSE__';
  actors text[][] := array[
    ['admin', 'Awa Démo (administratrice)'], ['customer', 'Moussa Démo (patient)'], ['doctor1', 'Dr Aminata Démo'], ['doctor2', 'Dr Ibrahim Démo'],
    ['pharmacist1', 'Fatoumata Démo (pharmacienne)'], ['pharmacist2', 'Seydou Démo (pharmacien)'], ['clinic', 'Mariam Démo (clinique)'], ['courier', 'Bakary Démo (livreur)'],
    ['lab', 'Kadiatou Démo (laboratoire)'], ['institution', 'Oumar Démo (institution)'], ['validator', 'Dr Rokia Démo (validatrice)'], ['auditor', 'Salif Démo (auditeur)'], ['nurse', 'Adama Démo (infirmier)']];
  i int; uid uuid; mail text; ids jsonb := '{}'::jsonb; r jsonb := '{}'::jsonb;
begin
  if pw like '\_\_%' then raise exception 'Remplacez __MOT_DE_PASSE__ avant exécution.'; end if;
  if exists (select 1 from auth.users where email not like '%@pharmaproxi.invalid') then
    raise exception 'Arrêt : cette base contient des comptes réels. Le jeu de démonstration ne s''installe que dans le projet de démonstration.';
  end if;
  insert into public.platform_settings (key, value, description) values ('demo_environment', 'true', 'Environnement de démonstration (données fictives)')
  on conflict (key) do update set value = 'true';
  update public.platform_settings set value = 'true' where key = 'care_follow_enabled'; -- démonstration : suivi par un médecin ouvert

  for i in 1 .. array_length(actors, 1) loop
    mail := 'demo.' || actors[i][1] || '@pharmaproxi.invalid';
    select id into uid from auth.users where email = mail;
    if uid is null then
      uid := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
      values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', mail, extensions.crypt(pw, extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', actors[i][2]), now(), now(), '', '', '', '');
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', mail, 'email_verified', true), 'email', now(), now(), now());
    else
      update auth.users set encrypted_password = extensions.crypt(pw, extensions.gen_salt('bf')), email_confirmed_at = coalesce(email_confirmed_at, now()) where id = uid;
    end if;
    ids := ids || jsonb_build_object(actors[i][1], uid);
  end loop;

  if not exists (select 1 from public.pharmacies where name ilike '%démo%') then
    r := r || jsonb_build_object('base', public.demo_install(ids));
    r := r || jsonb_build_object('annuaire', public.demo_directory_install(ids));
  end if;
  r := r || jsonb_build_object('acteurs', public.demo_extra_install(ids));
  r := r || jsonb_build_object('infirmier', public.demo_nurse_install((ids->>'nurse')::uuid));
  r := r || jsonb_build_object('donneur', public.demo_donor_install((ids->>'customer')::uuid, (ids->>'admin')::uuid));
  raise notice 'Démonstration installée : %', r;
end $$;

select email from auth.users order by email;
