-- =============================================================================
-- SantéProxi 0.26.0 — Conformité : preuves de consentement renforcées, versions
-- de politique, réclamations, registre des traitements, destinataires, habilitations
-- conformité, historique des connexions, favoris.
-- Migration additive : aucune donnée existante n'est modifiée ni supprimée
-- (les preuves antérieures restent telles quelles ; les nouvelles colonnes sont vides pour elles).
-- Retour arrière : voir le bloc « ROLLBACK » en fin de fichier.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Habilitations conformité (DPO / correspondant, juriste, auditeur en lecture seule)
-- ---------------------------------------------------------------------------
create table if not exists public.compliance_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null check (role in ('dpo', 'juriste', 'auditeur')),
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.compliance_members enable row level security;
drop policy if exists "pp_compliance_members_read" on public.compliance_members;
create policy "pp_compliance_members_read" on public.compliance_members for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke all on public.compliance_members from anon, authenticated;
grant select on public.compliance_members to authenticated;

create or replace function public.compliance_role() returns text
language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then 'admin' else (select role from public.compliance_members where user_id = auth.uid()) end;
$$;
create or replace function public.can_view_compliance() returns boolean
language sql stable security definer set search_path = public as $$ select public.compliance_role() is not null; $$;
create or replace function public.can_edit_compliance() returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(public.compliance_role() in ('admin', 'dpo', 'juriste'), false); $$;
grant execute on function public.compliance_role(), public.can_view_compliance(), public.can_edit_compliance() to authenticated;

create or replace function public.admin_set_compliance_member(p_email text, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.is_admin() then raise exception 'PP403: réservé à l''administration'; end if;
  select id into uid from auth.users where lower(email) = lower(btrim(p_email));
  if uid is null then raise exception 'PP404: aucun compte avec cette adresse'; end if;
  if p_role is null or p_role = '' then
    delete from public.compliance_members where user_id = uid;
  else
    if p_role not in ('dpo', 'juriste', 'auditeur') then raise exception 'PP422: rôle invalide'; end if;
    insert into public.compliance_members (user_id, role, granted_by) values (uid, p_role, auth.uid())
    on conflict (user_id) do update set role = excluded.role, granted_by = excluded.granted_by, created_at = now();
  end if;
  perform public.log_audit('compliance.member', 'user', uid::text, jsonb_build_object('role', nullif(p_role, '')));
end $$;
revoke execute on function public.admin_set_compliance_member(text, text) from public, anon;
grant execute on function public.admin_set_compliance_member(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Versions immuables des textes de consentement (copie exacte + empreinte SHA-256)
-- ---------------------------------------------------------------------------
create table if not exists public.consent_purpose_versions (
  purpose_code text not null references public.consent_purposes(code),
  version int not null,
  snapshot jsonb not null,
  text_sha256 text not null check (text_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (purpose_code, version)
);
alter table public.consent_purpose_versions enable row level security;
drop policy if exists "pp_consent_purpose_versions_read" on public.consent_purpose_versions;
create policy "pp_consent_purpose_versions_read" on public.consent_purpose_versions for select to anon, authenticated using (true);
revoke all on public.consent_purpose_versions from anon, authenticated;
grant select on public.consent_purpose_versions to anon, authenticated;

create or replace function public.consent_purpose_snapshot(p public.consent_purposes) returns jsonb
language sql immutable as $$
  select jsonb_build_object('code', p.code, 'version', p.version, 'titre', p.title, 'description', p.description,
    'donnees', p.data_categories, 'destinataires', p.recipients, 'base_legale', p.legal_basis, 'effet_du_retrait', p.withdrawal_effect);
$$;
create or replace function public.sha256_text(t text) returns text language sql immutable as $$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;

create or replace function public.archive_consent_purpose_version() returns trigger
language plpgsql security definer set search_path = public as $$
declare s jsonb := public.consent_purpose_snapshot(new);
begin
  insert into public.consent_purpose_versions (purpose_code, version, snapshot, text_sha256)
  values (new.code, new.version, s, public.sha256_text(s::text)) on conflict do nothing;
  return new;
end $$;
drop trigger if exists consent_purposes_archive on public.consent_purposes;
create trigger consent_purposes_archive after insert or update on public.consent_purposes for each row execute function public.archive_consent_purpose_version();

create or replace function public.immutable_row() returns trigger language plpgsql as $$
begin raise exception 'PP403: enregistrement immuable (%), toute correction doit créer un nouvel enregistrement', tg_table_name; end $$;
drop trigger if exists consent_purpose_versions_immutable on public.consent_purpose_versions;
create trigger consent_purpose_versions_immutable before update or delete on public.consent_purpose_versions for each row execute function public.immutable_row();

-- Versions actuelles déjà en place : archivées telles quelles
insert into public.consent_purpose_versions (purpose_code, version, snapshot, text_sha256)
select p.code, p.version, public.consent_purpose_snapshot(p), public.sha256_text(public.consent_purpose_snapshot(p)::text)
from public.consent_purposes p on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. Versions de la politique de confidentialité (texte figé une fois publié)
-- ---------------------------------------------------------------------------
create table if not exists public.privacy_policy_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique check (version ~ '^[0-9A-Za-z._-]{1,20}$'),
  lang text not null default 'fr',
  title text not null check (char_length(btrim(title)) between 3 and 160),
  body text not null check (char_length(btrim(body)) >= 20),
  sha256 text not null default '',
  status text not null default 'brouillon' check (status in ('brouillon', 'publiee', 'archivee')),
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.privacy_policy_versions enable row level security;
drop policy if exists "pp_policy_versions_read" on public.privacy_policy_versions;
create policy "pp_policy_versions_read" on public.privacy_policy_versions for select to anon, authenticated using (status <> 'brouillon' or public.can_view_compliance());
revoke all on public.privacy_policy_versions from anon, authenticated;
grant select on public.privacy_policy_versions to anon, authenticated;

create or replace function public.policy_version_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'brouillon' then raise exception 'PP403: une version publiée ne peut pas être supprimée'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.status <> 'brouillon' then
    if (new.title, new.body, new.version, new.lang) is distinct from (old.title, old.body, old.version, old.lang) then
      raise exception 'PP403: une version publiée est figée ; créez une nouvelle version';
    end if;
    if not (old.status = 'publiee' and new.status = 'archivee') and new.status <> old.status then
      raise exception 'PP403: transition de statut non autorisée';
    end if;
  end if;
  new.sha256 := public.sha256_text(new.version || '|' || new.lang || '|' || new.title || '|' || new.body);
  if new.status = 'publiee' and new.published_at is null then new.published_at := now(); end if;
  return new;
end $$;
drop trigger if exists policy_version_guard on public.privacy_policy_versions;
create trigger policy_version_guard before insert or update or delete on public.privacy_policy_versions for each row execute function public.policy_version_guard();

create or replace function public.current_policy_version() returns text
language sql stable security definer set search_path = public as $$
  select version from public.privacy_policy_versions where status = 'publiee' order by published_at desc limit 1;
$$;
grant execute on function public.current_policy_version() to anon, authenticated;

-- Version 1 : copie exacte de la politique de confidentialité actuellement affichée
insert into public.privacy_policy_versions (version, title, body, status)
select '1', coalesce(nullif(title, ''), 'Politique de confidentialité'), body, 'publiee'
from public.content_pages where slug = 'confidentialite' and char_length(btrim(body)) >= 20
on conflict (version) do nothing;

create or replace function public.publish_policy_version(p_version text, p_title text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_compliance() then raise exception 'PP403: réservé au responsable conformité'; end if;
  update public.privacy_policy_versions set status = 'archivee' where status = 'publiee';
  insert into public.privacy_policy_versions (version, title, body, status, created_by) values (p_version, p_title, p_body, 'publiee', auth.uid());
  perform public.log_audit('compliance.policy_publish', 'privacy_policy', p_version, '{}'::jsonb);
end $$;
revoke execute on function public.publish_policy_version(text, text, text) from public, anon;
grant execute on function public.publish_policy_version(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Preuves de consentement : refus explicite, contexte complet, chaîne d'empreintes
-- ---------------------------------------------------------------------------
alter table public.consent_records drop constraint if exists consent_records_decision_check;
alter table public.consent_records add constraint consent_records_decision_check check (decision in ('accorde', 'refuse', 'retire'));
alter table public.consent_records
  add column if not exists text_sha256 text,
  add column if not exists policy_version text,
  add column if not exists lang text,
  add column if not exists timezone text,
  add column if not exists session_ref text,
  add column if not exists origin text,
  add column if not exists prev_hash text,
  add column if not exists row_hash text;

create or replace function public.consent_records_chain() returns trigger
language plpgsql set search_path = public as $$
declare last text;
begin
  perform pg_advisory_xact_lock(hashtext('pp_consent_chain'));
  select row_hash into last from public.consent_records where row_hash is not null order by id desc limit 1;
  new.prev_hash := coalesce(last, 'genesis');
  new.row_hash := public.sha256_text(concat_ws('|', new.prev_hash, new.user_id::text, new.purpose_code, new.purpose_version::text, new.decision,
    new.method, coalesce(new.text_sha256, ''), coalesce(new.policy_version, ''), coalesce(new.lang, ''), coalesce(new.timezone, ''),
    coalesce(new.session_ref, ''), coalesce(new.origin, ''), to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')));
  return new;
end $$;
drop trigger if exists consent_records_chain on public.consent_records;
create trigger consent_records_chain before insert on public.consent_records for each row execute function public.consent_records_chain();

-- Enregistrement d'un choix : uniquement à la suite d'une action de l'utilisateur connecté
create or replace function public.record_consent(p_purpose text, p_decision text, p_method text default 'centre_confidentialite', p_lang text default 'fr', p_timezone text default null)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p public.consent_purposes; last text; v public.consent_purpose_versions; d text := p_decision;
begin
  if uid is null then raise exception 'PP401: connexion requise'; end if;
  select * into p from public.consent_purposes where code = p_purpose and active;
  if not found or p.legal_basis <> 'consentement' then raise exception 'PP422: cette finalité ne relève pas du consentement'; end if;
  if p_method not in ('centre_confidentialite', 'inscription', 'parcours_service') then raise exception 'PP422: méthode invalide'; end if;
  if d not in ('accorde', 'refuse', 'retire') then raise exception 'PP422: choix invalide'; end if;
  if (select count(*) from public.consent_records where user_id = uid and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'PP429: trop de changements, réessayez plus tard';
  end if;
  select decision into last from public.consent_records where user_id = uid and purpose_code = p_purpose order by created_at desc, id desc limit 1;
  -- Refuser ce qui était accordé = retrait ; retirer ce qui n'est pas accordé = refus
  if d = 'refuse' and last = 'accorde' then d := 'retire'; end if;
  if d = 'retire' and last is distinct from 'accorde' then d := 'refuse'; end if;
  if last is not distinct from d then return d; end if;
  select * into v from public.consent_purpose_versions where purpose_code = p.code and version = p.version;
  insert into public.consent_records (user_id, purpose_code, purpose_version, decision, method, data_categories, recipients,
    text_sha256, policy_version, lang, timezone, session_ref, origin)
  values (uid, p.code, p.version, d, p_method, p.data_categories, p.recipients,
    v.text_sha256, public.current_policy_version(), left(coalesce(nullif(p_lang, ''), 'fr'), 5), left(nullif(p_timezone, ''), 60),
    left(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id', ''), 64), 'utilisateur');
  perform public.log_audit('consent.' || d, 'consent', p.code, jsonb_build_object('version', p.version, 'method', p_method));
  return d;
end $$;
revoke execute on function public.record_consent(text, text, text, text, text) from public, anon;
grant execute on function public.record_consent(text, text, text, text, text) to authenticated;

-- Compatibilité avec la 0.25
create or replace function public.set_consent(p_purpose text, p_granted boolean, p_method text default 'centre_confidentialite')
returns void language plpgsql security definer set search_path = public as $$
begin perform public.record_consent(p_purpose, case when p_granted then 'accorde' else 'refuse' end, p_method, 'fr', null); end $$;

-- ---------------------------------------------------------------------------
-- 5. Réclamations « Je n'ai jamais donné mon consentement »
-- ---------------------------------------------------------------------------
create table if not exists public.consent_disputes (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('REC-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 6))),
  user_id uuid not null references public.profiles(id) on delete cascade,
  purpose_code text references public.consent_purposes(code),
  message text not null check (char_length(btrim(message)) between 5 and 2000),
  status text not null default 'nouvelle' check (status in ('nouvelle', 'en_analyse', 'preuve_retrouvee', 'preuve_insuffisante', 'traitement_suspendu', 'resolue', 'transmise')),
  shared_with_recipients text check (char_length(coalesce(shared_with_recipients, '')) <= 1000),
  corrective_actions text check (char_length(coalesce(corrective_actions, '')) <= 2000),
  report text check (char_length(coalesce(report, '')) <= 5000),
  handled_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.consent_disputes enable row level security;
drop policy if exists "pp_consent_disputes_read" on public.consent_disputes;
create policy "pp_consent_disputes_read" on public.consent_disputes for select to authenticated using (user_id = auth.uid() or public.can_view_compliance());
revoke all on public.consent_disputes from anon, authenticated;
grant select on public.consent_disputes to authenticated;

create or replace function public.create_consent_dispute(p_purpose text, p_message text)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.consent_disputes; a record;
begin
  if uid is null then raise exception 'PP401: connexion requise'; end if;
  if (select count(*) from public.consent_disputes where user_id = uid and created_at > now() - interval '1 day') >= 3 then raise exception 'PP429: trop de réclamations aujourd''hui'; end if;
  insert into public.consent_disputes (user_id, purpose_code, message)
  values (uid, (select code from public.consent_purposes where code = p_purpose), btrim(p_message)) returning * into r;
  perform public.log_audit('compliance.dispute_create', 'consent_dispute', r.id::text, jsonb_build_object('purpose', p_purpose));
  for a in select user_id from public.user_roles where role = 'admin' union select user_id from public.compliance_members where role in ('dpo', 'juriste') loop
    insert into public.notifications (user_id, kind, title, body, link) values (a.user_id, 'confidentialite', 'Réclamation sur un consentement ' || r.reference, left(r.message, 140), '/conformite/reclamations');
  end loop;
  return r.reference;
end $$;
revoke execute on function public.create_consent_dispute(text, text) from public, anon;
grant execute on function public.create_consent_dispute(text, text) to authenticated;

create or replace function public.handle_consent_dispute(p_id uuid, p_status text, p_shared text, p_actions text, p_report text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.consent_disputes;
begin
  if not public.can_edit_compliance() then raise exception 'PP403: réservé au responsable conformité'; end if;
  if p_status not in ('nouvelle', 'en_analyse', 'preuve_retrouvee', 'preuve_insuffisante', 'traitement_suspendu', 'resolue', 'transmise') then raise exception 'PP422: statut invalide'; end if;
  update public.consent_disputes set status = p_status, shared_with_recipients = nullif(btrim(coalesce(p_shared, '')), ''),
    corrective_actions = nullif(btrim(coalesce(p_actions, '')), ''), report = nullif(btrim(coalesce(p_report, '')), ''), handled_by = auth.uid(), updated_at = now()
  where id = p_id returning * into r;
  if not found then raise exception 'PP404: réclamation introuvable'; end if;
  perform public.log_audit('compliance.dispute_status', 'consent_dispute', p_id::text, jsonb_build_object('status', p_status));
  insert into public.notifications (user_id, kind, title, body, link)
  values (r.user_id, 'confidentialite', 'Votre réclamation ' || r.reference || ' a été mise à jour', 'Consultez-la dans Mes données et confidentialité.', '/compte/confidentialite');
end $$;
revoke execute on function public.handle_consent_dispute(uuid, text, text, text, text) from public, anon;
grant execute on function public.handle_consent_dispute(uuid, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Consultation, vérification et export des preuves (journalisés)
-- ---------------------------------------------------------------------------
create or replace function public.consent_record_ok(r public.consent_records) returns boolean
language sql stable security definer set search_path = public as $$
  select r.text_sha256 is null or exists (select 1 from public.consent_purpose_versions v
    where v.purpose_code = r.purpose_code and v.version = r.purpose_version and v.text_sha256 = r.text_sha256
      and v.text_sha256 = public.sha256_text(v.snapshot::text));
$$;

create or replace function public.compliance_search(p_user uuid default null, p_from date default null, p_to date default null, p_purpose text default null, p_decision text default null, p_export boolean default false)
returns table (id bigint, user_id uuid, user_name text, purpose_code text, purpose_title text, purpose_version int, decision text, method text,
  policy_version text, lang text, timezone text, text_sha256 text, created_at timestamptz, text_ok boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_view_compliance() then raise exception 'PP403: accès réservé aux personnes habilitées'; end if;
  perform public.log_audit(case when p_export then 'compliance.export' else 'compliance.search' end, 'consent', coalesce(p_user::text, '*'),
    jsonb_build_object('from', p_from, 'to', p_to, 'purpose', p_purpose, 'decision', p_decision));
  return query
    select r.id, r.user_id, pr.full_name, r.purpose_code, p.title, r.purpose_version, r.decision, r.method, r.policy_version, r.lang, r.timezone, r.text_sha256, r.created_at,
      public.consent_record_ok(r)
    from public.consent_records r join public.consent_purposes p on p.code = r.purpose_code left join public.profiles pr on pr.id = r.user_id
    where (p_user is null or r.user_id = p_user) and (p_from is null or r.created_at >= p_from) and (p_to is null or r.created_at < p_to + 1)
      and (p_purpose is null or r.purpose_code = p_purpose) and (p_decision is null or r.decision = p_decision)
    order by r.created_at desc, r.id desc limit 2000;
end $$;
revoke execute on function public.compliance_search(uuid, date, date, text, text, boolean) from public, anon;
grant execute on function public.compliance_search(uuid, date, date, text, text, boolean) to authenticated;

create or replace function public.consent_chain_verify()
returns table (checked bigint, broken_at bigint)
language plpgsql security definer set search_path = public stable as $$
declare r record; prev text := null; n bigint := 0; bad bigint := null; h text; started boolean := false;
begin
  if not public.can_view_compliance() then raise exception 'PP403: accès réservé aux personnes habilitées'; end if;
  for r in select * from public.consent_records where row_hash is not null order by id loop
    if not started then prev := r.prev_hash; started := true; end if;
    h := public.sha256_text(concat_ws('|', r.prev_hash, r.user_id::text, r.purpose_code, r.purpose_version::text, r.decision,
      r.method, coalesce(r.text_sha256, ''), coalesce(r.policy_version, ''), coalesce(r.lang, ''), coalesce(r.timezone, ''),
      coalesce(r.session_ref, ''), coalesce(r.origin, ''), to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')));
    if r.prev_hash is distinct from prev or h <> r.row_hash then bad := r.id; exit; end if;
    prev := r.row_hash; n := n + 1;
  end loop;
  return query select n, bad;
end $$;
revoke execute on function public.consent_chain_verify() from public, anon;
grant execute on function public.consent_chain_verify() to authenticated;

create or replace function public.compliance_find_user(p_query text)
returns table (id uuid, full_name text, email text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_view_compliance() then raise exception 'PP403: accès réservé aux personnes habilitées'; end if;
  if char_length(btrim(coalesce(p_query, ''))) < 4 then raise exception 'PP422: saisissez au moins 4 caractères'; end if;
  perform public.log_audit('compliance.find_user', 'user', '*', jsonb_build_object('q_len', char_length(p_query)));
  return query select u.id, p.full_name, u.email::text from auth.users u join public.profiles p on p.id = u.id
    where lower(u.email) = lower(btrim(p_query)) or p.phone = btrim(p_query) or u.id::text = btrim(p_query) limit 5;
end $$;
revoke execute on function public.compliance_find_user(text) from public, anon;
grant execute on function public.compliance_find_user(text) to authenticated;

-- Journal des consultations et exports administratifs (lecture pour les personnes habilitées)
create or replace function public.compliance_access_log(p_limit int default 100)
returns table (created_at timestamptz, actor_name text, action text, entity_id text, details jsonb)
language plpgsql security definer set search_path = public stable as $$
begin
  if not public.can_view_compliance() then raise exception 'PP403: accès réservé aux personnes habilitées'; end if;
  return query select l.created_at, p.full_name, l.action, l.entity_id, l.details from public.audit_logs l left join public.profiles p on p.id = l.actor_id
    where l.action like 'compliance.%' or l.action = 'admin.consent_proof' order by l.id desc limit least(greatest(p_limit, 1), 500);
end $$;
revoke execute on function public.compliance_access_log(int) from public, anon;
grant execute on function public.compliance_access_log(int) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Registre des traitements et destinataires
-- ---------------------------------------------------------------------------
create table if not exists public.data_processing_registry (
  code text primary key check (code ~ '^[a-z_]{3,40}$'),
  purpose text not null check (char_length(btrim(purpose)) between 3 and 300),
  data_categories text not null default '',
  data_subjects text not null default '',
  recipients text not null default '',
  legal_basis text not null check (legal_basis in ('consentement', 'contrat', 'obligation_legale', 'interet_vital', 'interet_legitime', 'mission_interet_public', 'a_determiner')),
  retention text not null default 'À définir',
  security_measures text not null default '',
  transfers text not null default '',
  apdp_formalities text not null default 'À déterminer',
  legal_status text not null default 'a_valider' check (legal_status in ('a_valider', 'valide', 'a_revoir')),
  validated_by_name text,
  validated_at date,
  sort int not null default 100,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
alter table public.data_processing_registry enable row level security;
drop policy if exists "pp_dpr_read" on public.data_processing_registry;
create policy "pp_dpr_read" on public.data_processing_registry for select to authenticated using (public.can_view_compliance());
revoke all on public.data_processing_registry from anon, authenticated;
grant select on public.data_processing_registry to authenticated;

create table if not exists public.third_party_recipients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 2 and 120),
  role text not null default '',
  data_categories text not null default '',
  country text not null default 'À préciser',
  safeguards text not null default 'À vérifier',
  contract_status text not null default 'a_verifier' check (contract_status in ('a_verifier', 'signe', 'conditions_standard', 'a_negocier')),
  active boolean not null default true,
  sort int not null default 100,
  updated_at timestamptz not null default now()
);
alter table public.third_party_recipients enable row level security;
drop policy if exists "pp_tpr_read" on public.third_party_recipients;
create policy "pp_tpr_read" on public.third_party_recipients for select to anon, authenticated using (active or public.can_view_compliance());
revoke all on public.third_party_recipients from anon, authenticated;
grant select on public.third_party_recipients to anon, authenticated;

create or replace function public.save_registry_entry(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_compliance() then raise exception 'PP403: réservé au responsable conformité'; end if;
  update public.data_processing_registry set
    purpose = coalesce(p ->> 'purpose', purpose), data_categories = coalesce(p ->> 'data_categories', data_categories),
    data_subjects = coalesce(p ->> 'data_subjects', data_subjects), recipients = coalesce(p ->> 'recipients', recipients),
    legal_basis = coalesce(p ->> 'legal_basis', legal_basis), retention = coalesce(p ->> 'retention', retention),
    security_measures = coalesce(p ->> 'security_measures', security_measures), transfers = coalesce(p ->> 'transfers', transfers),
    apdp_formalities = coalesce(p ->> 'apdp_formalities', apdp_formalities), legal_status = coalesce(p ->> 'legal_status', legal_status),
    validated_by_name = case when p ->> 'legal_status' = 'valide' then nullif(btrim(coalesce(p ->> 'validated_by_name', '')), '') else validated_by_name end,
    validated_at = case when p ->> 'legal_status' = 'valide' then current_date else validated_at end,
    updated_at = now(), updated_by = auth.uid()
  where code = p ->> 'code';
  if not found then raise exception 'PP404: traitement introuvable'; end if;
  if p ->> 'legal_status' = 'valide' and nullif(btrim(coalesce(p ->> 'validated_by_name', '')), '') is null then
    raise exception 'PP422: indiquez le nom et la qualité de la personne qui valide';
  end if;
  perform public.log_audit('compliance.registry', 'processing', p ->> 'code', jsonb_build_object('status', p ->> 'legal_status'));
end $$;
revoke execute on function public.save_registry_entry(jsonb) from public, anon;
grant execute on function public.save_registry_entry(jsonb) to authenticated;

insert into public.data_processing_registry (code, purpose, data_categories, data_subjects, recipients, legal_basis, retention, security_measures, transfers, sort) values
  ('comptes', 'Création et sécurité des comptes', 'Identité, contact, identifiants de connexion', 'Patients, professionnels', 'SantéProxi', 'contrat', 'Durée du compte', 'Mot de passe haché par le service d''authentification, double authentification, règles d''accès par ligne', 'Hébergement Union européenne (Irlande)', 10),
  ('rendez_vous', 'Prise et suivi des rendez-vous', 'Identité, contact, date, motif choisi', 'Patients et proches, professionnels', 'Professionnel ou établissement choisi', 'contrat', 'Durée du compte', 'Règles d''accès par ligne', 'Hébergement Union européenne (Irlande)', 20),
  ('reservations', 'Réservations et commandes en pharmacie', 'Identité, contact, médicaments réservés', 'Patients', 'Pharmacie choisie', 'contrat', 'Durée du compte', 'Règles d''accès par ligne', 'Hébergement Union européenne (Irlande)', 30),
  ('dossier_sante', 'Dossier santé personnel', 'Données de santé (documents, mesures, traitements, résultats)', 'Patients et proches', 'La personne et ceux à qui elle ouvre un accès', 'consentement', 'Jusqu''à suppression par la personne ou du compte', 'Règles d''accès par ligne, stockage privé, liens temporaires, aucun accès administrateur', 'Hébergement Union européenne (Irlande)', 40),
  ('espace_femme', 'SantéProxi Femme', 'Données de santé (cycle, grossesse, notes chiffrées)', 'Utilisatrices', 'L''utilisatrice et les personnes avec qui elle partage', 'consentement', 'Jusqu''à suppression', 'Chiffrement AES-256-GCM des notes, code secret, journal des accès', 'Hébergement Union européenne (Irlande)', 50),
  ('communications', 'Informations et messages de prévention par e-mail', 'E-mail, prénom', 'Utilisateurs ayant consenti', 'SantéProxi, prestataire d''envoi', 'consentement', 'Jusqu''au retrait du consentement', 'Envoi uniquement après consentement enregistré', 'À préciser selon le prestataire d''e-mail', 60),
  ('support', 'Centre d''aide et demandes d''assistance', 'Identité, contact, contenu de la demande', 'Utilisateurs et visiteurs', 'Équipe SantéProxi', 'interet_legitime', 'À définir', 'Accès réservé à l''équipe, notes internes séparées', 'Hébergement Union européenne (Irlande)', 70),
  ('securite_audit', 'Sécurité et traçabilité', 'Identifiant, action, date', 'Tous les utilisateurs', 'Administrateurs habilités', 'interet_legitime', 'À définir', 'Journal chaîné, non modifiable par l''application', 'Hébergement Union européenne (Irlande)', 80),
  ('statistiques', 'Statistiques agrégées de recherche', 'Recherches sans identité', 'Visiteurs', 'Partenaires sous forme agrégée', 'interet_legitime', '400 jours', 'Aucune donnée de santé individuelle', 'Hébergement Union européenne (Irlande)', 90),
  ('assistant', 'Assistant santé', 'Texte des questions, sans nom ni identifiant', 'Utilisateurs de l''assistant', 'Fournisseur d''IA (Anthropic)', 'a_determiner', 'Selon les conditions du fournisseur', 'Aucune donnée de compte transmise', 'États-Unis (fournisseur d''IA)', 100)
on conflict (code) do nothing;

insert into public.third_party_recipients (name, role, data_categories, country, safeguards, sort) values
  ('Supabase', 'Base de données, authentification et stockage des fichiers', 'Toutes les données du service', 'Union européenne (Irlande, région eu-west-1)', 'À vérifier : conditions contractuelles et accord de traitement des données', 10),
  ('Vercel', 'Hébergement et exécution du site', 'Données en transit lors de l''utilisation du site', 'À préciser (société américaine ; région d''exécution à confirmer)', 'À vérifier', 20),
  ('Prestataire d''envoi d''e-mails', 'Envoi des e-mails de compte et de notification', 'Adresse e-mail, contenu des messages', 'À préciser', 'À vérifier', 30),
  ('Anthropic', 'Réponses de l''assistant santé', 'Texte des questions posées à l''assistant', 'États-Unis', 'À vérifier : conditions commerciales de l''API', 40)
on conflict (name) do nothing;

-- Identité du responsable de traitement : champs administrables, vides tant qu'ils ne sont pas définis
insert into public.platform_settings (key, value, description) values
  ('privacy_controller_name', '""'::jsonb, 'Responsable du traitement : dénomination juridique'),
  ('privacy_controller_address', '""'::jsonb, 'Responsable du traitement : adresse officielle'),
  ('privacy_controller_registration', '""'::jsonb, 'Responsable du traitement : immatriculation (RCCM)'),
  ('privacy_contact_email', '""'::jsonb, 'Point de contact confidentialité : e-mail'),
  ('privacy_contact_phone', '""'::jsonb, 'Point de contact confidentialité : téléphone'),
  ('privacy_dpo_name', '""'::jsonb, 'Correspondant à la protection des données (si désigné)')
on conflict (key) do nothing;

create or replace function public.set_privacy_setting(p_key text, p_value text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_compliance() then raise exception 'PP403: réservé au responsable conformité'; end if;
  if p_key not in ('privacy_controller_name', 'privacy_controller_address', 'privacy_controller_registration', 'privacy_contact_email', 'privacy_contact_phone', 'privacy_dpo_name') then
    raise exception 'PP422: paramètre inconnu';
  end if;
  update public.platform_settings set value = to_jsonb(left(btrim(coalesce(p_value, '')), 300)), updated_at = now(), updated_by = auth.uid() where key = p_key;
  perform public.log_audit('compliance.setting', 'setting', p_key, '{}'::jsonb);
end $$;
revoke execute on function public.set_privacy_setting(text, text) from public, anon;
grant execute on function public.set_privacy_setting(text, text) to authenticated;

create or replace function public.privacy_identity()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.platform_settings where key like 'privacy\_%';
$$;
grant execute on function public.privacy_identity() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Historique des connexions et alerte « nouvel appareil »
-- ---------------------------------------------------------------------------
create table if not exists public.login_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_hash text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  device_label text not null check (char_length(device_label) <= 80),
  new_device boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists login_events_user_idx on public.login_events (user_id, created_at desc);
alter table public.login_events enable row level security;
drop policy if exists "pp_login_events_own" on public.login_events;
create policy "pp_login_events_own" on public.login_events for select to authenticated using (user_id = auth.uid());
revoke all on public.login_events from anon, authenticated;
grant select on public.login_events to authenticated;

create or replace function public.record_login(p_device_hash text, p_device_label text)
returns boolean language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); known boolean; first_login boolean;
begin
  if uid is null then return false; end if;
  if p_device_hash !~ '^[0-9a-f]{64}$' then raise exception 'PP422: appareil invalide'; end if;
  select exists (select 1 from public.login_events where user_id = uid and device_hash = p_device_hash), not exists (select 1 from public.login_events where user_id = uid)
  into known, first_login;
  insert into public.login_events (user_id, device_hash, device_label, new_device) values (uid, p_device_hash, left(coalesce(p_device_label, 'Appareil'), 80), not known and not first_login);
  delete from public.login_events where user_id = uid and created_at < now() - interval '180 days';
  if not known and not first_login then
    insert into public.notifications (user_id, kind, title, body, link)
    values (uid, 'securite', 'Connexion depuis un nouvel appareil', 'Une connexion a eu lieu depuis : ' || left(coalesce(p_device_label, 'appareil inconnu'), 80) || '. Si ce n''est pas vous, changez votre mot de passe et déconnectez vos autres appareils.', '/compte/confidentialite');
  end if;
  return not known and not first_login;
end $$;
revoke execute on function public.record_login(text, text) from public, anon;
grant execute on function public.record_login(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Favoris (professionnels et établissements)
-- ---------------------------------------------------------------------------
create table if not exists public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('medecin', 'pharmacie', 'etablissement', 'laboratoire')),
  target_id uuid not null,
  label text not null check (char_length(btrim(label)) between 1 and 160),
  href text not null check (href ~ '^/[a-z0-9/_-]{1,200}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, kind, target_id)
);
alter table public.favorites enable row level security;
drop policy if exists "pp_favorites_own" on public.favorites;
create policy "pp_favorites_own" on public.favorites for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.favorites from anon, authenticated;
grant select, insert, delete on public.favorites to authenticated;

-- ---------------------------------------------------------------------------
-- ROLLBACK (à exécuter manuellement si nécessaire, dans cet ordre) :
--   drop table if exists public.favorites, public.login_events, public.third_party_recipients, public.data_processing_registry, public.consent_disputes, public.privacy_policy_versions, public.consent_purpose_versions, public.compliance_members cascade;
--   drop trigger if exists consent_records_chain on public.consent_records;
--   drop trigger if exists consent_purposes_archive on public.consent_purposes;
--   (les colonnes ajoutées à consent_records peuvent rester : elles sont facultatives)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 10. Langues : anglais et arabe (affichage de droite à gauche) ouverts à la traduction validée
-- ---------------------------------------------------------------------------
alter table public.ui_translations drop constraint if exists ui_translations_lang_check;
alter table public.ui_translations add constraint ui_translations_lang_check check (lang in ('bm', 'snk', 'ff', 'son', 'en', 'ar'));
