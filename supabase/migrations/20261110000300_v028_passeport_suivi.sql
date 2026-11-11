-- =============================================================================
-- SantéProxi 0.28 / 0.29 — Passeport santé, historique des accès, autorisations, suivi des maladies chroniques.
-- Migration additive. Aucune donnée existante n'est modifiée.
--   0.28 : partages du passeport santé par lien ou QR code (durée limitée, retirables, chaque consultation enregistrée),
--          historique des accès au dossier, dossier de preuve des partages.
--   0.29 : rappels de mesure, suivi par un médecin choisi par le patient (accès à ses mesures uniquement avec son accord,
--          retirable), notes de suivi du médecin. Aucune interprétation automatique des mesures.
-- Retour arrière : voir le bloc « ROLLBACK » en fin de fichier.
-- =============================================================================

-- 1. Historique des accès au dossier ------------------------------------------------------------
create table if not exists public.record_access_log (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  person_id uuid references public.record_persons(id) on delete cascade,
  actor_kind text not null check (actor_kind in ('titulaire', 'lien_partage', 'medecin_suivi')),
  actor_label text not null check (char_length(actor_label) <= 160),
  action text not null check (action in ('ouverture_dossier', 'document_ouvert', 'resume_imprime', 'partage_cree', 'partage_retire', 'partage_consulte',
                                         'suivi_demande', 'suivi_accepte', 'suivi_termine', 'mesures_consultees', 'note_ajoutee')),
  detail text check (char_length(coalesce(detail, '')) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists record_access_log_owner on public.record_access_log (owner_id, created_at desc);
alter table public.record_access_log enable row level security;
drop policy if exists "pp_record_access_log_own" on public.record_access_log;
create policy "pp_record_access_log_own" on public.record_access_log for select to authenticated using (owner_id = auth.uid());
revoke all on public.record_access_log from anon, authenticated;
grant select on public.record_access_log to authenticated;

-- Le titulaire journalise ses propres actions sensibles (ouverture, document, impression)
create or replace function public.record_log_access(p_person uuid, p_action text, p_detail text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if p_action not in ('ouverture_dossier', 'document_ouvert', 'resume_imprime') then raise exception 'PP422: action invalide'; end if;
  if p_person is not null and not exists (select 1 from public.record_persons where id = p_person and owner_id = auth.uid()) then raise exception 'PP403: dossier d''un autre compte'; end if;
  insert into public.record_access_log (owner_id, person_id, actor_kind, actor_label, action, detail)
  values (auth.uid(), p_person, 'titulaire', 'Vous', p_action, left(p_detail, 300));
end $$;
revoke execute on function public.record_log_access(uuid, text, text) from public, anon;
grant execute on function public.record_log_access(uuid, text, text) to authenticated;

-- 2. Passeport santé : partages temporaires ------------------------------------------------------
create table if not exists public.health_shares (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('PAS-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 6))),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  person_id uuid not null references public.record_persons(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  label text check (char_length(coalesce(label, '')) <= 80),
  sections text[] not null check (cardinality(sections) between 1 and 8
    and sections <@ array['identite', 'groupe_sanguin', 'allergies', 'maladies', 'traitements', 'vaccins', 'contact_urgence', 'mesures']::text[]),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  views int not null default 0,
  last_viewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at and expires_at <= created_at + interval '30 days')
);
create index if not exists health_shares_owner on public.health_shares (owner_id, created_at desc);
alter table public.health_shares enable row level security;
drop policy if exists "pp_health_shares_own" on public.health_shares;
create policy "pp_health_shares_own" on public.health_shares for select to authenticated using (owner_id = auth.uid());
revoke all on public.health_shares from anon, authenticated;
grant select on public.health_shares to authenticated;

create or replace function public.create_health_share(p_person uuid, p_sections text[], p_hours int, p_label text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); tok text; s public.health_shares; pname text;
begin
  if uid is null then raise exception 'PP401: connexion requise'; end if;
  if not public.record_unlocked() then raise exception 'PP423: déverrouillez d''abord votre dossier avec votre code'; end if;
  select display_name into pname from public.record_persons where id = p_person and owner_id = uid;
  if pname is null then raise exception 'PP403: dossier d''un autre compte'; end if;
  if p_hours is null or p_hours < 1 or p_hours > 720 then raise exception 'PP422: durée entre 1 heure et 30 jours'; end if;
  if (select count(*) from public.health_shares where owner_id = uid and revoked_at is null and expires_at > now()) >= 10 then
    raise exception 'PP429: 10 partages actifs au maximum ; retirez-en un d''abord';
  end if;
  tok := encode(gen_random_bytes(32), 'hex');
  insert into public.health_shares (owner_id, person_id, token_hash, label, sections, expires_at)
  values (uid, p_person, encode(digest(tok, 'sha256'), 'hex'), nullif(btrim(coalesce(p_label, '')), ''), p_sections, now() + make_interval(hours => p_hours))
  returning * into s;
  insert into public.record_access_log (owner_id, person_id, actor_kind, actor_label, action, detail)
  values (uid, p_person, 'titulaire', 'Vous', 'partage_cree', s.reference || ' · ' || array_to_string(p_sections, ', ') || ' · jusqu''au ' || to_char(s.expires_at at time zone 'UTC', 'DD/MM/YYYY HH24:MI') || ' UTC');
  return jsonb_build_object('id', s.id, 'reference', s.reference, 'token', tok, 'expires_at', s.expires_at);
end $$;
revoke execute on function public.create_health_share(uuid, text[], int, text) from public, anon;
grant execute on function public.create_health_share(uuid, text[], int, text) to authenticated;

create or replace function public.revoke_health_share(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.health_shares;
begin
  update public.health_shares set revoked_at = now() where id = p_id and owner_id = auth.uid() and revoked_at is null returning * into s;
  if s.id is null then raise exception 'PP404: partage introuvable ou déjà retiré'; end if;
  insert into public.record_access_log (owner_id, person_id, actor_kind, actor_label, action, detail)
  values (s.owner_id, s.person_id, 'titulaire', 'Vous', 'partage_retire', s.reference);
end $$;
revoke execute on function public.revoke_health_share(uuid) from public, anon;
grant execute on function public.revoke_health_share(uuid) to authenticated;

-- Consultation d'un partage par la personne qui a reçu le lien (connectée ou non)
create or replace function public.open_health_share(p_token text, p_viewer text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare s public.health_shares; p public.record_persons; e public.record_essentials; out jsonb; viewer text; is_self boolean;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('status', 'invalide'); end if;
  select * into s from public.health_shares where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if s.id is null then return jsonb_build_object('status', 'invalide'); end if;
  if s.revoked_at is not null then return jsonb_build_object('status', 'retire'); end if;
  if s.expires_at <= now() then return jsonb_build_object('status', 'expire'); end if;
  select * into p from public.record_persons where id = s.person_id;
  select * into e from public.record_essentials where person_id = s.person_id;
  is_self := p.is_self;
  viewer := coalesce((select 'Compte SantéProxi : ' || full_name from public.profiles where id = auth.uid()), 'Personne non connectée') || coalesce(' · ' || left(nullif(btrim(p_viewer), ''), 80), '');
  out := jsonb_build_object('status', 'ok', 'reference', s.reference, 'expires_at', s.expires_at, 'sections', to_jsonb(s.sections));
  if 'identite' = any(s.sections) then out := out || jsonb_build_object('identite', jsonb_build_object('nom', p.display_name, 'annee_naissance', p.birth_year, 'sexe', p.sex)); end if;
  if 'groupe_sanguin' = any(s.sections) then out := out || jsonb_build_object('groupe_sanguin', e.blood_group); end if;
  if 'contact_urgence' = any(s.sections) then out := out || jsonb_build_object('contact_urgence', jsonb_build_object('nom', e.emergency_name, 'lien', e.emergency_relation, 'telephone', e.emergency_phone)); end if;
  if 'allergies' = any(s.sections) then out := out || jsonb_build_object('allergies', coalesce((select jsonb_agg(jsonb_build_object('titre', title, 'gravite', severity, 'detail', left(detail, 300)) order by title) from public.record_items where person_id = s.person_id and kind = 'allergie'), '[]')); end if;
  if 'maladies' = any(s.sections) then out := out || jsonb_build_object('maladies', coalesce((select jsonb_agg(jsonb_build_object('titre', title, 'annee', year) order by title) from public.record_items where person_id = s.person_id and kind = 'maladie'), '[]')); end if;
  if 'vaccins' = any(s.sections) then out := out || jsonb_build_object('vaccins', coalesce((select jsonb_agg(jsonb_build_object('titre', title, 'date', event_date) order by event_date desc nulls last) from public.record_items where person_id = s.person_id and kind = 'vaccin'), '[]')); end if;
  if 'traitements' = any(s.sections) then
    out := out || jsonb_build_object('traitements', case when is_self then coalesce((select jsonb_agg(jsonb_build_object('nom', name, 'indication', dose_note) order by name) from public.treatments where user_id = s.owner_id and active), '[]') else '[]'::jsonb end);
  end if;
  if 'mesures' = any(s.sections) then
    out := out || jsonb_build_object('mesures', case when is_self then coalesce((select jsonb_agg(m order by m.measured_at desc) from (select kind, systolic, diastolic, pulse, glucose_gl, context, measured_at from public.health_measures where user_id = s.owner_id order by measured_at desc limit 20) m), '[]') else '[]'::jsonb end);
  end if;
  update public.health_shares set views = views + 1, last_viewed_at = now() where id = s.id;
  insert into public.record_access_log (owner_id, person_id, actor_kind, actor_label, action, detail)
  values (s.owner_id, s.person_id, 'lien_partage', left(viewer, 160), 'partage_consulte', s.reference);
  -- Le titulaire est prévenu à la première consultation, puis au plus une fois par heure
  if s.last_viewed_at is null or s.last_viewed_at < now() - interval '1 hour' then
    insert into public.notifications (user_id, kind, title, body, link)
    values (s.owner_id, 'dossier', 'Votre passeport santé a été consulté', 'Partage ' || s.reference || ' ouvert par : ' || left(viewer, 120) || '. Vous pouvez retirer ce partage à tout moment.', '/ma-sante/dossier/autorisations');
  end if;
  return out;
end $$;
revoke execute on function public.open_health_share(text, text) from public;
grant execute on function public.open_health_share(text, text) to anon, authenticated;

-- 3. Suivi des maladies chroniques : rappels de mesure -------------------------------------------
create table if not exists public.measure_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('tension', 'glycemie')),
  weekdays int[] not null check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]),
  at_time text not null check (at_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  active boolean not null default true,
  last_sent_on date,
  created_at timestamptz not null default now(),
  unique (user_id, kind)
);
alter table public.measure_reminders enable row level security;
drop policy if exists "pp_measure_reminders_own" on public.measure_reminders;
create policy "pp_measure_reminders_own" on public.measure_reminders for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.measure_reminders from anon, authenticated;
grant select, insert, update, delete on public.measure_reminders to authenticated;

-- Envoi (heure du Mali = UTC) : une fois par jour, dès que l'heure choisie est passée
create or replace function public.chronic_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with r as (
    update public.measure_reminders m set last_sent_on = current_date
      from public.profiles pr
     where pr.id = m.user_id and pr.deleted_at is null and m.active
       and extract(isodow from now() at time zone 'UTC')::int = any(m.weekdays)
       and to_char(now() at time zone 'UTC', 'HH24:MI') >= m.at_time
       and (m.last_sent_on is null or m.last_sent_on < current_date)
    returning m.user_id, m.kind)
  insert into public.notifications (user_id, kind, title, body, link)
  select user_id, 'dossier', case when kind = 'tension' then 'Rappel : mesurer votre tension' else 'Rappel : mesurer votre glycémie' end,
         'Notez la mesure dans SantéProxi pour la montrer à votre soignant.', '/ma-sante/mesures' from r;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.chronic_reminders() from public, anon, authenticated;

-- 4. Suivi par un médecin choisi par le patient ---------------------------------------------------
create table if not exists public.care_follows (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  reason text check (char_length(coalesce(reason, '')) <= 200),
  share_measures boolean not null default true,
  share_treatments boolean not null default false,
  status text not null default 'demande' check (status in ('demande', 'actif', 'refuse', 'termine')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  ended_at timestamptz,
  ended_by text check (ended_by in ('patient', 'medecin'))
);
create unique index if not exists care_follows_open on public.care_follows (patient_id, doctor_id) where status in ('demande', 'actif');
alter table public.care_follows enable row level security;
drop policy if exists "pp_care_follows_read" on public.care_follows;
create policy "pp_care_follows_read" on public.care_follows for select to authenticated
  using (patient_id = auth.uid() or exists (select 1 from public.doctors d where d.id = doctor_id and d.user_id = auth.uid()));
revoke all on public.care_follows from anon, authenticated;
grant select on public.care_follows to authenticated;

create table if not exists public.care_notes (
  id uuid primary key default gen_random_uuid(),
  follow_id uuid not null references public.care_follows(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 2 and 2000),
  created_at timestamptz not null default now()
);
alter table public.care_notes enable row level security;
drop policy if exists "pp_care_notes_read" on public.care_notes;
create policy "pp_care_notes_read" on public.care_notes for select to authenticated
  using (exists (select 1 from public.care_follows f where f.id = follow_id and (f.patient_id = auth.uid() or exists (select 1 from public.doctors d where d.id = f.doctor_id and d.user_id = auth.uid()))));
revoke all on public.care_notes from anon, authenticated;
grant select on public.care_notes to authenticated;

create or replace function public.care_doctor_name(p_doctor uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(coalesce(title, '') || ' ' || display_name), ''), 'Médecin') from public.doctors where id = p_doctor;
$$;

-- Le suivi par un médecin n'ouvre qu'après accord d'un partenaire clinique : interrupteur éteint par défaut
insert into public.platform_settings (key, value, description) values ('care_follow_enabled', 'false'::jsonb, 'Suivi des mesures par un médecin (à activer après validation par le partenaire clinique)')
on conflict (key) do nothing;
create or replace function public.care_follow_enabled() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.platform_settings where key = 'care_follow_enabled'), 'false'::jsonb) = 'true'::jsonb;
$$;
grant execute on function public.care_follow_enabled() to anon, authenticated;
create or replace function public.admin_set_care_follow(p_on boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.platform_settings set value = to_jsonb(p_on), updated_at = now(), updated_by = auth.uid() where key = 'care_follow_enabled';
  perform public.log_audit('care.follow_switch', 'setting', 'care_follow_enabled', jsonb_build_object('on', p_on));
end $$;
revoke execute on function public.admin_set_care_follow(boolean) from public, anon;
grant execute on function public.admin_set_care_follow(boolean) to authenticated;

-- Le patient demande à un médecin (vérifié, avec un compte) de suivre ses mesures
create or replace function public.care_request(p_doctor uuid, p_reason text, p_share_treatments boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); d public.doctors; v_id uuid;
begin
  if uid is null then raise exception 'PP401: connexion requise'; end if;
  if not public.care_follow_enabled() then raise exception 'PP409: le suivi par un médecin n''est pas encore ouvert'; end if;
  select * into d from public.doctors where id = p_doctor and is_published and user_id is not null;
  if d.id is null then raise exception 'PP404: ce médecin ne peut pas encore recevoir de demande de suivi en ligne'; end if;
  if d.user_id = uid then raise exception 'PP422: vous ne pouvez pas vous suivre vous-même'; end if;
  if (select count(*) from public.care_follows where patient_id = uid and status in ('demande', 'actif')) >= 5 then raise exception 'PP429: 5 suivis au maximum'; end if;
  insert into public.care_follows (patient_id, doctor_id, reason, share_treatments) values (uid, p_doctor, nullif(btrim(coalesce(p_reason, '')), ''), coalesce(p_share_treatments, false))
  returning id into v_id;
  insert into public.record_access_log (owner_id, actor_kind, actor_label, action, detail) values (uid, 'titulaire', 'Vous', 'suivi_demande', public.care_doctor_name(p_doctor));
  insert into public.notifications (user_id, kind, title, body, link)
  values (d.user_id, 'rendez_vous', 'Nouvelle demande de suivi', 'Un patient vous demande de suivre ses mesures (tension, glycémie).', '/medecin/suivis');
  return v_id;
end $$;
revoke execute on function public.care_request(uuid, text, boolean) from public, anon;
grant execute on function public.care_request(uuid, text, boolean) to authenticated;

-- Le médecin accepte ou refuse ; l'un ou l'autre peut mettre fin au suivi à tout moment
create or replace function public.care_set_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare f public.care_follows; is_doc boolean; is_pat boolean;
begin
  select * into f from public.care_follows where id = p_id for update;
  if f.id is null then raise exception 'PP404: suivi introuvable'; end if;
  is_pat := f.patient_id = auth.uid();
  is_doc := exists (select 1 from public.doctors d where d.id = f.doctor_id and d.user_id = auth.uid());
  if not (is_pat or is_doc) then raise exception 'PP403: accès refusé'; end if;
  if p_status in ('actif', 'refuse') then
    if not is_doc or f.status <> 'demande' then raise exception 'PP409: seule une demande en attente peut être acceptée ou refusée par le médecin'; end if;
    update public.care_follows set status = p_status, accepted_at = case when p_status = 'actif' then now() end where id = p_id;
    if p_status = 'actif' then
      insert into public.record_access_log (owner_id, actor_kind, actor_label, action) values (f.patient_id, 'medecin_suivi', public.care_doctor_name(f.doctor_id), 'suivi_accepte');
    end if;
    insert into public.notifications (user_id, kind, title, body, link)
    values (f.patient_id, 'dossier', case when p_status = 'actif' then 'Demande de suivi acceptée' else 'Demande de suivi refusée' end,
            public.care_doctor_name(f.doctor_id) || case when p_status = 'actif' then ' peut désormais voir les mesures que vous notez. Vous pouvez arrêter ce suivi à tout moment.' else ' ne peut pas assurer ce suivi.' end, '/ma-sante/suivi');
  elsif p_status = 'termine' then
    if f.status not in ('demande', 'actif') then raise exception 'PP409: ce suivi est déjà terminé'; end if;
    update public.care_follows set status = 'termine', ended_at = now(), ended_by = case when is_pat then 'patient' else 'medecin' end where id = p_id;
    insert into public.record_access_log (owner_id, actor_kind, actor_label, action, detail)
    values (f.patient_id, case when is_pat then 'titulaire' else 'medecin_suivi' end, case when is_pat then 'Vous' else public.care_doctor_name(f.doctor_id) end, 'suivi_termine', public.care_doctor_name(f.doctor_id));
    if is_doc then insert into public.notifications (user_id, kind, title, body, link) values (f.patient_id, 'dossier', 'Suivi terminé', public.care_doctor_name(f.doctor_id) || ' a mis fin au suivi de vos mesures.', '/ma-sante/suivi'); end if;
  else raise exception 'PP422: statut invalide';
  end if;
end $$;
revoke execute on function public.care_set_status(uuid, text) from public, anon;
grant execute on function public.care_set_status(uuid, text) to authenticated;

-- Le médecin consulte les mesures d'un patient suivi (accès journalisé, visible par le patient)
create or replace function public.care_patient_data(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f public.care_follows; out jsonb;
begin
  select * into f from public.care_follows where id = p_id;
  if f.id is null or f.status <> 'actif' or not exists (select 1 from public.doctors d where d.id = f.doctor_id and d.user_id = auth.uid()) then
    raise exception 'PP403: suivi inactif ou réservé au médecin choisi par le patient';
  end if;
  out := jsonb_build_object('patient', (select full_name from public.profiles where id = f.patient_id), 'reason', f.reason,
    'mesures', case when f.share_measures then coalesce((select jsonb_agg(m order by m.measured_at desc) from (select kind, systolic, diastolic, pulse, glucose_gl, context, note, measured_at from public.health_measures where user_id = f.patient_id order by measured_at desc limit 90) m), '[]') else '[]'::jsonb end,
    'traitements', case when f.share_treatments then coalesce((select jsonb_agg(jsonb_build_object('nom', name, 'indication', dose_note) order by name) from public.treatments where user_id = f.patient_id and active), '[]') else '[]'::jsonb end);
  -- Une ligne par jour et par médecin suffit au patient pour savoir qui a regardé
  if not exists (select 1 from public.record_access_log where owner_id = f.patient_id and action = 'mesures_consultees' and actor_label = public.care_doctor_name(f.doctor_id) and created_at::date = current_date) then
    insert into public.record_access_log (owner_id, actor_kind, actor_label, action) values (f.patient_id, 'medecin_suivi', public.care_doctor_name(f.doctor_id), 'mesures_consultees');
  end if;
  return out;
end $$;
revoke execute on function public.care_patient_data(uuid) from public, anon;
grant execute on function public.care_patient_data(uuid) to authenticated;

create or replace function public.care_add_note(p_id uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare f public.care_follows;
begin
  select * into f from public.care_follows where id = p_id;
  if f.id is null or f.status <> 'actif' or not exists (select 1 from public.doctors d where d.id = f.doctor_id and d.user_id = auth.uid()) then raise exception 'PP403: suivi inactif'; end if;
  insert into public.care_notes (follow_id, body) values (p_id, btrim(p_body));
  insert into public.record_access_log (owner_id, actor_kind, actor_label, action) values (f.patient_id, 'medecin_suivi', public.care_doctor_name(f.doctor_id), 'note_ajoutee');
  insert into public.notifications (user_id, kind, title, body, link) values (f.patient_id, 'dossier', 'Nouvelle note de suivi', public.care_doctor_name(f.doctor_id) || ' vous a laissé une note.', '/ma-sante/suivi');
end $$;
revoke execute on function public.care_add_note(uuid, text) from public, anon;
grant execute on function public.care_add_note(uuid, text) to authenticated;

-- 5. Catégories des modules suivants (vides tant qu'aucune fiche n'est validée) -------------------
insert into public.health_categories (slug, name, description, icon, sort_order) values
  ('nutrition', 'Nutrition', 'Alimentation au quotidien, avec les plats et habitudes du Mali.', 'apple', 116),
  ('reeducation', 'Rééducation', 'Kinésithérapie, réadaptation après un accident ou une opération, orthophonie, accompagnement du handicap.', 'activity', 117)
on conflict (slug) do nothing;

-- 6. Maintenance : ajout des rappels de mesure (corps identique à la version 0.18, plus une ligne)
create or replace function public.run_maintenance()
returns jsonb language plpgsql security definer set search_path = public as $$
declare expired int; rl int; logs int; notifs int; outbox int; issues int; reminders int; appts int; appt_rem int; svc int; femme int; ai int; tools int; rec int; chronic int;
begin
  expired := public.expire_overdue_orders();
  appts := public.expire_appointments();
  appt_rem := public.send_appointment_reminders();
  svc := public.purge_services();
  femme := public.femme_send_reminders();
  ai := public.purge_assistant_usage();
  tools := public.health_tools_reminders();
  rec := public.record_reminders();
  chronic := public.chronic_reminders();
  delete from public.rate_limit_events where at < now() - interval '1 day';
  get diagnostics rl = row_count;
  delete from public.search_logs where created_at < now() - interval '400 days';
  get diagnostics logs = row_count;
  delete from public.notifications where read_at is not null and read_at < now() - interval '180 days';
  get diagnostics notifs = row_count;
  delete from public.notification_outbox where status in ('sent', 'skipped') and created_at < now() - interval '90 days';
  get diagnostics outbox = row_count;
  delete from public.record_access_log where created_at < now() - interval '2 years';
  reminders := public.directory_reminders();
  select count(*) into issues from public.integrity_issues() where severity = 'critique';
  insert into public.maintenance_runs (expired, purged, critical_issues)
  values (expired, jsonb_build_object('rate_limits', rl, 'search_logs', logs, 'notifications', notifs, 'outbox', outbox,
                                      'directory_reminders', reminders, 'appointments_expired', appts, 'appointment_reminders', appt_rem,
                                      'services', svc, 'femme_reminders', femme, 'assistant_usage', ai, 'health_tools', tools, 'health_record', rec, 'chronic', chronic), issues);
  delete from public.maintenance_runs where ran_at < now() - interval '30 days';
  return jsonb_build_object('expired', expired, 'appointments_expired', appts, 'appointment_reminders', appt_rem, 'femme_reminders', femme,
    'health_tools', tools, 'health_record', rec, 'chronic', chronic,
    'purged', jsonb_build_object('rate_limits', rl, 'search_logs', logs, 'notifications', notifs, 'outbox', outbox,
                                 'directory_reminders', reminders, 'services', svc, 'assistant_usage', ai),
    'critical_issues', issues);
end $$;
revoke execute on function public.run_maintenance() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- ROLLBACK (manuel) :
--   drop table if exists public.care_notes, public.care_follows, public.measure_reminders, public.health_shares, public.record_access_log cascade;
--   drop function if exists public.open_health_share(text, text), public.create_health_share(uuid, text[], int, text), public.revoke_health_share(uuid),
--     public.record_log_access(uuid, text, text), public.chronic_reminders(), public.care_request(uuid, text, boolean), public.care_set_status(uuid, text),
--     public.care_patient_data(uuid), public.care_add_note(uuid, text), public.care_doctor_name(uuid);
--   puis recréer run_maintenance() sans la ligne « chronic » (version de 20261104000100_health_record.sql).
-- ---------------------------------------------------------------------------
