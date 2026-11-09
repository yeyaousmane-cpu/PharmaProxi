-- =============================================================================
-- SantéProxi 0.25.0 — Confidentialité : consentements, preuves, demandes d'exercice
-- des droits, journal d'audit chaîné (inaltérable par l'application).
-- Migration additive : aucune donnée existante n'est modifiée ni supprimée.
-- Retour arrière (dans cet ordre) :
--   drop trigger if exists audit_logs_chain on public.audit_logs;
--   drop trigger if exists audit_logs_immutable on public.audit_logs;
--   alter table public.audit_logs drop column if exists prev_hash, drop column if exists row_hash;
--   drop table if exists public.privacy_requests, public.consent_records, public.consent_purposes;
-- =============================================================================

-- 1. Finalités (texte versionné présenté à l'utilisateur)
create table if not exists public.consent_purposes (
  code text primary key check (code ~ '^[a-z_]{3,40}$'),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text not null check (char_length(btrim(description)) between 10 and 1200),
  data_categories text not null check (char_length(data_categories) <= 300),
  recipients text not null check (char_length(recipients) <= 300),
  legal_basis text not null check (legal_basis in ('consentement', 'contrat', 'obligation_legale', 'interet_vital', 'interet_legitime')),
  withdrawal_effect text check (char_length(coalesce(withdrawal_effect, '')) <= 400),
  version int not null default 1 check (version >= 1),
  active boolean not null default true,
  sort int not null default 100,
  updated_at timestamptz not null default now()
);
alter table public.consent_purposes enable row level security;
drop policy if exists "pp_consent_purposes_read" on public.consent_purposes;
create policy "pp_consent_purposes_read" on public.consent_purposes for select to anon, authenticated using (active or public.is_admin());
drop policy if exists "pp_consent_purposes_admin" on public.consent_purposes;
create policy "pp_consent_purposes_admin" on public.consent_purposes for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.consent_purposes from anon;
grant select on public.consent_purposes to anon;
grant select, insert, update, delete on public.consent_purposes to authenticated;

-- Toute modification du texte d'une finalité augmente sa version (les preuves gardent la version acceptée)
create or replace function public.bump_consent_purpose_version()
returns trigger language plpgsql set search_path = public as $$
begin
  if (new.title, new.description, new.data_categories, new.recipients, new.legal_basis, coalesce(new.withdrawal_effect, ''))
     is distinct from (old.title, old.description, old.data_categories, old.recipients, old.legal_basis, coalesce(old.withdrawal_effect, '')) then
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists consent_purposes_version on public.consent_purposes;
create trigger consent_purposes_version before update on public.consent_purposes for each row execute function public.bump_consent_purpose_version();

insert into public.consent_purposes (code, title, description, data_categories, recipients, legal_basis, withdrawal_effect, sort) values
  ('dossier_sante', 'Mon dossier santé',
   'Enregistrer dans votre compte vos documents médicaux, mesures, traitements et résultats d''analyses, pour les retrouver et, si vous le décidez, les montrer à un professionnel.',
   'Documents médicaux, mesures, traitements, résultats d''analyses', 'Vous seul ; les professionnels ou proches à qui vous ouvrez un accès',
   'consentement', 'Le retrait n''efface pas automatiquement les éléments déjà enregistrés : vous pouvez les supprimer depuis votre dossier ou demander leur suppression.', 10),
  ('espace_femme', 'SantéProxi Femme',
   'Enregistrer votre suivi de cycle, de grossesse et vos notes personnelles dans l''espace Femme, protégé par un code secret.',
   'Cycle, symptômes, grossesse, notes personnelles (chiffrées)', 'Vous seul ; les personnes avec qui vous partagez explicitement',
   'consentement', 'Le retrait n''efface pas automatiquement vos données : vous pouvez les supprimer depuis l''espace Femme.', 20),
  ('communications', 'Informations et nouveautés',
   'Recevoir par e-mail des informations sur les nouveaux services SantéProxi et des messages de prévention.',
   'Adresse e-mail, prénom', 'SantéProxi et son prestataire d''envoi d''e-mails',
   'consentement', 'Vous ne recevez plus ces messages. Les messages liés à vos rendez-vous et commandes continuent.', 30),
  ('enquetes', 'Enquêtes de satisfaction',
   'Être contacté(e) pour donner votre avis sur SantéProxi afin d''améliorer le service.',
   'Adresse e-mail ou téléphone, prénom', 'Équipe SantéProxi',
   'consentement', 'Vous n''êtes plus sollicité(e) pour les enquêtes.', 40),
  ('compte_et_services', 'Compte, rendez-vous, commandes et réservations',
   'Créer et sécuriser votre compte, transmettre vos rendez-vous au professionnel choisi et vos réservations à la pharmacie choisie.',
   'Identité, contact, rendez-vous, commandes', 'Le professionnel, l''établissement ou la pharmacie que vous choisissez',
   'contrat', null, 100),
  ('securite', 'Sécurité et traçabilité',
   'Journaliser les actions sensibles (connexions, modifications, accès) pour protéger les comptes et enquêter en cas d''incident.',
   'Identifiant, action, date', 'Administrateurs habilités de SantéProxi',
   'interet_legitime', null, 110),
  ('fiche_urgence', 'Fiche d''urgence',
   'Afficher, si vous la remplissez, votre fiche d''urgence (groupe sanguin, allergies, contact) pour faciliter votre prise en charge.',
   'Informations de la fiche d''urgence', 'Vous ; les secours à qui vous la montrez',
   'interet_vital', null, 120)
on conflict (code) do nothing;

-- 2. Preuves de consentement : registre en ajout seul
create table if not exists public.consent_records (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  purpose_code text not null references public.consent_purposes(code),
  purpose_version int not null,
  decision text not null check (decision in ('accorde', 'retire')),
  method text not null check (method in ('centre_confidentialite', 'inscription', 'parcours_service')),
  data_categories text not null,
  recipients text not null,
  created_at timestamptz not null default now()
);
create index if not exists consent_records_user_idx on public.consent_records (user_id, purpose_code, created_at desc);
alter table public.consent_records enable row level security;
drop policy if exists "pp_consent_records_own" on public.consent_records;
create policy "pp_consent_records_own" on public.consent_records for select to authenticated using (user_id = auth.uid());
revoke all on public.consent_records from anon, authenticated;
grant select on public.consent_records to authenticated;

create or replace function public.consent_records_append_only()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Seule exception : suppression en cascade quand le profil lui-même est supprimé définitivement
  if tg_op = 'DELETE' and not exists (select 1 from public.profiles where id = old.user_id) then return old; end if;
  raise exception 'PP403: le registre des consentements ne peut pas être modifié';
end $$;
drop trigger if exists consent_records_append_only on public.consent_records;
create trigger consent_records_append_only before update or delete on public.consent_records for each row execute function public.consent_records_append_only();

create or replace function public.set_consent(p_purpose text, p_granted boolean, p_method text default 'centre_confidentialite')
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p public.consent_purposes; last text;
begin
  if uid is null then raise exception 'PP401: connexion requise'; end if;
  select * into p from public.consent_purposes where code = p_purpose and active;
  if not found or p.legal_basis <> 'consentement' then raise exception 'PP422: cette finalité ne relève pas du consentement'; end if;
  if p_method not in ('centre_confidentialite', 'inscription', 'parcours_service') then raise exception 'PP422: méthode invalide'; end if;
  if (select count(*) from public.consent_records where user_id = uid and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'PP429: trop de changements, réessayez plus tard';
  end if;
  select decision into last from public.consent_records where user_id = uid and purpose_code = p_purpose order by created_at desc, id desc limit 1;
  if last is not distinct from (case when p_granted then 'accorde' else 'retire' end) then return; end if;
  if last is null and not p_granted then return; end if;
  insert into public.consent_records (user_id, purpose_code, purpose_version, decision, method, data_categories, recipients)
  values (uid, p.code, p.version, case when p_granted then 'accorde' else 'retire' end, p_method, p.data_categories, p.recipients);
  perform public.log_audit(case when p_granted then 'consent.grant' else 'consent.withdraw' end, 'consent', p.code, jsonb_build_object('version', p.version, 'method', p_method));
end $$;
revoke execute on function public.set_consent(text, boolean, text) from public, anon;
grant execute on function public.set_consent(text, boolean, text) to authenticated;

-- Statistiques agrégées pour l'administration (aucune identité)
create or replace function public.consent_stats()
returns table (purpose_code text, accorde bigint, retire bigint)
language sql security definer set search_path = public stable as $$
  with last as (
    select distinct on (user_id, purpose_code) user_id, purpose_code, decision
    from public.consent_records order by user_id, purpose_code, created_at desc, id desc)
  select purpose_code, count(*) filter (where decision = 'accorde'), count(*) filter (where decision = 'retire')
  from last where public.is_admin() group by purpose_code;
$$;
revoke execute on function public.consent_stats() from public, anon;
grant execute on function public.consent_stats() to authenticated;

-- 3. Demandes d'exercice des droits
create table if not exists public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('acces', 'rectification', 'export', 'suppression', 'opposition', 'autre')),
  message text check (char_length(coalesce(message, '')) <= 2000),
  status text not null default 'nouvelle' check (status in ('nouvelle', 'en_cours', 'traitee', 'refusee')),
  admin_note text check (char_length(coalesce(admin_note, '')) <= 1000),
  handled_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists privacy_requests_status_idx on public.privacy_requests (status, created_at desc);
alter table public.privacy_requests enable row level security;
drop policy if exists "pp_privacy_requests_own" on public.privacy_requests;
create policy "pp_privacy_requests_own" on public.privacy_requests for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke all on public.privacy_requests from anon, authenticated;
grant select on public.privacy_requests to authenticated;

create or replace function public.create_privacy_request(p_kind text, p_message text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); rid uuid; a record;
begin
  if uid is null then raise exception 'PP401: connexion requise'; end if;
  if p_kind not in ('acces', 'rectification', 'export', 'suppression', 'opposition', 'autre') then raise exception 'PP422: type de demande invalide'; end if;
  if char_length(coalesce(p_message, '')) > 2000 then raise exception 'PP422: message trop long'; end if;
  if (select count(*) from public.privacy_requests where user_id = uid and created_at > now() - interval '1 day') >= 5 then
    raise exception 'PP429: trop de demandes aujourd''hui, réessayez demain';
  end if;
  insert into public.privacy_requests (user_id, kind, message) values (uid, p_kind, nullif(btrim(coalesce(p_message, '')), '')) returning id into rid;
  perform public.log_audit('privacy.request', 'privacy_request', rid::text, jsonb_build_object('kind', p_kind));
  for a in select ur.user_id from public.user_roles ur where ur.role = 'admin' loop
    insert into public.notifications (user_id, kind, title, body, link)
    values (a.user_id, 'confidentialite', 'Nouvelle demande sur les données personnelles', 'Type : ' || p_kind, '/admin/confidentialite');
  end loop;
  return rid;
end $$;
revoke execute on function public.create_privacy_request(text, text) from public, anon;
grant execute on function public.create_privacy_request(text, text) to authenticated;

create or replace function public.handle_privacy_request(p_id uuid, p_status text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.privacy_requests;
begin
  if not public.is_admin() then raise exception 'PP403: réservé à l''administration'; end if;
  if p_status not in ('nouvelle', 'en_cours', 'traitee', 'refusee') then raise exception 'PP422: statut invalide'; end if;
  update public.privacy_requests set status = p_status, admin_note = nullif(btrim(coalesce(p_note, '')), ''), handled_by = auth.uid(), updated_at = now()
  where id = p_id returning * into r;
  if not found then raise exception 'PP404: demande introuvable'; end if;
  perform public.log_audit('privacy.request_status', 'privacy_request', p_id::text, jsonb_build_object('status', p_status));
  insert into public.notifications (user_id, kind, title, body, link)
  values (r.user_id, 'confidentialite', 'Votre demande sur vos données a été mise à jour',
          case p_status when 'en_cours' then 'Elle est en cours de traitement.' when 'traitee' then 'Elle a été traitée.' when 'refusee' then 'Elle n''a pas pu être acceptée : consultez la réponse.' else 'Elle a été enregistrée.' end,
          '/compte/confidentialite');
end $$;
revoke execute on function public.handle_privacy_request(uuid, text, text) from public, anon;
grant execute on function public.handle_privacy_request(uuid, text, text) to authenticated;

-- Événement de confidentialité déclenché par l'utilisateur lui-même (ex. export de ses données)
create or replace function public.log_privacy_event(p_action text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'PP401: connexion requise'; end if;
  if p_action not in ('privacy.export', 'privacy.signout_others') then raise exception 'PP422: action inconnue'; end if;
  perform public.log_audit(p_action, 'user', auth.uid()::text, '{}'::jsonb);
end $$;
revoke execute on function public.log_privacy_event(text) from public, anon;
grant execute on function public.log_privacy_event(text) to authenticated;

-- Historique visible par l'utilisateur : ses propres actions et celles qui le concernent directement
create or replace function public.my_audit_events(p_limit int default 50)
returns table (created_at timestamptz, action text, entity_type text, by_me boolean)
language sql security definer set search_path = public stable as $$
  select l.created_at, l.action, l.entity_type, l.actor_id = auth.uid()
  from public.audit_logs l
  where auth.uid() is not null and (l.actor_id = auth.uid() or (l.entity_type = 'user' and l.entity_id = auth.uid()::text))
  order by l.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;
revoke execute on function public.my_audit_events(int) from public, anon;
grant execute on function public.my_audit_events(int) to authenticated;

-- 4. Journal d'audit chaîné : chaque ligne contient l'empreinte de la précédente.
-- Toute modification ou suppression par l'application est refusée ; une altération
-- directe en base devient détectable par audit_verify_chain().
alter table public.audit_logs add column if not exists prev_hash text, add column if not exists row_hash text;

create or replace function public.audit_logs_chain()
returns trigger language plpgsql set search_path = public as $$
declare last text;
begin
  perform pg_advisory_xact_lock(hashtext('pp_audit_chain'));
  select row_hash into last from public.audit_logs where row_hash is not null order by id desc limit 1;
  new.prev_hash := coalesce(last, 'genesis');
  new.row_hash := encode(sha256(convert_to(concat_ws('|', new.prev_hash, coalesce(new.actor_id::text, ''), new.action, new.entity_type,
    coalesce(new.entity_id, ''), new.details::text, to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')), 'UTF8')), 'hex');
  return new;
end $$;
drop trigger if exists audit_logs_chain on public.audit_logs;
create trigger audit_logs_chain before insert on public.audit_logs for each row execute function public.audit_logs_chain();

create or replace function public.audit_logs_immutable()
returns trigger language plpgsql as $$
begin raise exception 'PP403: le journal d''audit ne peut être ni modifié ni supprimé'; end $$;
drop trigger if exists audit_logs_immutable on public.audit_logs;
create trigger audit_logs_immutable before update or delete on public.audit_logs for each row execute function public.audit_logs_immutable();

create or replace function public.audit_verify_chain()
returns table (checked bigint, broken_at bigint, first_chained_id bigint)
language plpgsql security definer set search_path = public stable as $$
declare r record; prev text := null; n bigint := 0; bad bigint := null; first_id bigint := null; h text;
begin
  if not public.is_admin() then raise exception 'PP403: réservé à l''administration'; end if;
  for r in select * from public.audit_logs where row_hash is not null order by id loop
    if first_id is null then first_id := r.id; prev := r.prev_hash; end if;
    h := encode(sha256(convert_to(concat_ws('|', r.prev_hash, coalesce(r.actor_id::text, ''), r.action, r.entity_type,
      coalesce(r.entity_id, ''), r.details::text, to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')), 'UTF8')), 'hex');
    if r.prev_hash is distinct from prev or h <> r.row_hash then bad := r.id; exit; end if;
    prev := r.row_hash; n := n + 1;
  end loop;
  return query select n, bad, first_id;
end $$;
revoke execute on function public.audit_verify_chain() from public, anon;
grant execute on function public.audit_verify_chain() to authenticated;

-- 5. Fiche de preuve des consentements d'une personne (administration, consultation journalisée)
create or replace function public.consent_proof(p_user uuid)
returns table (purpose_code text, purpose_title text, purpose_version int, decision text, method text, data_categories text, recipients text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'PP403: réservé à l''administration'; end if;
  perform public.log_audit('admin.consent_proof', 'user', p_user::text, '{}'::jsonb);
  return query select r.purpose_code, p.title, r.purpose_version, r.decision, r.method, r.data_categories, r.recipients, r.created_at
    from public.consent_records r join public.consent_purposes p on p.code = r.purpose_code
    where r.user_id = p_user order by r.created_at, r.id;
end $$;
revoke execute on function public.consent_proof(uuid) from public, anon;
grant execute on function public.consent_proof(uuid) to authenticated;
