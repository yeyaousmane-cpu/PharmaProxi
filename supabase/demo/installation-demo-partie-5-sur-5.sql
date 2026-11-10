-- SantéProxi — installation du projet de DÉMONSTRATION, partie 5/5.
-- À exécuter dans l'ordre, dans l'éditeur SQL du projet « santeproxi-demo » UNIQUEMENT (jamais en production).

-- >>> 20261109000200_v025_confidentialite_consentements.sql
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


-- >>> 20261109000300_v025_centre_aide.sql
-- =============================================================================
-- SantéProxi 0.25.0 — Centre d'aide : catégories, articles, recherche, avis,
-- tickets de support avec échanges et suivi des délais.
-- Migration additive. Retour arrière :
--   drop table if exists public.support_ticket_messages, public.support_tickets, public.help_votes, public.help_articles, public.help_categories cascade;
-- =============================================================================

create table if not exists public.help_categories (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,60}$'),
  title text not null check (char_length(btrim(title)) between 2 and 80),
  description text not null check (char_length(description) <= 240),
  icon text not null default 'help' check (char_length(icon) <= 30),
  audience text not null default 'tous' check (audience in ('tous', 'patients', 'professionnels')),
  sort int not null default 100,
  active boolean not null default true
);
alter table public.help_categories enable row level security;
drop policy if exists "pp_help_categories_read" on public.help_categories;
create policy "pp_help_categories_read" on public.help_categories for select to anon, authenticated using (active or public.is_admin());
drop policy if exists "pp_help_categories_admin" on public.help_categories;
create policy "pp_help_categories_admin" on public.help_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.help_categories from anon;
grant select on public.help_categories to anon;
grant select, insert, update, delete on public.help_categories to authenticated;

create table if not exists public.help_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,90}$'),
  category_slug text not null references public.help_categories(slug) on update cascade,
  section text not null check (char_length(btrim(section)) between 2 and 80),
  title text not null check (char_length(btrim(title)) between 5 and 140),
  summary text not null check (char_length(btrim(summary)) between 10 and 300),
  body text not null check (char_length(btrim(body)) between 20 and 20000),
  keywords text not null default '' check (char_length(keywords) <= 500),
  status text not null default 'publie' check (status in ('brouillon', 'publie')),
  sort int not null default 100,
  helpful_yes int not null default 0,
  helpful_no int not null default 0,
  views int not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists help_articles_cat_idx on public.help_articles (category_slug, section, sort);
create index if not exists help_articles_trgm_idx on public.help_articles using gin (public.normalize_text(title || ' ' || keywords) extensions.gin_trgm_ops);
alter table public.help_articles enable row level security;
drop policy if exists "pp_help_articles_read" on public.help_articles;
create policy "pp_help_articles_read" on public.help_articles for select to anon, authenticated using (status = 'publie' or public.is_admin());
drop policy if exists "pp_help_articles_admin" on public.help_articles;
create policy "pp_help_articles_admin" on public.help_articles for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.help_articles from anon;
grant select on public.help_articles to anon;
grant select, insert, update, delete on public.help_articles to authenticated;

create or replace function public.touch_help_article()
returns trigger language plpgsql set search_path = public as $$
begin
  if (new.title, new.summary, new.body, new.section, new.category_slug, new.keywords, new.status)
     is distinct from (old.title, old.summary, old.body, old.section, old.category_slug, old.keywords, old.status) then
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists touch_help_article on public.help_articles;
create trigger touch_help_article before update on public.help_articles for each row execute function public.touch_help_article();

-- Recherche : insensible aux accents et à la casse, tolérante aux fautes (trigrammes), synonymes via « keywords »
create or replace function public.search_help(p_q text, p_limit int default 20)
returns table (slug text, title text, summary text, category_slug text, section text, score real)
language sql stable security definer set search_path = public as $$
  with q as (select btrim(public.normalize_text(p_q)) as t)
  select a.slug, a.title, a.summary, a.category_slug, a.section,
    (greatest(extensions.similarity(public.normalize_text(a.title), q.t), extensions.word_similarity(q.t, public.normalize_text(a.title || ' ' || a.keywords)))
     + case when public.normalize_text(a.title) like '%' || q.t || '%' then 0.6 else 0 end
     + case when public.normalize_text(a.keywords) like '%' || q.t || '%' then 0.4 else 0 end
     + case when public.normalize_text(a.body) like '%' || q.t || '%' then 0.2 else 0 end)::real as score
  from public.help_articles a, q
  where a.status = 'publie' and char_length(q.t) >= 2
    and (public.normalize_text(a.title || ' ' || a.keywords || ' ' || a.summary || ' ' || a.body) like '%' || q.t || '%'
         or extensions.word_similarity(q.t, public.normalize_text(a.title || ' ' || a.keywords)) > 0.35)
  order by score desc, a.sort
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
grant execute on function public.search_help(text, int) to anon, authenticated;

-- Avis « Cet article vous a-t-il aidé ? » : une voix par visiteur et par article (clé anonymisée calculée côté serveur)
create table if not exists public.help_votes (
  article_id uuid not null references public.help_articles(id) on delete cascade,
  voter text not null check (voter ~ '^[0-9a-f]{64}$'),
  useful boolean not null,
  created_at timestamptz not null default now(),
  primary key (article_id, voter)
);
alter table public.help_votes enable row level security;
revoke all on public.help_votes from anon, authenticated;

create or replace function public.vote_help_article(p_slug text, p_useful boolean, p_voter text)
returns boolean language plpgsql security definer set search_path = public as $$
declare aid uuid;
begin
  if p_voter !~ '^[0-9a-f]{64}$' then raise exception 'PP422: vote invalide'; end if;
  select id into aid from public.help_articles where slug = p_slug and status = 'publie';
  if aid is null then raise exception 'PP404: article introuvable'; end if;
  insert into public.help_votes (article_id, voter, useful) values (aid, p_voter, p_useful) on conflict do nothing;
  if not found then return false; end if;
  update public.help_articles set helpful_yes = helpful_yes + (case when p_useful then 1 else 0 end), helpful_no = helpful_no + (case when p_useful then 0 else 1 end) where id = aid;
  return true;
end $$;
grant execute on function public.vote_help_article(text, boolean, text) to anon, authenticated;

create or replace function public.count_help_view(p_slug text)
returns void language sql security definer set search_path = public as $$
  update public.help_articles set views = views + 1 where slug = p_slug and status = 'publie';
$$;
grant execute on function public.count_help_view(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Tickets de support
-- -----------------------------------------------------------------------------
create sequence if not exists public.support_ticket_seq start 1001;
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('SP-' || lpad(nextval('public.support_ticket_seq')::text, 6, '0')),
  user_id uuid references public.profiles(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  email text check (email is null or (char_length(email) <= 200 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  phone text check (phone is null or char_length(phone) <= 30),
  category_slug text references public.help_categories(slug) on update cascade on delete set null,
  subject text not null check (char_length(btrim(subject)) between 4 and 160),
  status text not null default 'nouveau' check (status in ('nouveau', 'en_cours', 'attente_infos', 'resolu', 'ferme')),
  priority text not null default 'normale' check (priority in ('basse', 'normale', 'haute', 'urgente')),
  assigned_to uuid references public.profiles(id) on delete set null,
  page_url text check (char_length(coalesce(page_url, '')) <= 300),
  first_response_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_id is not null or email is not null or phone is not null)
);
create index if not exists support_tickets_status_idx on public.support_tickets (status, priority, created_at);
create index if not exists support_tickets_user_idx on public.support_tickets (user_id, created_at desc);

create table if not exists public.support_ticket_messages (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  from_staff boolean not null default false,
  internal boolean not null default false,
  body text not null check (char_length(btrim(body)) between 2 and 5000),
  created_at timestamptz not null default now()
);
create index if not exists support_ticket_messages_idx on public.support_ticket_messages (ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
drop policy if exists "pp_tickets_read" on public.support_tickets;
create policy "pp_tickets_read" on public.support_tickets for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "pp_ticket_msgs_read" on public.support_ticket_messages;
create policy "pp_ticket_msgs_read" on public.support_ticket_messages for select to authenticated using (
  public.is_admin() or (not internal and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())));
revoke all on public.support_tickets, public.support_ticket_messages from anon, authenticated;
grant select on public.support_tickets, public.support_ticket_messages to authenticated;

-- Délai cible de première réponse (heures) selon la priorité
create or replace function public.ticket_sla_hours(p_priority text) returns int language sql immutable as $$
  select case p_priority when 'urgente' then 4 when 'haute' then 24 when 'normale' then 48 else 72 end;
$$;
grant execute on function public.ticket_sla_hours(text) to authenticated;

create or replace function public.create_support_ticket(p_name text, p_email text, p_phone text, p_category text, p_subject text, p_body text, p_page text default null)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t public.support_tickets; v_email text := nullif(lower(btrim(coalesce(p_email, ''))), ''); v_phone text := nullif(btrim(coalesce(p_phone, '')), ''); a record; prio text := 'normale';
begin
  if uid is null and v_email is null and v_phone is null then raise exception 'PP422: indiquez un e-mail ou un téléphone pour que nous puissions vous répondre'; end if;
  if char_length(btrim(coalesce(p_body, ''))) < 10 then raise exception 'PP422: décrivez votre demande en quelques mots (10 caractères minimum)'; end if;
  if char_length(btrim(coalesce(p_subject, ''))) < 4 then raise exception 'PP422: indiquez un objet'; end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'PP422: indiquez votre nom'; end if;
  if (select count(*) from public.support_tickets where created_at > now() - interval '1 hour'
      and ((uid is not null and user_id = uid) or (v_email is not null and email = v_email) or (v_phone is not null and phone = v_phone))) >= 5 then
    raise exception 'PP429: trop de demandes envoyées, réessayez plus tard';
  end if;
  if p_category in ('urgences', 'securite-confidentialite') then prio := 'haute'; end if;
  insert into public.support_tickets (user_id, name, email, phone, category_slug, subject, priority, page_url)
  values (uid, btrim(p_name), v_email, v_phone, (select slug from public.help_categories where slug = p_category), btrim(p_subject), prio, left(p_page, 300))
  returning * into t;
  insert into public.support_ticket_messages (ticket_id, author_id, body) values (t.id, uid, btrim(p_body));
  for a in select ur.user_id from public.user_roles ur where ur.role = 'admin' loop
    insert into public.notifications (user_id, kind, title, body, link)
    values (a.user_id, 'support', 'Nouvelle demande d''aide ' || t.reference, left(t.subject, 140), '/admin/aide/tickets/' || t.id);
  end loop;
  return t.reference;
end $$;
grant execute on function public.create_support_ticket(text, text, text, text, text, text, text) to anon, authenticated;

create or replace function public.reply_support_ticket(p_ticket uuid, p_body text, p_internal boolean default false, p_status text default null, p_priority text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t public.support_tickets; staff boolean := public.is_admin();
begin
  if uid is null then raise exception 'PP401: connexion requise'; end if;
  select * into t from public.support_tickets where id = p_ticket for update;
  if not found or (not staff and t.user_id is distinct from uid) then raise exception 'PP404: demande introuvable'; end if;
  if p_status is not null and p_status not in ('nouveau', 'en_cours', 'attente_infos', 'resolu', 'ferme') then raise exception 'PP422: statut invalide'; end if;
  if p_priority is not null and p_priority not in ('basse', 'normale', 'haute', 'urgente') then raise exception 'PP422: priorité invalide'; end if;
  if not staff and t.status = 'ferme' then raise exception 'PP409: cette demande est fermée, créez-en une nouvelle'; end if;
  if nullif(btrim(coalesce(p_body, '')), '') is not null then
    insert into public.support_ticket_messages (ticket_id, author_id, from_staff, internal, body) values (t.id, uid, staff, staff and coalesce(p_internal, false), btrim(p_body));
  end if;
  update public.support_tickets set
    status = case when staff then coalesce(p_status, case when t.status = 'nouveau' then 'en_cours' else t.status end)
                  else case when t.status in ('attente_infos', 'resolu') then 'en_cours' else t.status end end,
    priority = case when staff then coalesce(p_priority, t.priority) else t.priority end,
    assigned_to = case when staff and t.assigned_to is null then uid else t.assigned_to end,
    first_response_at = case when staff and not coalesce(p_internal, false) and t.first_response_at is null and nullif(btrim(coalesce(p_body, '')), '') is not null then now() else t.first_response_at end,
    resolved_at = case when staff and p_status in ('resolu', 'ferme') then coalesce(t.resolved_at, now()) when staff and p_status is not null then null else t.resolved_at end,
    updated_at = now()
  where id = t.id;
  if staff and t.user_id is not null and not coalesce(p_internal, false) then
    insert into public.notifications (user_id, kind, title, body, link)
    values (t.user_id, 'support', 'Réponse à votre demande ' || t.reference, left(t.subject, 140), '/compte/aide/' || t.id);
  end if;
  if staff then perform public.log_audit('support.reply', 'support_ticket', t.id::text, jsonb_build_object('status', p_status, 'internal', coalesce(p_internal, false))); end if;
end $$;
revoke execute on function public.reply_support_ticket(uuid, text, boolean, text, text) from public, anon;
grant execute on function public.reply_support_ticket(uuid, text, boolean, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Contenu initial : 14 catégories, articles décrivant uniquement des fonctions existantes
-- -----------------------------------------------------------------------------
insert into public.help_categories (slug, title, description, icon, audience, sort) values
  ('mon-compte', 'Mon compte SantéProxi', 'Créer son compte, se connecter, gérer ses informations.', 'user', 'tous', 10),
  ('rendez-vous', 'Mes rendez-vous', 'Trouver un professionnel, réserver, modifier ou annuler.', 'calendar', 'patients', 20),
  ('pharmacies-medicaments', 'Pharmacies et médicaments', 'Trouver une pharmacie, un médicament, réserver.', 'pill', 'patients', 30),
  ('laboratoires', 'Laboratoires et analyses', 'Trouver un laboratoire, faire une analyse, recevoir ses résultats.', 'flask', 'patients', 40),
  ('donnees-sante', 'Mes données de santé', 'Dossier santé, documents médicaux, confidentialité.', 'file-lock', 'patients', 50),
  ('proches', 'Mes proches et ma famille', 'Gérer les rendez-vous de vos enfants et de vos parents.', 'users', 'patients', 60),
  ('teleconsultation', 'Téléconsultation', 'Où en est la téléconsultation sur SantéProxi.', 'video', 'patients', 70),
  ('etablissements', 'Établissements de santé', 'Cliniques, hôpitaux, centres de santé et centres spécialisés.', 'hospital', 'tous', 80),
  ('urgences', 'Urgences et informations importantes', 'Numéros d''urgence, pharmacies de garde, premiers secours.', 'siren', 'tous', 90),
  ('securite-confidentialite', 'Sécurité et confidentialité', 'Protéger son compte, gérer ses données et ses consentements.', 'shield', 'tous', 100),
  ('paiements', 'Paiements et facturation', 'Comment se règlent les réservations et les services.', 'wallet', 'tous', 110),
  ('utilisation', 'Utilisation de SantéProxi', 'Installer l''application, langues, connexion faible.', 'smartphone', 'tous', 120),
  ('professionnels', 'Assistance aux professionnels de santé', 'Médecins, infirmiers : inscription, fiche, agenda.', 'stethoscope', 'professionnels', 130),
  ('structures', 'Pharmacies, laboratoires et établissements', 'Inscrire sa structure, gérer ses stocks, ses tarifs et son équipe.', 'building', 'professionnels', 140)
on conflict (slug) do nothing;

insert into public.help_articles (slug, category_slug, section, title, summary, keywords, sort, body) values
('creer-mon-compte', 'mon-compte', 'Créer et gérer mon compte', 'Comment créer mon compte SantéProxi ?', 'Créez gratuitement votre compte patient en quelques minutes.', 'inscription inscrire ouvrir compte s''inscrire nouveau compte', 10, $b$
La recherche de pharmacies, de médicaments et de professionnels fonctionne **sans compte**. Un compte est utile pour réserver, prendre rendez-vous et garder votre dossier santé.

1. Cliquez sur **Connexion**, puis sur **Créer un compte**.
2. Indiquez votre nom, votre adresse e-mail, éventuellement votre téléphone, et choisissez un mot de passe.
3. Acceptez les conditions d'utilisation et validez.

Le compte créé est un compte **patient**. Les professionnels de santé suivent une démarche spécifique : voir « Je suis professionnel de santé : comment m'inscrire ? ».
$b$),
('mot-de-passe-oublie', 'mon-compte', 'Connexion et identifiants', 'J''ai oublié mon mot de passe, que faire ?', 'Recevez par e-mail un lien pour choisir un nouveau mot de passe.', 'mot de passe oublie perdu reinitialiser connexion impossible mdp', 20, $b$
1. Ouvrez la page de **connexion**.
2. Cliquez sur **Mot de passe oublié ?**
3. Saisissez l'**adresse e-mail** de votre compte.
4. Ouvrez l'e-mail reçu (pensez à vérifier les courriers indésirables) et cliquez sur le lien.
5. Choisissez un nouveau mot de passe, puis connectez-vous.

La réinitialisation se fait aujourd'hui **par e-mail uniquement**. Si vous n'avez plus accès à votre adresse e-mail, contactez l'équipe depuis le centre d'aide.
$b$),
('modifier-mes-informations', 'mon-compte', 'Informations personnelles', 'Comment modifier mes informations personnelles ?', 'Nom, téléphone, région et adresses se modifient depuis Mon compte.', 'modifier nom telephone adresse profil changer informations', 30, $b$
Ouvrez **Mon compte** : vous pouvez y modifier votre nom, votre téléphone, votre région et commune préférées, et vos adresses.

Pour changer de mot de passe : **Mon compte › Sécurité**.
$b$),
('supprimer-mon-compte', 'mon-compte', 'Créer et gérer mon compte', 'Comment supprimer mon compte ?', 'La suppression se fait en bas de la page Mon compte.', 'supprimer effacer compte desinscrire fermer compte', 40, $b$
En bas de la page **Mon compte**, utilisez **Supprimer mon compte** et confirmez.

Avant de supprimer votre compte, vous pouvez **télécharger vos données** depuis *Mes données et confidentialité*.
$b$),
('trouver-un-medecin', 'rendez-vous', 'Trouver un professionnel de santé', 'Comment trouver un médecin ou un spécialiste ?', 'Cherchez par spécialité, par nom et par ville.', 'medecin docteur specialiste trouver chercher pediatre gynecologue', 10, $b$
1. Ouvrez **Médecins** depuis le menu.
2. Choisissez une **spécialité** ou tapez un nom.
3. Précisez votre région ou votre commune.
4. Ouvrez la fiche d'un médecin pour voir ses lieux de consultation, ses jours et la possibilité de prendre rendez-vous.

Une fiche indique la date de la dernière confirmation des informations.
$b$),
('prendre-rendez-vous', 'rendez-vous', 'Prendre un rendez-vous', 'Comment prendre rendez-vous ?', 'Réservez un créneau ou envoyez une demande au cabinet.', 'rendez-vous rdv reserver prendre consultation creneau', 20, $b$
Depuis la fiche d'un médecin, choisissez **Prendre rendez-vous**. Selon le cabinet :

- **Réservation immédiate** : vous choisissez un créneau libre, le rendez-vous est confirmé.
- **Demande à confirmer** : le cabinet accepte, propose un autre horaire ou refuse. Une demande sans réponse sous **48 heures** expire automatiquement : vous pouvez alors appeler le cabinet ou refaire une demande.

Vous devez être connecté(e). Vous pouvez prendre rendez-vous pour un proche (voir *Mes proches et ma famille*).
$b$),
('annuler-deplacer-rendez-vous', 'rendez-vous', 'Modifier ou annuler un rendez-vous', 'Comment annuler ou déplacer un rendez-vous ?', 'Depuis Mes rendez-vous, annulez ou choisissez un autre créneau.', 'annuler deplacer modifier changer rendez-vous rdv report', 30, $b$
1. Ouvrez **Mon compte › Mes rendez-vous**.
2. Sur le rendez-vous concerné, choisissez **Déplacer** (si le cabinet le permet) ou **Annuler**.

Prévenez le plus tôt possible : le créneau libéré peut servir à un autre patient.
$b$),
('rappels-rendez-vous', 'rendez-vous', 'Notifications et rappels', 'Comment recevoir un rappel de mon rendez-vous ?', 'Notifications dans votre compte et ajout à l''agenda du téléphone.', 'rappel notification agenda calendrier oubli', 40, $b$
Les changements sur vos rendez-vous apparaissent dans vos **notifications**. Pour un rendez-vous confirmé, le bouton **Ajouter à mon agenda** télécharge un fichier à ouvrir avec l'agenda de votre téléphone ; il inclut un rappel deux heures avant.

Réglez vos préférences dans **Mon compte › Notifications**.
$b$),
('alerte-creneau-libere', 'rendez-vous', 'Prendre un rendez-vous', 'Être prévenu(e) quand un créneau se libère', 'Inscrivez-vous sur la liste d''attente d''un médecin.', 'liste attente creneau libre complet disponibilite', 50, $b$
Quand aucun créneau ne convient, inscrivez-vous à l'**alerte de créneau libéré** sur la fiche du médecin. Vous êtes notifié(e) si un créneau se libère. Retrouvez vos alertes dans **Mes rendez-vous**.
$b$),
('trouver-medicament', 'pharmacies-medicaments', 'Rechercher un médicament', 'Comment trouver un médicament près de chez moi ?', 'Cherchez par nom commercial, générique ou principe actif.', 'medicament trouver disponible stock chercher paracetamol generique', 10, $b$
1. Tapez le nom du médicament dans la barre de recherche (nom commercial, générique ou principe actif). Vous pouvez aussi utiliser la recherche vocale.
2. Précisez votre région, commune ou quartier.
3. Les pharmacies qui **déclarent** l'avoir s'affichent, avec la **date de la dernière mise à jour** du stock.

Une disponibilité déclarée n'est pas une garantie : en cas de doute, appelez la pharmacie avant de vous déplacer.
$b$),
('pharmacie-de-garde', 'pharmacies-medicaments', 'Trouver une pharmacie', 'Comment trouver une pharmacie de garde ?', 'La page Garde liste les pharmacies ouvertes la nuit et le week-end.', 'garde nuit week-end dimanche ouverte ferie', 20, $b$
Ouvrez **Pharmacies de garde** depuis l'accueil ou le menu. Les gardes affichées sont celles **publiées** sur SantéProxi ; si aucune garde n'apparaît pour votre zone, renseignez-vous auprès des pharmacies proches ou des autorités sanitaires locales.
$b$),
('reserver-medicament', 'pharmacies-medicaments', 'Commandes et réservations', 'Comment réserver un médicament ?', 'Envoyez une demande de réservation à une pharmacie partenaire.', 'reserver commande commander retrait pharmacie', 30, $b$
Sur une pharmacie qui accepte les réservations, ajoutez les médicaments puis envoyez votre demande. La pharmacie confirme ou non la disponibilité. Suivez l'avancement dans **Mon compte › Mes commandes**.

Les médicaments soumis à prescription restent délivrés selon les règles de la pharmacie. SantéProxi ne recommande aucun médicament : demandez conseil à votre pharmacien.
$b$),
('medicament-suspect', 'pharmacies-medicaments', 'Informations importantes', 'Comment signaler un médicament suspect ?', 'Utilisez la page Signaler un médicament suspect.', 'faux contrefait suspect signaler qualite rue', 40, $b$
Ouvrez **Signaler un médicament suspect** (pied de page) et décrivez le produit et le lieu d'achat. N'achetez pas de médicaments hors des pharmacies : leur qualité et leur conservation ne sont pas garanties.
$b$),
('trouver-laboratoire', 'laboratoires', 'Trouver un laboratoire', 'Comment trouver un laboratoire d''analyses ?', 'La page Laboratoires liste les laboratoires et les examens.', 'laboratoire analyse examen prise de sang bilan', 10, $b$
Ouvrez **Laboratoires et examens**. Cherchez un examen ou un laboratoire près de chez vous. Les tarifs affichés sont ceux **communiqués par les laboratoires**. Le **lexique des analyses** explique les principaux examens.
$b$),
('prelevement-domicile', 'laboratoires', 'Réaliser une analyse', 'Comment demander une prise de sang à domicile ?', 'Certains laboratoires proposent le prélèvement à domicile.', 'domicile prelevement prise de sang infirmier maison', 20, $b$
Si un laboratoire propose ce service, faites la demande depuis sa fiche. Suivez vos demandes dans **Mon compte › Prises de sang à domicile**. Le laboratoire vous contacte pour fixer le rendez-vous.
$b$),
('resultats-analyses', 'laboratoires', 'Résultats d''analyses', 'Où trouver mes résultats d''analyses ?', 'Les résultats déposés par le laboratoire apparaissent dans votre compte.', 'resultats analyses bilan recevoir consulter', 30, $b$
Quand le laboratoire auprès duquel vous avez fait une demande dépose vos résultats sur SantéProxi, ils apparaissent dans **Mon compte › Résultats**. Seuls vous et ce laboratoire y ont accès. Pour leur interprétation, adressez-vous à votre médecin.
$b$),
('dossier-sante', 'donnees-sante', 'Comprendre mon espace santé', 'À quoi sert mon dossier santé ?', 'Rangez vos documents, traitements, mesures et votre fiche d''urgence.', 'dossier sante carnet documents ordonnance vaccins traitement', 10, $b$
Dans **Ma santé › Mon dossier**, vous pouvez enregistrer vos documents médicaux (ordonnances, comptes rendus), vos traitements, vos mesures et votre **fiche d'urgence**. Ces informations ne sont lisibles que par vous, et par les personnes à qui vous ouvrez un accès.
$b$),
('telecharger-mes-donnees', 'donnees-sante', 'Confidentialité', 'Comment télécharger ou faire supprimer mes données ?', 'Le centre « Mes données et confidentialité » permet l''export et les demandes.', 'donnees export telecharger suppression rgpd apdp acces rectification', 20, $b$
Ouvrez **Mon compte › Mes données et confidentialité** :

- **Télécharger mes données** : un fichier contenant les données de votre compte.
- **Faire une demande** : accès, rectification, suppression ou opposition. L'équipe vous répond dans votre compte.
- **Mes consentements** : accordez ou retirez chaque consentement séparément.

Retirer un consentement ne supprime pas automatiquement les données déjà enregistrées : vous pouvez les supprimer séparément.
$b$),
('rendez-vous-pour-un-proche', 'proches', 'Gérer mes proches', 'Comment prendre rendez-vous pour mon enfant ou un parent ?', 'Ajoutez vos proches dans votre compte, puis choisissez-les lors de la réservation.', 'enfant parent proche famille bebe rendez-vous pour autre personne', 10, $b$
1. Ouvrez **Mon compte › Mes proches** et ajoutez la personne (seuls son nom et, si vous le souhaitez, son téléphone sont enregistrés).
2. Lors d'une prise de rendez-vous, choisissez pour qui est le rendez-vous.
$b$),
('teleconsultation-disponibilite', 'teleconsultation', 'Informations', 'La téléconsultation est-elle disponible ?', 'Pas encore : elle exige un hébergement certifié des données de santé.', 'teleconsultation video consultation a distance en ligne', 10, $b$
**Non, la téléconsultation n'est pas encore proposée sur SantéProxi.** Elle sera ouverte seulement lorsque les conditions de sécurité et de réglementation seront réunies (hébergement adapté aux données de santé, accords avec les professionnels).

En attendant, vous pouvez prendre rendez-vous en cabinet depuis la fiche d'un médecin.
$b$),
('trouver-etablissement', 'etablissements', 'Trouver un établissement', 'Comment trouver une clinique, un hôpital ou un centre spécialisé ?', 'Utilisez Cliniques, Urgences et Centres spécialisés.', 'clinique hopital centre sante cscom specialise dialyse', 10, $b$
- **Cliniques** : liste des cliniques et polycliniques avec leurs services.
- **Urgences** : services d'urgence et ambulances proches.
- **Centres spécialisés** : établissements disposant d'un service particulier, avec la source de l'information.

Chaque fiche affiche la date de dernière confirmation de ses informations.
$b$),
('numeros-urgence', 'urgences', 'Urgences', 'Quels numéros appeler en cas d''urgence ?', 'La page SOS Santé regroupe les numéros d''urgence avec appel direct.', 'urgence numero appeler pompier police ambulance secours sos', 10, $b$
Ouvrez **SOS Santé** (bouton rouge en haut de chaque page). Vous y trouvez les numéros d'urgence, un bouton **Appeler maintenant** et un bouton **Copier** pour chaque numéro, avec l'état de leur vérification.

En cas d'urgence vitale, contactez immédiatement les services de secours ou rendez-vous au service d'urgence le plus proche. SantéProxi ne remplace pas les services de secours et n'envoie pas d'ambulance.
$b$),
('double-authentification', 'securite-confidentialite', 'Protéger mon compte', 'Comment activer la double authentification ?', 'Ajoutez un code à usage unique pour sécuriser votre compte.', 'double authentification 2fa code securite application authentificateur', 10, $b$
1. Ouvrez **Mon compte › Sécurité**.
2. Suivez les étapes pour associer une application d'authentification (codes à 6 chiffres).
3. À chaque connexion, saisissez le code affiché par l'application.

Vous pouvez aussi **déconnecter vos autres appareils** depuis *Mes données et confidentialité*.
$b$),
('message-suspect', 'securite-confidentialite', 'Protéger mon compte', 'J''ai reçu un message suspect au nom de SantéProxi', 'SantéProxi ne vous demande jamais votre mot de passe.', 'arnaque phishing fraude message suspect mot de passe faux', 20, $b$
SantéProxi ne vous demandera **jamais** votre mot de passe ni un code reçu par e-mail. Ne cliquez pas sur le lien, ne répondez pas, et signalez-le à l'équipe depuis le centre d'aide. Si vous avez saisi votre mot de passe, changez-le immédiatement dans **Mon compte › Sécurité**.
$b$),
('paiement-reservations', 'paiements', 'Paiements', 'Comment payer une réservation de médicaments ?', 'Le paiement se fait auprès de la pharmacie.', 'payer paiement prix orange money moov argent tarif', 10, $b$
SantéProxi ne prélève pas de paiement en ligne pour les médicaments : vous **réglez directement la pharmacie**, selon les moyens qu'elle accepte. Les prix affichés sont ceux communiqués par les pharmacies.

La recherche et l'utilisation de SantéProxi sont **gratuites** pour les patients.
$b$),
('installer-application', 'utilisation', 'Utiliser SantéProxi', 'Comment installer SantéProxi sur mon téléphone ?', 'Ajoutez le site à l''écran d''accueil : il fonctionne comme une application.', 'installer application telephone ecran accueil android iphone hors ligne', 10, $b$
- **Android (Chrome)** : menu ⋮ › **Ajouter à l'écran d'accueil** ou **Installer l'application**.
- **iPhone (Safari)** : bouton Partager › **Sur l'écran d'accueil**.

Certaines pages (SOS, premiers secours, urgences) restent lisibles sans Internet une fois ouvertes une première fois.
$b$),
('changer-langue', 'utilisation', 'Utiliser SantéProxi', 'Comment changer de langue ?', 'Choisissez votre langue dans le menu ; certaines traductions sont en cours.', 'langue bambara francais traduction audio soninke peul', 20, $b$
Utilisez le sélecteur de langue du menu. Seules les traductions **validées** par des locuteurs natifs s'affichent ; les textes non encore traduits restent en français. Des **guides audio** enregistrés en langues nationales sont proposés sur certaines pages.
$b$),
('inscription-professionnel', 'professionnels', 'Rejoindre SantéProxi', 'Je suis professionnel de santé : comment m''inscrire ?', 'Créez un compte, puis l''équipe vérifie votre autorisation d''exercer.', 'medecin inscription professionnel infirmier sage-femme fiche ordre', 10, $b$
1. Créez un compte SantéProxi normal.
2. Ouvrez **Vous êtes professionnel de santé ?** et envoyez votre demande avec la référence de votre autorisation (inscription à l'Ordre, arrêté ou agrément).
3. L'équipe vérifie auprès des registres officiels et autorise votre compte ; vous êtes notifié(e) pour compléter votre fiche.

Votre fiche est publiée après dépôt et vérification de vos justificatifs. Les informations de vérification ne sont pas publiées.
$b$),
('inscrire-pharmacie', 'structures', 'Inscrire ma structure', 'Comment inscrire ma pharmacie, mon laboratoire ou ma clinique ?', 'Demande depuis l''espace professionnels, puis vérification des justificatifs.', 'pharmacie inscrire laboratoire clinique structure partenaire agrement', 10, $b$
Depuis **Vous êtes professionnel de santé ?**, choisissez le type de structure et envoyez votre demande avec vos justificatifs. Après vérification, vous accédez à votre espace : fiche publique, horaires, équipe, et selon le type de structure, stocks, réservations, examens et tarifs.
$b$),
('mettre-a-jour-stocks', 'structures', 'Gérer ma pharmacie', 'Comment mettre à jour les stocks de ma pharmacie ?', 'Depuis l''espace pharmacien, par saisie ou import d''un fichier.', 'stock mise a jour import csv fichier disponibilite pharmacien', 20, $b$
Dans l'**espace pharmacien**, mettez à jour un produit en quelques gestes ou importez un fichier (CSV) de votre logiciel. La date de mise à jour s'affiche aux patients : des stocks récents inspirent confiance et évitent des déplacements inutiles.
$b$)
on conflict (slug) do nothing;


-- >>> v0.26 — Conformité et consentements (20261109000400)
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


-- >>> v0.27 — Validation médicale, prévention, langues (20261110000100)
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


-- >>> v0.27 — Acteurs de démonstration (20261110000200)
-- =============================================================================
-- SantéProxi 0.27 — Démonstration : acteurs supplémentaires (laboratoire, institution, validateur médical,
-- auditeur conformité) et données fictives associées.
-- Ces fonctions ne font rien en production : elles refusent de s'exécuter si le réglage
-- « demo_environment » n'est pas activé, et ce réglage n'existe que dans le projet de démonstration.
-- Réservées au rôle service (aucun utilisateur ne peut les appeler).
-- =============================================================================

create or replace function public.demo_guard() returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce((select value from public.platform_settings where key = 'demo_environment'), 'false'::jsonb) <> 'true'::jsonb then
    raise exception 'PP403: fonction réservée à l''environnement de démonstration';
  end if;
end $$;
revoke execute on function public.demo_guard() from public, anon, authenticated;

create or replace function public.demo_extra_install(p_users jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare lab_id uuid; v_region uuid; n_exams int; v_patient uuid := (p_users ->> 'customer')::uuid;
begin
  perform public.demo_guard();
  select id into v_region from public.regions order by (name ilike '%bamako%') desc, name limit 1;

  -- Laboratoire fictif et son responsable
  select id into lab_id from public.facility_listings where source = 'démonstration' and kind = 'laboratoire' limit 1;
  if lab_id is null then
    insert into public.facility_listings (name, kind, category_label, region_id, city_label, address, latitude, longitude, source, is_published)
    values ('Laboratoire Démo Hamdallaye (démonstration)', 'laboratoire', 'Laboratoire d''analyses', v_region, 'Bamako', 'Adresse fictive — Hamdallaye ACI', 12.6330, -8.0270, 'démonstration', true)
    returning id into lab_id;
  end if;
  if p_users ? 'lab' then
    insert into public.facility_members (facility_id, user_id, role) values (lab_id, (p_users ->> 'lab')::uuid, 'responsable') on conflict do nothing;
  end if;
  insert into public.facility_exams (facility_id, exam_id, price_xof, price_note, delay, source, verified_at)
  select lab_id, e.id, (array[3000, 5000, 7500, 10000, 12500, 15000])[1 + (row_number() over (order by e.name))::int % 6], 'Tarif fictif de démonstration', '24 h', 'démonstration', now()
  from (select id, name from public.medical_exams where is_active order by name limit 8) e
  on conflict do nothing;
  get diagnostics n_exams = row_count;

  -- Institution sanitaire fictive
  if p_users ? 'institution' then
    insert into public.authority_members (user_id, scope, organisation, title)
    values ((p_users ->> 'institution')::uuid, 'ministere', 'Direction de démonstration (fictive)', 'Chargé(e) de suivi — compte de démonstration')
    on conflict (user_id) do nothing;
  end if;

  -- Validateur médical et rédactrice (bibliothèque santé)
  if p_users ? 'validator' then
    insert into public.health_staff (user_id, role, display_name, credentials)
    values ((p_users ->> 'validator')::uuid, 'validator', 'Dr Démo Validatrice (fictive)', 'Compte de démonstration — aucune qualification réelle')
    on conflict do nothing;
  end if;

  -- Auditeur conformité (lecture seule)
  if p_users ? 'auditor' then
    insert into public.compliance_members (user_id, role) values ((p_users ->> 'auditor')::uuid, 'auditeur') on conflict (user_id) do nothing;
  end if;

  -- Calendrier de prévention : exemples clairement fictifs
  if not exists (select 1 from public.prevention_events where source_name = 'Donnée fictive de démonstration') then
    insert into public.prevention_events (kind, title, description, starts_on, ends_on, region_id, place, organizer, source_name, public_concerned, is_free, status)
    values
      ('depistage', '(Démonstration) Journée fictive de dépistage du diabète', 'Exemple fictif pour découvrir le calendrier de prévention.', current_date + 7, current_date + 7, v_region, 'Lieu fictif', 'Organisme fictif', 'Donnée fictive de démonstration', 'Adultes', true, 'publie'),
      ('vaccination', '(Démonstration) Semaine fictive de vaccination', 'Exemple fictif : aucune campagne réelle n''est annoncée ici.', current_date + 14, current_date + 20, v_region, null, 'Organisme fictif', 'Donnée fictive de démonstration', 'Enfants de 0 à 5 ans', true, 'publie'),
      ('journee_mondiale', '(Démonstration) Journée mondiale — exemple', 'Exemple de journée de sensibilisation.', current_date + 30, null, null, null, 'Organisme fictif', 'Donnée fictive de démonstration', null, null, 'publie');
  end if;

  -- Notifications d'exemple pour le patient
  if v_patient is not null and not exists (select 1 from public.notifications where user_id = v_patient and title like '(Démo)%') then
    insert into public.notifications (user_id, kind, title, body, link) values
      (v_patient, 'info', '(Démo) Bienvenue dans la démonstration', 'Toutes les données de ce compte sont fictives.', '/demo'),
      (v_patient, 'info', '(Démo) Une journée de dépistage approche', 'Consultez le calendrier de prévention.', '/prevention');
  end if;

  return jsonb_build_object('laboratoire', lab_id, 'analyses_tarifees', n_exams);
end $$;
revoke execute on function public.demo_extra_install(jsonb) from public, anon, authenticated;
grant execute on function public.demo_extra_install(jsonb) to service_role;

create or replace function public.demo_extra_uninstall()
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform public.demo_guard();
  delete from public.prevention_events where source_name = 'Donnée fictive de démonstration';
  delete from public.notifications where title like '(Démo)%';
  delete from public.facility_listings where source = 'démonstration';
  get diagnostics n = row_count;
  return jsonb_build_object('etablissements_supprimes', n);
end $$;
revoke execute on function public.demo_extra_uninstall() from public, anon, authenticated;
grant execute on function public.demo_extra_uninstall() to service_role;


-- >>> Maintenance planifiée toutes les 10 minutes (pg_cron)
create extension if not exists pg_cron;
select cron.schedule('pharmaproxi-maintenance', '*/10 * * * *', $$select public.run_maintenance()$$);
