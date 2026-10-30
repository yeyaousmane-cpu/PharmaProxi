-- ============================================================================
-- PharmaProxi — Migration : module « Santé essentielle »
-- Bibliothèque de fiches d'information santé avec circuit de validation médicale.
--   * Catégories (arborescence à un niveau), fiches structurées, sources, historique
--   * Rôles : administrateur (existant), rédacteur, validateur médical (table health_staff)
--   * Seules les fiches publiées (validées puis publiées) sont visibles du public
--   * Aucune donnée médicale personnelle n'est stockée par ce module
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Rôles éditoriaux
-- ---------------------------------------------------------------------------
create table if not exists public.health_staff (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('editor', 'validator')),
  display_name text not null check (char_length(btrim(display_name)) between 3 and 120),  -- ex. « Dr A. Traoré, hématologue »
  credentials text check (char_length(coalesce(credentials, '')) <= 200),                  -- ex. n° d'inscription à l'Ordre
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);
alter table public.health_staff enable row level security;
drop policy if exists "pp_health_staff_read" on public.health_staff;
create policy "pp_health_staff_read" on public.health_staff for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke insert, update, delete on public.health_staff from anon, authenticated;
grant select on public.health_staff to authenticated;

create or replace function public.health_role(p_role text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.health_staff s where s.user_id = auth.uid() and s.role = p_role)
$$;
create or replace function public.is_health_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.health_staff s where s.user_id = auth.uid())
$$;

-- ---------------------------------------------------------------------------
-- Catégories
-- ---------------------------------------------------------------------------
create table if not exists public.health_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name text not null check (char_length(name) between 2 and 120),
  description text check (char_length(coalesce(description, '')) <= 400),
  icon text not null default 'heart-pulse' check (icon ~ '^[a-z0-9-]{2,40}$'),
  sort_order int not null default 100,
  is_active boolean not null default true,
  is_priority boolean not null default false
);
alter table public.health_categories enable row level security;
drop policy if exists "pp_health_categories_read" on public.health_categories;
create policy "pp_health_categories_read" on public.health_categories for select to anon, authenticated using (is_active or public.is_health_staff());
revoke insert, update, delete on public.health_categories from anon, authenticated;
grant select on public.health_categories to anon, authenticated;

insert into public.health_categories (slug, name, description, icon, sort_order, is_priority) values
  ('mariage', 'Avant le mariage', 'Examens à connaître, groupes sanguins, drépanocytose, infections, fertilité : comprendre pour décider ensemble.', 'heart-handshake', 1, true),
  ('sante-reproductive', 'Santé reproductive et sexuelle', 'Contraception, cycle menstruel, fertilité, infections sexuellement transmissibles, préparation à une grossesse.', 'venus-and-mars', 10, false),
  ('grossesse-enfant', 'Grossesse et santé de l''enfant', 'Suivi prénatal, signes d''alerte, accouchement, allaitement, vaccination et santé du nouveau-né.', 'baby', 20, false),
  ('maladies-hereditaires', 'Maladies héréditaires', 'Drépanocytose, thalassémie, autres maladies génétiques, transmission et conseil génétique.', 'dna', 30, false),
  ('maladies-infectieuses', 'Maladies infectieuses', 'Paludisme, tuberculose, VIH, hépatites, infections sexuellement transmissibles, vaccination.', 'bug', 40, false),
  ('maladies-chroniques', 'Maladies chroniques', 'Diabète, hypertension, maladies cardiovasculaires et rénales, anémie, santé respiratoire.', 'activity', 50, false),
  ('medicaments', 'Médicaments et bon usage', 'Automédication, antibiotiques, allergies, interactions, grossesse, conservation, médicaments contrefaits.', 'pill', 60, false),
  ('urgences', 'Urgences et premiers secours', 'Reconnaître un AVC, un infarctus, une convulsion, une hémorragie, une brûlure ou une intoxication.', 'siren', 70, false),
  ('vie-saine', 'Nutrition, hygiène et santé mentale', 'Alimentation, hydratation, eau potable, sommeil, stress, prévention des addictions.', 'apple', 80, false),
  ('depistage-prevention', 'Dépistage et prévention', 'Dépistages selon l''âge et les risques, prévention cardiovasculaire, santé bucco-dentaire, vaccins.', 'shield-check', 90, false)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Fiches
-- ---------------------------------------------------------------------------
create table if not exists public.health_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,90}$'),
  category_id uuid not null references public.health_categories(id) on delete restrict,
  kind text not null default 'fiche' check (kind in ('fiche', 'faq', 'idee_recue', 'prevention', 'actualite')),
  lang text not null default 'fr' check (lang in ('fr', 'bm')),           -- bambara prévu
  translation_of uuid references public.health_articles(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 3 and 160),
  summary text not null default '' check (char_length(summary) <= 600),
  keywords text check (char_length(coalesce(keywords, '')) <= 400),          -- synonymes et fautes courantes, pour la recherche
  audiences text[] not null default '{}' check (audiences <@ array['tous', 'enfant', 'adolescent', 'adulte', 'senior', 'femme_enceinte', 'couple']::text[]),
  recommendation text check (recommendation in ('recommande', 'selon_risque', 'sur_indication')),
  -- Corps structuré (modèle standard) : clés autorisées ci-dessous, texte simple
  body jsonb not null default '{}'::jsonb,
  myths jsonb not null default '[]'::jsonb,      -- [{ "idee": "...", "verite": "..." }]
  faq jsonb not null default '[]'::jsonb,        -- [{ "q": "...", "r": "..." }]
  exam_codes text[] not null default '{}',       -- liens vers medical_exams.code (« où faire l'examen »)
  specialty_codes text[] not null default '{}',  -- liens vers medical_specialties.code (« quel professionnel »)
  is_featured boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'changes_requested', 'rejected', 'validated', 'published', 'unpublished')),
  author_id uuid references public.profiles(id) on delete set null,
  author_name text,
  validator_id uuid references public.profiles(id) on delete set null,
  validator_name text,                           -- tel qu'enregistré dans health_staff au moment de la validation
  validator_credentials text,
  validated_at timestamptz,
  published_at timestamptz,
  reviewed_at timestamptz,                       -- dernière révision validée
  review_note text check (char_length(coalesce(review_note, '')) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_text text generated always as (public.normalize_text(title || ' ' || summary || ' ' || coalesce(keywords, ''))) stored,
  check (jsonb_typeof(body) = 'object' and jsonb_typeof(myths) = 'array' and jsonb_typeof(faq) = 'array')
);
create index if not exists health_articles_status on public.health_articles (status, category_id);
create index if not exists health_articles_search on public.health_articles using gin (search_text extensions.gin_trgm_ops);
drop trigger if exists health_articles_touch on public.health_articles;
create trigger health_articles_touch before update on public.health_articles for each row execute function public.touch_updated_at();
alter table public.health_articles enable row level security;
drop policy if exists "pp_health_articles_read" on public.health_articles;
create policy "pp_health_articles_read" on public.health_articles for select to anon, authenticated
  using (status = 'published' or public.is_health_staff());
revoke insert, update, delete on public.health_articles from anon, authenticated;
grant select on public.health_articles to anon, authenticated;

create table if not exists public.health_sources (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.health_articles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 300),
  organization text not null check (char_length(btrim(organization)) between 2 and 200),
  url text check (url is null or url ~ '^https?://'),
  published_on text check (char_length(coalesce(published_on, '')) <= 40),   -- « 2024 », « mars 2023 »… ou vide si inconnue
  accessed_on date not null,
  sort_order int not null default 0
);
create index if not exists health_sources_article on public.health_sources (article_id);
alter table public.health_sources enable row level security;
drop policy if exists "pp_health_sources_read" on public.health_sources;
create policy "pp_health_sources_read" on public.health_sources for select to anon, authenticated using (
  exists (select 1 from public.health_articles a where a.id = article_id and (a.status = 'published' or public.is_health_staff())));
revoke insert, update, delete on public.health_sources from anon, authenticated;
grant select on public.health_sources to anon, authenticated;

create table if not exists public.health_article_history (
  id bigint generated always as identity primary key,
  article_id uuid not null references public.health_articles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  action text not null,
  from_status text,
  to_status text,
  note text,
  snapshot jsonb,
  at timestamptz not null default now()
);
create index if not exists health_history_article on public.health_article_history (article_id, at desc);
alter table public.health_article_history enable row level security;
drop policy if exists "pp_health_history_read" on public.health_article_history;
create policy "pp_health_history_read" on public.health_article_history for select to authenticated using (public.is_health_staff());
revoke insert, update, delete on public.health_article_history from anon, authenticated;
grant select on public.health_article_history to authenticated;

-- Signalements d'information obsolète ou erronée (public, sans compte)
create table if not exists public.health_reports (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.health_articles(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 10 and 1000),
  reporter_id uuid references public.profiles(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);
alter table public.health_reports enable row level security;
drop policy if exists "pp_health_reports_read" on public.health_reports;
create policy "pp_health_reports_read" on public.health_reports for select to authenticated using (public.is_health_staff());
revoke insert, update, delete on public.health_reports from anon, authenticated;
grant select on public.health_reports to authenticated;

-- ---------------------------------------------------------------------------
-- Outils internes
-- ---------------------------------------------------------------------------
create or replace function public.health_actor_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select s.display_name from public.health_staff s where s.user_id = auth.uid() order by s.role desc limit 1),
                  (select p.full_name from public.profiles p where p.id = auth.uid()), 'Administration')
$$;

create or replace function public.health_log(p_article uuid, p_action text, p_from text, p_to text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.health_article_history (article_id, actor_id, actor_name, action, from_status, to_status, note, snapshot)
  select p_article, auth.uid(), public.health_actor_name(), p_action, p_from, p_to, p_note,
         jsonb_build_object('title', a.title, 'summary', a.summary, 'body', a.body, 'myths', a.myths, 'faq', a.faq,
                            'sources', (select coalesce(jsonb_agg(to_jsonb(s) - 'article_id' order by s.sort_order), '[]'::jsonb) from public.health_sources s where s.article_id = a.id))
  from public.health_articles a where a.id = p_article;
end $$;

-- Clés autorisées du corps d'une fiche (modèle standard)
create or replace function public.health_clean_body(p jsonb)
returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(k, to_jsonb(left(btrim(v), 6000))), '{}'::jsonb)
  from jsonb_each_text(coalesce(p, '{}'::jsonb)) as t(k, v)
  where k in ('definition', 'importance', 'situations', 'prevention', 'examens', 'deroulement', 'preparation',
              'resultats', 'quand_consulter', 'urgence', 'ou_au_mali')
    and nullif(btrim(v), '') is not null
$$;

-- ---------------------------------------------------------------------------
-- Enregistrement d'une fiche (rédacteur, validateur ou administrateur)
-- p : { id?, slug, category_slug, kind, title, summary, keywords, audiences[], recommendation,
--       body{}, myths[], faq[], exam_codes[], specialty_codes[], is_featured,
--       sources: [{ title, organization, url, published_on, accessed_on }] }
-- Modifier une fiche publiée ou validée la repasse en brouillon (elle disparaît du public
-- jusqu'à sa nouvelle validation) : un contenu modifié n'est jamais affiché comme validé.
-- ---------------------------------------------------------------------------
create or replace function public.health_save_article(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  aid uuid := nullif(p ->> 'id', '')::uuid; a public.health_articles; cat uuid; new_status text; s jsonb; i int := 0;
begin
  if not (public.health_role('editor') or public.health_role('validator')) then
    raise exception 'PP403: réservé aux rédacteurs et validateurs de la bibliothèque santé' using errcode = '42501';
  end if;
  select id into cat from public.health_categories where slug = p ->> 'category_slug';
  if cat is null then raise exception 'PP422: catégorie inconnue'; end if;
  if aid is not null then
    select * into a from public.health_articles where id = aid for update;
    if a.id is null then raise exception 'PP404: fiche introuvable'; end if;
    if a.status = 'in_review' then raise exception 'PP409: fiche en cours de validation : attendez la décision du validateur'; end if;
    new_status := case when a.status in ('published', 'validated', 'unpublished', 'rejected', 'changes_requested') then 'draft' else a.status end;
    update public.health_articles set
      slug = coalesce(nullif(btrim(p ->> 'slug'), ''), slug), category_id = cat,
      kind = coalesce(nullif(p ->> 'kind', ''), kind), title = btrim(p ->> 'title'), summary = btrim(coalesce(p ->> 'summary', '')),
      keywords = nullif(btrim(coalesce(p ->> 'keywords', '')), ''),
      audiences = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p -> 'audiences', '[]')) x), '{}'),
      recommendation = nullif(p ->> 'recommendation', ''),
      body = public.health_clean_body(p -> 'body'), myths = coalesce(p -> 'myths', '[]'), faq = coalesce(p -> 'faq', '[]'),
      exam_codes = coalesce((select array_agg(lower(btrim(x))) from jsonb_array_elements_text(coalesce(p -> 'exam_codes', '[]')) x where btrim(x) <> ''), '{}'),
      specialty_codes = coalesce((select array_agg(lower(btrim(x))) from jsonb_array_elements_text(coalesce(p -> 'specialty_codes', '[]')) x where btrim(x) <> ''), '{}'),
      is_featured = coalesce((p ->> 'is_featured')::boolean, false),
      status = new_status,
      validated_at = case when new_status = 'draft' then null else validated_at end,
      validator_id = case when new_status = 'draft' then null else validator_id end,
      validator_name = case when new_status = 'draft' then null else validator_name end,
      validator_credentials = case when new_status = 'draft' then null else validator_credentials end
    where id = aid;
    perform public.health_log(aid, 'modification', a.status, new_status,
      case when a.status = 'published' then 'Fiche publiée modifiée : retirée du public jusqu''à sa nouvelle validation' end);
  else
    insert into public.health_articles (slug, category_id, kind, title, summary, keywords, audiences, recommendation, body, myths, faq,
                                        exam_codes, specialty_codes, is_featured, author_id, author_name)
    values (btrim(p ->> 'slug'), cat, coalesce(nullif(p ->> 'kind', ''), 'fiche'), btrim(p ->> 'title'), btrim(coalesce(p ->> 'summary', '')),
            nullif(btrim(coalesce(p ->> 'keywords', '')), ''),
            coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p -> 'audiences', '[]')) x), '{}'),
            nullif(p ->> 'recommendation', ''), public.health_clean_body(p -> 'body'), coalesce(p -> 'myths', '[]'), coalesce(p -> 'faq', '[]'),
            coalesce((select array_agg(lower(btrim(x))) from jsonb_array_elements_text(coalesce(p -> 'exam_codes', '[]')) x where btrim(x) <> ''), '{}'),
            coalesce((select array_agg(lower(btrim(x))) from jsonb_array_elements_text(coalesce(p -> 'specialty_codes', '[]')) x where btrim(x) <> ''), '{}'),
            coalesce((p ->> 'is_featured')::boolean, false), auth.uid(), public.health_actor_name())
    returning id into aid;
    perform public.health_log(aid, 'création', null, 'draft');
  end if;
  if p ? 'sources' then
    delete from public.health_sources where article_id = aid;
    for s in select * from jsonb_array_elements(coalesce(p -> 'sources', '[]')) loop
      insert into public.health_sources (article_id, title, organization, url, published_on, accessed_on, sort_order)
      values (aid, btrim(s ->> 'title'), btrim(s ->> 'organization'), nullif(btrim(coalesce(s ->> 'url', '')), ''),
              nullif(btrim(coalesce(s ->> 'published_on', '')), ''), coalesce(nullif(s ->> 'accessed_on', '')::date, current_date), i);
      i := i + 1;
    end loop;
  end if;
  return aid;
exception
  when unique_violation then raise exception 'PP409: une fiche utilise déjà cet identifiant d''adresse (slug)';
  when check_violation then raise exception 'PP422: vérifiez les champs : titre (3 à 160 caractères), résumé (600 max), identifiant (minuscules, chiffres, tirets), sources (titre, organisme, lien en http)';
  when invalid_datetime_format then raise exception 'PP422: date de consultation d''une source invalide (AAAA-MM-JJ)';
end $$;

-- Soumission à la validation : résumé, au moins une source et corps non vide exigés
create or replace function public.health_submit(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a public.health_articles;
begin
  if not (public.health_role('editor') or public.health_role('validator')) then raise exception 'PP403: action non autorisée' using errcode = '42501'; end if;
  select * into a from public.health_articles where id = p_id for update;
  if a.id is null then raise exception 'PP404: fiche introuvable'; end if;
  if a.status not in ('draft', 'changes_requested') then raise exception 'PP409: seule une fiche en brouillon peut être soumise'; end if;
  if char_length(btrim(a.summary)) < 20 then raise exception 'PP422: ajoutez un résumé en langage simple (20 caractères minimum)'; end if;
  if not exists (select 1 from public.health_sources where article_id = p_id) then raise exception 'PP422: ajoutez au moins une source médicale'; end if;
  if a.body = '{}'::jsonb and jsonb_array_length(a.faq) = 0 and jsonb_array_length(a.myths) = 0 then raise exception 'PP422: la fiche est vide'; end if;
  update public.health_articles set status = 'in_review' where id = p_id;
  perform public.health_log(p_id, 'soumission', a.status, 'in_review');
end $$;

-- Décision du validateur médical : approuver, demander une correction, rejeter.
-- Un validateur ne peut pas valider une fiche dont il est l'auteur.
create or replace function public.health_review(p_id uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.health_articles; st public.health_staff; new_status text;
begin
  select * into st from public.health_staff where user_id = auth.uid() and role = 'validator';
  if st.user_id is null then raise exception 'PP403: réservé aux validateurs médicaux enregistrés' using errcode = '42501'; end if;
  select * into a from public.health_articles where id = p_id for update;
  if a.id is null then raise exception 'PP404: fiche introuvable'; end if;
  if a.status <> 'in_review' then raise exception 'PP409: cette fiche n''est pas en attente de validation'; end if;
  if a.author_id = auth.uid() then raise exception 'PP409: vous ne pouvez pas valider une fiche que vous avez rédigée'; end if;
  new_status := case p_decision when 'approve' then 'validated' when 'changes' then 'changes_requested' when 'reject' then 'rejected' end;
  if new_status is null then raise exception 'PP422: décision invalide'; end if;
  if p_decision <> 'approve' and char_length(btrim(coalesce(p_note, ''))) < 5 then raise exception 'PP422: expliquez au rédacteur ce qui doit changer'; end if;
  update public.health_articles set status = new_status, review_note = nullif(btrim(coalesce(p_note, '')), ''),
    validator_id = case when p_decision = 'approve' then auth.uid() end,
    validator_name = case when p_decision = 'approve' then st.display_name end,
    validator_credentials = case when p_decision = 'approve' then st.credentials end,
    validated_at = case when p_decision = 'approve' then now() end,
    reviewed_at = case when p_decision = 'approve' then now() else reviewed_at end
  where id = p_id;
  perform public.health_log(p_id, case p_decision when 'approve' then 'validation médicale' when 'changes' then 'correction demandée' else 'rejet' end, 'in_review', new_status, p_note);
  if a.author_id is not null and a.author_id <> auth.uid() then
    perform public.notify_user(a.author_id, 'health', case p_decision when 'approve' then 'Fiche validée' when 'changes' then 'Correction demandée' else 'Fiche rejetée' end,
      format('« %s »%s', a.title, coalesce(' : ' || btrim(p_note), '')), null, format('/redaction-sante/%s', a.id));
  end if;
end $$;

-- Publication / dépublication (administrateur ou validateur) : seulement une fiche validée
create or replace function public.health_publish(p_id uuid, p_publish boolean)
returns void language plpgsql security definer set search_path = public as $$
declare a public.health_articles;
begin
  if not public.health_role('validator') then raise exception 'PP403: réservé aux validateurs et à l''administration' using errcode = '42501'; end if;
  select * into a from public.health_articles where id = p_id for update;
  if a.id is null then raise exception 'PP404: fiche introuvable'; end if;
  if p_publish then
    if a.status not in ('validated', 'unpublished') or a.validated_at is null then
      raise exception 'PP409: seule une fiche validée par un validateur médical peut être publiée';
    end if;
    update public.health_articles set status = 'published', published_at = coalesce(published_at, now()) where id = p_id;
    perform public.health_log(p_id, 'publication', a.status, 'published');
  else
    if a.status <> 'published' then raise exception 'PP409: cette fiche n''est pas publiée'; end if;
    update public.health_articles set status = 'unpublished' where id = p_id;
    perform public.health_log(p_id, 'dépublication', 'published', 'unpublished');
  end if;
end $$;

-- Suppression d'un brouillon jamais publié (administrateur)
create or replace function public.health_delete_article(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  delete from public.health_articles where id = p_id and published_at is null;
  if not found then raise exception 'PP409: une fiche déjà publiée ne se supprime pas : dépubliez-la'; end if;
end $$;

-- Gestion des rédacteurs et validateurs (administrateur)
create or replace function public.health_set_staff(p_email text, p_role text, p_display_name text, p_credentials text, p_grant boolean)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin(); target uuid;
begin
  select id into target from auth.users where lower(email) = lower(btrim(p_email));
  if target is null then raise exception 'PP404: aucun compte avec cette adresse (la personne doit d''abord s''inscrire)'; end if;
  if p_role not in ('editor', 'validator') then raise exception 'PP422: rôle invalide'; end if;
  if p_grant then
    insert into public.health_staff (user_id, role, display_name, credentials, granted_by)
    values (target, p_role, btrim(p_display_name), nullif(btrim(coalesce(p_credentials, '')), ''), uid)
    on conflict (user_id, role) do update set display_name = excluded.display_name, credentials = excluded.credentials;
  else
    delete from public.health_staff where user_id = target and role = p_role;
  end if;
  perform public.log_audit(case when p_grant then 'health.staff.grant' else 'health.staff.revoke' end, 'profile', target::text, jsonb_build_object('role', p_role));
exception when check_violation then raise exception 'PP422: indiquez le nom affiché (3 à 120 caractères)';
end $$;

-- Signalement public d'une information obsolète
create or replace function public.health_report(p_article uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.health_articles where id = p_article and status = 'published') then raise exception 'PP404: fiche introuvable'; end if;
  if (select count(*) from public.health_reports where article_id = p_article and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'PP429: trop de signalements, réessayez plus tard';
  end if;
  insert into public.health_reports (article_id, reason, reporter_id) values (p_article, btrim(p_reason), auth.uid());
exception when check_violation then raise exception 'PP422: décrivez le problème en 10 caractères au moins';
end $$;

create or replace function public.health_close_report(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_health_staff() then raise exception 'PP403: action non autorisée' using errcode = '42501'; end if;
  update public.health_reports set status = 'closed' where id = p_id;
end $$;

-- ---------------------------------------------------------------------------
-- Lecture publique
-- ---------------------------------------------------------------------------
-- Recherche dans les fiches publiées (synonymes via « keywords », fautes via trigrammes)
create or replace function public.health_search(p_query text default null, p_category text default null, p_audience text default null,
                                                p_kind text default null, p_limit int default 20, p_offset int default 0)
returns table (id uuid, slug text, title text, summary text, kind text, category_slug text, category_name text,
               recommendation text, reviewed_at timestamptz, validator_name text, score real, total_count bigint)
language sql stable security definer set search_path = public, extensions as $$
  with q as (select nullif(public.normalize_text(left(coalesce(p_query, ''), 80)), '') as t)
  select a.id, a.slug, a.title, a.summary, a.kind, c.slug, c.name, a.recommendation, coalesce(a.reviewed_at, a.validated_at), a.validator_name,
         case when q.t is null then 0 else greatest(extensions.word_similarity(q.t, a.search_text), case when a.search_text like '%' || q.t || '%' then 1 else 0 end)::real end as score,
         count(*) over ()
  from public.health_articles a join public.health_categories c on c.id = a.category_id cross join q
  where a.status = 'published' and a.lang = 'fr'
    and (p_category is null or c.slug = p_category)
    and (p_audience is null or p_audience = any(a.audiences) or 'tous' = any(a.audiences))
    and (p_kind is null or a.kind = p_kind)
    and (q.t is null or a.search_text like '%' || q.t || '%' or extensions.word_similarity(q.t, a.search_text) > 0.45)
  order by score desc, a.is_featured desc, coalesce(a.reviewed_at, a.published_at) desc nulls last, a.title
  limit least(greatest(coalesce(p_limit, 20), 1), 50) offset greatest(coalesce(p_offset, 0), 0)
$$;

-- Sujets en préparation d'une catégorie (titres uniquement, sans contenu) : transparence pour le public
create or replace function public.health_upcoming(p_category text)
returns table (title text, status text)
language sql stable security definer set search_path = public as $$
  select a.title, case when a.status in ('in_review', 'validated') then 'en validation' else 'en rédaction' end
  from public.health_articles a join public.health_categories c on c.id = a.category_id
  where c.slug = p_category and a.status in ('draft', 'in_review', 'changes_requested', 'validated') and a.lang = 'fr'
  order by a.title
  limit 40
$$;

-- Nombre de fiches publiées par catégorie
create or replace function public.health_category_counts()
returns table (category_id uuid, published bigint, upcoming bigint)
language sql stable security definer set search_path = public as $$
  select c.id, count(a.id) filter (where a.status = 'published'), count(a.id) filter (where a.status in ('draft', 'in_review', 'changes_requested', 'validated'))
  from public.health_categories c left join public.health_articles a on a.category_id = c.id and a.lang = 'fr'
  group by c.id
$$;

-- ---------------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------------
revoke execute on function public.health_log(uuid, text, text, text, text), public.health_actor_name() from public, anon, authenticated;
revoke execute on function public.health_save_article(jsonb), public.health_submit(uuid), public.health_review(uuid, text, text),
  public.health_publish(uuid, boolean), public.health_delete_article(uuid), public.health_set_staff(text, text, text, text, boolean),
  public.health_close_report(uuid) from public, anon;
grant execute on function public.health_save_article(jsonb), public.health_submit(uuid), public.health_review(uuid, text, text),
  public.health_publish(uuid, boolean), public.health_delete_article(uuid), public.health_set_staff(text, text, text, text, boolean),
  public.health_close_report(uuid) to authenticated;
grant execute on function public.health_report(uuid, text), public.health_search(text, text, text, text, int, int),
  public.health_upcoming(text), public.health_category_counts(), public.health_role(text), public.is_health_staff(),
  public.health_clean_body(jsonb) to anon, authenticated;

-- Examen ajouté au catalogue (utilisé par les fiches « Avant le mariage »)
insert into public.medical_exams (code, name, category, synonyms, description, sort_order) values
  ('syphilis', 'Sérologie de la syphilis (TPHA / VDRL / test rapide)', 'biologie', 'syphilis tpha vdrl rpr treponeme', 'Recherche d''une infection par la bactérie de la syphilis.', 32)
on conflict (code) do nothing;
