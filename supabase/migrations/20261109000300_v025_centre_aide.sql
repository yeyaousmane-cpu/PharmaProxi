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
