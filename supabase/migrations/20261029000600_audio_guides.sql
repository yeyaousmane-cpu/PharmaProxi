-- ============================================================================
-- PharmaProxi — Migration : guides audio en langues nationales
-- Des messages courts, enregistrés par des locuteurs natifs à partir d'un texte
-- français simple, écoutables sur les pages clés. Aucune voix de synthèse : chaque
-- enregistrement est déposé, vérifié puis publié par l'équipe.
-- ============================================================================

create table if not exists public.audio_languages (
  code text primary key check (code ~ '^[a-z]{2,12}$'),
  name text not null,
  native_name text,
  sort_order int not null default 100,
  is_active boolean not null default true
);
alter table public.audio_languages enable row level security;
drop policy if exists "pp_audio_lang_read" on public.audio_languages;
create policy "pp_audio_lang_read" on public.audio_languages for select to anon, authenticated using (true);
revoke insert, update, delete on public.audio_languages from anon, authenticated;
grant select on public.audio_languages to anon, authenticated;

-- Français + langues nationales du Mali
insert into public.audio_languages (code, name, native_name, sort_order) values
  ('francais', 'Français', null, 0),
  ('bambara', 'Bambara', 'Bamanankan', 1),
  ('peul', 'Peul', 'Fulfulde', 2),
  ('soninke', 'Soninké', 'Sooninkanxanne', 3),
  ('songhai', 'Songhaï', null, 4),
  ('tamasheq', 'Tamasheq', null, 5),
  ('dogon', 'Dogon', null, 6),
  ('malinke', 'Malinké', 'Maninkakan', 7),
  ('senoufo', 'Sénoufo', null, 8),
  ('minianka', 'Minianka', null, 9),
  ('bobo', 'Bobo', null, 10),
  ('bozo', 'Bozo', null, 11),
  ('kassonke', 'Khassonké', null, 12),
  ('hassaniya', 'Hassanya', null, 13)
on conflict (code) do nothing;

-- Pages et messages à enregistrer (texte français simple à faire traduire oralement)
create table if not exists public.audio_targets (
  key text primary key check (key ~ '^[a-z0-9:-]{2,100}$'),
  label text not null check (char_length(label) between 2 and 160),
  page_path text not null check (page_path ~ '^/'),
  script_fr text not null check (char_length(script_fr) between 20 and 3000),
  sort_order int not null default 100,
  created_at timestamptz not null default now()
);
alter table public.audio_targets enable row level security;
drop policy if exists "pp_audio_targets_read" on public.audio_targets;
create policy "pp_audio_targets_read" on public.audio_targets for select to anon, authenticated using (true);
revoke insert, update, delete on public.audio_targets from anon, authenticated;
grant select on public.audio_targets to anon, authenticated;

insert into public.audio_targets (key, label, page_path, sort_order, script_fr) values
  ('accueil', 'Accueil — présentation de PharmaProxi', '/', 1,
   'Bienvenue sur PharmaProxi. Ce site vous aide à trouver la pharmacie qui a votre médicament, près de chez vous. Écrivez le nom du médicament, choisissez votre quartier, puis regardez les pharmacies qui le déclarent. Avant de vous déplacer, appelez la pharmacie ou demandez une confirmation. PharmaProxi vous aide aussi à trouver un médecin, un laboratoire et les pharmacies de garde. Le site ne remplace pas l''avis d''un médecin ou d''un pharmacien.'),
  ('recherche', 'Rechercher un médicament', '/recherche', 2,
   'Pour chercher un médicament, écrivez son nom. Les résultats montrent les pharmacies qui disent l''avoir, avec le prix et la date de la dernière mise à jour. Une information ancienne peut ne plus être vraie : appelez toujours la pharmacie avant de partir. Les médicaments sur ordonnance ne sont donnés qu''avec l''ordonnance du médecin.'),
  ('garde', 'Pharmacies de garde', '/garde', 3,
   'Cette page montre les pharmacies de garde, ouvertes la nuit, le week-end et les jours fériés. Choisissez votre région et votre commune. Appelez la pharmacie avant de vous déplacer, car le tableau de garde peut changer.'),
  ('urgences', 'Urgences', '/urgences', 4,
   'En cas d''urgence grave — la personne ne répond plus, respire mal, a une forte douleur dans la poitrine, saigne beaucoup, ou a eu un accident — allez tout de suite au service d''urgence le plus proche ou appelez les secours. N''attendez pas un rendez-vous. Cette page donne les numéros d''urgence et les services ouverts jour et nuit.'),
  ('rendez-vous', 'Prendre rendez-vous avec un médecin', '/rendez-vous', 5,
   'Pour prendre rendez-vous, choisissez la spécialité et votre quartier. Choisissez un médecin, le motif de la visite, puis un horaire libre. Confirmez. Vous recevez un rappel la veille. Si vous ne pouvez pas venir, annulez pour laisser la place à quelqu''un d''autre. En cas d''urgence, ne prenez pas rendez-vous : allez aux urgences.'),
  ('inscription', 'Créer un compte', '/inscription', 6,
   'Pour créer un compte, écrivez votre nom, votre numéro de téléphone, votre adresse e-mail et un mot de passe. Gardez votre mot de passe pour vous. Avec un compte, vous pouvez demander une réservation en pharmacie, prendre rendez-vous et recevoir des alertes quand un médicament revient.'),
  ('sante', 'Santé essentielle', '/sante', 7,
   'La rubrique Santé essentielle donne des informations simples sur la santé : prévention, examens, maladies fréquentes. Chaque fiche est vérifiée par un professionnel de santé, et ses sources sont indiquées. Ces informations ne remplacent pas une consultation : pour votre santé, parlez à un médecin, une sage-femme ou un pharmacien.'),
  ('sante-mariage', 'Avant le mariage', '/sante/mariage', 8,
   'Avant le mariage, certains examens aident à préparer une famille en bonne santé : le groupe sanguin et le rhésus, le test de l''hémoglobine pour la drépanocytose, et le dépistage de certaines infections. Une différence de groupe sanguin n''empêche jamais de se marier. Si les deux futurs époux sont porteurs du gène de la drépanocytose, par exemple AS et AS, chaque grossesse a une chance sur quatre de donner un enfant malade. Ce n''est pas une interdiction : parlez-en à un médecin, qui vous accompagnera.')
on conflict (key) do nothing;

create table if not exists public.audio_clips (
  id uuid primary key default gen_random_uuid(),
  target_key text not null references public.audio_targets(key) on delete cascade,
  lang text not null references public.audio_languages(code) on delete restrict,
  storage_path text not null unique check (storage_path ~ '^[a-z0-9:/_.-]{5,200}$'),
  mime text not null check (mime in ('audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/webm', 'audio/wav', 'audio/x-wav')),
  size_bytes int not null check (size_bytes between 1 and 10485760),
  duration_s int check (duration_s is null or duration_s between 1 and 900),
  speaker text check (char_length(coalesce(speaker, '')) <= 120),      -- voix (affichée si renseignée)
  translator text check (char_length(coalesce(translator, '')) <= 120), -- traduction orale
  reviewer text check (char_length(coalesce(reviewer, '')) <= 120),     -- relecture par un second locuteur
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (target_key, lang)
);
alter table public.audio_clips enable row level security;
drop policy if exists "pp_audio_clips_read" on public.audio_clips;
create policy "pp_audio_clips_read" on public.audio_clips for select to anon, authenticated
  using (status = 'published' or public.is_admin() or public.is_health_staff());
revoke insert, update, delete on public.audio_clips from anon, authenticated;
grant select on public.audio_clips to anon, authenticated;

create or replace function public.can_manage_audio()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.is_health_staff()
$$;

-- Stockage : fichiers lisibles publiquement (bucket public), dépôt réservé à l'équipe
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audio-guides', 'audio-guides', true, 10485760,
        array['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/webm', 'audio/wav', 'audio/x-wav'])
on conflict (id) do nothing;
drop policy if exists "pp_audio_insert" on storage.objects;
create policy "pp_audio_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'audio-guides' and public.can_manage_audio());
drop policy if exists "pp_audio_delete" on storage.objects;
create policy "pp_audio_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'audio-guides' and public.can_manage_audio());

-- Enregistre (ou remplace) l'enregistrement d'une page dans une langue ; renvoie l'ancien fichier à supprimer
create or replace function public.audio_register_clip(p_target text, p_lang text, p_path text, p_mime text, p_size int,
                                                      p_duration int, p_speaker text, p_translator text, p_reviewer text)
returns text language plpgsql security definer set search_path = public as $$
declare old_path text;
begin
  if not public.can_manage_audio() then raise exception 'PP403: réservé à l''équipe PharmaProxi' using errcode = '42501'; end if;
  if not exists (select 1 from public.audio_targets where key = p_target) then raise exception 'PP404: page inconnue'; end if;
  if not exists (select 1 from public.audio_languages where code = p_lang and is_active) then raise exception 'PP404: langue inconnue'; end if;
  select storage_path into old_path from public.audio_clips where target_key = p_target and lang = p_lang;
  delete from public.audio_clips where target_key = p_target and lang = p_lang;
  insert into public.audio_clips (target_key, lang, storage_path, mime, size_bytes, duration_s, speaker, translator, reviewer, created_by)
  values (p_target, p_lang, p_path, p_mime, p_size, p_duration, nullif(btrim(coalesce(p_speaker, '')), ''),
          nullif(btrim(coalesce(p_translator, '')), ''), nullif(btrim(coalesce(p_reviewer, '')), ''), auth.uid());
  perform public.log_audit('audio.upload', 'audio_clip', p_target || '/' || p_lang);
  return old_path;
exception when check_violation then raise exception 'PP422: fichier audio refusé (format MP3, M4A, AAC, OGG, WEBM ou WAV ; 10 Mo maximum)';
end $$;

-- Publication : exige l'indication d'une relecture par un second locuteur
create or replace function public.audio_set_published(p_id uuid, p_publish boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c public.audio_clips;
begin
  if not public.can_manage_audio() then raise exception 'PP403: réservé à l''équipe PharmaProxi' using errcode = '42501'; end if;
  select * into c from public.audio_clips where id = p_id for update;
  if c.id is null then raise exception 'PP404: enregistrement introuvable'; end if;
  if p_publish and c.lang <> 'francais' and c.reviewer is null then
    raise exception 'PP422: indiquez qui a vérifié la traduction (un second locuteur) avant de publier';
  end if;
  update public.audio_clips set status = case when p_publish then 'published' else 'draft' end,
    published_at = case when p_publish then coalesce(published_at, now()) else published_at end where id = p_id;
  perform public.log_audit(case when p_publish then 'audio.publish' else 'audio.unpublish' end, 'audio_clip', p_id::text);
end $$;

create or replace function public.audio_delete_clip(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare path text;
begin
  if not public.can_manage_audio() then raise exception 'PP403: réservé à l''équipe PharmaProxi' using errcode = '42501'; end if;
  delete from public.audio_clips where id = p_id returning storage_path into path;
  if path is null then raise exception 'PP404: enregistrement introuvable'; end if;
  perform public.log_audit('audio.delete', 'audio_clip', p_id::text);
  return path;
end $$;

-- Ajouter une page à enregistrer (ex. une fiche santé publiée : clé « fiche:<slug> »)
create or replace function public.audio_save_target(p_key text, p_label text, p_path text, p_script text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_audio() then raise exception 'PP403: réservé à l''équipe PharmaProxi' using errcode = '42501'; end if;
  insert into public.audio_targets (key, label, page_path, script_fr, sort_order)
  values (lower(btrim(p_key)), btrim(p_label), btrim(p_path), btrim(p_script), 200)
  on conflict (key) do update set label = excluded.label, page_path = excluded.page_path, script_fr = excluded.script_fr;
exception when check_violation then raise exception 'PP422: vérifiez la clé, le titre, l''adresse (commençant par /) et le texte (20 à 3 000 caractères)';
end $$;

revoke execute on function public.audio_register_clip(text, text, text, text, int, int, text, text, text), public.audio_set_published(uuid, boolean),
  public.audio_delete_clip(uuid), public.audio_save_target(text, text, text, text) from public, anon;
grant execute on function public.audio_register_clip(text, text, text, text, int, int, text, text, text), public.audio_set_published(uuid, boolean),
  public.audio_delete_clip(uuid), public.audio_save_target(text, text, text, text), public.can_manage_audio() to authenticated;
