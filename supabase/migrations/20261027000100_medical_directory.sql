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
