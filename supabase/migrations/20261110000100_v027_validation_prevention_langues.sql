-- =============================================================================
-- SantéProxi 0.27.0 — Fiabilité médicale, prévention, langues.
-- Migration additive : aucune donnée existante n'est modifiée ni supprimée.
--   1. Fiches santé : date de révision (« À actualiser »), statut « Archivé », langues en/ar.
--   2. Catégorie « Santé mentale ».
--   3. Calendrier de prévention (campagnes, dépistages, vaccination, journées mondiales), source obligatoire.
--   4. Langue préférée enregistrée dans le profil.
--   5. Langue Bomu ajoutée aux guides audio enregistrés.
-- Retour arrière : voir le bloc « ROLLBACK » en fin de fichier.
-- =============================================================================

-- 1. Circuit de validation : révision périodique et archivage ------------------------------------
alter table public.health_articles add column if not exists next_review_on date;
alter table public.health_articles add column if not exists archived_at timestamptz;
alter table public.health_articles drop constraint if exists health_articles_status_check;
alter table public.health_articles add constraint health_articles_status_check
  check (status in ('draft', 'in_review', 'changes_requested', 'rejected', 'validated', 'published', 'unpublished', 'archived'));
alter table public.health_articles drop constraint if exists health_articles_lang_check;
alter table public.health_articles add constraint health_articles_lang_check check (lang in ('fr', 'bm', 'en', 'ar'));

-- À chaque validation médicale, la prochaine révision est fixée à un an (modifiable par le validateur)
create or replace function public.health_default_review() returns trigger language plpgsql as $$
begin
  if new.validated_at is not null and (old.validated_at is distinct from new.validated_at) then
    new.next_review_on := coalesce(case when new.next_review_on > current_date then new.next_review_on end, (new.validated_at at time zone 'UTC')::date + 365);
  end if;
  return new;
end $$;
drop trigger if exists health_default_review on public.health_articles;
create trigger health_default_review before update on public.health_articles for each row execute function public.health_default_review();
update public.health_articles set next_review_on = (coalesce(reviewed_at, validated_at) at time zone 'UTC')::date + 365
  where next_review_on is null and validated_at is not null;

create or replace function public.health_set_review_date(p_id uuid, p_date date)
returns void language plpgsql security definer set search_path = public as $$
declare a public.health_articles;
begin
  if not public.health_role('validator') then raise exception 'PP403: réservé aux validateurs médicaux' using errcode = '42501'; end if;
  if p_date is null or p_date < current_date or p_date > current_date + 1100 then raise exception 'PP422: date de révision entre aujourd''hui et 3 ans'; end if;
  select * into a from public.health_articles where id = p_id;
  if a.id is null then raise exception 'PP404: fiche introuvable'; end if;
  update public.health_articles set next_review_on = p_date where id = p_id;
  perform public.health_log(p_id, 'date de révision fixée au ' || to_char(p_date, 'DD/MM/YYYY'), a.status, a.status);
end $$;
revoke execute on function public.health_set_review_date(uuid, date) from public, anon;
grant execute on function public.health_set_review_date(uuid, date) to authenticated;

-- Archivage : la fiche quitte le site public mais reste conservée avec tout son historique
create or replace function public.health_archive(p_id uuid, p_archive boolean)
returns void language plpgsql security definer set search_path = public as $$
declare a public.health_articles;
begin
  if not public.health_role('validator') then raise exception 'PP403: réservé aux validateurs et à l''administration' using errcode = '42501'; end if;
  select * into a from public.health_articles where id = p_id for update;
  if a.id is null then raise exception 'PP404: fiche introuvable'; end if;
  if p_archive then
    if a.status not in ('published', 'unpublished', 'validated', 'rejected') then raise exception 'PP409: seule une fiche validée, publiée, dépubliée ou rejetée peut être archivée'; end if;
    update public.health_articles set status = 'archived', archived_at = now() where id = p_id;
    perform public.health_log(p_id, 'archivage', a.status, 'archived');
  else
    if a.status <> 'archived' then raise exception 'PP409: cette fiche n''est pas archivée'; end if;
    update public.health_articles set status = 'draft', archived_at = null where id = p_id;
    perform public.health_log(p_id, 'sortie des archives (nouvelle validation nécessaire)', 'archived', 'draft');
  end if;
end $$;
revoke execute on function public.health_archive(uuid, boolean) from public, anon;
grant execute on function public.health_archive(uuid, boolean) to authenticated;

-- Fiches publiées dont la date de révision est dépassée (« À actualiser »)
create or replace function public.health_due_reviews()
returns table (id uuid, title text, slug text, next_review_on date, validator_name text)
language sql stable security definer set search_path = public as $$
  select a.id, a.title, a.slug, a.next_review_on, a.validator_name from public.health_articles a
  where public.is_health_staff() and a.status = 'published' and a.next_review_on is not null and a.next_review_on <= current_date + 30
  order by a.next_review_on;
$$;
revoke execute on function public.health_due_reviews() from public, anon;
grant execute on function public.health_due_reviews() to authenticated;

-- 2. Catégorie Santé mentale --------------------------------------------------------------------
insert into public.health_categories (slug, name, description, icon, sort_order)
values ('sante-mentale', 'Santé mentale', 'Stress, anxiété, dépression, deuil, addictions : comprendre et savoir où trouver de l''aide.', 'brain', 115)
on conflict (slug) do nothing;

-- 3. Calendrier de prévention -------------------------------------------------------------------
create table if not exists public.prevention_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('campagne', 'depistage', 'vaccination', 'sensibilisation', 'journee_mondiale')),
  title text not null check (char_length(btrim(title)) between 5 and 160),
  description text not null default '' check (char_length(description) <= 1500),
  starts_on date not null,
  ends_on date,
  region_id uuid references public.regions(id) on delete set null,
  place text check (char_length(coalesce(place, '')) <= 200),
  organizer text not null check (char_length(btrim(organizer)) between 2 and 160),
  source_name text not null check (char_length(btrim(source_name)) between 2 and 200),
  source_url text check (source_url is null or source_url ~ '^https://'),
  public_concerned text check (char_length(coalesce(public_concerned, '')) <= 200),
  is_free boolean,
  status text not null default 'brouillon' check (status in ('brouillon', 'publie', 'annule')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index if not exists prevention_events_dates on public.prevention_events (status, starts_on);
alter table public.prevention_events enable row level security;
drop policy if exists "pp_prevention_read" on public.prevention_events;
create policy "pp_prevention_read" on public.prevention_events for select to anon, authenticated using (status in ('publie', 'annule') or public.is_admin());
revoke all on public.prevention_events from anon, authenticated;
grant select on public.prevention_events to anon, authenticated;

create or replace function public.save_prevention_event(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p ->> 'id', '')::uuid; st text := coalesce(nullif(p ->> 'status', ''), 'brouillon');
begin
  perform public.require_admin();
  if st not in ('brouillon', 'publie', 'annule') then raise exception 'PP422: statut invalide'; end if;
  if st = 'publie' and nullif(btrim(coalesce(p ->> 'source_name', '')), '') is null then raise exception 'PP422: la source officielle est obligatoire pour publier'; end if;
  if v_id is null then
    insert into public.prevention_events (kind, title, description, starts_on, ends_on, region_id, place, organizer, source_name, source_url, public_concerned, is_free, status, created_by)
    values (p ->> 'kind', btrim(p ->> 'title'), coalesce(p ->> 'description', ''), (p ->> 'starts_on')::date, nullif(p ->> 'ends_on', '')::date,
      nullif(p ->> 'region_id', '')::uuid, nullif(btrim(coalesce(p ->> 'place', '')), ''), btrim(p ->> 'organizer'), btrim(p ->> 'source_name'),
      nullif(btrim(coalesce(p ->> 'source_url', '')), ''), nullif(btrim(coalesce(p ->> 'public_concerned', '')), ''), nullif(p ->> 'is_free', '')::boolean, st, auth.uid())
    returning id into v_id;
  else
    update public.prevention_events set kind = p ->> 'kind', title = btrim(p ->> 'title'), description = coalesce(p ->> 'description', ''),
      starts_on = (p ->> 'starts_on')::date, ends_on = nullif(p ->> 'ends_on', '')::date, region_id = nullif(p ->> 'region_id', '')::uuid,
      place = nullif(btrim(coalesce(p ->> 'place', '')), ''), organizer = btrim(p ->> 'organizer'), source_name = btrim(p ->> 'source_name'),
      source_url = nullif(btrim(coalesce(p ->> 'source_url', '')), ''), public_concerned = nullif(btrim(coalesce(p ->> 'public_concerned', '')), ''),
      is_free = nullif(p ->> 'is_free', '')::boolean, status = st, updated_at = now()
    where id = v_id;
    if not found then raise exception 'PP404: événement introuvable'; end if;
  end if;
  perform public.log_audit('prevention.save', 'prevention_event', v_id::text, jsonb_build_object('status', st));
  return v_id;
end $$;
revoke execute on function public.save_prevention_event(jsonb) from public, anon;
grant execute on function public.save_prevention_event(jsonb) to authenticated;

-- 4. Langue préférée de l'utilisateur ------------------------------------------------------------
alter table public.profiles add column if not exists preferred_lang text;
alter table public.profiles drop constraint if exists profiles_preferred_lang_check;
alter table public.profiles add constraint profiles_preferred_lang_check check (preferred_lang is null or preferred_lang in ('fr', 'en', 'ar', 'bm', 'snk', 'ff', 'son'));
create or replace function public.set_preferred_lang(p_lang text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if p_lang is not null and p_lang not in ('fr', 'en', 'ar', 'bm', 'snk', 'ff', 'son') then raise exception 'PP422: langue invalide'; end if;
  update public.profiles set preferred_lang = p_lang where id = auth.uid();
end $$;
revoke execute on function public.set_preferred_lang(text) from public, anon;
grant execute on function public.set_preferred_lang(text) to authenticated;

-- 5. Langue Bomu pour les guides audio enregistrés par des locuteurs -------------------------------
insert into public.audio_languages (code, name, native_name, sort_order) values ('bomu', 'Bomu', null, 14) on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- ROLLBACK (manuel, dans cet ordre) :
--   drop table if exists public.prevention_events cascade;
--   drop function if exists public.save_prevention_event(jsonb), public.health_archive(uuid, boolean), public.health_set_review_date(uuid, date), public.health_due_reviews(), public.set_preferred_lang(text);
--   drop trigger if exists health_default_review on public.health_articles;
--   (les colonnes ajoutées peuvent rester : elles sont facultatives ; ne pas retirer le statut « archived » si des fiches l'utilisent)
-- ---------------------------------------------------------------------------
