-- =============================================================================
-- SantéProxi 0.38 — Imagerie médicale dans le dossier santé
-- * Examens d'imagerie (fichiers DICOM, images, comptes rendus PDF) rangés dans le dossier, chiffrés sur le serveur,
--   visibles par le seul titulaire (mêmes protections que les autres documents du dossier : verrou par code).
-- * Partage temporaire avec consentement : le patient choisit un médecin vérifié (code public), un examen, une durée
--   (1 à 30 jours) ; l'accès est révocable à tout moment, chaque consultation est journalisée et notifiée au patient.
-- * Aucun lien anonyme : seul le médecin désigné, connecté, peut ouvrir l'examen.
-- Migration additive. Retour arrière : drop table imaging_grants ; colonnes ajoutées sans effet sur l'existant.
-- =============================================================================

alter table public.record_documents drop constraint if exists record_documents_doc_kind_check;
alter table public.record_documents add constraint record_documents_doc_kind_check
  check (doc_kind in ('ordonnance', 'resultat', 'compte_rendu', 'certificat', 'vaccination', 'imagerie', 'autre'));
alter table public.record_documents drop constraint if exists record_documents_mime_check;
alter table public.record_documents add constraint record_documents_mime_check
  check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/dicom'));
alter table public.record_documents add column if not exists modality text
  check (modality is null or modality in ('radiographie', 'echographie', 'scanner', 'irm', 'mammographie', 'panoramique_dentaire', 'doppler', 'osteodensitometrie', 'autre'));
alter table public.record_documents add column if not exists body_part text check (char_length(coalesce(body_part, '')) <= 80);
alter table public.record_documents add column if not exists facility_name text check (char_length(coalesce(facility_name, '')) <= 160);
alter table public.record_documents add column if not exists study_group text check (char_length(coalesce(study_group, '')) <= 60);

create table if not exists public.imaging_grants (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('IMG-' || upper(substr(md5(gen_random_uuid()::text), 1, 8))),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  document_id uuid not null references public.record_documents(id) on delete cascade,
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  grantee_user_id uuid not null references public.profiles(id) on delete cascade,
  purpose text check (char_length(coalesce(purpose, '')) <= 200),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  views int not null default 0,
  last_viewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists imaging_grants_grantee on public.imaging_grants (grantee_user_id, expires_at);
create index if not exists imaging_grants_owner on public.imaging_grants (owner_id, created_at desc);
alter table public.imaging_grants enable row level security;
drop policy if exists "pp_imaging_grants_read" on public.imaging_grants;
create policy "pp_imaging_grants_read" on public.imaging_grants for select to authenticated
  using ((owner_id = auth.uid() and public.record_unlocked()) or (grantee_user_id = auth.uid() and revoked_at is null and expires_at > now()));
revoke all on public.imaging_grants from anon, authenticated;
grant select on public.imaging_grants to authenticated;

-- Le médecin désigné lit le fichier chiffré de l'examen partagé, tant que le partage est actif
-- (fonction security definer : le médecin n'a aucun droit de lecture sur record_documents)
create or replace function public.imaging_can_read(p_path text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.imaging_grants g join public.record_documents d on d.id = g.document_id
    where d.storage_path = p_path and g.grantee_user_id = auth.uid() and g.revoked_at is null and g.expires_at > now());
$$;
revoke execute on function public.imaging_can_read(text) from public, anon;
grant execute on function public.imaging_can_read(text) to authenticated;
drop policy if exists "pp_personal_docs_select_grant" on storage.objects;
create policy "pp_personal_docs_select_grant" on storage.objects for select to authenticated
  using (bucket_id = 'personal-documents' and public.imaging_can_read(name));

create or replace function public.imaging_grant(p_document uuid, p_doctor_code text, p_days int, p_purpose text default null) returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); d public.record_documents; doc public.doctors; ref text;
begin
  if not public.record_unlocked(uid) then raise exception 'PP423: ouvrez d''abord votre dossier avec votre code'; end if;
  select * into d from public.record_documents where id = p_document and user_id = uid;
  if d.id is null then raise exception 'PP404: examen introuvable'; end if;
  if d.doc_kind not in ('imagerie', 'compte_rendu', 'resultat') then raise exception 'PP422: seuls les examens d''imagerie, comptes rendus et résultats se partagent ici'; end if;
  select * into doc from public.doctors where upper(public_code) = upper(btrim(p_doctor_code)) and status = 'verified' and user_id is not null;
  if doc.id is null then raise exception 'PP404: aucun médecin vérifié avec ce code (le médecin le trouve dans son espace professionnel)'; end if;
  if doc.user_id = uid then raise exception 'PP422: choisissez un autre médecin que vous-même'; end if;
  if p_days not between 1 and 30 then raise exception 'PP422: durée de 1 à 30 jours'; end if;
  insert into public.imaging_grants (owner_id, document_id, doctor_id, grantee_user_id, purpose, expires_at)
  values (uid, d.id, doc.id, doc.user_id, nullif(btrim(coalesce(p_purpose, '')), ''), now() + make_interval(days => p_days))
  returning reference into ref;
  perform public.log_audit('imaging.grant', 'record_document', d.id::text, jsonb_build_object('doctor', doc.id, 'days', p_days));
  insert into public.notifications (user_id, kind, title, body, link)
  values (doc.user_id, 'dossier', 'Un patient vous a partagé un examen', ref || ' — ' || d.title || ' (accès jusqu''au ' || to_char(now() + make_interval(days => p_days), 'DD/MM/YYYY') || ')', '/medecin/imagerie');
  return ref;
end $$;
revoke execute on function public.imaging_grant(uuid, text, int, text) from public, anon;
grant execute on function public.imaging_grant(uuid, text, int, text) to authenticated;

create or replace function public.imaging_revoke(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.imaging_grants set revoked_at = now() where id = p_id and owner_id = auth.uid() and revoked_at is null;
  if not found then raise exception 'PP404: partage introuvable ou déjà retiré'; end if;
  perform public.log_audit('imaging.revoke', 'imaging_grant', p_id::text);
end $$;
revoke execute on function public.imaging_revoke(uuid) from public, anon;
grant execute on function public.imaging_revoke(uuid) to authenticated;

-- Examens partagés avec le médecin connecté (aucune autre donnée du dossier n'est accessible)
create or replace function public.imaging_shared_with_me()
returns table (grant_id uuid, reference text, patient text, title text, doc_kind text, modality text, body_part text, doc_date date, facility_name text, mime text, purpose text, expires_at timestamptz, views int)
language sql stable security definer set search_path = public as $$
  select g.id, g.reference, split_part(btrim(p.full_name), ' ', 1) || coalesce(' ' || left(nullif(split_part(btrim(p.full_name), ' ', 2), ''), 1) || '.', ''),
    d.title, d.doc_kind, d.modality, d.body_part, d.doc_date, d.facility_name, d.mime, g.purpose, g.expires_at, g.views
  from public.imaging_grants g join public.record_documents d on d.id = g.document_id join public.profiles p on p.id = g.owner_id
  where g.grantee_user_id = auth.uid() and g.revoked_at is null and g.expires_at > now()
  order by g.created_at desc;
$$;
revoke execute on function public.imaging_shared_with_me() from public, anon;
grant execute on function public.imaging_shared_with_me() to authenticated;

-- Ouverture par le médecin : vérifie le partage, journalise, prévient le patient, renvoie le chemin du fichier
create or replace function public.imaging_open(p_grant uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.imaging_grants; d public.record_documents;
begin
  select * into g from public.imaging_grants where id = p_grant and grantee_user_id = auth.uid() and revoked_at is null and expires_at > now() for update;
  if g.id is null then raise exception 'PP403: partage expiré, retiré ou inconnu' using errcode = '42501'; end if;
  select * into d from public.record_documents where id = g.document_id;
  update public.imaging_grants set views = views + 1, last_viewed_at = now() where id = g.id;
  perform public.log_audit('imaging.view', 'imaging_grant', g.id::text, jsonb_build_object('document', d.id));
  if g.last_viewed_at is null or g.last_viewed_at < now() - interval '1 hour' then
    insert into public.notifications (user_id, kind, title, body, link)
    values (g.owner_id, 'dossier', 'Votre examen partagé a été consulté', g.reference || ' — ' || d.title, '/ma-sante/dossier/imagerie');
  end if;
  return jsonb_build_object('storage_path', d.storage_path, 'mime', d.mime, 'title', d.title);
end $$;
revoke execute on function public.imaging_open(uuid) from public, anon;
grant execute on function public.imaging_open(uuid) to authenticated;
