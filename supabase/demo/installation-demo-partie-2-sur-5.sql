-- SantéProxi — installation du projet de DÉMONSTRATION, partie 2/5.
-- À exécuter dans l'ordre, dans l'éditeur SQL du projet « santeproxi-demo » UNIQUEMENT (jamais en production).

-- >>> 20261027000100_medical_directory.sql
-- ============================================================================
-- PharmaProxi — Migration 0011 : annuaire des médecins spécialistes et des
-- cliniques (module M7 du cahier des charges v2.0).
--
-- Principes :
--   * information, pas publicité : aucun classement, aucune notation ;
--   * professionnels vérifiés sur pièces avant toute publication ;
--   * consentement explicite et daté du médecin avant publication ;
--   * coordonnées professionnelles uniquement ; aucune donnée inventée ;
--   * information datée : une fiche non confirmée depuis 180 jours n'est plus
--     publiée (seuils réglables) ;
--   * toutes les écritures sensibles passent par des fonctions contrôlées.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Paramètres
-- ---------------------------------------------------------------------------
insert into public.platform_settings (key, value, description) values
  ('directory_fresh_days', '90', 'Annuaire : au-delà de ce délai sans confirmation, la fiche est signalée « à confirmer ».'),
  ('directory_stale_days', '180', 'Annuaire : au-delà de ce délai sans confirmation, la fiche n''est plus publiée.'),
  ('emergency_numbers', '""', 'Numéros d''urgence affichés dans l''annuaire (texte libre, à renseigner avec les autorités). Vide : message générique.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Spécialités (référentiel administré)
-- ---------------------------------------------------------------------------
create table public.medical_specialties (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]{2,40}$'),
  name text not null unique check (char_length(name) between 2 and 80),
  family text not null check (char_length(family) between 2 and 80),
  description text check (char_length(description) <= 400),
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Liste initiale proposée dans le cahier des charges, à valider avec l'Ordre
-- des médecins. Descriptions neutres, sans conseil médical.
insert into public.medical_specialties (code, name, family, description, sort_order) values
  ('medecine_generale', 'Médecine générale', 'Premier recours', 'Le médecin généraliste assure le suivi courant et oriente, si besoin, vers le bon spécialiste.', 10),
  ('medecine_interne', 'Médecine interne', 'Médecine de l''adulte', 'Le médecin interniste prend en charge les maladies de l''adulte touchant plusieurs organes.', 20),
  ('cardiologie', 'Cardiologie', 'Médecine de l''adulte', 'Le cardiologue s''occupe du cœur et des vaisseaux sanguins.', 21),
  ('pneumologie', 'Pneumologie', 'Médecine de l''adulte', 'Le pneumologue s''occupe des poumons et de la respiration.', 22),
  ('gastro_enterologie', 'Gastro-entérologie', 'Médecine de l''adulte', 'Le gastro-entérologue s''occupe de l''appareil digestif.', 23),
  ('nephrologie', 'Néphrologie', 'Médecine de l''adulte', 'Le néphrologue s''occupe des reins.', 24),
  ('endocrinologie', 'Endocrinologie-diabétologie', 'Médecine de l''adulte', 'L''endocrinologue s''occupe des hormones, du diabète et de la thyroïde.', 25),
  ('rhumatologie', 'Rhumatologie', 'Médecine de l''adulte', 'Le rhumatologue s''occupe des os, des articulations et des muscles.', 26),
  ('infectiologie', 'Infectiologie', 'Médecine de l''adulte', 'L''infectiologue s''occupe des maladies infectieuses.', 27),
  ('hematologie', 'Hématologie', 'Médecine de l''adulte', 'L''hématologue s''occupe des maladies du sang.', 28),
  ('oncologie', 'Oncologie', 'Médecine de l''adulte', 'L''oncologue s''occupe des cancers.', 29),
  ('neurologie', 'Neurologie', 'Médecine de l''adulte', 'Le neurologue s''occupe du cerveau et des nerfs.', 30),
  ('dermatologie', 'Dermatologie', 'Médecine de l''adulte', 'Le dermatologue s''occupe de la peau, des cheveux et des ongles.', 31),
  ('gynecologie', 'Gynécologie-obstétrique', 'Femme et enfant', 'Le gynécologue-obstétricien suit la santé de la femme, la grossesse et l''accouchement.', 40),
  ('pediatrie', 'Pédiatrie', 'Femme et enfant', 'Le pédiatre suit la santé des enfants, de la naissance à l''adolescence.', 41),
  ('neonatologie', 'Néonatologie', 'Femme et enfant', 'Le néonatologue s''occupe des nouveau-nés.', 42),
  ('chirurgie_generale', 'Chirurgie générale', 'Chirurgie', 'Le chirurgien général opère notamment l''abdomen.', 50),
  ('traumatologie', 'Traumatologie-orthopédie', 'Chirurgie', 'Le chirurgien orthopédiste s''occupe des os et des articulations (fractures, prothèses).', 51),
  ('urologie', 'Urologie', 'Chirurgie', 'L''urologue s''occupe des voies urinaires et de l''appareil génital masculin.', 52),
  ('neurochirurgie', 'Neurochirurgie', 'Chirurgie', 'Le neurochirurgien opère le cerveau, la moelle épinière et les nerfs.', 53),
  ('chirurgie_pediatrique', 'Chirurgie pédiatrique', 'Chirurgie', 'Le chirurgien pédiatrique opère les enfants.', 54),
  ('chirurgie_maxillo_faciale', 'Chirurgie maxillo-faciale', 'Chirurgie', 'Le chirurgien maxillo-facial opère le visage et les mâchoires.', 55),
  ('ophtalmologie', 'Ophtalmologie', 'Organes des sens', 'L''ophtalmologue s''occupe des yeux et de la vue.', 60),
  ('orl', 'ORL', 'Organes des sens', 'L''ORL (oto-rhino-laryngologiste) s''occupe des oreilles, du nez et de la gorge.', 61),
  ('psychiatrie', 'Psychiatrie', 'Santé mentale', 'Le psychiatre s''occupe de la santé mentale.', 70),
  ('pedopsychiatrie', 'Pédopsychiatrie', 'Santé mentale', 'Le pédopsychiatre s''occupe de la santé mentale des enfants et des adolescents.', 71),
  ('radiologie', 'Radiologie et imagerie', 'Diagnostic et soins critiques', 'Le radiologue réalise et interprète les examens d''imagerie (radio, échographie, scanner).', 80),
  ('anesthesie', 'Anesthésie-réanimation', 'Diagnostic et soins critiques', 'L''anesthésiste-réanimateur endort les patients pour les opérations et prend en charge la réanimation.', 81),
  ('biologie', 'Biologie médicale', 'Diagnostic et soins critiques', 'Le biologiste réalise et interprète les analyses de laboratoire.', 82),
  ('chirurgie_dentaire', 'Chirurgie dentaire', 'Bouche et dents', 'Le chirurgien-dentiste soigne les dents et les gencives.', 90),
  ('stomatologie', 'Stomatologie', 'Bouche et dents', 'Le stomatologue s''occupe des maladies de la bouche.', 91)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Cliniques
-- ---------------------------------------------------------------------------
create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  kind text not null default 'clinique' check (kind in ('clinique', 'cabinet', 'centre_medical', 'hopital')),
  status public.pharmacy_status not null default 'pending',
  address text not null check (char_length(address) between 3 and 300),
  region_id uuid not null references public.regions(id) on delete restrict,
  commune_id uuid references public.communes(id) on delete restrict,
  locality_id uuid references public.localities(id) on delete restrict,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp text check (whatsapp is null or whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  opening_hours jsonb not null default '{}'::jsonb,
  emergency_24h boolean not null default false,
  services text[] not null default '{}' check (services <@ array['laboratoire', 'imagerie', 'maternite', 'hospitalisation', 'bloc_operatoire', 'pharmacie_interne']::text[]),
  confirmed_at timestamptz not null default now(),
  reminded_at timestamptz,
  verified_at timestamptz,
  is_demo boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null))
);
create index clinics_status_idx on public.clinics(status);
create index clinics_geo_idx on public.clinics(region_id, commune_id, locality_id);
create index clinics_name_trgm on public.clinics using gin (public.normalize_text(name) extensions.gin_trgm_ops);
create trigger clinics_touch before update on public.clinics for each row execute function public.touch_updated_at();

create table public.clinic_private (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  legal_name text check (char_length(legal_name) <= 200),
  license_number text check (char_length(license_number) <= 100),
  rccm text check (char_length(rccm) <= 80),
  tax_id text check (char_length(tax_id) <= 50),
  manager_name text not null check (char_length(manager_name) between 2 and 120),
  manager_phone text check (manager_phone is null or manager_phone ~ '^\+[1-9][0-9]{7,14}$'),
  updated_at timestamptz not null default now()
);

create table public.clinic_members (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'owner' check (member_role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (clinic_id, user_id)
);
create index clinic_members_user_idx on public.clinic_members(user_id);

create table public.clinic_documents (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  doc_type text not null check (doc_type in ('autorisation_ouverture', 'rccm', 'nif', 'piece_identite', 'autre')),
  storage_path text not null unique,
  file_name text check (char_length(file_name) <= 200),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Médecins
-- ---------------------------------------------------------------------------
create table public.doctors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  title text not null default 'Dr' check (title in ('Dr', 'Pr')),
  display_name text not null check (char_length(display_name) between 2 and 120),
  gender text check (gender in ('F', 'M')),
  languages text[] not null default array['fr']::text[]
    check (languages <@ array['fr', 'bm', 'snk', 'ff', 'son', 'tmh', 'dgo', 'en', 'ar']::text[] and cardinality(languages) between 1 and 9),
  status public.pharmacy_status not null default 'pending',
  is_published boolean not null default true,
  publication_consent_at timestamptz not null,
  confirmed_at timestamptz not null default now(),
  reminded_at timestamptz,
  verified_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index doctors_status_idx on public.doctors(status, is_published);
create index doctors_name_trgm on public.doctors using gin (public.normalize_text(display_name) extensions.gin_trgm_ops);
create trigger doctors_touch before update on public.doctors for each row execute function public.touch_updated_at();

create table public.doctor_private (
  doctor_id uuid primary key references public.doctors(id) on delete cascade,
  order_number text not null check (char_length(order_number) between 2 and 60),
  personal_phone text check (personal_phone is null or personal_phone ~ '^\+[1-9][0-9]{7,14}$'),
  updated_at timestamptz not null default now()
);

create table public.doctor_specialties (
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  specialty_id uuid not null references public.medical_specialties(id) on delete restrict,
  primary key (doctor_id, specialty_id)
);
create index doctor_specialties_spec_idx on public.doctor_specialties(specialty_id);

create table public.doctor_documents (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  doc_type text not null check (doc_type in ('inscription_ordre', 'diplome_specialite', 'piece_identite', 'autre')),
  storage_path text not null unique,
  file_name text check (char_length(file_name) <= 200),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Lieu d'exercice : un médecin dans une clinique, avec ses jours et horaires.
-- Publié seulement quand les DEUX parties ont accepté.
create table public.doctor_practice_sites (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  schedule jsonb not null default '{}'::jsonb,
  appointment_phone text check (appointment_phone is null or appointment_phone ~ '^\+[1-9][0-9]{7,14}$'),
  doctor_accepted boolean not null default false,
  clinic_accepted boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (doctor_id, clinic_id)
);
create index doctor_practice_sites_clinic_idx on public.doctor_practice_sites(clinic_id);
create trigger doctor_practice_sites_touch before update on public.doctor_practice_sites for each row execute function public.touch_updated_at();

create table public.doctor_absences (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  note text check (char_length(note) <= 120),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 366)
);
create index doctor_absences_doctor_idx on public.doctor_absences(doctor_id, ends_on);

create table public.directory_verifications (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid references public.doctors(id) on delete cascade,
  clinic_id uuid references public.clinics(id) on delete cascade,
  decision public.pharmacy_status not null,
  reason text check (char_length(reason) <= 1000),
  checklist jsonb not null default '{}'::jsonb,
  reviewer_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((doctor_id is null) <> (clinic_id is null))
);
create index directory_verifications_doctor_idx on public.directory_verifications(doctor_id, created_at desc);
create index directory_verifications_clinic_idx on public.directory_verifications(clinic_id, created_at desc);

-- Signalements et journal de recherche étendus à l'annuaire
alter table public.reports add column doctor_id uuid references public.doctors(id) on delete cascade;
alter table public.reports add column clinic_id uuid references public.clinics(id) on delete cascade;
alter table public.reports drop constraint reports_reason_check;
alter table public.reports add constraint reports_reason_check check (reason in (
  'stock_incorrect', 'prix_incorrect', 'pharmacie_fermee', 'informations_erronees', 'comportement', 'produit_suspect', 'autre',
  'numero_errone', 'ne_consulte_plus'));
alter table public.search_logs add column kind text not null default 'medicine' check (kind in ('medicine', 'doctor', 'clinic'));

-- ---------------------------------------------------------------------------
-- Fonctions d'aide
-- ---------------------------------------------------------------------------
create or replace function public.my_doctor_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.doctors where user_id = auth.uid()
$$;

create or replace function public.is_clinic_member(p_clinic uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clinic_members where clinic_id = p_clinic and user_id = auth.uid())
$$;

create or replace function public.is_clinic_owner(p_clinic uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clinic_members where clinic_id = p_clinic and user_id = auth.uid() and member_role = 'owner')
$$;

-- Membre d'une clinique non suspendue
create or replace function public.can_manage_clinic(p_clinic uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.clinic_members m join public.clinics c on c.id = m.clinic_id
    where m.clinic_id = p_clinic and m.user_id = auth.uid() and c.status in ('pending', 'verified', 'rejected'))
$$;

-- « fresh » | « to_confirm » | « stale »
create or replace function public.directory_freshness(p_confirmed timestamptz, p_now timestamptz default now())
returns text language sql stable security definer set search_path = public as $$
  select case
    when p_confirmed >= p_now - make_interval(days => public.setting_int('directory_fresh_days', 90)) then 'fresh'
    when p_confirmed >= p_now - make_interval(days => public.setting_int('directory_stale_days', 180)) then 'to_confirm'
    else 'stale' end
$$;

create or replace function public.doctor_is_public(p_doctor uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.doctors d where d.id = p_doctor and d.status = 'verified' and d.is_published
                 and public.directory_freshness(d.confirmed_at) <> 'stale')
$$;

create or replace function public.clinic_is_public(p_clinic uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clinics c where c.id = p_clinic and c.status = 'verified'
                 and public.directory_freshness(c.confirmed_at) <> 'stale')
$$;

-- La clinique voit les médecins liés à elle (même non encore vérifiés), le médecin voit ses cliniques
create or replace function public.doctor_linked_to_my_clinic(p_doctor uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.doctor_practice_sites s join public.clinic_members m on m.clinic_id = s.clinic_id
                 where s.doctor_id = p_doctor and m.user_id = auth.uid())
$$;

create or replace function public.clinic_linked_to_me(p_clinic uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.doctor_practice_sites s join public.doctors d on d.id = s.doctor_id
                 where s.clinic_id = p_clinic and d.user_id = auth.uid())
$$;

-- Jour courant (heure du Mali, UTC+0) au format des horaires
create or replace function public.day_key(p_ts timestamptz default now())
returns text language sql stable as $$
  select (array['mon','tue','wed','thu','fri','sat','sun'])[extract(isodow from p_ts at time zone 'UTC')::int]
$$;

-- Validation d'un planning {"mon":[["08:00","12:00"],["15:00","18:00"]], ...}
create or replace function public.valid_schedule(p jsonb)
returns boolean language plpgsql immutable as $$
declare k text; slot jsonb; n int := 0;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  for k in select jsonb_object_keys(p) loop
    if k not in ('mon','tue','wed','thu','fri','sat','sun') then return false; end if;
    if jsonb_typeof(p -> k) <> 'array' or jsonb_array_length(p -> k) > 3 then return false; end if;
    for slot in select * from jsonb_array_elements(p -> k) loop
      if jsonb_typeof(slot) <> 'array' or jsonb_array_length(slot) <> 2
         or not (slot ->> 0) ~ '^([01]\d|2[0-3]):[0-5]\d$' or not (slot ->> 1) ~ '^([01]\d|2[0-3]):[0-5]\d$|^24:00$'
         or (slot ->> 0) >= (slot ->> 1) then
        return false;
      end if;
      n := n + 1;
    end loop;
  end loop;
  return true;
end $$;

create or replace function public.notify_clinic(p_clinic uuid, p_kind text, p_title text, p_body text, p_link text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body, link)
  select m.user_id, p_kind, p_title, p_body, p_link from public.clinic_members m where m.clinic_id = p_clinic;
$$;
revoke execute on function public.notify_clinic(uuid, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Médecin : référencement et gestion de sa fiche
-- ---------------------------------------------------------------------------
create or replace function public._set_doctor_specialties(p_doctor uuid, p_specialties jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_specialties is null or jsonb_typeof(p_specialties) <> 'array' then raise exception 'PP422: choisissez au moins une spécialité'; end if;
  n := jsonb_array_length(p_specialties);
  if n < 1 then raise exception 'PP422: choisissez au moins une spécialité'; end if;
  if n > 4 then raise exception 'PP422: 4 spécialités maximum'; end if;
  if exists (select 1 from jsonb_array_elements_text(p_specialties) s
             where not exists (select 1 from public.medical_specialties m where m.id::text = s and m.is_active)) then
    raise exception 'PP422: spécialité inconnue';
  end if;
  delete from public.doctor_specialties where doctor_id = p_doctor
    and specialty_id::text not in (select jsonb_array_elements_text(p_specialties));
  insert into public.doctor_specialties (doctor_id, specialty_id)
  select p_doctor, s::uuid from jsonb_array_elements_text(p_specialties) s
  on conflict do nothing;
end $$;
revoke execute on function public._set_doctor_specialties(uuid, jsonb) from public, anon, authenticated;

create or replace function public.register_doctor(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); did uuid; langs text[];
begin
  if exists (select 1 from public.doctors where user_id = uid) then
    raise exception 'PP409: une fiche médecin existe déjà pour ce compte';
  end if;
  if coalesce((p ->> 'consent')::boolean, false) is not true then
    raise exception 'PP422: votre accord pour la publication de vos coordonnées professionnelles est obligatoire';
  end if;
  if coalesce(trim(p ->> 'order_number'), '') = '' then
    raise exception 'PP422: le numéro d''inscription à l''Ordre des médecins est obligatoire';
  end if;
  langs := coalesce(array(select jsonb_array_elements_text(p -> 'languages')), array['fr']);
  if cardinality(langs) = 0 then langs := array['fr']; end if;

  insert into public.doctors (user_id, title, display_name, gender, languages, publication_consent_at)
  values (uid, coalesce(nullif(p ->> 'title', ''), 'Dr'), trim(p ->> 'display_name'), nullif(p ->> 'gender', ''), langs, now())
  returning id into did;
  insert into public.doctor_private (doctor_id, order_number, personal_phone)
  values (did, trim(p ->> 'order_number'), nullif(p ->> 'personal_phone', ''));
  perform public._set_doctor_specialties(did, p -> 'specialties');
  insert into public.directory_verifications (doctor_id, decision, reason, reviewer_id) values (did, 'pending', 'Demande de référencement', uid);
  perform public.log_audit('doctor.register', 'doctor', did::text, jsonb_build_object('consent_at', now()));
  return did;
end $$;

create or replace function public.update_doctor(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); d public.doctors; langs text[]; before_specs jsonb;
begin
  select * into d from public.doctors where user_id = uid for update;
  if d.id is null then raise exception 'PP404: aucune fiche médecin pour ce compte'; end if;
  if d.status = 'suspended' then raise exception 'PP403: fiche suspendue : modification impossible'; end if;
  langs := coalesce(array(select jsonb_array_elements_text(p -> 'languages')), d.languages);
  if cardinality(langs) = 0 then langs := array['fr']; end if;
  select coalesce(jsonb_agg(specialty_id order by specialty_id), '[]') into before_specs from public.doctor_specialties where doctor_id = d.id;
  update public.doctors set title = coalesce(nullif(p ->> 'title', ''), title), display_name = trim(p ->> 'display_name'),
         gender = nullif(p ->> 'gender', ''), languages = langs where id = d.id;
  update public.doctor_private set order_number = coalesce(nullif(trim(p ->> 'order_number'), ''), order_number),
         personal_phone = nullif(p ->> 'personal_phone', ''), updated_at = now() where doctor_id = d.id;
  if p ? 'specialties' then perform public._set_doctor_specialties(d.id, p -> 'specialties'); end if;
  perform public.log_audit('doctor.update', 'doctor', d.id::text,
    jsonb_build_object('specialties_before', before_specs,
      'specialties_after', (select coalesce(jsonb_agg(specialty_id order by specialty_id), '[]') from public.doctor_specialties where doctor_id = d.id)));
end $$;

-- Confirmation périodique « mes informations sont toujours exactes »
create or replace function public.confirm_doctor_info()
returns timestamptz language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); did uuid;
begin
  update public.doctors set confirmed_at = now(), reminded_at = null where user_id = uid and status <> 'suspended' returning id into did;
  if did is null then raise exception 'PP404: aucune fiche médecin active pour ce compte'; end if;
  perform public.log_audit('doctor.confirm', 'doctor', did::text);
  return now();
end $$;

-- Retrait de l'annuaire (ou republication) à l'initiative du médecin, effet immédiat
create or replace function public.set_doctor_published(p_published boolean)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); did uuid;
begin
  update public.doctors set is_published = coalesce(p_published, false),
         publication_consent_at = case when p_published then now() else publication_consent_at end
   where user_id = uid returning id into did;
  if did is null then raise exception 'PP404: aucune fiche médecin pour ce compte'; end if;
  perform public.log_audit(case when p_published then 'doctor.publish' else 'doctor.unpublish' end, 'doctor', did::text);
end $$;

create or replace function public.resubmit_doctor()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); did uuid;
begin
  update public.doctors set status = 'pending' where user_id = uid and status = 'rejected' returning id into did;
  if did is null then raise exception 'PP409: seule une demande refusée peut être soumise à nouveau'; end if;
  insert into public.directory_verifications (doctor_id, decision, reason, reviewer_id) values (did, 'pending', 'Nouvelle soumission après corrections', uid);
  perform public.log_audit('doctor.resubmit', 'doctor', did::text);
end $$;

create or replace function public.add_doctor_absence(p_starts date, p_ends date, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); did uuid := public.my_doctor_id(); aid uuid;
begin
  if did is null then raise exception 'PP404: aucune fiche médecin pour ce compte'; end if;
  if p_starts is null or p_ends is null or p_ends < p_starts then raise exception 'PP422: dates d''absence invalides'; end if;
  if p_ends < current_date then raise exception 'PP422: la période d''absence est déjà passée'; end if;
  if p_ends - p_starts > 366 then raise exception 'PP422: une absence ne peut pas dépasser un an'; end if;
  if (select count(*) from public.doctor_absences where doctor_id = did and ends_on >= current_date) >= 10 then
    raise exception 'PP429: 10 absences à venir maximum';
  end if;
  insert into public.doctor_absences (doctor_id, starts_on, ends_on, note) values (did, p_starts, p_ends, nullif(left(trim(p_note), 120), ''))
  returning id into aid;
  return aid;
end $$;

create or replace function public.remove_doctor_absence(p_absence uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_auth();
  delete from public.doctor_absences where id = p_absence and doctor_id = public.my_doctor_id();
  if not found then raise exception 'PP404: absence introuvable'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Clinique : inscription et gestion
-- ---------------------------------------------------------------------------
create or replace function public._check_location(v_region uuid, v_commune uuid, v_locality uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if v_region is null or not exists (select 1 from public.regions where id = v_region) then raise exception 'PP422: région invalide'; end if;
  if v_commune is not null and not exists (select 1 from public.communes where id = v_commune and region_id = v_region) then
    raise exception 'PP422: la commune ne correspond pas à la région';
  end if;
  if v_locality is not null and (v_commune is null or not exists (select 1 from public.localities where id = v_locality and commune_id = v_commune)) then
    raise exception 'PP422: le quartier ne correspond pas à la commune';
  end if;
end $$;

create or replace function public._clinic_services(p jsonb)
returns text[] language sql immutable as $$
  select coalesce(array(select distinct s from jsonb_array_elements_text(coalesce(p, '[]'::jsonb)) s
    where s in ('laboratoire', 'imagerie', 'maternite', 'hospitalisation', 'bloc_operatoire', 'pharmacie_interne')), '{}')
$$;

create or replace function public.register_clinic(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); cid uuid;
  v_region uuid := (p ->> 'region_id')::uuid;
  v_commune uuid := nullif(p ->> 'commune_id', '')::uuid;
  v_locality uuid := nullif(p ->> 'locality_id', '')::uuid;
begin
  if (select count(*) from public.clinic_members m join public.clinics c on c.id = m.clinic_id
      where m.user_id = uid and c.status = 'pending') >= 3 then
    raise exception 'PP429: trop de demandes d''inscription en attente';
  end if;
  perform public._check_location(v_region, v_commune, v_locality);
  if coalesce(trim(p ->> 'manager_name'), '') = '' then raise exception 'PP422: le nom du responsable est obligatoire'; end if;
  if not public.valid_schedule(coalesce(p -> 'opening_hours', '{}'::jsonb)) then raise exception 'PP422: horaires invalides'; end if;

  insert into public.clinics (name, kind, address, region_id, commune_id, locality_id, latitude, longitude, phone, whatsapp, email,
                              opening_hours, emergency_24h, services, created_by)
  values (trim(p ->> 'name'), coalesce(nullif(p ->> 'kind', ''), 'clinique'), trim(p ->> 'address'), v_region, v_commune, v_locality,
          nullif(p ->> 'latitude', '')::double precision, nullif(p ->> 'longitude', '')::double precision,
          p ->> 'phone', nullif(p ->> 'whatsapp', ''), nullif(p ->> 'email', ''),
          coalesce(p -> 'opening_hours', '{}'::jsonb), coalesce((p ->> 'emergency_24h')::boolean, false), public._clinic_services(p -> 'services'), uid)
  returning id into cid;
  insert into public.clinic_private (clinic_id, legal_name, license_number, rccm, tax_id, manager_name, manager_phone)
  values (cid, nullif(p ->> 'legal_name', ''), nullif(p ->> 'license_number', ''), nullif(p ->> 'rccm', ''), nullif(p ->> 'tax_id', ''),
          trim(p ->> 'manager_name'), nullif(p ->> 'manager_phone', ''));
  insert into public.clinic_members (clinic_id, user_id, member_role) values (cid, uid, 'owner');
  insert into public.directory_verifications (clinic_id, decision, reason, reviewer_id) values (cid, 'pending', 'Demande d''inscription', uid);
  perform public.log_audit('clinic.register', 'clinic', cid::text);
  return cid;
end $$;

create or replace function public.update_clinic(p_clinic uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_region uuid := (p ->> 'region_id')::uuid;
  v_commune uuid := nullif(p ->> 'commune_id', '')::uuid;
  v_locality uuid := nullif(p ->> 'locality_id', '')::uuid;
begin
  perform public.require_auth();
  if not public.can_manage_clinic(p_clinic) then raise exception 'PP403: modification impossible (clinique suspendue ou accès refusé)'; end if;
  perform public._check_location(v_region, v_commune, v_locality);
  if not public.valid_schedule(coalesce(p -> 'opening_hours', '{}'::jsonb)) then raise exception 'PP422: horaires invalides'; end if;
  update public.clinics set name = trim(p ->> 'name'), kind = coalesce(nullif(p ->> 'kind', ''), kind), address = trim(p ->> 'address'),
         region_id = v_region, commune_id = v_commune, locality_id = v_locality,
         latitude = nullif(p ->> 'latitude', '')::double precision, longitude = nullif(p ->> 'longitude', '')::double precision,
         phone = p ->> 'phone', whatsapp = nullif(p ->> 'whatsapp', ''), email = nullif(p ->> 'email', ''),
         opening_hours = coalesce(p -> 'opening_hours', '{}'::jsonb), emergency_24h = coalesce((p ->> 'emergency_24h')::boolean, false),
         services = public._clinic_services(p -> 'services')
   where id = p_clinic;
  update public.clinic_private set legal_name = nullif(p ->> 'legal_name', ''), license_number = nullif(p ->> 'license_number', ''),
         rccm = nullif(p ->> 'rccm', ''), tax_id = nullif(p ->> 'tax_id', ''),
         manager_name = coalesce(nullif(trim(p ->> 'manager_name'), ''), manager_name), manager_phone = nullif(p ->> 'manager_phone', ''),
         updated_at = now()
   where clinic_id = p_clinic;
  perform public.log_audit('clinic.update', 'clinic', p_clinic::text);
end $$;

create or replace function public.confirm_clinic_info(p_clinic uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
begin
  perform public.require_auth();
  if not public.can_manage_clinic(p_clinic) then raise exception 'PP403: accès refusé'; end if;
  update public.clinics set confirmed_at = now(), reminded_at = null where id = p_clinic;
  perform public.log_audit('clinic.confirm', 'clinic', p_clinic::text);
  return now();
end $$;

create or replace function public.resubmit_clinic(p_clinic uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth();
begin
  if not public.is_clinic_owner(p_clinic) then raise exception 'PP403: accès refusé'; end if;
  update public.clinics set status = 'pending' where id = p_clinic and status = 'rejected';
  if not found then raise exception 'PP409: seule une demande refusée peut être soumise à nouveau'; end if;
  insert into public.directory_verifications (clinic_id, decision, reason, reviewer_id) values (p_clinic, 'pending', 'Nouvelle soumission après corrections', uid);
  perform public.log_audit('clinic.resubmit', 'clinic', p_clinic::text);
end $$;

create or replace function public.clinic_team(p_clinic uuid)
returns table (user_id uuid, full_name text, email text, member_role text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_clinic_member(p_clinic) or public.is_admin()) then raise exception 'PP403: accès refusé'; end if;
  return query
  select m.user_id, p.full_name, u.email::text, m.member_role, m.created_at
  from public.clinic_members m join public.profiles p on p.id = m.user_id join auth.users u on u.id = m.user_id
  where m.clinic_id = p_clinic order by m.member_role desc, m.created_at;
end $$;

create or replace function public.clinic_add_member(p_clinic uuid, p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); target uuid;
begin
  if not public.is_clinic_owner(p_clinic) or not public.can_manage_clinic(p_clinic) then
    raise exception 'PP403: seul le responsable de la clinique peut gérer l''équipe';
  end if;
  select u.id into target from auth.users u join public.profiles p on p.id = u.id
   where lower(u.email) = lower(trim(p_email)) and p.deleted_at is null;
  if target is null then raise exception 'PP404: aucun compte PharmaProxi avec cette adresse ; la personne doit d''abord créer son compte'; end if;
  if (select count(*) from public.clinic_members where clinic_id = p_clinic) >= 20 then raise exception 'PP422: 20 membres maximum'; end if;
  insert into public.clinic_members (clinic_id, user_id, member_role) values (p_clinic, target, 'staff') on conflict do nothing;
  perform public.log_audit('clinic.member_add', 'clinic', p_clinic::text, jsonb_build_object('user', target));
  perform public.notify_user(target, 'clinic_member', 'Vous avez rejoint l''équipe d''une clinique',
    (select name from public.clinics where id = p_clinic), null, '/clinique/' || p_clinic);
  return target;
end $$;

create or replace function public.clinic_remove_member(p_clinic uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_auth();
  if not public.is_clinic_owner(p_clinic) and not public.is_admin() then raise exception 'PP403: seul le responsable de la clinique peut gérer l''équipe'; end if;
  if exists (select 1 from public.clinic_members where clinic_id = p_clinic and user_id = p_user and member_role = 'owner') then
    raise exception 'PP409: le responsable ne peut pas être retiré de l''équipe';
  end if;
  delete from public.clinic_members where clinic_id = p_clinic and user_id = p_user;
  if not found then raise exception 'PP404: membre introuvable'; end if;
  perform public.log_audit('clinic.member_remove', 'clinic', p_clinic::text, jsonb_build_object('user', p_user));
end $$;

-- ---------------------------------------------------------------------------
-- Lieux d'exercice : proposés par une partie, acceptés par l'autre
-- ---------------------------------------------------------------------------
create or replace function public.doctor_propose_site(p_clinic uuid, p_schedule jsonb, p_phone text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); d public.doctors; sid uuid; cstatus public.pharmacy_status; cname text;
begin
  select * into d from public.doctors where user_id = uid;
  if d.id is null then raise exception 'PP404: créez d''abord votre fiche médecin'; end if;
  if d.status = 'suspended' then raise exception 'PP403: fiche suspendue'; end if;
  select status, name into cstatus, cname from public.clinics where id = p_clinic;
  if cstatus is null then raise exception 'PP404: clinique introuvable'; end if;
  if cstatus not in ('verified', 'pending') and not public.is_clinic_member(p_clinic) then raise exception 'PP409: cette clinique ne peut pas recevoir de demande'; end if;
  if not public.valid_schedule(coalesce(p_schedule, '{}'::jsonb)) or coalesce(p_schedule, '{}'::jsonb) = '{}'::jsonb then
    raise exception 'PP422: indiquez au moins un jour et des horaires valides';
  end if;
  if p_phone is not null and p_phone <> '' and not public.valid_phone(p_phone) then raise exception 'PP422: numéro de rendez-vous invalide'; end if;
  if (select count(*) from public.doctor_practice_sites where doctor_id = d.id) >= 8 then raise exception 'PP422: 8 lieux d''exercice maximum'; end if;
  insert into public.doctor_practice_sites (doctor_id, clinic_id, schedule, appointment_phone, doctor_accepted,
                                            clinic_accepted, created_by)
  values (d.id, p_clinic, p_schedule, nullif(p_phone, ''), true, public.is_clinic_member(p_clinic), uid)
  on conflict (doctor_id, clinic_id) do update set schedule = excluded.schedule, appointment_phone = excluded.appointment_phone, doctor_accepted = true
  returning id into sid;
  if not public.is_clinic_member(p_clinic) then
    perform public.notify_clinic(p_clinic, 'directory_site', 'Un médecin demande à être rattaché',
      d.title || ' ' || d.display_name || ' indique consulter dans votre établissement.', '/clinique/' || p_clinic || '#medecins');
  end if;
  perform public.log_audit('site.propose', 'doctor', d.id::text, jsonb_build_object('clinic', p_clinic));
  return sid;
end $$;

create or replace function public.clinic_invite_doctor(p_clinic uuid, p_doctor uuid, p_schedule jsonb, p_phone text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); sid uuid; duser uuid; cname text;
begin
  if not public.can_manage_clinic(p_clinic) then raise exception 'PP403: accès refusé'; end if;
  select user_id into duser from public.doctors where id = p_doctor and status = 'verified';
  if duser is null then raise exception 'PP404: seul un médecin déjà vérifié peut être invité'; end if;
  if not public.valid_schedule(coalesce(p_schedule, '{}'::jsonb)) or coalesce(p_schedule, '{}'::jsonb) = '{}'::jsonb then
    raise exception 'PP422: indiquez au moins un jour et des horaires valides';
  end if;
  if p_phone is not null and p_phone <> '' and not public.valid_phone(p_phone) then raise exception 'PP422: numéro de rendez-vous invalide'; end if;
  if (select count(*) from public.doctor_practice_sites where clinic_id = p_clinic) >= 200 then raise exception 'PP422: nombre maximal de médecins atteint'; end if;
  select name into cname from public.clinics where id = p_clinic;
  insert into public.doctor_practice_sites (doctor_id, clinic_id, schedule, appointment_phone, doctor_accepted, clinic_accepted, created_by)
  values (p_doctor, p_clinic, p_schedule, nullif(p_phone, ''), duser = uid, true, uid)
  on conflict (doctor_id, clinic_id) do update set schedule = excluded.schedule, appointment_phone = excluded.appointment_phone, clinic_accepted = true
  returning id into sid;
  if duser <> uid then
    perform public.notify_user(duser, 'directory_site', 'Invitation d''une clinique', cname || ' vous propose un planning de consultation : acceptez-le pour le publier.', null, '/medecin#lieux');
  end if;
  perform public.log_audit('site.invite', 'clinic', p_clinic::text, jsonb_build_object('doctor', p_doctor));
  return sid;
end $$;

-- Acceptation par la partie qui n'a pas encore accepté
create or replace function public.accept_practice_site(p_site uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.doctor_practice_sites; is_doc boolean; is_cli boolean;
begin
  perform public.require_auth();
  select * into s from public.doctor_practice_sites where id = p_site for update;
  if s.id is null then raise exception 'PP404: lieu d''exercice introuvable'; end if;
  is_doc := s.doctor_id = public.my_doctor_id();
  is_cli := public.can_manage_clinic(s.clinic_id);
  if not is_doc and not is_cli then raise exception 'PP403: accès refusé'; end if;
  update public.doctor_practice_sites
     set doctor_accepted = doctor_accepted or is_doc, clinic_accepted = clinic_accepted or is_cli
   where id = p_site;
  perform public.log_audit('site.accept', 'practice_site', p_site::text, jsonb_build_object('by', case when is_doc then 'doctor' else 'clinic' end));
end $$;

create or replace function public.update_practice_site(p_site uuid, p_schedule jsonb, p_phone text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s public.doctor_practice_sites;
begin
  perform public.require_auth();
  select * into s from public.doctor_practice_sites where id = p_site for update;
  if s.id is null then raise exception 'PP404: lieu d''exercice introuvable'; end if;
  if s.doctor_id is distinct from public.my_doctor_id() and not public.can_manage_clinic(s.clinic_id) then raise exception 'PP403: accès refusé'; end if;
  if not public.valid_schedule(coalesce(p_schedule, '{}'::jsonb)) or coalesce(p_schedule, '{}'::jsonb) = '{}'::jsonb then
    raise exception 'PP422: indiquez au moins un jour et des horaires valides';
  end if;
  if p_phone is not null and p_phone <> '' and not public.valid_phone(p_phone) then raise exception 'PP422: numéro de rendez-vous invalide'; end if;
  update public.doctor_practice_sites set schedule = p_schedule, appointment_phone = nullif(p_phone, '') where id = p_site;
  perform public.log_audit('site.update', 'practice_site', p_site::text);
end $$;

create or replace function public.remove_practice_site(p_site uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.doctor_practice_sites;
begin
  perform public.require_auth();
  select * into s from public.doctor_practice_sites where id = p_site;
  if s.id is null then raise exception 'PP404: lieu d''exercice introuvable'; end if;
  if s.doctor_id is distinct from public.my_doctor_id() and not public.is_clinic_member(s.clinic_id) and not public.is_admin() then
    raise exception 'PP403: accès refusé';
  end if;
  delete from public.doctor_practice_sites where id = p_site;
  perform public.log_audit('site.remove', 'practice_site', p_site::text, jsonb_build_object('doctor', s.doctor_id, 'clinic', s.clinic_id));
end $$;

-- ---------------------------------------------------------------------------
-- Administration : vérification sur pièces (listes de contrôle en 5 points)
-- ---------------------------------------------------------------------------
create or replace function public._review_transition_ok(cur public.pharmacy_status, nxt public.pharmacy_status)
returns boolean language sql immutable as $$
  select (cur = 'pending' and nxt in ('verified', 'rejected')) or (cur = 'verified' and nxt = 'suspended')
      or (cur = 'suspended' and nxt in ('verified', 'rejected'))
$$;

create or replace function public.admin_review_doctor(p_doctor uuid, p_decision public.pharmacy_status, p_reason text default null, p_checklist jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin(); d public.doctors; k text;
begin
  select * into d from public.doctors where id = p_doctor for update;
  if d.id is null then raise exception 'PP404: médecin introuvable'; end if;
  if not public._review_transition_ok(d.status, p_decision) then raise exception 'PP409: transition % -> % non autorisée', d.status, p_decision; end if;
  if p_decision in ('rejected', 'suspended') and coalesce(trim(p_reason), '') = '' then raise exception 'PP422: un motif est obligatoire pour un refus ou une suspension'; end if;
  if p_decision = 'verified' and d.status = 'pending' then
    if not exists (select 1 from public.doctor_documents where doctor_id = p_doctor) then raise exception 'PP422: aucun justificatif déposé, validation impossible'; end if;
    foreach k in array array['ordre', 'diplome', 'identite', 'lieu', 'telephone'] loop
      if coalesce((p_checklist ->> k)::boolean, false) is not true then raise exception 'PP422: cochez les 5 points de contrôle avant de valider'; end if;
    end loop;
  end if;
  update public.doctors set status = p_decision, verified_at = case when p_decision = 'verified' then now() else verified_at end,
         confirmed_at = case when p_decision = 'verified' then now() else confirmed_at end
   where id = p_doctor;
  insert into public.directory_verifications (doctor_id, decision, reason, checklist, reviewer_id)
  values (p_doctor, p_decision, p_reason, coalesce(p_checklist, '{}'::jsonb), uid);
  perform public.log_audit('doctor.review', 'doctor', p_doctor::text, jsonb_build_object('from', d.status, 'to', p_decision, 'reason', p_reason));
  perform public.notify_user(d.user_id, 'directory_review',
    case p_decision when 'verified' then 'Votre fiche médecin est publiée' when 'rejected' then 'Référencement refusé'
                    when 'suspended' then 'Fiche médecin suspendue' else 'Statut mis à jour' end,
    coalesce(p_reason, d.title || ' ' || d.display_name), null, '/medecin');
end $$;

create or replace function public.admin_review_clinic(p_clinic uuid, p_decision public.pharmacy_status, p_reason text default null, p_checklist jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin(); c public.clinics; k text;
begin
  select * into c from public.clinics where id = p_clinic for update;
  if c.id is null then raise exception 'PP404: clinique introuvable'; end if;
  if not public._review_transition_ok(c.status, p_decision) then raise exception 'PP409: transition % -> % non autorisée', c.status, p_decision; end if;
  if p_decision in ('rejected', 'suspended') and coalesce(trim(p_reason), '') = '' then raise exception 'PP422: un motif est obligatoire pour un refus ou une suspension'; end if;
  if p_decision = 'verified' and c.status = 'pending' then
    if not exists (select 1 from public.clinic_documents where clinic_id = p_clinic) then raise exception 'PP422: aucun justificatif déposé, validation impossible'; end if;
    foreach k in array array['autorisation', 'existence_legale', 'responsable', 'adresse', 'telephone'] loop
      if coalesce((p_checklist ->> k)::boolean, false) is not true then raise exception 'PP422: cochez les 5 points de contrôle avant de valider'; end if;
    end loop;
  end if;
  update public.clinics set status = p_decision, verified_at = case when p_decision = 'verified' then now() else verified_at end,
         confirmed_at = case when p_decision = 'verified' then now() else confirmed_at end
   where id = p_clinic;
  insert into public.directory_verifications (clinic_id, decision, reason, checklist, reviewer_id)
  values (p_clinic, p_decision, p_reason, coalesce(p_checklist, '{}'::jsonb), uid);
  perform public.log_audit('clinic.review', 'clinic', p_clinic::text, jsonb_build_object('from', c.status, 'to', p_decision, 'reason', p_reason));
  perform public.notify_clinic(p_clinic, 'directory_review',
    case p_decision when 'verified' then 'Votre établissement est publié' when 'rejected' then 'Inscription refusée'
                    when 'suspended' then 'Établissement suspendu' else 'Statut mis à jour' end,
    coalesce(p_reason, c.name), '/clinique/' || p_clinic);
end $$;

create or replace function public.admin_save_specialty(p_id uuid, p_code text, p_name text, p_family text, p_description text, p_sort int, p_active boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  perform public.require_admin();
  if p_id is null then
    insert into public.medical_specialties (code, name, family, description, sort_order, is_active)
    values (lower(trim(p_code)), trim(p_name), trim(p_family), nullif(trim(p_description), ''), coalesce(p_sort, 100), coalesce(p_active, true))
    returning id into sid;
  else
    update public.medical_specialties set name = trim(p_name), family = trim(p_family), description = nullif(trim(p_description), ''),
           sort_order = coalesce(p_sort, sort_order), is_active = coalesce(p_active, is_active)
     where id = p_id returning id into sid;
    if sid is null then raise exception 'PP404: spécialité introuvable'; end if;
  end if;
  perform public.log_audit('specialty.save', 'specialty', sid::text, jsonb_build_object('name', p_name, 'active', p_active));
  return sid;
end $$;

-- ---------------------------------------------------------------------------
-- Recherche publique
-- ---------------------------------------------------------------------------
create or replace function public.search_doctors(
  p_query text default null, p_specialty uuid default null, p_region uuid default null, p_commune uuid default null,
  p_clinic uuid default null, p_day text default null, p_today boolean default false, p_language text default null,
  p_gender text default null, p_lat double precision default null, p_lng double precision default null,
  p_sort text default 'name', p_limit int default 20, p_offset int default 0)
returns table (doctor_id uuid, title text, display_name text, gender text, languages text[], specialties jsonb, sites jsonb,
               distance_km double precision, confirmed_at timestamptz, freshness text, absent_until date, total_count bigint)
language plpgsql security definer set search_path = public, extensions as $$
declare q text := nullif(public.normalize_text(left(coalesce(p_query, ''), 80)), ''); today text := public.day_key(); lim int := least(greatest(coalesce(p_limit, 20), 1), 50); n int;
begin
  if p_day is not null and p_day not in ('mon','tue','wed','thu','fri','sat','sun') then p_day := null; end if;
  return query
  with base as (
    select d.*,
           (select coalesce(jsonb_agg(jsonb_build_object('id', ms.id, 'name', ms.name) order by ms.sort_order), '[]')
              from public.doctor_specialties ds join public.medical_specialties ms on ms.id = ds.specialty_id where ds.doctor_id = d.id) as specs,
           (select a.ends_on from public.doctor_absences a where a.doctor_id = d.id and current_date between a.starts_on and a.ends_on
             order by a.ends_on desc limit 1) as absent
    from public.doctors d
    where d.status = 'verified' and d.is_published and public.directory_freshness(d.confirmed_at) <> 'stale'
  ), sites as (
    select s.doctor_id, s.clinic_id, s.schedule, s.appointment_phone, c.name as clinic_name, c.region_id, c.commune_id, c.phone as clinic_phone,
           cm.name as commune_name, r.name as region_name, public.distance_km(p_lat, p_lng, c.latitude, c.longitude) as dist
    from public.doctor_practice_sites s join public.clinics c on c.id = s.clinic_id
    join public.regions r on r.id = c.region_id left join public.communes cm on cm.id = c.commune_id
    where s.doctor_accepted and s.clinic_accepted and c.status = 'verified' and public.directory_freshness(c.confirmed_at) <> 'stale'
  ), matched as (
    select b.*,
      (select coalesce(jsonb_agg(jsonb_build_object('clinic_id', st.clinic_id, 'clinic_name', st.clinic_name, 'commune', st.commune_name,
              'region', st.region_name, 'days', (select coalesce(jsonb_agg(k), '[]') from jsonb_object_keys(st.schedule) k),
              'phone', coalesce(st.appointment_phone, st.clinic_phone), 'distance_km', st.dist) order by st.dist nulls last, st.clinic_name), '[]')
         from sites st where st.doctor_id = b.id) as site_list,
      (select min(st.dist) from sites st where st.doctor_id = b.id) as min_dist
    from base b
    where (p_specialty is null or exists (select 1 from public.doctor_specialties ds where ds.doctor_id = b.id and ds.specialty_id = p_specialty))
      and (p_language is null or p_language = any(b.languages))
      and (p_gender is null or b.gender = p_gender)
      and (q is null
           or public.normalize_text(b.display_name) like '%' || q || '%'
           or extensions.word_similarity(q, public.normalize_text(b.display_name)) > 0.45
           or exists (select 1 from public.doctor_specialties ds join public.medical_specialties ms on ms.id = ds.specialty_id
                      where ds.doctor_id = b.id and (public.normalize_text(ms.name) like '%' || q || '%'
                        or extensions.word_similarity(q, public.normalize_text(ms.name)) > 0.45))
           or exists (select 1 from sites st where st.doctor_id = b.id and public.normalize_text(st.clinic_name) like '%' || q || '%'))
      and (p_region is null or exists (select 1 from sites st where st.doctor_id = b.id and st.region_id = p_region))
      and (p_commune is null or exists (select 1 from sites st where st.doctor_id = b.id and st.commune_id = p_commune))
      and (p_clinic is null or exists (select 1 from sites st where st.doctor_id = b.id and st.clinic_id = p_clinic))
      and (p_day is null or exists (select 1 from sites st where st.doctor_id = b.id and st.schedule ? p_day))
      and (not coalesce(p_today, false) or (b.absent is null and exists (select 1 from sites st where st.doctor_id = b.id and st.schedule ? today)))
  )
  select m.id, m.title, m.display_name, m.gender, m.languages, m.specs, m.site_list, m.min_dist, m.confirmed_at,
         public.directory_freshness(m.confirmed_at), m.absent, count(*) over ()
  from matched m
  order by case when p_sort = 'distance' then coalesce(m.min_dist, 1e9) end asc, public.normalize_text(m.display_name) asc, m.id
  limit lim offset greatest(coalesce(p_offset, 0), 0);
  get diagnostics n = row_count;
  -- Journal anonyme (aucun identifiant) : mesure des besoins non couverts
  if coalesce(p_offset, 0) = 0 and (q is not null or p_specialty is not null) then
    insert into public.search_logs (query_normalized, region_id, commune_id, result_count, kind)
    values (coalesce(q, (select public.normalize_text(name) from public.medical_specialties where id = p_specialty)), p_region, p_commune, n, 'doctor');
  end if;
end $$;

create or replace function public.search_clinics(
  p_query text default null, p_region uuid default null, p_commune uuid default null, p_specialty uuid default null,
  p_emergency boolean default false, p_lat double precision default null, p_lng double precision default null,
  p_sort text default 'name', p_limit int default 20, p_offset int default 0)
returns table (clinic_id uuid, name text, kind text, address text, commune_name text, region_name text, phone text,
               latitude double precision, longitude double precision, emergency_24h boolean, services text[], specialties jsonb,
               doctors_count bigint, is_open boolean, distance_km double precision, confirmed_at timestamptz, freshness text, total_count bigint)
language plpgsql security definer set search_path = public, extensions as $$
declare q text := nullif(public.normalize_text(left(coalesce(p_query, ''), 80)), ''); lim int := least(greatest(coalesce(p_limit, 20), 1), 50); n int;
begin
  return query
  with pub_sites as (
    select s.clinic_id, s.doctor_id from public.doctor_practice_sites s join public.doctors d on d.id = s.doctor_id
    where s.doctor_accepted and s.clinic_accepted and d.status = 'verified' and d.is_published and public.directory_freshness(d.confirmed_at) <> 'stale'
  )
  select c.id, c.name, c.kind, c.address, cm.name, r.name, c.phone, c.latitude, c.longitude, c.emergency_24h, c.services,
         (select coalesce(jsonb_agg(distinct jsonb_build_object('id', ms.id, 'name', ms.name)), '[]')
            from pub_sites ps join public.doctor_specialties ds on ds.doctor_id = ps.doctor_id join public.medical_specialties ms on ms.id = ds.specialty_id
           where ps.clinic_id = c.id),
         (select count(*) from pub_sites ps where ps.clinic_id = c.id),
         public.is_open_now(c.opening_hours, true),
         public.distance_km(p_lat, p_lng, c.latitude, c.longitude), c.confirmed_at, public.directory_freshness(c.confirmed_at), count(*) over ()
  from public.clinics c join public.regions r on r.id = c.region_id left join public.communes cm on cm.id = c.commune_id
  where c.status = 'verified' and public.directory_freshness(c.confirmed_at) <> 'stale'
    and (p_region is null or c.region_id = p_region) and (p_commune is null or c.commune_id = p_commune)
    and (not coalesce(p_emergency, false) or c.emergency_24h)
    and (q is null or public.normalize_text(c.name) like '%' || q || '%' or extensions.word_similarity(q, public.normalize_text(c.name)) > 0.45)
    and (p_specialty is null or exists (select 1 from pub_sites ps join public.doctor_specialties ds on ds.doctor_id = ps.doctor_id
                                        where ps.clinic_id = c.id and ds.specialty_id = p_specialty))
  order by case when p_sort = 'distance' then coalesce(public.distance_km(p_lat, p_lng, c.latitude, c.longitude), 1e9) end asc,
           public.normalize_text(c.name), c.id
  limit lim offset greatest(coalesce(p_offset, 0), 0);
  get diagnostics n = row_count;
  if coalesce(p_offset, 0) = 0 and q is not null then
    insert into public.search_logs (query_normalized, region_id, commune_id, result_count, kind) values (q, p_region, p_commune, n, 'clinic');
  end if;
end $$;

-- Pharmacies vérifiées les plus proches d'un point (fiche clinique)
create or replace function public.nearby_pharmacies(p_lat double precision, p_lng double precision, p_limit int default 4)
returns table (id uuid, name text, address text, phone text, is_open boolean, distance_km double precision,
               latitude double precision, longitude double precision)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.address, p.phone, public.is_open_now(p.opening_hours, p.hours_verified),
         public.distance_km(p_lat, p_lng, p.latitude, p.longitude), p.latitude, p.longitude
  from public.pharmacies p
  where p_lat is not null and p_lng is not null and p.status = 'verified' and p.latitude is not null
    and public.distance_km(p_lat, p_lng, p.latitude, p.longitude) <= 10
  order by public.is_open_now(p.opening_hours, p.hours_verified) desc nulls last, public.distance_km(p_lat, p_lng, p.latitude, p.longitude)
  limit least(greatest(coalesce(p_limit, 4), 1), 10)
$$;

-- Médecins vérifiés que la clinique peut inviter (recherche par nom)
create or replace function public.find_doctors_to_invite(p_clinic uuid, p_query text)
returns table (doctor_id uuid, title text, display_name text, specialties text)
language plpgsql stable security definer set search_path = public, extensions as $$
declare q text := nullif(public.normalize_text(left(coalesce(p_query, ''), 80)), '');
begin
  if not public.can_manage_clinic(p_clinic) then raise exception 'PP403: accès refusé'; end if;
  if q is null or char_length(q) < 2 then return; end if;
  return query
  select d.id, d.title, d.display_name,
         (select string_agg(ms.name, ', ' order by ms.sort_order) from public.doctor_specialties ds join public.medical_specialties ms on ms.id = ds.specialty_id where ds.doctor_id = d.id)
  from public.doctors d
  where d.status = 'verified' and (public.normalize_text(d.display_name) like '%' || q || '%' or extensions.word_similarity(q, public.normalize_text(d.display_name)) > 0.45)
    and not exists (select 1 from public.doctor_practice_sites s where s.doctor_id = d.id and s.clinic_id = p_clinic)
  order by public.normalize_text(d.display_name) limit 20;
end $$;

-- ---------------------------------------------------------------------------
-- Rappels de confirmation (appelés par la maintenance planifiée)
-- ---------------------------------------------------------------------------
create or replace function public.directory_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; r record;
begin
  for r in select id, user_id from public.doctors
            where status = 'verified' and public.directory_freshness(confirmed_at) <> 'fresh'
              and (reminded_at is null or reminded_at < now() - interval '30 days')
            limit 500 loop
    perform public.notify_user(r.user_id, 'directory_confirm', 'Vos informations sont-elles toujours exactes ?',
      'Confirmez vos lieux et jours de consultation pour que votre fiche reste publiée.', null, '/medecin');
    update public.doctors set reminded_at = now() where id = r.id;
    n := n + 1;
  end loop;
  for r in select id from public.clinics
            where status = 'verified' and public.directory_freshness(confirmed_at) <> 'fresh'
              and (reminded_at is null or reminded_at < now() - interval '30 days')
            limit 500 loop
    perform public.notify_clinic(r.id, 'directory_confirm', 'Les informations de votre établissement sont-elles à jour ?',
      'Confirmez-les pour que votre fiche reste publiée dans l''annuaire.', '/clinique/' || r.id);
    update public.clinics set reminded_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.directory_reminders() from public, anon, authenticated;

create or replace function public.run_maintenance()
returns jsonb language plpgsql security definer set search_path = public as $$
declare expired int; rl int; logs int; notifs int; outbox int; issues int; reminders int;
begin
  expired := public.expire_overdue_orders();
  delete from public.rate_limit_events where at < now() - interval '1 day';
  get diagnostics rl = row_count;
  delete from public.search_logs where created_at < now() - interval '400 days';
  get diagnostics logs = row_count;
  delete from public.notifications where read_at is not null and read_at < now() - interval '180 days';
  get diagnostics notifs = row_count;
  delete from public.notification_outbox where status in ('sent', 'skipped') and created_at < now() - interval '90 days';
  get diagnostics outbox = row_count;
  reminders := public.directory_reminders();
  select count(*) into issues from public.integrity_issues() where severity = 'critique';
  insert into public.maintenance_runs (expired, purged, critical_issues)
  values (expired, jsonb_build_object('rate_limits', rl, 'search_logs', logs, 'notifications', notifs, 'outbox', outbox, 'directory_reminders', reminders), issues);
  delete from public.maintenance_runs where ran_at < now() - interval '30 days';
  return jsonb_build_object('expired', expired, 'purged', jsonb_build_object('rate_limits', rl, 'search_logs', logs, 'notifications', notifs,
    'outbox', outbox, 'directory_reminders', reminders), 'critical_issues', issues);
end $$;
revoke execute on function public.run_maintenance() from public, anon, authenticated;
grant execute on function public.run_maintenance() to service_role;

-- ---------------------------------------------------------------------------
-- Transfert de titularité d'une pharmacie (administration)
-- ---------------------------------------------------------------------------
create or replace function public.admin_transfer_pharmacy_owner(p_pharmacy uuid, p_email text, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin(); target uuid; old_owner uuid;
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'PP422: un motif est obligatoire (justificatifs du nouveau titulaire vérifiés)'; end if;
  if not exists (select 1 from public.pharmacies where id = p_pharmacy) then raise exception 'PP404: pharmacie introuvable'; end if;
  select u.id into target from auth.users u join public.profiles p on p.id = u.id where lower(u.email) = lower(trim(p_email)) and p.deleted_at is null;
  if target is null then raise exception 'PP404: aucun compte PharmaProxi avec cette adresse'; end if;
  select user_id into old_owner from public.pharmacy_members where pharmacy_id = p_pharmacy and member_role = 'owner' limit 1;
  if old_owner = target then raise exception 'PP409: cette personne est déjà titulaire'; end if;
  update public.pharmacy_members set member_role = 'staff' where pharmacy_id = p_pharmacy and member_role = 'owner';
  insert into public.pharmacy_members (pharmacy_id, user_id, member_role) values (p_pharmacy, target, 'owner')
  on conflict (pharmacy_id, user_id) do update set member_role = 'owner';
  insert into public.user_roles (user_id, role, granted_by) values (target, 'pharmacist', uid) on conflict do nothing;
  perform public.log_audit('pharmacy.owner_transfer', 'pharmacy', p_pharmacy::text,
    jsonb_build_object('from', old_owner, 'to', target, 'reason', p_reason));
  perform public.notify_user(target, 'pharmacy_member', 'Vous êtes désormais titulaire d''une pharmacie',
    (select name from public.pharmacies where id = p_pharmacy), null, '/pharmacien');
  return target;
end $$;

-- ---------------------------------------------------------------------------
-- Stockage privé des justificatifs : chemin = doctor/<id>/<fichier> ou clinic/<id>/<fichier>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('directory-documents', 'directory-documents', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create or replace function public.can_upload_directory_doc(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare parts text[] := storage.foldername(p_name); oid uuid;
begin
  if parts is null or array_length(parts, 1) < 2 then return false; end if;
  begin oid := parts[2]::uuid; exception when others then return false; end;
  if parts[1] = 'doctor' then
    return exists (select 1 from public.doctors where id = oid and user_id = auth.uid() and status <> 'suspended');
  elsif parts[1] = 'clinic' then
    return public.can_manage_clinic(oid) and public.is_clinic_owner(oid);
  end if;
  return false;
end $$;

create or replace function public.can_read_directory_doc(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare parts text[] := storage.foldername(p_name); oid uuid;
begin
  if public.is_admin() then return true; end if;
  if parts is null or array_length(parts, 1) < 2 then return false; end if;
  begin oid := parts[2]::uuid; exception when others then return false; end;
  if parts[1] = 'doctor' then return exists (select 1 from public.doctors where id = oid and user_id = auth.uid()); end if;
  if parts[1] = 'clinic' then return public.is_clinic_member(oid); end if;
  return false;
end $$;

create policy "pp_dir_docs_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'directory-documents' and public.can_upload_directory_doc(name));
create policy "pp_dir_docs_select" on storage.objects for select to authenticated
  using (bucket_id = 'directory-documents' and public.can_read_directory_doc(name));
create policy "pp_dir_docs_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'directory-documents' and public.can_upload_directory_doc(name));

-- ---------------------------------------------------------------------------
-- Sécurité au niveau des lignes
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['medical_specialties', 'clinics', 'clinic_private', 'clinic_members', 'clinic_documents', 'doctors',
    'doctor_private', 'doctor_specialties', 'doctor_documents', 'doctor_practice_sites', 'doctor_absences', 'directory_verifications'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy "lecture publique" on public.medical_specialties for select using (is_active or public.is_admin());

create policy "fiches publiées, membres, médecins liés, admin" on public.clinics for select
  using (public.clinic_is_public(id) or public.is_clinic_member(id) or public.clinic_linked_to_me(id) or public.is_admin());
create policy "membres et admin" on public.clinic_private for select using (public.is_clinic_member(clinic_id) or public.is_admin());
create policy "membres et admin" on public.clinic_members for select using (user_id = auth.uid() or public.is_clinic_member(clinic_id) or public.is_admin());
create policy "membres et admin" on public.clinic_documents for select using (public.is_clinic_member(clinic_id) or public.is_admin());
create policy "responsable dépose" on public.clinic_documents for insert
  with check (public.can_manage_clinic(clinic_id) and public.is_clinic_owner(clinic_id) and uploaded_by = auth.uid()
              and storage_path like 'clinic/' || clinic_id::text || '/%');
create policy "responsable retire si en attente" on public.clinic_documents for delete
  using (public.is_clinic_owner(clinic_id) and exists (select 1 from public.clinics c where c.id = clinic_id and c.status in ('pending', 'rejected')));

create policy "fiches publiées, soi-même, cliniques liées, admin" on public.doctors for select
  using (public.doctor_is_public(id) or user_id = auth.uid() or public.doctor_linked_to_my_clinic(id) or public.is_admin());
create policy "soi-même et admin" on public.doctor_private for select
  using (exists (select 1 from public.doctors d where d.id = doctor_id and d.user_id = auth.uid()) or public.is_admin());
create policy "selon la fiche" on public.doctor_specialties for select
  using (exists (select 1 from public.doctors d where d.id = doctor_id));
create policy "soi-même et admin" on public.doctor_documents for select
  using (exists (select 1 from public.doctors d where d.id = doctor_id and d.user_id = auth.uid()) or public.is_admin());
create policy "médecin dépose" on public.doctor_documents for insert
  with check (exists (select 1 from public.doctors d where d.id = doctor_id and d.user_id = auth.uid() and d.status <> 'suspended')
              and uploaded_by = auth.uid() and storage_path like 'doctor/' || doctor_id::text || '/%');
create policy "médecin retire si en attente" on public.doctor_documents for delete
  using (exists (select 1 from public.doctors d where d.id = doctor_id and d.user_id = auth.uid() and d.status in ('pending', 'rejected')));

create policy "publics, parties concernées, admin" on public.doctor_practice_sites for select
  using ((doctor_accepted and clinic_accepted and public.doctor_is_public(doctor_id) and public.clinic_is_public(clinic_id))
         or doctor_id = public.my_doctor_id() or public.is_clinic_member(clinic_id) or public.is_admin());
create policy "selon la fiche" on public.doctor_absences for select
  using (exists (select 1 from public.doctors d where d.id = doctor_id));
create policy "concernés et admin" on public.directory_verifications for select
  using (public.is_admin() or (doctor_id is not null and doctor_id = public.my_doctor_id())
         or (clinic_id is not null and public.is_clinic_member(clinic_id)));

-- Signalements : le médecin et la clinique concernés voient ceux qui les visent
drop policy "auteur, pharmacie concernée, admin" on public.reports;
create policy "auteur, professionnel concerné, admin" on public.reports for select
  using (reporter_id = auth.uid() or public.is_admin()
         or (pharmacy_id is not null and public.is_pharmacy_member(pharmacy_id))
         or (doctor_id is not null and doctor_id = public.my_doctor_id())
         or (clinic_id is not null and public.is_clinic_member(clinic_id)));

-- Privilèges : écritures exclusivement par fonctions (sauf dépôt de justificatifs)
revoke insert, update, delete, truncate on public.medical_specialties, public.clinics, public.clinic_private, public.clinic_members,
  public.clinic_documents, public.doctors, public.doctor_private, public.doctor_specialties, public.doctor_documents,
  public.doctor_practice_sites, public.doctor_absences, public.directory_verifications from anon;
revoke insert, update, delete on public.medical_specialties, public.clinics, public.clinic_private, public.clinic_members,
  public.doctors, public.doctor_private, public.doctor_specialties, public.doctor_practice_sites, public.doctor_absences,
  public.directory_verifications from authenticated;
revoke update on public.clinic_documents, public.doctor_documents from authenticated;
revoke all on public.clinic_private, public.doctor_private, public.clinic_documents, public.doctor_documents from anon;

-- Délais maximums identiques aux autres fonctions publiques
alter function public.search_doctors(text, uuid, uuid, uuid, uuid, text, boolean, text, text, double precision, double precision, text, int, int) set statement_timeout = '5s';
alter function public.search_clinics(text, uuid, uuid, uuid, boolean, double precision, double precision, text, int, int) set statement_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Contrôle d'intégrité : un lieu publié doit relier un médecin et une clinique vérifiés
-- ---------------------------------------------------------------------------
create or replace function public.directory_integrity_issues()
returns table (check_name text, severity text, entity_id text, details text)
language sql stable security definer set search_path = public as $$
  select 'site_without_verified_parties', 'avertissement', s.id::text,
         format('lieu accepté des deux côtés mais médecin %s / clinique %s', d.status, c.status)
  from public.doctor_practice_sites s join public.doctors d on d.id = s.doctor_id join public.clinics c on c.id = s.clinic_id
  where s.doctor_accepted and s.clinic_accepted and (d.status = 'suspended' or c.status = 'suspended')
  union all
  select 'doctor_without_specialty', 'critique', d.id::text, 'fiche médecin sans spécialité'
  from public.doctors d where not exists (select 1 from public.doctor_specialties ds where ds.doctor_id = d.id)
  union all
  select 'doctor_without_consent', 'critique', d.id::text, 'fiche publiée sans consentement'
  from public.doctors d where d.is_published and d.publication_consent_at is null
$$;
revoke execute on function public.directory_integrity_issues() from public, anon, authenticated;

create or replace function public.admin_integrity_report()
returns table (check_name text, severity text, entity_id text, details text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return query select * from public.integrity_issues() union all select * from public.directory_integrity_issues();
end $$;

-- ---------------------------------------------------------------------------
-- Indicateurs : les statistiques de recherche de médicaments excluent l'annuaire,
-- qui a ses propres indicateurs.
-- ---------------------------------------------------------------------------
create or replace function public.admin_stats(p_from timestamptz default now() - interval '30 days', p_to timestamptz default now(), p_region uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  perform public.require_admin();
  select jsonb_build_object(
    'pharmacies_registered', (select count(*) from public.pharmacies where (p_region is null or region_id = p_region) and not is_demo),
    'pharmacies_verified', (select count(*) from public.pharmacies where status = 'verified' and (p_region is null or region_id = p_region) and not is_demo),
    'pharmacies_pending', (select count(*) from public.pharmacies where status = 'pending' and (p_region is null or region_id = p_region)),
    'pharmacies_active', (select count(distinct i.pharmacy_id) from public.pharmacy_inventory i join public.pharmacies p on p.id = i.pharmacy_id
                          where p.status = 'verified' and i.stock_updated_at >= now() - interval '7 days' and (p_region is null or p.region_id = p_region) and not p.is_demo),
    'catalog_items', (select count(*) from public.medicine_catalog where merged_into is null and review_status <> 'rejected'),
    'catalog_pending', (select count(*) from public.medicine_catalog where merged_into is null and review_status = 'pending'),
    'inventory_lines', (select count(*) from public.pharmacy_inventory i join public.pharmacies p on p.id = i.pharmacy_id where (p_region is null or p.region_id = p_region)),
    'inventory_fresh', (select count(*) from public.pharmacy_inventory i join public.pharmacies p on p.id = i.pharmacy_id
                        where i.stock_updated_at >= now() - make_interval(hours => public.setting_int('stock_fresh_hours', 24)) and (p_region is null or p.region_id = p_region)),
    'searches', (select count(*) from public.search_logs where kind = 'medicine' and created_at between p_from and p_to and (p_region is null or region_id = p_region)),
    'searches_no_result', (select count(*) from public.search_logs where kind = 'medicine' and result_count = 0 and created_at between p_from and p_to and (p_region is null or region_id = p_region)),
    'top_no_result_queries', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select query_normalized as query, count(*) as n from public.search_logs
        where kind = 'medicine' and result_count = 0 and created_at between p_from and p_to and (p_region is null or region_id = p_region)
        group by 1 order by 2 desc limit 10) x),
    'orders_by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
        select o.status, count(*) as n from public.orders o join public.pharmacies p on p.id = o.pharmacy_id
        where o.created_at between p_from and p_to and (p_region is null or p.region_id = p_region) group by 1) x),
    'orders_total', (select count(*) from public.orders o join public.pharmacies p on p.id = o.pharmacy_id
        where o.created_at between p_from and p_to and (p_region is null or p.region_id = p_region)),
    'pharmacies_by_region', (select coalesce(jsonb_agg(x order by x.verified desc), '[]'::jsonb) from (
        select r.name as region, count(p.id) filter (where p.status = 'verified') as verified, count(p.id) as registered
        from public.regions r left join public.pharmacies p on p.region_id = r.id and not p.is_demo
        group by r.name) x),
    'open_reports', (select count(*) from public.reports where status in ('open', 'in_review')),
    'couriers_verified', (select count(*) from public.couriers where status = 'verified'),
    'couriers_pending', (select count(*) from public.couriers where status = 'pending')
  ) into res;
  return res;
end $$;

create or replace function public.admin_directory_stats(p_from timestamptz default now() - interval '30 days', p_to timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'doctors_verified', (select count(*) from public.doctors where status = 'verified' and not is_demo),
    'doctors_published', (select count(*) from public.doctors where status = 'verified' and is_published and public.directory_freshness(confirmed_at) <> 'stale' and not is_demo),
    'doctors_pending', (select count(*) from public.doctors where status = 'pending'),
    'doctors_to_confirm', (select count(*) from public.doctors where status = 'verified' and public.directory_freshness(confirmed_at) <> 'fresh'),
    'clinics_verified', (select count(*) from public.clinics where status = 'verified' and not is_demo),
    'clinics_pending', (select count(*) from public.clinics where status = 'pending'),
    'sites_published', (select count(*) from public.doctor_practice_sites where doctor_accepted and clinic_accepted),
    'searches', (select count(*) from public.search_logs where kind in ('doctor', 'clinic') and created_at between p_from and p_to),
    'searches_no_result', (select count(*) from public.search_logs where kind in ('doctor', 'clinic') and result_count = 0 and created_at between p_from and p_to),
    'top_no_result_queries', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select query_normalized as query, count(*) as n from public.search_logs
        where kind in ('doctor', 'clinic') and result_count = 0 and created_at between p_from and p_to
        group by 1 order by 2 desc limit 10) x),
    'open_reports', (select count(*) from public.reports where (doctor_id is not null or clinic_id is not null) and status in ('open', 'in_review'))
  );
end $$;

-- ---------------------------------------------------------------------------
-- Stocks d'une pharmacie paginés côté base (grandes officines, grossistes)
-- ---------------------------------------------------------------------------
create or replace function public.pharmacy_stock_page(p_pharmacy uuid, p_view text default 'tous', p_query text default null,
                                                      p_limit int default 100, p_offset int default 0)
returns table (id uuid, catalog_id uuid, quantity int, reserved_quantity int, price_xof int, is_available boolean, low_stock_threshold int,
               stock_updated_at timestamptz, row_version int, brand_name text, dosage text, form text, packaging text, review_status text,
               freshness text, total_count bigint)
language plpgsql stable security definer set search_path = public as $$
declare q text := nullif(public.normalize_text(left(coalesce(p_query, ''), 80)), '');
begin
  if not (public.is_pharmacy_member(p_pharmacy) or public.is_admin()) then raise exception 'PP403: accès refusé'; end if;
  return query
  select i.id, i.catalog_id, i.quantity, i.reserved_quantity, i.price_xof, i.is_available, i.low_stock_threshold, i.stock_updated_at, i.row_version,
         c.brand_name, c.dosage, c.form, c.packaging, c.review_status,
         public.stock_freshness(i.quantity, i.reserved_quantity, i.is_available, i.stock_updated_at), count(*) over ()
  from public.pharmacy_inventory i join public.medicine_catalog c on c.id = i.catalog_id
  where i.pharmacy_id = p_pharmacy
    and (q is null or c.search_text like '%' || q || '%')
    and case coalesce(p_view, 'tous')
          when 'disponibles' then i.is_available and i.quantity - i.reserved_quantity > 0
          when 'indisponibles' then not i.is_available or i.quantity - i.reserved_quantity <= 0
          when 'faibles' then i.is_available and i.quantity - i.reserved_quantity <= i.low_stock_threshold
          when 'anciens' then public.stock_freshness(i.quantity, i.reserved_quantity, i.is_available, i.stock_updated_at) in ('stale', 'to_confirm')
          else true end
  order by public.normalize_text(concat_ws(' ', c.brand_name, c.dosage, c.form, c.packaging)), i.id
  limit least(greatest(coalesce(p_limit, 100), 1), 500) offset greatest(coalesce(p_offset, 0), 0);
end $$;

-- ---------------------------------------------------------------------------
-- Données de démonstration de l'annuaire (service_role uniquement).
-- Noms explicitement fictifs (« DÉMO »), aucun médecin ni établissement réel.
-- ---------------------------------------------------------------------------
create or replace function public.demo_directory_install(p_users jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u_d1 uuid := (p_users ->> 'doctor1')::uuid;
  u_d2 uuid := (p_users ->> 'doctor2')::uuid;
  u_cl uuid := (p_users ->> 'clinic')::uuid;
  r_bko uuid; c3 uuid; c4 uuid; cl1 uuid; cl2 uuid; d1 uuid; d2 uuid;
  hours jsonb := '{"mon":[["08:00","18:00"]],"tue":[["08:00","18:00"]],"wed":[["08:00","18:00"]],"thu":[["08:00","18:00"]],"fri":[["08:00","18:00"]],"sat":[["08:00","13:00"]]}';
begin
  if exists (select 1 from public.clinics where is_demo) then raise exception 'Les données de démonstration de l''annuaire sont déjà installées'; end if;
  update public.profiles set is_demo = true where id in (u_d1, u_d2, u_cl);
  update public.profiles set full_name = 'Médecin Démo 1' where id = u_d1;
  update public.profiles set full_name = 'Médecin Démo 2' where id = u_d2;
  update public.profiles set full_name = 'Gestionnaire Clinique Démo' where id = u_cl;
  select id into r_bko from public.regions where name = 'District de Bamako';
  select id into c3 from public.communes where region_id = r_bko and name = 'Commune III';
  select id into c4 from public.communes where region_id = r_bko and name = 'Commune IV';

  insert into public.clinics (name, kind, status, address, region_id, commune_id, latitude, longitude, phone, opening_hours, emergency_24h, services, verified_at, is_demo, created_by)
  values ('Clinique DÉMO du Djoliba', 'clinique', 'verified', 'Adresse de démonstration n°10', r_bko, c3, 12.6470, -7.9950, '+22320000101', hours, true,
          array['laboratoire', 'imagerie', 'maternite', 'hospitalisation'], now(), true, u_cl) returning id into cl1;
  insert into public.clinics (name, kind, status, address, region_id, commune_id, latitude, longitude, phone, opening_hours, emergency_24h, services, verified_at, is_demo, created_by)
  values ('Cabinet médical DÉMO des Manguiers', 'cabinet', 'verified', 'Adresse de démonstration n°11', r_bko, c4, 12.6280, -8.0250, '+22320000102', hours, false,
          array['laboratoire'], now(), true, u_cl) returning id into cl2;
  insert into public.clinic_private (clinic_id, manager_name) values (cl1, 'Gestionnaire Démo'), (cl2, 'Gestionnaire Démo');
  insert into public.clinic_members (clinic_id, user_id, member_role) values (cl1, u_cl, 'owner'), (cl2, u_cl, 'owner');

  insert into public.doctors (user_id, title, display_name, gender, languages, status, publication_consent_at, verified_at, is_demo)
  values (u_d1, 'Dr', 'Démo Aminata (cardiologie)', 'F', array['fr', 'bm'], 'verified', now(), now(), true) returning id into d1;
  insert into public.doctors (user_id, title, display_name, gender, languages, status, publication_consent_at, verified_at, is_demo)
  values (u_d2, 'Dr', 'Démo Ibrahima (pédiatrie)', 'M', array['fr', 'bm', 'snk'], 'verified', now(), now(), true) returning id into d2;
  insert into public.doctor_private (doctor_id, order_number) values (d1, 'DEMO-0001'), (d2, 'DEMO-0002');
  insert into public.doctor_specialties (doctor_id, specialty_id)
  select d1, id from public.medical_specialties where code = 'cardiologie'
  union all select d2, id from public.medical_specialties where code in ('pediatrie', 'medecine_generale');

  insert into public.doctor_practice_sites (doctor_id, clinic_id, schedule, appointment_phone, doctor_accepted, clinic_accepted) values
    (d1, cl1, '{"mon":[["08:00","12:00"]],"wed":[["15:00","18:00"]]}', '+22320000111', true, true),
    (d1, cl2, '{"sat":[["09:00","12:00"]]}', null, true, true),
    (d2, cl1, '{"tue":[["08:00","13:00"]],"thu":[["08:00","13:00"]],"fri":[["15:00","18:00"]]}', null, true, true);
  return jsonb_build_object('clinics', jsonb_build_array(cl1, cl2), 'doctors', jsonb_build_array(d1, d2));
end $$;

create or replace function public.demo_directory_uninstall()
returns jsonb language plpgsql security definer set search_path = public as $$
declare n_doc int; n_cli int;
begin
  delete from public.reports where doctor_id in (select id from public.doctors where is_demo) or clinic_id in (select id from public.clinics where is_demo);
  with d as (delete from public.doctors where is_demo returning 1) select count(*) into n_doc from d;
  with d as (delete from public.clinics where is_demo returning 1) select count(*) into n_cli from d;
  return jsonb_build_object('doctors_deleted', n_doc, 'clinics_deleted', n_cli);
end $$;

revoke execute on function public.demo_directory_install(jsonb) from public, anon, authenticated;
revoke execute on function public.demo_directory_uninstall() from public, anon, authenticated;
grant execute on function public.demo_directory_install(jsonb) to service_role;
grant execute on function public.demo_directory_uninstall() to service_role;

-- >>> 20261028000100_pharmacy_listings.sql
-- ============================================================================
-- PharmaProxi — Migration : annuaire des pharmacies non encore inscrites
-- Fiches d'annuaire simples (nom, zone, adresse, téléphone, position), gérées
-- par l'administration. Elles n'ont ni stock, ni prix, ni commande : elles
-- permettent au public de trouver et d'appeler une officine qui n'a pas encore
-- rejoint PharmaProxi. Une fiche est masquée dès qu'elle est rattachée à la
-- pharmacie vérifiée correspondante.
-- ============================================================================

create table public.pharmacy_listings (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  region_id uuid not null references public.regions(id) on delete restrict,
  commune_id uuid references public.communes(id) on delete set null,
  locality_id uuid references public.localities(id) on delete set null,
  area_label text check (char_length(coalesce(area_label, '')) <= 200),
  address text check (char_length(coalesce(address, '')) <= 300),
  phone text check (phone is null or public.valid_phone(phone)),
  latitude double precision check (latitude is null or latitude between 9.5 and 25.5),
  longitude double precision check (longitude is null or longitude between -12.8 and 4.8),
  source text not null default 'Saisie administrateur' check (char_length(source) between 1 and 200),
  is_published boolean not null default true,
  claimed_pharmacy_id uuid references public.pharmacies(id) on delete set null,
  search_name text generated always as (public.normalize_text(name)) stored,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null))
);

create unique index pharmacy_listings_dedup
  on public.pharmacy_listings (search_name, region_id, coalesce(commune_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index pharmacy_listings_name_trgm on public.pharmacy_listings using gin (search_name extensions.gin_trgm_ops);
create index pharmacy_listings_zone on public.pharmacy_listings (region_id, commune_id) where is_published and claimed_pharmacy_id is null;
create index pharmacy_listings_claimed on public.pharmacy_listings (claimed_pharmacy_id) where claimed_pharmacy_id is not null;

alter table public.pharmacy_listings enable row level security;

create policy "pp_listings_public_read" on public.pharmacy_listings for select to anon, authenticated
  using (is_published and claimed_pharmacy_id is null);
create policy "pp_listings_admin_read" on public.pharmacy_listings for select to authenticated
  using (public.is_admin());

revoke insert, update, delete on public.pharmacy_listings from anon, authenticated;
grant select on public.pharmacy_listings to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Normalisation d'un numéro malien : « 76-32-23-41 », « 76 32 23 41 »,
-- « 00223 76322341 », « +223 76 32 23 41 » → « +22376322341 ». NULL si invalide.
-- ---------------------------------------------------------------------------
create or replace function public.normalize_ml_phone(p text)
returns text language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p, ''), '[^0-9+]', '', 'g');
begin
  if d = '' then return null; end if;
  if d like '+%' then d := substr(d, 2);
  elsif d like '00%' then d := substr(d, 3);
  elsif char_length(d) = 8 then d := '223' || d;
  end if;
  d := regexp_replace(d, '[^0-9]', '', 'g');
  if ('+' || d) ~ '^\+[1-9][0-9]{7,14}$' then return '+' || d; end if;
  return null;
end $$;

-- Résolution d'une région / commune / quartier saisis en texte libre
create or replace function public.resolve_region(p text)
returns uuid language sql stable set search_path = public as $$
  select id from public.regions
  where public.normalize_text(name) = public.normalize_text(p)
     or (public.normalize_text(p) in ('bamako', 'district de bamako', 'district bamako') and name = 'District de Bamako')
  limit 1
$$;

create or replace function public.resolve_commune(p_region uuid, p text)
returns uuid language plpgsql stable set search_path = public as $$
declare t text := public.normalize_text(p); r uuid;
begin
  if p_region is null or t = '' then return null; end if;
  -- « Commune 4 », « C4 », « CIV », « commune iv » → « Commune IV »
  t := regexp_replace(t, '^(commune|com\.?|c)\s*', 'commune ');
  t := case regexp_replace(t, '^commune ', '')
         when '1' then 'commune i' when '2' then 'commune ii' when '3' then 'commune iii'
         when '4' then 'commune iv' when '5' then 'commune v' when '6' then 'commune vi'
         else t end;
  select id into r from public.communes where region_id = p_region and public.normalize_text(name) = t limit 1;
  if r is null then
    select id into r from public.communes where region_id = p_region and public.normalize_text(name) = public.normalize_text(p) limit 1;
  end if;
  return r;
end $$;

create or replace function public.resolve_locality(p_commune uuid, p text)
returns uuid language sql stable set search_path = public as $$
  select id from public.localities
  where p_commune is not null and commune_id = p_commune and public.normalize_text(name) = public.normalize_text(p)
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- Administration
-- ---------------------------------------------------------------------------
create or replace function public.admin_save_listing(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_admin();
  lid uuid := nullif(p ->> 'id', '')::uuid;
  v_phone text := public.normalize_ml_phone(p ->> 'phone');
  v_lat double precision := nullif(p ->> 'latitude', '')::double precision;
  v_lng double precision := nullif(p ->> 'longitude', '')::double precision;
begin
  if nullif(btrim(p ->> 'phone'), '') is not null and v_phone is null then
    raise exception 'PP422: numéro de téléphone invalide';
  end if;
  if (v_lat is null) <> (v_lng is null) then
    raise exception 'PP422: renseignez la latitude ET la longitude, ou aucune des deux';
  end if;
  if lid is null then
    insert into public.pharmacy_listings (name, region_id, commune_id, locality_id, area_label, address, phone, latitude, longitude, source, created_by)
    values (btrim(p ->> 'name'), (p ->> 'region_id')::uuid, nullif(p ->> 'commune_id', '')::uuid, nullif(p ->> 'locality_id', '')::uuid,
            nullif(btrim(p ->> 'area_label'), ''), nullif(btrim(p ->> 'address'), ''), v_phone, v_lat, v_lng,
            coalesce(nullif(btrim(p ->> 'source'), ''), 'Saisie administrateur'), uid)
    returning id into lid;
    perform public.log_audit('listing.create', 'pharmacy_listing', lid::text, jsonb_build_object('name', p ->> 'name'));
  else
    update public.pharmacy_listings set
      name = btrim(p ->> 'name'), region_id = (p ->> 'region_id')::uuid,
      commune_id = nullif(p ->> 'commune_id', '')::uuid, locality_id = nullif(p ->> 'locality_id', '')::uuid,
      area_label = nullif(btrim(p ->> 'area_label'), ''), address = nullif(btrim(p ->> 'address'), ''),
      phone = v_phone, latitude = v_lat, longitude = v_lng,
      source = coalesce(nullif(btrim(p ->> 'source'), ''), source), updated_at = now()
    where id = lid;
    if not found then raise exception 'PP404: fiche introuvable'; end if;
    perform public.log_audit('listing.update', 'pharmacy_listing', lid::text, jsonb_build_object('name', p ->> 'name'));
  end if;
  return lid;
exception when unique_violation then
  raise exception 'PP409: une fiche porte déjà ce nom dans cette zone';
end $$;

create or replace function public.admin_set_listing_published(p_id uuid, p_published boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.pharmacy_listings set is_published = p_published, updated_at = now() where id = p_id;
  if not found then raise exception 'PP404: fiche introuvable'; end if;
  perform public.log_audit(case when p_published then 'listing.publish' else 'listing.unpublish' end, 'pharmacy_listing', p_id::text);
end $$;

create or replace function public.admin_delete_listing(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n text;
begin
  perform public.require_admin();
  delete from public.pharmacy_listings where id = p_id returning name into n;
  if n is null then raise exception 'PP404: fiche introuvable'; end if;
  perform public.log_audit('listing.delete', 'pharmacy_listing', p_id::text, jsonb_build_object('name', n));
end $$;

create or replace function public.admin_link_listing(p_id uuid, p_pharmacy uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if p_pharmacy is not null and not exists (select 1 from public.pharmacies where id = p_pharmacy and status = 'verified') then
    raise exception 'PP422: seule une pharmacie vérifiée peut être rattachée';
  end if;
  update public.pharmacy_listings set claimed_pharmacy_id = p_pharmacy, updated_at = now() where id = p_id;
  if not found then raise exception 'PP404: fiche introuvable'; end if;
  perform public.log_audit(case when p_pharmacy is null then 'listing.unlink' else 'listing.link' end, 'pharmacy_listing', p_id::text,
    jsonb_build_object('pharmacy', p_pharmacy));
end $$;

-- Pharmacies vérifiées dont le nom ressemble à la fiche (aide au rattachement)
create or replace function public.admin_listing_matches(p_id uuid)
returns table (id uuid, name text, commune_name text, similarity real)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_admin();
  return query
  select p.id, p.name, c.name, extensions.similarity(public.normalize_text(p.name), l.search_name)
  from public.pharmacy_listings l
  join public.pharmacies p on p.status = 'verified' and p.region_id = l.region_id
  left join public.communes c on c.id = p.commune_id
  where l.id = p_id and extensions.similarity(public.normalize_text(p.name), l.search_name) > 0.25
  order by 4 desc limit 5;
end $$;

-- Import en masse. p_rows : [{line, name, region, commune, quartier, address, phone, latitude, longitude, source}]
-- Les doublons (même nom dans la même zone) sont ignorés, jamais écrasés.
create or replace function public.admin_import_listings(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_admin();
  rec record; ok int := 0; dup int := 0; errors jsonb := '[]'::jsonb;
  v_region uuid; v_commune uuid; v_locality uuid; v_phone text; v_lat double precision; v_lng double precision; v_area text;
begin
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'PP422: format invalide'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'PP422: 5 000 lignes maximum par import'; end if;
  for rec in select coalesce((e ->> 'line')::int, (o)::int + 1) as line, e from jsonb_array_elements(p_rows) with ordinality as t(e, o) loop
    begin
      if char_length(btrim(coalesce(rec.e ->> 'name', ''))) < 2 then raise exception 'PP422: nom manquant'; end if;
      v_region := public.resolve_region(rec.e ->> 'region');
      if v_region is null then raise exception 'PP422: région inconnue « % »', coalesce(rec.e ->> 'region', ''); end if;
      v_commune := public.resolve_commune(v_region, rec.e ->> 'commune');
      v_locality := public.resolve_locality(v_commune, rec.e ->> 'quartier');
      v_area := nullif(concat_ws(', ',
        case when v_locality is null then nullif(btrim(rec.e ->> 'quartier'), '') end,
        case when v_commune is null then nullif(btrim(rec.e ->> 'commune'), '') end), '');
      v_phone := public.normalize_ml_phone(rec.e ->> 'phone');
      if nullif(btrim(rec.e ->> 'phone'), '') is not null and v_phone is null then
        raise exception 'PP422: téléphone invalide « % »', rec.e ->> 'phone';
      end if;
      v_lat := nullif(replace(btrim(rec.e ->> 'latitude'), ',', '.'), '')::double precision;
      v_lng := nullif(replace(btrim(rec.e ->> 'longitude'), ',', '.'), '')::double precision;
      if (v_lat is null) <> (v_lng is null) then raise exception 'PP422: latitude et longitude vont ensemble'; end if;

      if exists (select 1 from public.pharmacy_listings l
                 where l.search_name = public.normalize_text(rec.e ->> 'name') and l.region_id = v_region
                   and l.commune_id is not distinct from v_commune) then
        dup := dup + 1;
        continue;
      end if;
      insert into public.pharmacy_listings (name, region_id, commune_id, locality_id, area_label, address, phone, latitude, longitude, source, created_by)
      values (btrim(rec.e ->> 'name'), v_region, v_commune, v_locality, v_area, nullif(btrim(rec.e ->> 'address'), ''),
              v_phone, v_lat, v_lng, coalesce(nullif(btrim(rec.e ->> 'source'), ''), 'Import CSV'), uid);
      ok := ok + 1;
    exception
      when invalid_text_representation then
        errors := errors || jsonb_build_object('row', rec.line, 'error', 'coordonnées invalides');
      when check_violation then
        errors := errors || jsonb_build_object('row', rec.line, 'error', 'valeur hors limites (nom trop long ou coordonnées hors du Mali)');
      when unique_violation then
        dup := dup + 1;
      when others then
        errors := errors || jsonb_build_object('row', rec.line, 'error', regexp_replace(sqlerrm, '^PP[0-9]+: ', ''));
    end;
  end loop;
  perform public.log_audit('listing.import', 'pharmacy_listing', null,
    jsonb_build_object('imported', ok, 'duplicates', dup, 'failed', jsonb_array_length(errors)));
  return jsonb_build_object('imported', ok, 'duplicates', dup, 'failed', jsonb_array_length(errors), 'errors', errors);
end $$;

-- ---------------------------------------------------------------------------
-- Annuaire public : pharmacies vérifiées + fiches non inscrites
-- Ordre neutre : distance si une position est donnée, sinon alphabétique.
-- ---------------------------------------------------------------------------
create or replace function public.pharmacy_directory(
  p_query text default null, p_region uuid default null, p_commune uuid default null,
  p_lat double precision default null, p_lng double precision default null,
  p_kind text default 'all', p_limit int default 30, p_offset int default 0)
returns table (kind text, id uuid, name text, address text, area text, phone text,
               latitude double precision, longitude double precision, distance_km double precision,
               is_demo boolean, total_count bigint)
language sql stable security definer set search_path = public, extensions as $$
  with q as (select nullif(public.normalize_text(p_query), '') as t),
  d as (
    select 'verified'::text as kind, p.id, p.name, p.address,
           concat_ws(', ', lo.name, c.name, r.name) as area, p.phone, p.latitude, p.longitude,
           public.distance_km(p_lat, p_lng, p.latitude, p.longitude) as distance_km, p.is_demo, public.normalize_text(p.name) as sn
    from public.pharmacies p
    join public.regions r on r.id = p.region_id
    left join public.communes c on c.id = p.commune_id
    left join public.localities lo on lo.id = p.locality_id
    where p.status = 'verified' and coalesce(p_kind, 'all') in ('all', 'verified')
      and (p_region is null or p.region_id = p_region) and (p_commune is null or p.commune_id = p_commune)
    union all
    select 'listing', l.id, l.name, l.address,
           concat_ws(', ', lo.name, l.area_label, c.name, r.name), l.phone, l.latitude, l.longitude,
           public.distance_km(p_lat, p_lng, l.latitude, l.longitude), l.is_demo, l.search_name
    from public.pharmacy_listings l
    join public.regions r on r.id = l.region_id
    left join public.communes c on c.id = l.commune_id
    left join public.localities lo on lo.id = l.locality_id
    where l.is_published and l.claimed_pharmacy_id is null and coalesce(p_kind, 'all') in ('all', 'listing')
      and (p_region is null or l.region_id = p_region) and (p_commune is null or l.commune_id = p_commune)
  )
  select d.kind, d.id, d.name, d.address, d.area, d.phone, d.latitude, d.longitude, d.distance_km, d.is_demo,
         count(*) over ()
  from d, q
  where q.t is null or d.sn like '%' || q.t || '%' or extensions.similarity(d.sn, q.t) > 0.3
  order by d.distance_km nulls last, d.sn, d.id
  limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
$$;
alter function public.pharmacy_directory(text, uuid, uuid, double precision, double precision, text, int, int) set statement_timeout = '5s';

-- Points de la carte pour les fiches non inscrites géolocalisées
create or replace function public.map_listings(p_region uuid default null, p_commune uuid default null,
                                                p_lat double precision default null, p_lng double precision default null)
returns table (id uuid, name text, address text, phone text, latitude double precision, longitude double precision,
               area text, distance_km double precision)
language sql stable security definer set search_path = public as $$
  select l.id, l.name, l.address, l.phone, l.latitude, l.longitude,
         concat_ws(', ', l.area_label, c.name), public.distance_km(p_lat, p_lng, l.latitude, l.longitude)
  from public.pharmacy_listings l
  left join public.communes c on c.id = l.commune_id
  where l.is_published and l.claimed_pharmacy_id is null and l.latitude is not null
    and (p_region is null or l.region_id = p_region) and (p_commune is null or l.commune_id = p_commune)
  order by 8 nulls last, l.name
  limit 500
$$;

revoke execute on function public.admin_save_listing(jsonb), public.admin_set_listing_published(uuid, boolean),
  public.admin_delete_listing(uuid), public.admin_link_listing(uuid, uuid), public.admin_listing_matches(uuid),
  public.admin_import_listings(jsonb) from public, anon;
grant execute on function public.admin_save_listing(jsonb), public.admin_set_listing_published(uuid, boolean),
  public.admin_delete_listing(uuid), public.admin_link_listing(uuid, uuid), public.admin_listing_matches(uuid),
  public.admin_import_listings(jsonb) to authenticated;
grant execute on function public.pharmacy_directory(text, uuid, uuid, double precision, double precision, text, int, int),
  public.map_listings(uuid, uuid, double precision, double precision) to anon, authenticated;

-- Statistiques d'administration
create or replace function public.admin_listing_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'total', (select count(*) from public.pharmacy_listings),
    'published', (select count(*) from public.pharmacy_listings where is_published and claimed_pharmacy_id is null),
    'claimed', (select count(*) from public.pharmacy_listings where claimed_pharmacy_id is not null),
    'with_phone', (select count(*) from public.pharmacy_listings where phone is not null),
    'with_position', (select count(*) from public.pharmacy_listings where latitude is not null));
end $$;
revoke execute on function public.admin_listing_stats() from public, anon;
grant execute on function public.admin_listing_stats() to authenticated;

-- >>> 20261028000200_registers.sql
-- ============================================================================
-- PharmaProxi — Migration : registres publics
--   1. Tableau de l'Ordre des médecins (registre officiel publié par l'Ordre) :
--      nom, prénom, spécialité, structure, conseil régional. Aucune coordonnée
--      personnelle. Distinct des fiches médecins vérifiées (contacts, plannings).
--   2. Établissements de santé non encore vérifiés (fiches d'annuaire simples).
--   3. Spécialités complémentaires présentes au Tableau.
-- ============================================================================

insert into public.medical_specialties (code, name, family, description, sort_order) values
  ('sante_publique', 'Santé publique', 'Santé publique et prévention', 'Le médecin de santé publique s''occupe de la prévention, de l''épidémiologie et de l''organisation des soins pour la population.', 100),
  ('medecine_travail', 'Médecine du travail', 'Santé publique et prévention', 'Le médecin du travail suit la santé des salariés en lien avec leur poste.', 101),
  ('medecine_urgence', 'Médecine d''urgence', 'Diagnostic et soins critiques', 'L''urgentiste prend en charge les situations médicales urgentes.', 83),
  ('medecine_legale', 'Médecine légale', 'Diagnostic et soins critiques', 'Le médecin légiste réalise les expertises médicales demandées par la justice.', 84),
  ('anatomopathologie', 'Anatomie et cytologie pathologiques', 'Diagnostic et soins critiques', 'L''anatomopathologiste analyse les tissus et les cellules prélevés (biopsies).', 85),
  ('chirurgie_cardio_thoracique', 'Chirurgie thoracique et cardiovasculaire', 'Chirurgie', 'Le chirurgien thoracique et cardiovasculaire opère le cœur, les vaisseaux et le thorax.', 56),
  ('chirurgie_plastique', 'Chirurgie plastique et reconstructrice', 'Chirurgie', 'Le chirurgien plasticien répare et reconstruit (brûlures, malformations, cicatrices).', 57),
  ('medecine_physique', 'Médecine physique et réadaptation', 'Médecine de l''adulte', 'Le médecin rééducateur aide à retrouver ses capacités après un accident ou une maladie.', 33),
  ('geriatrie', 'Gériatrie', 'Médecine de l''adulte', 'Le gériatre s''occupe de la santé des personnes âgées.', 34),
  ('medecine_sport', 'Médecine du sport', 'Médecine de l''adulte', 'Le médecin du sport suit les sportifs et la pratique de l''activité physique.', 35)
on conflict (code) do nothing;

-- Correspondance libellé du Tableau → code de spécialité (NULL si non clinique / inconnu)
create or replace function public.register_specialty_code(p_label text)
returns text language plpgsql immutable as $$
declare t text := public.normalize_text(coalesce(p_label, ''));
begin
  if t = '' then return null; end if;
  return case
    when t ~ 'hemato.?biolog|parasitolog|microbiolog|genetique|biologie' then 'biologie'
    when t ~ 'anatomie|cytologie' then 'anatomopathologie'
    when t ~ '^generaliste|medecine generale|mc/mf|medecine de famille|communautaire' then 'medecine_generale'
    when t ~ 'medecine interne' then 'medecine_interne'
    when t ~ 'chirurgie thorac' then 'chirurgie_cardio_thoracique'
    when t ~ 'cardiolog' then 'cardiologie'
    when t ~ 'pneumolog' then 'pneumologie'
    when t ~ 'gastro|coloprocto' then case when t ~ 'chirurg' then 'chirurgie_generale' else 'gastro_enterologie' end
    when t ~ 'nephrolog' then 'nephrologie'
    when t ~ 'endocrin|diabet|^nutrition' then 'endocrinologie'
    when t ~ 'rhumatolog' then 'rhumatologie'
    when t ~ 'infectieu|infectiolog' then 'infectiologie'
    when t ~ 'hematolog' then 'hematologie'
    when t ~ 'oncolog|radiotherap' then 'oncologie'
    when t ~ 'neurochirurg' then 'neurochirurgie'
    when t ~ 'neurolog' then 'neurologie'
    when t ~ 'dermatolog' then 'dermatologie'
    when t ~ 'gynecolog|obstetri' then 'gynecologie'
    when t ~ 'chirurgie pediatr' then 'chirurgie_pediatrique'
    when t ~ 'pediatr' then 'pediatrie'
    when t ~ 'neonatolog' then 'neonatologie'
    when t ~ 'plastique|esthetique' then 'chirurgie_plastique'
    when t ~ 'maxillo|stomatologie et cmf|cmf' then 'chirurgie_maxillo_faciale'
    when t ~ 'stomatolog' then 'stomatologie'
    when t ~ 'orthoped|traumatolog|^c\.o' then 'traumatologie'
    when t ~ 'urolog' then 'urologie'
    when t ~ 'chirurgie generale|chirurgie visceral' then 'chirurgie_generale'
    when t ~ 'ophtalmolog' then 'ophtalmologie'
    when t ~ '^orl|oto-rhino' then 'orl'
    when t ~ 'pedopsychiatr' then 'pedopsychiatrie'
    when t ~ 'psychiatr' then 'psychiatrie'
    when t ~ 'radiolog|imagerie|nucleaire' then 'radiologie'
    when t ~ 'anesthes|reanimation' then 'anesthesie'
    when t ~ 'urgence' then 'medecine_urgence'
    when t ~ 'legale' then 'medecine_legale'
    when t ~ 'physique et readaptation' then 'medecine_physique'
    when t ~ 'geriatr' then 'geriatrie'
    when t ~ 'sport' then 'medecine_sport'
    when t ~ 'travail' then 'medecine_travail'
    when t ~ 'sante publique|epidemiolog|promotion de la sante|medecine preventive' then 'sante_publique'
    when t ~ 'dentaire|odonto' then 'chirurgie_dentaire'
    else null
  end;
end $$;

-- Conseil régional de l'Ordre (« CROM GAO », « NIORO SAHEL ») → région
create or replace function public.resolve_crom_region(p text)
returns uuid language sql stable set search_path = public as $$
  select public.resolve_region(case public.normalize_text(regexp_replace(coalesce(p, ''), '^\s*crom\s+', '', 'i'))
    when 'nioro sahel' then 'Nioro' when 'nioro du sahel' then 'Nioro'
    when 'taoudenni' then 'Taoudénit' when 'taoudeni' then 'Taoudénit'
    else regexp_replace(coalesce(p, ''), '^\s*crom\s+', '', 'i') end)
$$;

-- ---------------------------------------------------------------------------
-- 1. Tableau de l'Ordre des médecins
-- ---------------------------------------------------------------------------
create table public.doctor_register (
  id uuid primary key default gen_random_uuid(),
  register_year smallint not null check (register_year between 2000 and 2100),
  order_no int,
  registration_number text check (char_length(coalesce(registration_number, '')) <= 40),
  last_name text not null check (char_length(last_name) between 1 and 120),
  first_name text not null default '' check (char_length(first_name) <= 120),
  specialty_label text check (char_length(coalesce(specialty_label, '')) <= 160),
  specialty_id uuid references public.medical_specialties(id) on delete set null,
  structure text check (char_length(coalesce(structure, '')) <= 200),
  crom text check (char_length(coalesce(crom, '')) <= 60),
  region_id uuid references public.regions(id) on delete set null,
  is_published boolean not null default true,
  search_text text generated always as (public.normalize_text(
    coalesce(last_name, '') || ' ' || coalesce(first_name, '') || ' ' || coalesce(structure, '') || ' ' || coalesce(specialty_label, ''))) stored,
  created_at timestamptz not null default now()
);
create unique index doctor_register_unique on public.doctor_register
  (register_year, coalesce(registration_number, ''), public.normalize_text(last_name), public.normalize_text(first_name));
create index doctor_register_search_trgm on public.doctor_register using gin (search_text extensions.gin_trgm_ops);
create index doctor_register_filters on public.doctor_register (register_year, specialty_id, region_id) where is_published;
create index doctor_register_regno on public.doctor_register (registration_number);

alter table public.doctor_register enable row level security;
create policy "pp_register_public_read" on public.doctor_register for select to anon, authenticated using (is_published);
create policy "pp_register_admin_read" on public.doctor_register for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.doctor_register from anon, authenticated;
grant select on public.doctor_register to anon, authenticated;

-- Médecins ayant demandé à ne pas figurer sur PharmaProxi : le choix survit aux imports suivants
create table public.register_optouts (
  registration_number text not null default '',
  last_name_norm text not null,
  first_name_norm text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (registration_number, last_name_norm, first_name_norm)
);
alter table public.register_optouts enable row level security;
create policy "pp_optouts_admin_read" on public.register_optouts for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.register_optouts from anon, authenticated;

-- Import (par lots). p_rows : [{ordre, inscription, nom, prenom, specialite, structure, crom}]
-- p_replace = true : remplace l'édition de l'année (premier lot d'un nouvel import).
create or replace function public.admin_import_doctor_register(p_year int, p_rows jsonb, p_replace boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_admin();
  rec record; ok int := 0; dup int := 0; errors jsonb := '[]'::jsonb; v_code text; v_region uuid; removed int := 0;
begin
  if p_year is null or p_year < 2000 or p_year > 2100 then raise exception 'PP422: année invalide'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'PP422: format invalide'; end if;
  if jsonb_array_length(p_rows) > 6000 then raise exception 'PP422: 6 000 lignes maximum par lot'; end if;
  if p_replace then
    delete from public.doctor_register where register_year = p_year;
    get diagnostics removed = row_count;
  end if;
  for rec in select coalesce((e ->> 'line')::int, o::int + 1) as line, e from jsonb_array_elements(p_rows) with ordinality as t(e, o) loop
    begin
      if char_length(btrim(coalesce(rec.e ->> 'nom', ''))) < 1 then raise exception 'PP422: nom manquant'; end if;
      v_code := public.register_specialty_code(rec.e ->> 'specialite');
      v_region := public.resolve_crom_region(rec.e ->> 'crom');
      insert into public.doctor_register (register_year, order_no, registration_number, last_name, first_name, specialty_label, specialty_id, structure, crom, region_id, is_published)
      values (p_year, nullif(regexp_replace(coalesce(rec.e ->> 'ordre', ''), '\D', '', 'g'), '')::int,
              nullif(btrim(rec.e ->> 'inscription'), ''), btrim(rec.e ->> 'nom'), coalesce(btrim(rec.e ->> 'prenom'), ''),
              nullif(btrim(rec.e ->> 'specialite'), ''), (select id from public.medical_specialties where code = v_code),
              nullif(btrim(rec.e ->> 'structure'), ''), nullif(btrim(regexp_replace(coalesce(rec.e ->> 'crom', ''), '^\s*crom\s+', '', 'i')), ''), v_region,
              not exists (select 1 from public.register_optouts o
                          where o.registration_number = coalesce(nullif(btrim(rec.e ->> 'inscription'), ''), '')
                            and o.last_name_norm = public.normalize_text(rec.e ->> 'nom')
                            and o.first_name_norm = public.normalize_text(coalesce(rec.e ->> 'prenom', ''))));
      ok := ok + 1;
    exception
      when unique_violation then dup := dup + 1;
      when others then errors := errors || jsonb_build_object('row', rec.line, 'error', regexp_replace(sqlerrm, '^PP[0-9]+: ', ''));
    end;
  end loop;
  perform public.log_audit('register.import', 'doctor_register', p_year::text,
    jsonb_build_object('imported', ok, 'duplicates', dup, 'failed', jsonb_array_length(errors), 'replaced', removed));
  return jsonb_build_object('imported', ok, 'duplicates', dup, 'failed', jsonb_array_length(errors), 'errors', errors, 'replaced', removed);
end $$;

create or replace function public.admin_set_register_published(p_id uuid, p_published boolean)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin(); r public.doctor_register;
begin
  update public.doctor_register set is_published = p_published where id = p_id returning * into r;
  if r.id is null then raise exception 'PP404: entrée introuvable'; end if;
  if p_published then
    delete from public.register_optouts
    where registration_number = coalesce(r.registration_number, '') and last_name_norm = public.normalize_text(r.last_name)
      and first_name_norm = public.normalize_text(r.first_name);
  else
    insert into public.register_optouts (registration_number, last_name_norm, first_name_norm, created_by)
    values (coalesce(r.registration_number, ''), public.normalize_text(r.last_name), public.normalize_text(r.first_name), uid)
    on conflict do nothing;
  end if;
  perform public.log_audit(case when p_published then 'register.publish' else 'register.unpublish' end, 'doctor_register', p_id::text);
end $$;

-- Recherche publique. Les médecins qui ont une fiche vérifiée et publiée (même n° d'inscription)
-- n'apparaissent pas en double : leur fiche complète est affichée à la place.
create or replace function public.search_doctor_register(
  p_query text default null, p_specialty uuid default null, p_region uuid default null,
  p_limit int default 20, p_offset int default 0)
returns table (id uuid, register_year smallint, registration_number text, last_name text, first_name text,
               specialty_label text, specialty_name text, structure text, crom text, region_name text, total_count bigint)
language sql stable security definer set search_path = public, extensions as $$
  with q as (select nullif(public.normalize_text(p_query), '') as t),
  latest as (select max(register_year) as y from public.doctor_register where is_published)
  select r.id, r.register_year, r.registration_number, r.last_name, r.first_name, r.specialty_label, s.name, r.structure, r.crom, rg.name,
         count(*) over ()
  from public.doctor_register r
  cross join q cross join latest
  left join public.medical_specialties s on s.id = r.specialty_id
  left join public.regions rg on rg.id = r.region_id
  where r.is_published and r.register_year = latest.y
    and (p_specialty is null or r.specialty_id = p_specialty)
    and (p_region is null or r.region_id = p_region)
    and (q.t is null or not exists (
          select 1 from regexp_split_to_table(q.t, '\s+') w where w <> '' and r.search_text not like '%' || w || '%'))
    and not exists (
          select 1 from public.doctor_private dp
          where r.registration_number is not null and dp.order_number = r.registration_number and public.doctor_is_public(dp.doctor_id))
  order by public.normalize_text(r.last_name), public.normalize_text(r.first_name), r.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50) offset greatest(coalesce(p_offset, 0), 0)
$$;
alter function public.search_doctor_register(text, uuid, uuid, int, int) set statement_timeout = '5s';

create or replace function public.register_summary()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('year', max(register_year), 'total', count(*))
  from public.doctor_register where is_published and register_year = (select max(register_year) from public.doctor_register where is_published)
$$;

-- ---------------------------------------------------------------------------
-- 2. Établissements de santé non encore vérifiés
-- ---------------------------------------------------------------------------
create table public.facility_listings (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  kind text not null default 'centre_sante'
    check (kind in ('clinique', 'cabinet', 'cabinet_dentaire', 'centre_sante', 'csref', 'hopital', 'imagerie', 'laboratoire')),
  category_label text check (char_length(coalesce(category_label, '')) <= 100),
  region_id uuid references public.regions(id) on delete set null,
  city_label text check (char_length(coalesce(city_label, '')) <= 100),
  address text check (char_length(coalesce(address, '')) <= 300),
  phone text check (phone is null or public.valid_phone(phone)),
  phone2 text check (phone2 is null or public.valid_phone(phone2)),
  latitude double precision check (latitude is null or latitude between 9.5 and 25.5),
  longitude double precision check (longitude is null or longitude between -12.8 and 4.8),
  source text not null default 'Saisie administrateur' check (char_length(source) between 1 and 200),
  is_published boolean not null default true,
  claimed_clinic_id uuid references public.clinics(id) on delete set null,
  search_name text generated always as (public.normalize_text(name)) stored,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null))
);
create unique index facility_listings_dedup on public.facility_listings
  (search_name, coalesce(region_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index facility_listings_trgm on public.facility_listings using gin (search_name extensions.gin_trgm_ops);

alter table public.facility_listings enable row level security;
create policy "pp_facilities_public_read" on public.facility_listings for select to anon, authenticated
  using (is_published and claimed_clinic_id is null);
create policy "pp_facilities_admin_read" on public.facility_listings for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.facility_listings from anon, authenticated;
grant select on public.facility_listings to anon, authenticated;

-- p_rows : [{line, nom, type, categorie, region, ville, adresse, telephone, telephone2, latitude, longitude, source}]
create or replace function public.admin_import_facility_listings(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_admin();
  rec record; ok int := 0; dup int := 0; errors jsonb := '[]'::jsonb;
  v_region uuid; v_kind text; v_p1 text; v_p2 text; v_lat double precision; v_lng double precision;
begin
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'PP422: format invalide'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'PP422: 5 000 lignes maximum par import'; end if;
  for rec in select coalesce((e ->> 'line')::int, o::int + 1) as line, e from jsonb_array_elements(p_rows) with ordinality as t(e, o) loop
    begin
      if char_length(btrim(coalesce(rec.e ->> 'nom', ''))) < 2 then raise exception 'PP422: nom manquant'; end if;
      v_region := case when nullif(btrim(rec.e ->> 'region'), '') is null then null else public.resolve_region(rec.e ->> 'region') end;
      if nullif(btrim(rec.e ->> 'region'), '') is not null and v_region is null then
        raise exception 'PP422: région inconnue « % »', rec.e ->> 'region';
      end if;
      v_kind := coalesce(nullif(btrim(rec.e ->> 'type'), ''), 'centre_sante');
      if v_kind not in ('clinique', 'cabinet', 'cabinet_dentaire', 'centre_sante', 'csref', 'hopital', 'imagerie', 'laboratoire') then
        raise exception 'PP422: type inconnu « % »', v_kind;
      end if;
      v_p1 := public.normalize_ml_phone(rec.e ->> 'telephone');
      v_p2 := public.normalize_ml_phone(rec.e ->> 'telephone2');
      if nullif(btrim(rec.e ->> 'telephone'), '') is not null and v_p1 is null then raise exception 'PP422: téléphone invalide « % »', rec.e ->> 'telephone'; end if;
      v_lat := nullif(replace(btrim(rec.e ->> 'latitude'), ',', '.'), '')::double precision;
      v_lng := nullif(replace(btrim(rec.e ->> 'longitude'), ',', '.'), '')::double precision;
      if exists (select 1 from public.facility_listings f where f.search_name = public.normalize_text(rec.e ->> 'nom')
                 and f.region_id is not distinct from v_region) then
        dup := dup + 1; continue;
      end if;
      insert into public.facility_listings (name, kind, category_label, region_id, city_label, address, phone, phone2, latitude, longitude, source, created_by)
      values (btrim(rec.e ->> 'nom'), v_kind, nullif(btrim(rec.e ->> 'categorie'), ''), v_region, nullif(btrim(rec.e ->> 'ville'), ''),
              nullif(btrim(rec.e ->> 'adresse'), ''), v_p1, v_p2, v_lat, v_lng, coalesce(nullif(btrim(rec.e ->> 'source'), ''), 'Import CSV'), uid);
      ok := ok + 1;
    exception
      when invalid_text_representation then errors := errors || jsonb_build_object('row', rec.line, 'error', 'coordonnées invalides');
      when check_violation then errors := errors || jsonb_build_object('row', rec.line, 'error', 'valeur hors limites');
      when unique_violation then dup := dup + 1;
      when others then errors := errors || jsonb_build_object('row', rec.line, 'error', regexp_replace(sqlerrm, '^PP[0-9]+: ', ''));
    end;
  end loop;
  perform public.log_audit('facility.import', 'facility_listing', null,
    jsonb_build_object('imported', ok, 'duplicates', dup, 'failed', jsonb_array_length(errors)));
  return jsonb_build_object('imported', ok, 'duplicates', dup, 'failed', jsonb_array_length(errors), 'errors', errors);
end $$;

create or replace function public.admin_set_facility_published(p_id uuid, p_published boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.facility_listings set is_published = p_published, updated_at = now() where id = p_id;
  if not found then raise exception 'PP404: fiche introuvable'; end if;
  perform public.log_audit(case when p_published then 'facility.publish' else 'facility.unpublish' end, 'facility_listing', p_id::text);
end $$;

create or replace function public.admin_delete_facility(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n text;
begin
  perform public.require_admin();
  delete from public.facility_listings where id = p_id returning name into n;
  if n is null then raise exception 'PP404: fiche introuvable'; end if;
  perform public.log_audit('facility.delete', 'facility_listing', p_id::text, jsonb_build_object('name', n));
end $$;

create or replace function public.search_facility_listings(p_query text default null, p_region uuid default null,
                                                           p_limit int default 20, p_offset int default 0)
returns table (id uuid, name text, kind text, category_label text, region_name text, city_label text, address text,
               phone text, phone2 text, latitude double precision, longitude double precision, total_count bigint)
language sql stable security definer set search_path = public, extensions as $$
  with q as (select nullif(public.normalize_text(p_query), '') as t)
  select f.id, f.name, f.kind, f.category_label, r.name, f.city_label, f.address, f.phone, f.phone2, f.latitude, f.longitude, count(*) over ()
  from public.facility_listings f cross join q
  left join public.regions r on r.id = f.region_id
  where f.is_published and f.claimed_clinic_id is null
    and (p_region is null or f.region_id = p_region)
    and (q.t is null or f.search_name like '%' || q.t || '%' or extensions.similarity(f.search_name, q.t) > 0.3)
  order by f.search_name, f.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50) offset greatest(coalesce(p_offset, 0), 0)
$$;

-- Statistiques d'administration
create or replace function public.admin_register_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'register_total', (select count(*) from public.doctor_register),
    'register_year', (select max(register_year) from public.doctor_register),
    'register_hidden', (select count(*) from public.doctor_register where not is_published),
    'register_with_specialty', (select count(*) from public.doctor_register where specialty_id is not null),
    'facilities_total', (select count(*) from public.facility_listings),
    'facilities_published', (select count(*) from public.facility_listings where is_published and claimed_clinic_id is null));
end $$;

revoke execute on function public.admin_import_doctor_register(int, jsonb, boolean), public.admin_set_register_published(uuid, boolean),
  public.admin_import_facility_listings(jsonb), public.admin_set_facility_published(uuid, boolean), public.admin_delete_facility(uuid),
  public.admin_register_stats() from public, anon;
grant execute on function public.admin_import_doctor_register(int, jsonb, boolean), public.admin_set_register_published(uuid, boolean),
  public.admin_import_facility_listings(jsonb), public.admin_set_facility_published(uuid, boolean), public.admin_delete_facility(uuid),
  public.admin_register_stats() to authenticated;
grant execute on function public.search_doctor_register(text, uuid, uuid, int, int), public.register_summary(),
  public.search_facility_listings(text, uuid, int, int) to anon, authenticated;

-- >>> 20261028000300_appointments.sql
-- ============================================================================
-- PharmaProxi — Migration : demandes de rendez-vous avec les médecins
-- Principe : le patient DEMANDE un rendez-vous (jour + moment de la journée) sur un
-- lieu de consultation publié ; le médecin ou le secrétariat de l'établissement
-- CONFIRME avec une heure précise, PROPOSE un autre moment ou REFUSE. Rien n'est
-- garanti avant la confirmation. Aucun conseil médical, aucune téléconsultation.
-- Le motif (facultatif) n'est visible que du patient, du médecin et du secrétariat.
-- Heure du Mali = UTC.
-- ============================================================================

alter table public.doctor_practice_sites add column accepts_appointments boolean not null default false;

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  site_id uuid references public.doctor_practice_sites(id) on delete set null,
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  patient_name text not null check (char_length(btrim(patient_name)) between 2 and 120),
  patient_phone text not null check (public.valid_phone(patient_phone)),
  requested_date date not null,
  requested_period text not null default 'indifferent' check (requested_period in ('matin', 'apres_midi', 'indifferent')),
  reason text check (char_length(coalesce(reason, '')) <= 300),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'proposed', 'declined', 'cancelled', 'expired', 'completed', 'no_show')),
  scheduled_at timestamptz,          -- heure fixée (confirmée ou proposée)
  response_note text check (char_length(coalesce(response_note, '')) <= 300),
  cancelled_by text check (cancelled_by in ('patient', 'practice')),
  decided_by uuid references public.profiles(id) on delete set null,
  idempotency_key text check (char_length(coalesce(idempotency_key, '')) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('confirmed', 'proposed') or scheduled_at is not null)
);
create unique index appointments_idem on public.appointments (patient_id, idempotency_key) where idempotency_key is not null;
create index appointments_patient on public.appointments (patient_id, created_at desc);
create index appointments_doctor on public.appointments (doctor_id, status, requested_date);
create index appointments_clinic on public.appointments (clinic_id, status, requested_date);
create trigger appointments_touch before update on public.appointments for each row execute function public.touch_updated_at();

alter table public.appointments enable row level security;
create policy "pp_appointments_read" on public.appointments for select to authenticated using (
  patient_id = auth.uid() or doctor_id = public.my_doctor_id() or public.is_clinic_member(clinic_id));
revoke insert, update, delete on public.appointments from anon, authenticated;
grant select on public.appointments to authenticated;

create or replace function public.appointment_period_label(p text)
returns text language sql immutable as $$
  select case p when 'matin' then 'le matin' when 'apres_midi' then 'l''après-midi' else 'à tout moment' end
$$;

-- Le médecin (ou un membre de l'établissement) peut-il gérer ce rendez-vous ?
create or replace function public.can_manage_appointment(a public.appointments)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(a.doctor_id = public.my_doctor_id(), false) or coalesce(public.is_clinic_member(a.clinic_id), false)
$$;

-- Activer / désactiver les demandes en ligne sur un lieu de consultation
create or replace function public.set_site_appointments(p_site uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare s public.doctor_practice_sites;
begin
  select * into s from public.doctor_practice_sites where id = p_site;
  if s.id is null then raise exception 'PP404: lieu de consultation introuvable'; end if;
  if not (coalesce(s.doctor_id = public.my_doctor_id(), false) or coalesce(public.can_manage_clinic(s.clinic_id), false)) then
    raise exception 'PP403: action réservée au médecin ou à l''établissement' using errcode = '42501';
  end if;
  update public.doctor_practice_sites set accepts_appointments = p_on where id = p_site;
  perform public.log_audit(case when p_on then 'appointments.enable' else 'appointments.disable' end, 'practice_site', p_site::text);
end $$;

-- ---------------------------------------------------------------------------
-- Patient : demande
-- ---------------------------------------------------------------------------
create or replace function public.request_appointment(
  p_site uuid, p_date date, p_period text, p_patient_name text, p_phone text, p_reason text default null, p_key text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s public.doctor_practice_sites; d public.doctors; c public.clinics;
  slots jsonb; ok_day boolean := false; slot jsonb; aid uuid; dkey text; doc_user uuid;
begin
  if uid is null then raise exception 'PP401: connectez-vous pour demander un rendez-vous' using errcode = '42501'; end if;
  if p_key is not null then
    select id into aid from public.appointments where patient_id = uid and idempotency_key = p_key;
    if aid is not null then return aid; end if;
  end if;
  select * into s from public.doctor_practice_sites where id = p_site;
  if s.id is null or not s.doctor_accepted or not s.clinic_accepted then raise exception 'PP404: lieu de consultation introuvable'; end if;
  select * into d from public.doctors where id = s.doctor_id;
  select * into c from public.clinics where id = s.clinic_id;
  if not public.doctor_is_public(d.id) or c.status <> 'verified' then raise exception 'PP404: ce médecin n''est pas disponible dans l''annuaire'; end if;
  if not s.accepts_appointments then raise exception 'PP409: ce lieu ne prend pas de demandes en ligne : appelez le numéro indiqué'; end if;
  if p_period not in ('matin', 'apres_midi', 'indifferent') then raise exception 'PP422: moment de la journée invalide'; end if;
  if public.normalize_ml_phone(p_phone) is null then raise exception 'PP422: numéro de téléphone invalide'; end if;
  if char_length(btrim(coalesce(p_patient_name, ''))) < 2 then raise exception 'PP422: indiquez le nom du patient'; end if;
  if p_date is null or p_date < (now() at time zone 'UTC')::date then raise exception 'PP422: choisissez une date à venir'; end if;
  if p_date > (now() at time zone 'UTC')::date + 60 then raise exception 'PP422: les demandes sont possibles jusqu''à 60 jours à l''avance'; end if;
  dkey := public.day_key(p_date::timestamp at time zone 'UTC');
  slots := s.schedule -> dkey;
  if slots is not null and jsonb_typeof(slots) = 'array' then
    for slot in select * from jsonb_array_elements(slots) loop
      if p_period = 'indifferent'
         or (p_period = 'matin' and (slot ->> 0) < '13:00')
         or (p_period = 'apres_midi' and (slot ->> 1) > '13:00') then ok_day := true; end if;
    end loop;
  end if;
  if not ok_day then raise exception 'PP422: le médecin ne consulte pas à ce moment dans cet établissement : choisissez un jour de consultation'; end if;
  if exists (select 1 from public.doctor_absences a where a.doctor_id = d.id and p_date between a.starts_on and a.ends_on) then
    raise exception 'PP409: le médecin a annoncé une absence ce jour-là';
  end if;
  if (select count(*) from public.appointments where patient_id = uid and status in ('pending', 'proposed')) >= 3 then
    raise exception 'PP429: vous avez déjà 3 demandes en attente : attendez une réponse ou annulez-en une';
  end if;
  if exists (select 1 from public.appointments where patient_id = uid and doctor_id = d.id and requested_date = p_date
             and status in ('pending', 'proposed', 'confirmed')) then
    raise exception 'PP409: vous avez déjà une demande auprès de ce médecin pour ce jour';
  end if;

  insert into public.appointments (site_id, doctor_id, clinic_id, patient_id, patient_name, patient_phone, requested_date, requested_period, reason, idempotency_key)
  values (s.id, d.id, c.id, uid, btrim(p_patient_name), public.normalize_ml_phone(p_phone), p_date, p_period, nullif(btrim(coalesce(p_reason, '')), ''), p_key)
  returning id into aid;

  select user_id into doc_user from public.doctors where id = d.id;
  perform public.notify_user(doc_user, 'appointment', 'Nouvelle demande de rendez-vous',
    format('%s souhaite vous voir le %s %s à %s.', btrim(p_patient_name), to_char(p_date, 'DD/MM/YYYY'), public.appointment_period_label(p_period), c.name),
    null, '/medecin/rendez-vous');
  perform public.notify_clinic(c.id, 'appointment', 'Nouvelle demande de rendez-vous',
    format('Pour %s %s, le %s %s.', d.title, d.display_name, to_char(p_date, 'DD/MM/YYYY'), public.appointment_period_label(p_period)),
    format('/clinique/%s/rendez-vous', c.id));
  return aid;
exception when check_violation then
  raise exception 'PP422: vérifiez le nom et le numéro de téléphone';
end $$;

-- ---------------------------------------------------------------------------
-- Médecin / secrétariat : réponse
-- p_action : 'confirm' (heure le jour demandé), 'propose' (autre moment), 'decline'
-- ---------------------------------------------------------------------------
create or replace function public.respond_appointment(p_id uuid, p_action text, p_at timestamptz default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.appointments; d public.doctors;
begin
  select * into a from public.appointments where id = p_id for update;
  if a.id is null or not public.can_manage_appointment(a) then raise exception 'PP404: rendez-vous introuvable'; end if;
  if a.status not in ('pending', 'proposed') then raise exception 'PP409: cette demande a déjà reçu une réponse'; end if;
  select * into d from public.doctors where id = a.doctor_id;
  if p_action = 'confirm' then
    if p_at is null then raise exception 'PP422: indiquez l''heure du rendez-vous'; end if;
    if (p_at at time zone 'UTC')::date <> a.requested_date then raise exception 'PP422: pour un autre jour, utilisez « Proposer un autre moment »'; end if;
    if p_at < now() then raise exception 'PP422: cette heure est déjà passée'; end if;
    update public.appointments set status = 'confirmed', scheduled_at = p_at, response_note = nullif(btrim(coalesce(p_note, '')), ''), decided_by = auth.uid() where id = p_id;
    perform public.notify_user(a.patient_id, 'appointment', 'Rendez-vous confirmé',
      format('%s %s vous attend le %s à %s.%s', d.title, d.display_name, to_char(p_at at time zone 'UTC', 'DD/MM/YYYY'), to_char(p_at at time zone 'UTC', 'HH24"h"MI'),
             coalesce(' ' || nullif(btrim(coalesce(p_note, '')), ''), '')), null, '/compte/rendez-vous');
  elsif p_action = 'propose' then
    if p_at is null or p_at < now() then raise exception 'PP422: proposez une date et une heure à venir'; end if;
    update public.appointments set status = 'proposed', scheduled_at = p_at, response_note = nullif(btrim(coalesce(p_note, '')), ''), decided_by = auth.uid() where id = p_id;
    perform public.notify_user(a.patient_id, 'appointment', 'Un autre moment vous est proposé',
      format('%s %s propose le %s à %s. Acceptez ou refusez dans « Mes rendez-vous ».', d.title, d.display_name,
             to_char(p_at at time zone 'UTC', 'DD/MM/YYYY'), to_char(p_at at time zone 'UTC', 'HH24"h"MI')), null, '/compte/rendez-vous');
  elsif p_action = 'decline' then
    if char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'PP422: indiquez un motif au patient (ex. complet ce jour-là, appelez le secrétariat)'; end if;
    update public.appointments set status = 'declined', response_note = btrim(p_note), decided_by = auth.uid() where id = p_id;
    perform public.notify_user(a.patient_id, 'appointment', 'Demande de rendez-vous non retenue',
      format('%s %s : %s', d.title, d.display_name, btrim(p_note)), null, '/compte/rendez-vous');
  else
    raise exception 'PP422: action inconnue';
  end if;
  perform public.log_audit('appointment.' || p_action, 'appointment', p_id::text);
end $$;

-- Patient : réponse à une proposition
create or replace function public.answer_appointment_proposal(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare a public.appointments; doc_user uuid;
begin
  select * into a from public.appointments where id = p_id and patient_id = auth.uid() for update;
  if a.id is null then raise exception 'PP404: rendez-vous introuvable'; end if;
  if a.status <> 'proposed' then raise exception 'PP409: aucune proposition en attente'; end if;
  if p_accept and a.scheduled_at < now() then raise exception 'PP409: le moment proposé est déjà passé'; end if;
  update public.appointments set status = case when p_accept then 'confirmed' else 'cancelled' end,
         cancelled_by = case when p_accept then null else 'patient' end where id = p_id;
  select user_id into doc_user from public.doctors where id = a.doctor_id;
  perform public.notify_user(doc_user, 'appointment',
    case when p_accept then 'Proposition acceptée' else 'Proposition refusée' end,
    format('%s, %s.', a.patient_name, to_char(a.scheduled_at at time zone 'UTC', 'DD/MM/YYYY HH24"h"MI')), null, '/medecin/rendez-vous');
  perform public.notify_clinic(a.clinic_id, 'appointment',
    case when p_accept then 'Proposition acceptée' else 'Proposition refusée' end,
    format('%s, %s.', a.patient_name, to_char(a.scheduled_at at time zone 'UTC', 'DD/MM/YYYY HH24"h"MI')), format('/clinique/%s/rendez-vous', a.clinic_id));
end $$;

-- Annulation : par le patient (demande ou rendez-vous à venir) ou par le médecin / secrétariat (avec motif)
create or replace function public.cancel_appointment(p_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.appointments; is_patient boolean; doc_user uuid; d public.doctors;
begin
  select * into a from public.appointments where id = p_id for update;
  if a.id is null then raise exception 'PP404: rendez-vous introuvable'; end if;
  is_patient := a.patient_id = auth.uid();
  if not is_patient and not public.can_manage_appointment(a) then raise exception 'PP404: rendez-vous introuvable'; end if;
  if a.status not in ('pending', 'proposed', 'confirmed') then raise exception 'PP409: ce rendez-vous ne peut plus être annulé'; end if;
  if a.status = 'confirmed' and a.scheduled_at < now() then raise exception 'PP409: l''heure du rendez-vous est passée'; end if;
  if not is_patient and char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'PP422: indiquez un motif au patient'; end if;
  update public.appointments set status = 'cancelled', cancelled_by = case when is_patient then 'patient' else 'practice' end,
         response_note = case when is_patient then response_note else btrim(p_reason) end where id = p_id;
  select * into d from public.doctors where id = a.doctor_id;
  if is_patient then
    perform public.notify_user(d.user_id, 'appointment', 'Rendez-vous annulé par le patient',
      format('%s, %s.', a.patient_name, coalesce(to_char(a.scheduled_at at time zone 'UTC', 'DD/MM/YYYY HH24"h"MI'), to_char(a.requested_date, 'DD/MM/YYYY'))), null, '/medecin/rendez-vous');
    perform public.notify_clinic(a.clinic_id, 'appointment', 'Rendez-vous annulé par le patient',
      format('%s, %s.', a.patient_name, coalesce(to_char(a.scheduled_at at time zone 'UTC', 'DD/MM/YYYY HH24"h"MI'), to_char(a.requested_date, 'DD/MM/YYYY'))), format('/clinique/%s/rendez-vous', a.clinic_id));
  else
    perform public.notify_user(a.patient_id, 'appointment', 'Rendez-vous annulé',
      format('%s %s : %s', d.title, d.display_name, btrim(p_reason)), null, '/compte/rendez-vous');
  end if;
  perform public.log_audit('appointment.cancel', 'appointment', p_id::text, jsonb_build_object('by', case when is_patient then 'patient' else 'practice' end));
end $$;

-- Après l'heure : honoré ou patient absent
create or replace function public.close_appointment(p_id uuid, p_outcome text)
returns void language plpgsql security definer set search_path = public as $$
declare a public.appointments;
begin
  select * into a from public.appointments where id = p_id for update;
  if a.id is null or not public.can_manage_appointment(a) then raise exception 'PP404: rendez-vous introuvable'; end if;
  if a.status <> 'confirmed' then raise exception 'PP409: seul un rendez-vous confirmé peut être clôturé'; end if;
  if a.scheduled_at > now() then raise exception 'PP409: le rendez-vous n''a pas encore eu lieu'; end if;
  if p_outcome not in ('completed', 'no_show') then raise exception 'PP422: résultat inconnu'; end if;
  update public.appointments set status = p_outcome where id = p_id;
end $$;

-- ---------------------------------------------------------------------------
-- Listes
-- ---------------------------------------------------------------------------
create or replace function public.my_appointments()
returns table (id uuid, status text, requested_date date, requested_period text, scheduled_at timestamptz, response_note text,
               patient_name text, reason text, cancelled_by text, created_at timestamptz,
               doctor_id uuid, doctor_label text, clinic_id uuid, clinic_name text, clinic_address text, phone text)
language sql stable security definer set search_path = public as $$
  select a.id, a.status, a.requested_date, a.requested_period, a.scheduled_at, a.response_note, a.patient_name, a.reason, a.cancelled_by, a.created_at,
         d.id, d.title || ' ' || d.display_name, c.id, c.name, c.address, coalesce(s.appointment_phone, c.phone)
  from public.appointments a
  join public.doctors d on d.id = a.doctor_id
  join public.clinics c on c.id = a.clinic_id
  left join public.doctor_practice_sites s on s.id = a.site_id
  where a.patient_id = auth.uid()
  order by (a.status in ('pending', 'proposed', 'confirmed')) desc, coalesce(a.scheduled_at, a.requested_date::timestamptz) desc
  limit 100
$$;

-- p_clinic NULL : agenda du médecin connecté ; sinon : agenda de l'établissement (membres seulement)
create or replace function public.practice_appointments(p_clinic uuid default null, p_view text default 'a_traiter')
returns table (id uuid, status text, requested_date date, requested_period text, scheduled_at timestamptz, response_note text,
               patient_name text, patient_phone text, reason text, cancelled_by text, created_at timestamptz,
               doctor_label text, clinic_id uuid, clinic_name text)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.my_doctor_id();
begin
  if p_clinic is null and me is null then raise exception 'PP403: espace médecin requis' using errcode = '42501'; end if;
  if p_clinic is not null and not public.is_clinic_member(p_clinic) then raise exception 'PP403: action réservée à l''établissement' using errcode = '42501'; end if;
  return query
  select a.id, a.status, a.requested_date, a.requested_period, a.scheduled_at, a.response_note, a.patient_name, a.patient_phone, a.reason, a.cancelled_by, a.created_at,
         d.title || ' ' || d.display_name, c.id, c.name
  from public.appointments a
  join public.doctors d on d.id = a.doctor_id
  join public.clinics c on c.id = a.clinic_id
  where (case when p_clinic is null then a.doctor_id = me else a.clinic_id = p_clinic end)
    and case p_view
          when 'a_traiter' then a.status in ('pending', 'proposed')
          when 'a_venir' then a.status = 'confirmed' and a.scheduled_at >= date_trunc('day', now())
          when 'a_cloturer' then a.status = 'confirmed' and a.scheduled_at < now()
          else a.status not in ('pending', 'proposed') and not (a.status = 'confirmed' and a.scheduled_at >= date_trunc('day', now()))
        end
  order by case when p_view in ('a_traiter', 'a_venir', 'a_cloturer') then coalesce(a.scheduled_at, a.requested_date::timestamptz) end asc,
           a.updated_at desc
  limit 200;
end $$;

-- ---------------------------------------------------------------------------
-- Expiration automatique (maintenance) : demande sans réponse sous 48 h ou date passée,
-- proposition non acceptée sous 48 h ou moment passé.
-- ---------------------------------------------------------------------------
create or replace function public.expire_appointments()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    update public.appointments set status = 'expired'
    where (status = 'pending' and (created_at < now() - interval '48 hours' or requested_date < (now() at time zone 'UTC')::date))
       or (status = 'proposed' and (updated_at < now() - interval '48 hours' or scheduled_at < now()))
    returning id, patient_id, requested_date
  loop
    perform public.notify_user(r.patient_id, 'appointment', 'Demande de rendez-vous expirée',
      format('Votre demande pour le %s n''a pas été confirmée à temps. Vous pouvez en faire une nouvelle ou appeler l''établissement.', to_char(r.requested_date, 'DD/MM/YYYY')),
      null, '/compte/rendez-vous');
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.run_maintenance()
returns jsonb language plpgsql security definer set search_path = public as $$
declare expired int; rl int; logs int; notifs int; outbox int; issues int; reminders int; appts int;
begin
  expired := public.expire_overdue_orders();
  appts := public.expire_appointments();
  delete from public.rate_limit_events where at < now() - interval '1 day';
  get diagnostics rl = row_count;
  delete from public.search_logs where created_at < now() - interval '400 days';
  get diagnostics logs = row_count;
  delete from public.notifications where read_at is not null and read_at < now() - interval '180 days';
  get diagnostics notifs = row_count;
  delete from public.notification_outbox where status in ('sent', 'skipped') and created_at < now() - interval '90 days';
  get diagnostics outbox = row_count;
  reminders := public.directory_reminders();
  select count(*) into issues from public.integrity_issues() where severity = 'critique';
  insert into public.maintenance_runs (expired, purged, critical_issues)
  values (expired, jsonb_build_object('rate_limits', rl, 'search_logs', logs, 'notifications', notifs, 'outbox', outbox,
                                      'directory_reminders', reminders, 'appointments_expired', appts), issues);
  delete from public.maintenance_runs where ran_at < now() - interval '30 days';
  return jsonb_build_object('expired', expired, 'appointments_expired', appts, 'purged', jsonb_build_object('rate_limits', rl, 'search_logs', logs,
    'notifications', notifs, 'outbox', outbox, 'directory_reminders', reminders), 'critical_issues', issues);
end $$;
revoke execute on function public.run_maintenance() from public, anon, authenticated;
grant execute on function public.run_maintenance() to service_role;

-- Statistiques (sans aucune donnée de patient)
create or replace function public.admin_appointment_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'sites_open', (select count(*) from public.doctor_practice_sites where accepts_appointments),
    'last_30_days', (select count(*) from public.appointments where created_at > now() - interval '30 days'),
    'by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
       select status, count(*) n from public.appointments where created_at > now() - interval '30 days' group by status) x));
end $$;

revoke execute on function public.can_manage_appointment(public.appointments), public.expire_appointments() from public, anon, authenticated;
revoke execute on function public.set_site_appointments(uuid, boolean), public.request_appointment(uuid, date, text, text, text, text, text),
  public.respond_appointment(uuid, text, timestamptz, text), public.answer_appointment_proposal(uuid, boolean),
  public.cancel_appointment(uuid, text), public.close_appointment(uuid, text), public.my_appointments(),
  public.practice_appointments(uuid, text), public.admin_appointment_stats() from public, anon;
grant execute on function public.set_site_appointments(uuid, boolean), public.request_appointment(uuid, date, text, text, text, text, text),
  public.respond_appointment(uuid, text, timestamptz, text), public.answer_appointment_proposal(uuid, boolean),
  public.cancel_appointment(uuid, text), public.close_appointment(uuid, text), public.my_appointments(),
  public.practice_appointments(uuid, text), public.admin_appointment_stats() to authenticated;
grant execute on function public.expire_appointments() to service_role;

-- >>> 20261028000400_booking.sql
-- ============================================================================
-- PharmaProxi — Migration : réservation en ligne par créneaux (type Doctolib)
--   • motifs de consultation (durée, consignes, public, tarif indicatif déclaré)
--   • réservation immédiate d'un créneau libre OU demande à confirmer, au choix du lieu
--   • délais de prévenance (réservation, annulation), informations d'accès
--   • rendez-vous saisis par le cabinet (appel téléphonique), plages bloquées
--   • proches (prendre rendez-vous pour un enfant, un parent)
--   • liste d'attente : alerte quand un créneau se libère
--   • rappel la veille, prochaine disponibilité, informations pratiques du médecin
-- Pas de téléconsultation, pas de paiement, pas de dossier médical.
-- Heure du Mali = UTC.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Informations pratiques du médecin (déclarées par lui, jamais inventées)
-- ---------------------------------------------------------------------------
alter table public.doctors
  add column presentation text check (char_length(coalesce(presentation, '')) <= 1500),
  add column fee_info text check (char_length(coalesce(fee_info, '')) <= 200),
  add column payment_methods text[] not null default '{}'
    check (payment_methods <@ array['especes', 'orange_money', 'moov_money', 'carte', 'assurance', 'cheque']::text[]),
  add column accepts_new_patients boolean not null default true;

create or replace function public.update_doctor_practice_info(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_doctor_id();
begin
  if me is null then raise exception 'PP403: espace médecin requis' using errcode = '42501'; end if;
  update public.doctors set
    presentation = nullif(btrim(coalesce(p ->> 'presentation', '')), ''),
    fee_info = nullif(btrim(coalesce(p ->> 'fee_info', '')), ''),
    payment_methods = coalesce((select array_agg(distinct x) from jsonb_array_elements_text(coalesce(p -> 'payment_methods', '[]'::jsonb)) x
                                where x in ('especes', 'orange_money', 'moov_money', 'carte', 'assurance', 'cheque')), '{}'),
    accepts_new_patients = coalesce((p ->> 'accepts_new_patients')::boolean, true)
  where id = me;
exception when check_violation then
  raise exception 'PP422: texte trop long (présentation 1 500 caractères, tarifs 200 caractères)';
end $$;

-- ---------------------------------------------------------------------------
-- Réglages de réservation d'un lieu de consultation
-- ---------------------------------------------------------------------------
alter table public.doctor_practice_sites
  add column booking_mode text not null default 'request' check (booking_mode in ('request', 'instant')),
  add column min_notice_hours int not null default 2 check (min_notice_hours between 0 and 168),
  add column cancel_notice_hours int not null default 2 check (cancel_notice_hours between 0 and 168),
  add column access_info text check (char_length(coalesce(access_info, '')) <= 300);

create or replace function public.can_manage_site(p_site uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.doctor_practice_sites s
                 where s.id = p_site and (coalesce(s.doctor_id = public.my_doctor_id(), false) or coalesce(public.can_manage_clinic(s.clinic_id), false)))
$$;

create or replace function public.update_site_booking(p_site uuid, p_mode text, p_min_notice int, p_cancel_notice int, p_access_info text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_site(p_site) then raise exception 'PP403: action réservée au médecin ou à l''établissement' using errcode = '42501'; end if;
  if p_mode not in ('request', 'instant') then raise exception 'PP422: mode de réservation inconnu'; end if;
  if p_mode = 'instant' and not exists (
       select 1 from public.appointment_types t join public.doctor_practice_sites s on s.id = p_site
       where t.doctor_id = s.doctor_id and t.is_active and (t.site_id is null or t.site_id = p_site)) then
    raise exception 'PP422: créez d''abord au moins un motif de consultation (avec sa durée) pour proposer des créneaux';
  end if;
  update public.doctor_practice_sites set booking_mode = p_mode, min_notice_hours = coalesce(p_min_notice, 2),
         cancel_notice_hours = coalesce(p_cancel_notice, 2), access_info = nullif(btrim(coalesce(p_access_info, '')), '')
  where id = p_site;
  perform public.log_audit('booking.settings', 'practice_site', p_site::text, jsonb_build_object('mode', p_mode));
exception when check_violation then
  raise exception 'PP422: délais entre 0 et 168 heures, informations d''accès 300 caractères maximum';
end $$;

-- ---------------------------------------------------------------------------
-- Motifs de consultation
-- ---------------------------------------------------------------------------
create table public.appointment_types (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  site_id uuid references public.doctor_practice_sites(id) on delete cascade,   -- NULL : tous les lieux
  name text not null check (char_length(btrim(name)) between 2 and 80),
  duration_min int not null check (duration_min between 5 and 240),
  audience text not null default 'all' check (audience in ('all', 'new', 'returning')),
  instructions text check (char_length(coalesce(instructions, '')) <= 500),
  fee text check (char_length(coalesce(fee, '')) <= 80),
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index appointment_types_doctor on public.appointment_types (doctor_id) where is_active;
alter table public.appointment_types enable row level security;
create policy "pp_types_public_read" on public.appointment_types for select to anon, authenticated
  using (is_active and public.doctor_is_public(doctor_id));
create policy "pp_types_practice_read" on public.appointment_types for select to authenticated
  using (doctor_id = public.my_doctor_id() or (site_id is not null and public.can_manage_site(site_id)));
revoke insert, update, delete on public.appointment_types from anon, authenticated;
grant select on public.appointment_types to anon, authenticated;

create or replace function public.save_appointment_type(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  tid uuid := nullif(p ->> 'id', '')::uuid; v_site uuid := nullif(p ->> 'site_id', '')::uuid;
  v_doctor uuid; t public.appointment_types; s public.doctor_practice_sites;
begin
  if tid is not null then
    select * into t from public.appointment_types where id = tid;
    if t.id is null then raise exception 'PP404: motif introuvable'; end if;
    v_doctor := t.doctor_id;
  end if;
  if v_site is not null then
    select * into s from public.doctor_practice_sites where id = v_site;
    if s.id is null or not public.can_manage_site(v_site) then raise exception 'PP403: lieu non autorisé' using errcode = '42501'; end if;
    if v_doctor is not null and v_doctor <> s.doctor_id then raise exception 'PP422: lieu d''un autre médecin'; end if;
    v_doctor := s.doctor_id;
  end if;
  v_doctor := coalesce(v_doctor, public.my_doctor_id());
  if v_doctor is null then raise exception 'PP403: espace médecin requis' using errcode = '42501'; end if;
  -- Un motif « tous lieux » n'est modifiable que par le médecin ; un motif de lieu, aussi par l'établissement
  if not (coalesce(v_doctor = public.my_doctor_id(), false) or (v_site is not null and public.can_manage_site(v_site))
          or (t.site_id is not null and public.can_manage_site(t.site_id))) then
    raise exception 'PP403: action réservée au médecin' using errcode = '42501';
  end if;
  if tid is null then
    insert into public.appointment_types (doctor_id, site_id, name, duration_min, audience, instructions, fee, sort_order)
    values (v_doctor, v_site, btrim(p ->> 'name'), (p ->> 'duration_min')::int, coalesce(nullif(p ->> 'audience', ''), 'all'),
            nullif(btrim(coalesce(p ->> 'instructions', '')), ''), nullif(btrim(coalesce(p ->> 'fee', '')), ''), coalesce((p ->> 'sort_order')::int, 100))
    returning id into tid;
  else
    update public.appointment_types set name = btrim(p ->> 'name'), duration_min = (p ->> 'duration_min')::int,
      audience = coalesce(nullif(p ->> 'audience', ''), 'all'), instructions = nullif(btrim(coalesce(p ->> 'instructions', '')), ''),
      fee = nullif(btrim(coalesce(p ->> 'fee', '')), ''), sort_order = coalesce((p ->> 'sort_order')::int, sort_order),
      is_active = coalesce((p ->> 'is_active')::boolean, is_active), site_id = coalesce(v_site, site_id)
    where id = tid;
  end if;
  return tid;
exception
  when check_violation then raise exception 'PP422: nom (2 à 80 caractères) et durée (5 à 240 minutes) obligatoires';
  when invalid_text_representation then raise exception 'PP422: durée invalide';
end $$;

-- ---------------------------------------------------------------------------
-- Rendez-vous : colonnes de réservation
-- ---------------------------------------------------------------------------
alter table public.appointments
  alter column patient_id drop not null,
  add column type_id uuid references public.appointment_types(id) on delete set null,
  add column ends_at timestamptz,
  add column source text not null default 'online' check (source in ('online', 'practice')),
  add column relative_id uuid,
  add column reminded_at timestamptz,
  add check (source = 'practice' or patient_id is not null);
create index appointments_doctor_time on public.appointments (doctor_id, scheduled_at) where status in ('confirmed', 'proposed');

-- ---------------------------------------------------------------------------
-- Plages bloquées (réunion, garde, congé d'une demi-journée…)
-- ---------------------------------------------------------------------------
create table public.practice_blocks (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  site_id uuid references public.doctor_practice_sites(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text check (char_length(coalesce(note, '')) <= 120),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at - starts_at <= interval '14 days')
);
create index practice_blocks_doctor on public.practice_blocks (doctor_id, starts_at);
alter table public.practice_blocks enable row level security;
create policy "pp_blocks_practice_read" on public.practice_blocks for select to authenticated
  using (doctor_id = public.my_doctor_id() or (site_id is not null and public.can_manage_site(site_id)));
revoke insert, update, delete on public.practice_blocks from anon, authenticated;
grant select on public.practice_blocks to authenticated;

create or replace function public.add_practice_block(p_site uuid, p_start timestamptz, p_end timestamptz, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare s public.doctor_practice_sites; bid uuid;
begin
  select * into s from public.doctor_practice_sites where id = p_site;
  if s.id is null or not public.can_manage_site(p_site) then raise exception 'PP403: action réservée au médecin ou à l''établissement' using errcode = '42501'; end if;
  insert into public.practice_blocks (doctor_id, site_id, starts_at, ends_at, note, created_by)
  values (s.doctor_id, p_site, p_start, p_end, nullif(btrim(coalesce(p_note, '')), ''), auth.uid()) returning id into bid;
  return bid;
exception when check_violation then
  raise exception 'PP422: la fin doit être après le début (14 jours maximum)';
end $$;

create or replace function public.remove_practice_block(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b public.practice_blocks;
begin
  select * into b from public.practice_blocks where id = p_id;
  if b.id is null or not (coalesce(b.doctor_id = public.my_doctor_id(), false) or (b.site_id is not null and public.can_manage_site(b.site_id))) then
    raise exception 'PP404: plage introuvable';
  end if;
  delete from public.practice_blocks where id = p_id;
end $$;

-- ---------------------------------------------------------------------------
-- Proches du patient
-- ---------------------------------------------------------------------------
create table public.patient_relatives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  relation text not null default 'autre' check (relation in ('enfant', 'parent', 'conjoint', 'frere_soeur', 'autre')),
  phone text check (phone is null or public.valid_phone(phone)),
  created_at timestamptz not null default now()
);
create index patient_relatives_user on public.patient_relatives (user_id);
alter table public.patient_relatives enable row level security;
create policy "pp_relatives_own" on public.patient_relatives for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.patient_relatives from anon, authenticated;
grant select on public.patient_relatives to authenticated;
alter table public.appointments add constraint appointments_relative_fk foreign key (relative_id) references public.patient_relatives(id) on delete set null;

create or replace function public.add_relative(p_name text, p_relation text, p_phone text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); rid uuid; v_phone text := public.normalize_ml_phone(p_phone);
begin
  if uid is null then raise exception 'PP401: connectez-vous' using errcode = '42501'; end if;
  if (select count(*) from public.patient_relatives where user_id = uid) >= 10 then raise exception 'PP429: 10 proches maximum'; end if;
  if nullif(btrim(coalesce(p_phone, '')), '') is not null and v_phone is null then raise exception 'PP422: numéro de téléphone invalide'; end if;
  insert into public.patient_relatives (user_id, full_name, relation, phone)
  values (uid, btrim(p_name), coalesce(nullif(p_relation, ''), 'autre'), v_phone) returning id into rid;
  return rid;
exception when check_violation then
  raise exception 'PP422: nom (2 à 120 caractères) et lien de parenté obligatoires';
end $$;

create or replace function public.remove_relative(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.patient_relatives where id = p_id and user_id = auth.uid();
  if not found then raise exception 'PP404: proche introuvable'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Créneaux disponibles
-- Créneaux de la durée du motif, découpés dans les plages de consultation du lieu,
-- hors délai de prévenance, absences, plages bloquées et rendez-vous existants
-- du médecin (tous lieux confondus). 60 jours maximum.
-- ---------------------------------------------------------------------------
create or replace function public.site_is_bookable(s public.doctor_practice_sites)
returns boolean language sql stable security definer set search_path = public as $$
  select s.doctor_accepted and s.clinic_accepted and s.accepts_appointments and s.booking_mode = 'instant'
     and public.doctor_is_public(s.doctor_id)
     and exists (select 1 from public.clinics c where c.id = s.clinic_id and c.status = 'verified')
$$;

create or replace function public.available_slots(p_site uuid, p_type uuid, p_from date default null, p_days int default 7)
returns table (slot_start timestamptz, slot_end timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  s public.doctor_practice_sites; t public.appointment_types;
  today date := (now() at time zone 'UTC')::date; d date; k text; slot jsonb;
  st timestamptz; en timestamptz; cur timestamptz; dur interval; min_start timestamptz;
begin
  select * into s from public.doctor_practice_sites where id = p_site;
  if s.id is null or not public.site_is_bookable(s) then return; end if;
  select * into t from public.appointment_types where id = p_type and doctor_id = s.doctor_id and is_active and (site_id is null or site_id = p_site);
  if t.id is null then return; end if;
  dur := make_interval(mins => t.duration_min);
  min_start := now() + make_interval(hours => s.min_notice_hours);
  for d in select g::date from generate_series(greatest(coalesce(p_from, today), today),
                                                 least(greatest(coalesce(p_from, today), today) + greatest(least(coalesce(p_days, 7), 31), 1) - 1, today + 60),
                                                 interval '1 day') g loop
    continue when exists (select 1 from public.doctor_absences a where a.doctor_id = s.doctor_id and d between a.starts_on and a.ends_on);
    k := public.day_key(d::timestamp at time zone 'UTC');
    for slot in select * from jsonb_array_elements(coalesce(s.schedule -> k, '[]'::jsonb)) loop
      st := (d::timestamp + (slot ->> 0)::time) at time zone 'UTC';
      en := (d::timestamp + case when slot ->> 1 = '24:00' then interval '24 hours' else (slot ->> 1)::time::interval end) at time zone 'UTC';
      cur := st;
      while cur + dur <= en loop
        if cur >= min_start
           and not exists (select 1 from public.appointments a
                           where a.doctor_id = s.doctor_id and a.status in ('confirmed', 'proposed') and a.scheduled_at is not null
                             and tstzrange(a.scheduled_at, coalesce(a.ends_at, a.scheduled_at + interval '30 minutes')) && tstzrange(cur, cur + dur))
           and not exists (select 1 from public.practice_blocks b
                           where b.doctor_id = s.doctor_id and tstzrange(b.starts_at, b.ends_at) && tstzrange(cur, cur + dur)) then
          slot_start := cur; slot_end := cur + dur;
          return next;
        end if;
        cur := cur + dur;
      end loop;
    end loop;
  end loop;
end $$;
alter function public.available_slots(uuid, uuid, date, int) set statement_timeout = '5s';

-- Prochaine disponibilité de chaque médecin (motif ouvert à tous ou aux nouveaux patients, 30 jours)
create or replace function public.next_availabilities(p_doctors uuid[])
returns table (doctor_id uuid, site_id uuid, type_id uuid, slot_start timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare r record; best timestamptz; v_site uuid; v_type uuid; x timestamptz;
begin
  for r in select distinct unnest(p_doctors[1:30]) as did loop
    best := null;
    for v_site, v_type in
      select s.id, t.id from public.doctor_practice_sites s
      join public.appointment_types t on t.doctor_id = s.doctor_id and t.is_active and (t.site_id is null or t.site_id = s.id) and t.audience <> 'returning'
      where s.doctor_id = r.did and public.site_is_bookable(s)
    loop
      select min(a.slot_start) into x from (select av.slot_start from public.available_slots(v_site, v_type, null, 30) av limit 1) a;
      if x is not null and (best is null or x < best) then best := x; doctor_id := r.did; site_id := v_site; type_id := v_type; slot_start := x; end if;
    end loop;
    if best is not null then return next; end if;
  end loop;
end $$;
alter function public.next_availabilities(uuid[]) set statement_timeout = '8s';

-- ---------------------------------------------------------------------------
-- Réservation immédiate d'un créneau
-- ---------------------------------------------------------------------------
create or replace function public.book_appointment(
  p_site uuid, p_type uuid, p_start timestamptz, p_patient_name text, p_phone text,
  p_reason text default null, p_relative uuid default null, p_key text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); s public.doctor_practice_sites; t public.appointment_types; d public.doctors; c public.clinics;
  aid uuid; v_name text := btrim(coalesce(p_patient_name, '')); v_phone text := public.normalize_ml_phone(p_phone); seen boolean; rel public.patient_relatives;
begin
  if uid is null then raise exception 'PP401: connectez-vous pour prendre rendez-vous' using errcode = '42501'; end if;
  if p_key is not null then
    select id into aid from public.appointments where patient_id = uid and idempotency_key = p_key;
    if aid is not null then return aid; end if;
  end if;
  select * into s from public.doctor_practice_sites where id = p_site;
  if s.id is null or not public.site_is_bookable(s) then raise exception 'PP404: la réservation en ligne n''est pas ouverte pour ce lieu'; end if;
  select * into t from public.appointment_types where id = p_type and doctor_id = s.doctor_id and is_active and (site_id is null or site_id = p_site);
  if t.id is null then raise exception 'PP404: motif de consultation introuvable'; end if;
  select * into d from public.doctors where id = s.doctor_id;
  select * into c from public.clinics where id = s.clinic_id;
  if p_relative is not null then
    select * into rel from public.patient_relatives where id = p_relative and user_id = uid;
    if rel.id is null then raise exception 'PP404: proche introuvable'; end if;
    v_name := rel.full_name;
    v_phone := coalesce(v_phone, rel.phone);
  end if;
  if char_length(v_name) < 2 then raise exception 'PP422: indiquez le nom du patient'; end if;
  if v_phone is null then raise exception 'PP422: numéro de téléphone invalide'; end if;

  -- Nouveau patient / patient déjà suivi
  seen := exists (select 1 from public.appointments a where a.patient_id = uid and a.doctor_id = d.id
                  and a.relative_id is not distinct from p_relative and a.status in ('completed', 'confirmed') and a.scheduled_at < now());
  if t.audience = 'new' and seen then raise exception 'PP409: ce motif est réservé aux nouveaux patients : choisissez un motif de suivi'; end if;
  if t.audience = 'returning' and not seen then raise exception 'PP409: ce motif est réservé aux patients déjà suivis par ce médecin'; end if;
  if not d.accepts_new_patients and not seen then raise exception 'PP409: ce médecin n''accepte pas de nouveaux patients en ligne pour le moment'; end if;

  if (select count(*) from public.appointments where patient_id = uid and status in ('pending', 'proposed', 'confirmed') and coalesce(scheduled_at, requested_date::timestamptz) >= now()) >= 5 then
    raise exception 'PP429: vous avez déjà 5 rendez-vous à venir : annulez-en un pour en prendre un autre';
  end if;
  if exists (select 1 from public.appointments where patient_id = uid and doctor_id = d.id and relative_id is not distinct from p_relative
             and status in ('pending', 'proposed', 'confirmed') and coalesce(scheduled_at::date, requested_date) = (p_start at time zone 'UTC')::date) then
    raise exception 'PP409: vous avez déjà un rendez-vous avec ce médecin ce jour-là';
  end if;

  -- Une réservation à la fois par médecin : le créneau est revérifié sous verrou
  perform pg_advisory_xact_lock(hashtextextended(d.id::text, 0));
  if not exists (select 1 from public.available_slots(p_site, p_type, (p_start at time zone 'UTC')::date, 1) a where a.slot_start = p_start) then
    raise exception 'PP409: ce créneau n''est plus disponible : choisissez-en un autre';
  end if;

  insert into public.appointments (site_id, doctor_id, clinic_id, patient_id, patient_name, patient_phone, requested_date, requested_period,
                                   reason, status, scheduled_at, ends_at, type_id, relative_id, idempotency_key, source)
  values (s.id, d.id, c.id, uid, v_name, v_phone, (p_start at time zone 'UTC')::date,
          case when extract(hour from p_start at time zone 'UTC') < 13 then 'matin' else 'apres_midi' end,
          nullif(btrim(coalesce(p_reason, '')), ''), 'confirmed', p_start, p_start + make_interval(mins => t.duration_min), t.id, p_relative, p_key, 'online')
  returning id into aid;

  perform public.notify_user(d.user_id, 'appointment', 'Nouveau rendez-vous',
    format('%s — %s, %s à %s (%s).', v_name, t.name, to_char(p_start at time zone 'UTC', 'DD/MM/YYYY'), to_char(p_start at time zone 'UTC', 'HH24"h"MI'), c.name),
    null, '/medecin/rendez-vous?vue=a_venir');
  perform public.notify_clinic(c.id, 'appointment', 'Nouveau rendez-vous',
    format('%s %s — %s, %s à %s.', d.title, d.display_name, v_name, to_char(p_start at time zone 'UTC', 'DD/MM/YYYY'), to_char(p_start at time zone 'UTC', 'HH24"h"MI')),
    format('/clinique/%s/rendez-vous?vue=a_venir', c.id));
  perform public.notify_user(uid, 'appointment', 'Rendez-vous confirmé',
    format('%s %s, %s à %s, %s.%s', d.title, d.display_name, to_char(p_start at time zone 'UTC', 'DD/MM/YYYY'), to_char(p_start at time zone 'UTC', 'HH24"h"MI'), c.name,
           coalesce(' À savoir : ' || t.instructions, '')), null, '/compte/rendez-vous');
  delete from public.appointment_waitlist w where w.user_id = uid and w.doctor_id = d.id;
  return aid;
end $$;

-- Rendez-vous saisi par le cabinet (patient qui a appelé) : bloque le créneau
create or replace function public.practice_add_appointment(
  p_site uuid, p_start timestamptz, p_duration_min int, p_patient_name text, p_phone text, p_note text default null, p_type uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare s public.doctor_practice_sites; aid uuid; v_phone text := public.normalize_ml_phone(p_phone); dur int := coalesce(p_duration_min, 15);
begin
  select * into s from public.doctor_practice_sites where id = p_site;
  if s.id is null or not public.can_manage_site(p_site) then raise exception 'PP403: action réservée au médecin ou à l''établissement' using errcode = '42501'; end if;
  if v_phone is null then raise exception 'PP422: numéro de téléphone invalide'; end if;
  if char_length(btrim(coalesce(p_patient_name, ''))) < 2 then raise exception 'PP422: indiquez le nom du patient'; end if;
  if dur < 5 or dur > 240 then raise exception 'PP422: durée entre 5 et 240 minutes'; end if;
  perform pg_advisory_xact_lock(hashtextextended(s.doctor_id::text, 0));
  if exists (select 1 from public.appointments a where a.doctor_id = s.doctor_id and a.status in ('confirmed', 'proposed') and a.scheduled_at is not null
             and tstzrange(a.scheduled_at, coalesce(a.ends_at, a.scheduled_at + interval '30 minutes')) && tstzrange(p_start, p_start + make_interval(mins => dur))) then
    raise exception 'PP409: un rendez-vous est déjà prévu sur ce créneau';
  end if;
  insert into public.appointments (site_id, doctor_id, clinic_id, patient_id, patient_name, patient_phone, requested_date, requested_period,
                                   status, scheduled_at, ends_at, type_id, response_note, source, decided_by)
  values (s.id, s.doctor_id, s.clinic_id, null, btrim(p_patient_name), v_phone, (p_start at time zone 'UTC')::date,
          case when extract(hour from p_start at time zone 'UTC') < 13 then 'matin' else 'apres_midi' end,
          'confirmed', p_start, p_start + make_interval(mins => dur), p_type, nullif(btrim(coalesce(p_note, '')), ''), 'practice', auth.uid())
  returning id into aid;
  return aid;
end $$;

-- ---------------------------------------------------------------------------
-- Liste d'attente : prévenir quand un créneau se libère
-- ---------------------------------------------------------------------------
create table public.appointment_waitlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  site_id uuid not null references public.doctor_practice_sites(id) on delete cascade,
  until_date date not null,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, site_id)
);
alter table public.appointment_waitlist enable row level security;
create policy "pp_waitlist_own" on public.appointment_waitlist for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.appointment_waitlist from anon, authenticated;
grant select on public.appointment_waitlist to authenticated;

create or replace function public.join_waitlist(p_site uuid, p_until date)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); s public.doctor_practice_sites; wid uuid;
begin
  if uid is null then raise exception 'PP401: connectez-vous' using errcode = '42501'; end if;
  select * into s from public.doctor_practice_sites where id = p_site;
  if s.id is null or not public.site_is_bookable(s) then raise exception 'PP404: la réservation en ligne n''est pas ouverte pour ce lieu'; end if;
  if p_until is null or p_until < (now() at time zone 'UTC')::date or p_until > (now() at time zone 'UTC')::date + 60 then
    raise exception 'PP422: choisissez une date limite dans les 60 prochains jours';
  end if;
  if (select count(*) from public.appointment_waitlist where user_id = uid) >= 5 then raise exception 'PP429: 5 alertes maximum'; end if;
  insert into public.appointment_waitlist (user_id, doctor_id, site_id, until_date) values (uid, s.doctor_id, p_site, p_until)
  on conflict (user_id, site_id) do update set until_date = excluded.until_date, notified_at = null
  returning id into wid;
  return wid;
end $$;

create or replace function public.leave_waitlist(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.appointment_waitlist where id = p_id and user_id = auth.uid();
  if not found then raise exception 'PP404: alerte introuvable'; end if;
end $$;

-- Annulation (remplace la version précédente) : délai d'annulation en ligne + alerte liste d'attente
create or replace function public.cancel_appointment(p_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.appointments; is_patient boolean; d public.doctors; s public.doctor_practice_sites; w record; v_when text;
begin
  select * into a from public.appointments where id = p_id for update;
  if a.id is null then raise exception 'PP404: rendez-vous introuvable'; end if;
  is_patient := coalesce(a.patient_id = auth.uid(), false);
  if not is_patient and not public.can_manage_appointment(a) then raise exception 'PP404: rendez-vous introuvable'; end if;
  if a.status not in ('pending', 'proposed', 'confirmed') then raise exception 'PP409: ce rendez-vous ne peut plus être annulé'; end if;
  if a.status = 'confirmed' and a.scheduled_at < now() then raise exception 'PP409: l''heure du rendez-vous est passée'; end if;
  select * into s from public.doctor_practice_sites where id = a.site_id;
  if is_patient and a.status = 'confirmed' and s.id is not null and a.scheduled_at - now() < make_interval(hours => s.cancel_notice_hours) then
    raise exception 'PP409: annulation en ligne impossible moins de % h avant : appelez le cabinet', s.cancel_notice_hours;
  end if;
  if not is_patient and char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'PP422: indiquez un motif au patient'; end if;
  update public.appointments set status = 'cancelled', cancelled_by = case when is_patient then 'patient' else 'practice' end,
         response_note = case when is_patient then response_note else btrim(p_reason) end where id = p_id;
  select * into d from public.doctors where id = a.doctor_id;
  v_when := coalesce(to_char(a.scheduled_at at time zone 'UTC', 'DD/MM/YYYY HH24"h"MI'), to_char(a.requested_date, 'DD/MM/YYYY'));
  if is_patient then
    perform public.notify_user(d.user_id, 'appointment', 'Rendez-vous annulé par le patient', format('%s, %s.', a.patient_name, v_when), null, '/medecin/rendez-vous');
    perform public.notify_clinic(a.clinic_id, 'appointment', 'Rendez-vous annulé par le patient', format('%s, %s.', a.patient_name, v_when), format('/clinique/%s/rendez-vous', a.clinic_id));
  elsif a.patient_id is not null then
    perform public.notify_user(a.patient_id, 'appointment', 'Rendez-vous annulé', format('%s %s : %s', d.title, d.display_name, btrim(p_reason)), null, '/compte/rendez-vous');
  end if;
  -- Créneau libéré : prévenir la liste d'attente (10 personnes au plus, une fois par jour)
  if a.status = 'confirmed' and a.scheduled_at > now() and a.site_id is not null then
    for w in select * from public.appointment_waitlist
             where site_id = a.site_id and until_date >= (a.scheduled_at at time zone 'UTC')::date
               and user_id is distinct from a.patient_id and (notified_at is null or notified_at < now() - interval '1 day')
             order by created_at limit 10 loop
      perform public.notify_user(w.user_id, 'appointment', 'Un créneau s''est libéré',
        format('%s %s : le %s à %s. Réservez vite, il est proposé à plusieurs personnes.', d.title, d.display_name,
               to_char(a.scheduled_at at time zone 'UTC', 'DD/MM/YYYY'), to_char(a.scheduled_at at time zone 'UTC', 'HH24"h"MI')),
        null, format('/medecins/%s/rendez-vous?lieu=%s', a.doctor_id, a.site_id));
      update public.appointment_waitlist set notified_at = now() where id = w.id;
    end loop;
  end if;
  perform public.log_audit('appointment.cancel', 'appointment', p_id::text, jsonb_build_object('by', case when is_patient then 'patient' else 'practice' end));
end $$;

-- Rappel la veille (notification ; SMS en file d'attente si un prestataire est branché)
create or replace function public.send_appointment_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; nid uuid;
begin
  for r in
    update public.appointments a set reminded_at = now()
    where a.status = 'confirmed' and a.reminded_at is null and a.patient_id is not null
      and a.scheduled_at between now() + interval '2 hours' and now() + interval '26 hours'
    returning a.id, a.patient_id, a.scheduled_at, a.doctor_id, a.clinic_id
  loop
    insert into public.notifications (user_id, kind, title, body, link)
    select r.patient_id, 'appointment', 'Rappel de rendez-vous',
           format('%s %s, le %s à %s, %s. Empêché ? Annulez pour libérer le créneau.', d.title, d.display_name,
                  to_char(r.scheduled_at at time zone 'UTC', 'DD/MM/YYYY'), to_char(r.scheduled_at at time zone 'UTC', 'HH24"h"MI'), c.name),
           '/compte/rendez-vous'
    from public.doctors d, public.clinics c where d.id = r.doctor_id and c.id = r.clinic_id
    returning id into nid;
    insert into public.notification_outbox (notification_id, channel) values (nid, 'sms');
    n := n + 1;
  end loop;
  delete from public.appointment_waitlist where until_date < (now() at time zone 'UTC')::date;
  return n;
end $$;

create or replace function public.run_maintenance()
returns jsonb language plpgsql security definer set search_path = public as $$
declare expired int; rl int; logs int; notifs int; outbox int; issues int; reminders int; appts int; appt_rem int;
begin
  expired := public.expire_overdue_orders();
  appts := public.expire_appointments();
  appt_rem := public.send_appointment_reminders();
  delete from public.rate_limit_events where at < now() - interval '1 day';
  get diagnostics rl = row_count;
  delete from public.search_logs where created_at < now() - interval '400 days';
  get diagnostics logs = row_count;
  delete from public.notifications where read_at is not null and read_at < now() - interval '180 days';
  get diagnostics notifs = row_count;
  delete from public.notification_outbox where status in ('sent', 'skipped') and created_at < now() - interval '90 days';
  get diagnostics outbox = row_count;
  reminders := public.directory_reminders();
  select count(*) into issues from public.integrity_issues() where severity = 'critique';
  insert into public.maintenance_runs (expired, purged, critical_issues)
  values (expired, jsonb_build_object('rate_limits', rl, 'search_logs', logs, 'notifications', notifs, 'outbox', outbox,
                                      'directory_reminders', reminders, 'appointments_expired', appts, 'appointment_reminders', appt_rem), issues);
  delete from public.maintenance_runs where ran_at < now() - interval '30 days';
  return jsonb_build_object('expired', expired, 'appointments_expired', appts, 'appointment_reminders', appt_rem,
    'purged', jsonb_build_object('rate_limits', rl, 'search_logs', logs, 'notifications', notifs, 'outbox', outbox, 'directory_reminders', reminders),
    'critical_issues', issues);
end $$;
revoke execute on function public.run_maintenance() from public, anon, authenticated;
grant execute on function public.run_maintenance() to service_role;

-- ---------------------------------------------------------------------------
-- Listes (versions enrichies)
-- ---------------------------------------------------------------------------
drop function public.my_appointments();
create function public.my_appointments()
returns table (id uuid, status text, requested_date date, requested_period text, scheduled_at timestamptz, ends_at timestamptz, response_note text,
               patient_name text, reason text, cancelled_by text, created_at timestamptz,
               doctor_id uuid, doctor_label text, clinic_id uuid, clinic_name text, clinic_address text, phone text,
               site_id uuid, type_name text, instructions text, access_info text, can_cancel boolean, cancel_notice_hours int)
language sql stable security definer set search_path = public as $$
  select a.id, a.status, a.requested_date, a.requested_period, a.scheduled_at, a.ends_at, a.response_note, a.patient_name, a.reason, a.cancelled_by, a.created_at,
         d.id, d.title || ' ' || d.display_name, c.id, c.name, c.address, coalesce(s.appointment_phone, c.phone),
         a.site_id, t.name, t.instructions, s.access_info,
         a.status in ('pending', 'proposed') or (a.status = 'confirmed' and a.scheduled_at - now() >= make_interval(hours => coalesce(s.cancel_notice_hours, 0))),
         coalesce(s.cancel_notice_hours, 0)
  from public.appointments a
  join public.doctors d on d.id = a.doctor_id
  join public.clinics c on c.id = a.clinic_id
  left join public.doctor_practice_sites s on s.id = a.site_id
  left join public.appointment_types t on t.id = a.type_id
  where a.patient_id = auth.uid()
  order by (a.status in ('pending', 'proposed', 'confirmed')) desc, coalesce(a.scheduled_at, a.requested_date::timestamptz) desc
  limit 100
$$;

drop function public.practice_appointments(uuid, text);
create function public.practice_appointments(p_clinic uuid default null, p_view text default 'a_traiter', p_date date default null)
returns table (id uuid, status text, requested_date date, requested_period text, scheduled_at timestamptz, ends_at timestamptz, response_note text,
               patient_name text, patient_phone text, reason text, cancelled_by text, created_at timestamptz,
               doctor_label text, clinic_id uuid, clinic_name text, type_name text, source text, site_id uuid)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.my_doctor_id();
begin
  if p_clinic is null and me is null then raise exception 'PP403: espace médecin requis' using errcode = '42501'; end if;
  if p_clinic is not null and not public.is_clinic_member(p_clinic) then raise exception 'PP403: action réservée à l''établissement' using errcode = '42501'; end if;
  return query
  select a.id, a.status, a.requested_date, a.requested_period, a.scheduled_at, a.ends_at, a.response_note, a.patient_name, a.patient_phone, a.reason, a.cancelled_by, a.created_at,
         d.title || ' ' || d.display_name, c.id, c.name, t.name, a.source, a.site_id
  from public.appointments a
  join public.doctors d on d.id = a.doctor_id
  join public.clinics c on c.id = a.clinic_id
  left join public.appointment_types t on t.id = a.type_id
  where (case when p_clinic is null then a.doctor_id = me else a.clinic_id = p_clinic end)
    and case p_view
          when 'a_traiter' then a.status in ('pending', 'proposed')
          when 'a_venir' then a.status = 'confirmed' and a.scheduled_at >= date_trunc('day', now())
          when 'a_cloturer' then a.status = 'confirmed' and a.scheduled_at < now()
          when 'jour' then a.status in ('confirmed', 'proposed', 'completed', 'no_show')
                           and (a.scheduled_at at time zone 'UTC')::date = coalesce(p_date, (now() at time zone 'UTC')::date)
          else a.status not in ('pending', 'proposed') and not (a.status = 'confirmed' and a.scheduled_at >= date_trunc('day', now()))
        end
  order by case when p_view in ('a_traiter', 'a_venir', 'a_cloturer', 'jour') then coalesce(a.scheduled_at, a.requested_date::timestamptz) end asc,
           a.updated_at desc
  limit 300;
end $$;

-- ---------------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------------
revoke execute on function public.site_is_bookable(public.doctor_practice_sites), public.send_appointment_reminders()
  from public, anon, authenticated;
-- Utilisée par les politiques RLS (se limite aux droits de l'utilisateur connecté)
revoke execute on function public.can_manage_site(uuid) from public, anon;
grant execute on function public.can_manage_site(uuid) to authenticated;
grant execute on function public.send_appointment_reminders() to service_role;
revoke execute on function public.update_doctor_practice_info(jsonb), public.update_site_booking(uuid, text, int, int, text),
  public.save_appointment_type(jsonb), public.add_practice_block(uuid, timestamptz, timestamptz, text), public.remove_practice_block(uuid),
  public.add_relative(text, text, text), public.remove_relative(uuid),
  public.book_appointment(uuid, uuid, timestamptz, text, text, text, uuid, text),
  public.practice_add_appointment(uuid, timestamptz, int, text, text, text, uuid),
  public.join_waitlist(uuid, date), public.leave_waitlist(uuid), public.my_appointments(), public.practice_appointments(uuid, text, date)
  from public, anon;
grant execute on function public.update_doctor_practice_info(jsonb), public.update_site_booking(uuid, text, int, int, text),
  public.save_appointment_type(jsonb), public.add_practice_block(uuid, timestamptz, timestamptz, text), public.remove_practice_block(uuid),
  public.add_relative(text, text, text), public.remove_relative(uuid),
  public.book_appointment(uuid, uuid, timestamptz, text, text, text, uuid, text),
  public.practice_add_appointment(uuid, timestamptz, int, text, text, text, uuid),
  public.join_waitlist(uuid, date), public.leave_waitlist(uuid), public.my_appointments(), public.practice_appointments(uuid, text, date)
  to authenticated;
grant execute on function public.available_slots(uuid, uuid, date, int), public.next_availabilities(uuid[]) to anon, authenticated;

