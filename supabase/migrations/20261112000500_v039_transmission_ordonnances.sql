-- =============================================================================
-- SantéProxi 0.39 — Transmission d'ordonnances à une pharmacie
-- * Le patient choisit une ordonnance de son dossier (chiffrée), une pharmacie vérifiée, et donne son consentement.
-- * Seuls les membres de cette pharmacie peuvent lire le fichier, tant que la demande est active (72 h au plus).
-- * La pharmacie répond ligne par ligne (disponible, partiel, à commander, indisponible) avec une durée de validité
--   courte : une disponibilité n'est jamais affichée au-delà de sa validité, et jamais inventée par SantéProxi.
-- * Réservation sans paiement en ligne ; l'ordonnance originale reste exigée au comptoir. Aucun SMS ni e-mail :
--   notifications dans l'application uniquement. Aucune substitution sans l'accord du pharmacien et du patient.
-- Migration additive. Retour arrière : drop des tables prescription_* et des fonctions rx_*.
-- =============================================================================

create table if not exists public.prescription_transmissions (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('ORD-' || upper(substr(md5(gen_random_uuid()::text), 1, 8))),
  patient_id uuid not null references public.profiles(id) on delete cascade,
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  document_id uuid not null references public.record_documents(id) on delete cascade,
  patient_note text check (char_length(coalesce(patient_note, '')) <= 500),
  fulfillment text not null default 'retrait' check (fulfillment in ('retrait')),
  status text not null default 'envoyee' check (status in ('envoyee', 'vue', 'repondue', 'reservee', 'prete', 'retiree', 'refusee', 'annulee', 'expiree')),
  consent_at timestamptz not null,
  expires_at timestamptz not null,
  viewed_at timestamptz,
  responded_at timestamptz,
  response_valid_until timestamptz,
  pharmacy_message text check (char_length(coalesce(pharmacy_message, '')) <= 500),
  reserved_at timestamptz,
  hold_until timestamptz,
  closed_at timestamptz,
  close_reason text check (char_length(coalesce(close_reason, '')) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists prescription_tx_patient on public.prescription_transmissions (patient_id, created_at desc);
create index if not exists prescription_tx_pharmacy on public.prescription_transmissions (pharmacy_id, status, created_at desc);

create table if not exists public.prescription_response_lines (
  id uuid primary key default gen_random_uuid(),
  transmission_id uuid not null references public.prescription_transmissions(id) on delete cascade,
  position int not null,
  label text not null check (char_length(label) between 2 and 160),
  availability text not null check (availability in ('disponible', 'partiel', 'a_commander', 'indisponible')),
  quantity_available int check (quantity_available is null or quantity_available between 0 and 999),
  unit_price_xof int check (unit_price_xof is null or unit_price_xof between 0 and 10000000),
  delay_days int check (delay_days is null or delay_days between 0 and 60),
  note text check (char_length(coalesce(note, '')) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists prescription_lines_tx on public.prescription_response_lines (transmission_id, position);

create table if not exists public.prescription_events (
  id bigint generated always as identity primary key,
  transmission_id uuid not null references public.prescription_transmissions(id) on delete cascade,
  status text not null,
  actor text not null check (actor in ('patient', 'pharmacie', 'systeme')),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists prescription_events_tx on public.prescription_events (transmission_id, created_at);

alter table public.prescription_transmissions enable row level security;
alter table public.prescription_response_lines enable row level security;
alter table public.prescription_events enable row level security;
revoke all on public.prescription_transmissions, public.prescription_response_lines, public.prescription_events from anon, authenticated;
grant select on public.prescription_transmissions, public.prescription_response_lines, public.prescription_events to authenticated;

drop policy if exists "pp_rx_read" on public.prescription_transmissions;
create policy "pp_rx_read" on public.prescription_transmissions for select to authenticated
  using (patient_id = auth.uid() or public.is_pharmacy_member(pharmacy_id) or public.is_admin());
drop policy if exists "pp_rx_lines_read" on public.prescription_response_lines;
create policy "pp_rx_lines_read" on public.prescription_response_lines for select to authenticated
  using (exists (select 1 from public.prescription_transmissions t where t.id = transmission_id and (t.patient_id = auth.uid() or public.is_pharmacy_member(t.pharmacy_id) or public.is_admin())));
drop policy if exists "pp_rx_events_read" on public.prescription_events;
create policy "pp_rx_events_read" on public.prescription_events for select to authenticated
  using (exists (select 1 from public.prescription_transmissions t where t.id = transmission_id and (t.patient_id = auth.uid() or public.is_pharmacy_member(t.pharmacy_id) or public.is_admin())));

-- Une demande est « active » tant qu'elle n'est ni close ni expirée
create or replace function public.rx_is_open(t public.prescription_transmissions) returns boolean language sql immutable as $$
  select t.status in ('envoyee', 'vue', 'repondue', 'reservee', 'prete')
$$;

-- Expiration paresseuse (appelée par les fonctions de lecture et d'action ; aucun traitement planifié requis)
create or replace function public.rx_expire() returns void language sql security definer set search_path = public as $$
  with x as (
    update public.prescription_transmissions set status = 'expiree', closed_at = now(), close_reason = 'Délai dépassé'
     where status in ('envoyee', 'vue', 'repondue') and expires_at < now()
        or status in ('reservee', 'prete') and hold_until < now()
    returning id)
  insert into public.prescription_events (transmission_id, status, actor, note) select id, 'expiree', 'systeme', 'Délai dépassé' from x;
$$;
revoke execute on function public.rx_expire() from public, anon;
grant execute on function public.rx_expire() to authenticated;

-- Le membre de la pharmacie destinataire lit le fichier chiffré de l'ordonnance tant que la demande est active
create or replace function public.rx_can_read(p_path text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.prescription_transmissions t join public.record_documents d on d.id = t.document_id
    where d.storage_path = p_path and public.is_pharmacy_member(t.pharmacy_id) and t.status in ('envoyee', 'vue', 'repondue', 'reservee', 'prete')
      and (t.expires_at > now() or t.status in ('reservee', 'prete')));
$$;
revoke execute on function public.rx_can_read(text) from public, anon;
grant execute on function public.rx_can_read(text) to authenticated;
drop policy if exists "pp_personal_docs_select_rx" on storage.objects;
create policy "pp_personal_docs_select_rx" on storage.objects for select to authenticated
  using (bucket_id = 'personal-documents' and public.rx_can_read(name));

create or replace function public.rx_send(p_document uuid, p_pharmacy uuid, p_note text default null, p_consent boolean default false) returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); d public.record_documents; ph public.pharmacies; ref text; tid uuid;
begin
  if not p_consent then raise exception 'PP422: votre consentement est nécessaire pour transmettre l''ordonnance'; end if;
  if not public.record_unlocked(uid) then raise exception 'PP423: ouvrez d''abord votre dossier avec votre code'; end if;
  select * into d from public.record_documents where id = p_document and user_id = uid;
  if d.id is null then raise exception 'PP404: ordonnance introuvable dans votre dossier'; end if;
  if d.doc_kind <> 'ordonnance' then raise exception 'PP422: choisissez un document rangé comme « Ordonnance »'; end if;
  select * into ph from public.pharmacies where id = p_pharmacy and status = 'verified';
  if ph.id is null then raise exception 'PP404: pharmacie introuvable ou non vérifiée'; end if;
  if exists (select 1 from public.pharmacy_members m where m.pharmacy_id = ph.id and m.user_id = uid) then raise exception 'PP422: vous ne pouvez pas transmettre une ordonnance à votre propre pharmacie'; end if;
  perform public.rx_expire();
  if (select count(*) from public.prescription_transmissions where patient_id = uid and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'PP429: 5 transmissions par jour au maximum'; end if;
  if exists (select 1 from public.prescription_transmissions where patient_id = uid and document_id = d.id and pharmacy_id = ph.id and status in ('envoyee', 'vue', 'repondue', 'reservee', 'prete')) then
    raise exception 'PP409: cette ordonnance est déjà en cours auprès de cette pharmacie'; end if;
  insert into public.prescription_transmissions (patient_id, pharmacy_id, document_id, patient_note, consent_at, expires_at)
  values (uid, ph.id, d.id, nullif(left(btrim(coalesce(p_note, '')), 500), ''), now(), now() + interval '72 hours')
  returning id, reference into tid, ref;
  insert into public.prescription_events (transmission_id, status, actor) values (tid, 'envoyee', 'patient');
  insert into public.notifications (user_id, kind, title, body, link)
    select m.user_id, 'ordonnance', 'Nouvelle ordonnance reçue', ref || ' — réponse attendue sous 72 h', '/pharmacien/ordonnances/' || tid from public.pharmacy_members m where m.pharmacy_id = ph.id;
  perform public.log_audit('rx.send', 'prescription_transmission', tid::text, jsonb_build_object('pharmacy', ph.id));
  return ref;
end $$;
revoke execute on function public.rx_send(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.rx_send(uuid, uuid, text, boolean) to authenticated;

-- Ouverture par la pharmacie : marque « vue », journalise, renvoie le chemin du fichier
create or replace function public.rx_open(p_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.prescription_transmissions; d public.record_documents;
begin
  perform public.rx_expire();
  select * into t from public.prescription_transmissions where id = p_id for update;
  if t.id is null or not public.is_pharmacy_member(t.pharmacy_id) then raise exception 'PP403: accès refusé' using errcode = '42501'; end if;
  if not public.rx_is_open(t) then raise exception 'PP410: demande close : le fichier n''est plus accessible'; end if;
  select * into d from public.record_documents where id = t.document_id;
  if t.status = 'envoyee' then
    update public.prescription_transmissions set status = 'vue', viewed_at = now() where id = t.id;
    insert into public.prescription_events (transmission_id, status, actor) values (t.id, 'vue', 'pharmacie');
    insert into public.notifications (user_id, kind, title, body, link) values (t.patient_id, 'ordonnance', 'Votre ordonnance a été ouverte par la pharmacie', t.reference, '/ma-sante/dossier/ordonnances');
  end if;
  perform public.log_audit('rx.view', 'prescription_transmission', t.id::text);
  return jsonb_build_object('storage_path', d.storage_path, 'mime', d.mime, 'title', d.title);
end $$;
revoke execute on function public.rx_open(uuid) from public, anon;
grant execute on function public.rx_open(uuid) to authenticated;

-- Réponse de la pharmacie : lignes saisies par le pharmacien, validité de 2 à 48 heures
create or replace function public.rx_respond(p_id uuid, p_lines jsonb, p_valid_hours int default 24, p_message text default null) returns void language plpgsql security definer set search_path = public as $$
declare t public.prescription_transmissions; l jsonb; i int := 0;
begin
  perform public.rx_expire();
  select * into t from public.prescription_transmissions where id = p_id for update;
  if t.id is null or not public.can_manage_pharmacy(t.pharmacy_id) then raise exception 'PP403: accès refusé' using errcode = '42501'; end if;
  if t.status not in ('envoyee', 'vue', 'repondue') then raise exception 'PP409: la demande ne peut plus recevoir de réponse'; end if;
  if p_valid_hours not between 2 and 48 then raise exception 'PP422: validité de 2 à 48 heures'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 30 then raise exception 'PP422: indiquez de 1 à 30 lignes'; end if;
  delete from public.prescription_response_lines where transmission_id = t.id;
  for l in select * from jsonb_array_elements(p_lines) loop
    i := i + 1;
    insert into public.prescription_response_lines (transmission_id, position, label, availability, quantity_available, unit_price_xof, delay_days, note)
    values (t.id, i, btrim(l->>'label'), l->>'availability', nullif(l->>'quantity', '')::int, nullif(l->>'price', '')::int, nullif(l->>'delay', '')::int, nullif(btrim(coalesce(l->>'note', '')), ''));
  end loop;
  update public.prescription_transmissions set status = 'repondue', responded_at = now(), response_valid_until = now() + make_interval(hours => p_valid_hours),
    expires_at = greatest(expires_at, now() + make_interval(hours => p_valid_hours)), pharmacy_message = nullif(left(btrim(coalesce(p_message, '')), 500), '')
   where id = t.id;
  insert into public.prescription_events (transmission_id, status, actor) values (t.id, 'repondue', 'pharmacie');
  insert into public.notifications (user_id, kind, title, body, link) values (t.patient_id, 'ordonnance', 'La pharmacie a répondu à votre ordonnance', t.reference || ' — réponse valable ' || p_valid_hours || ' h', '/ma-sante/dossier/ordonnances');
  perform public.log_audit('rx.respond', 'prescription_transmission', t.id::text, jsonb_build_object('lines', i));
end $$;
revoke execute on function public.rx_respond(uuid, jsonb, int, text) from public, anon;
grant execute on function public.rx_respond(uuid, jsonb, int, text) to authenticated;

-- Le patient réserve (réponse encore valable) ou annule
create or replace function public.rx_patient_action(p_id uuid, p_action text) returns void language plpgsql security definer set search_path = public as $$
declare t public.prescription_transmissions;
begin
  perform public.rx_expire();
  select * into t from public.prescription_transmissions where id = p_id and patient_id = auth.uid() for update;
  if t.id is null then raise exception 'PP404: demande introuvable'; end if;
  if p_action = 'reserver' then
    if t.status <> 'repondue' then raise exception 'PP409: réservation possible seulement après la réponse de la pharmacie'; end if;
    if t.response_valid_until < now() then raise exception 'PP410: la réponse de la pharmacie n''est plus valable : demandez une mise à jour'; end if;
    if not exists (select 1 from public.prescription_response_lines where transmission_id = t.id and availability in ('disponible', 'partiel', 'a_commander')) then raise exception 'PP409: aucun produit disponible à réserver'; end if;
    update public.prescription_transmissions set status = 'reservee', reserved_at = now(), hold_until = now() + interval '48 hours' where id = t.id;
    insert into public.prescription_events (transmission_id, status, actor) values (t.id, 'reservee', 'patient');
    insert into public.notifications (user_id, kind, title, body, link)
      select m.user_id, 'ordonnance', 'Réservation sur ordonnance', t.reference || ' — à préparer', '/pharmacien/ordonnances/' || t.id from public.pharmacy_members m where m.pharmacy_id = t.pharmacy_id;
  elsif p_action = 'annuler' then
    if not public.rx_is_open(t) then raise exception 'PP409: demande déjà close'; end if;
    update public.prescription_transmissions set status = 'annulee', closed_at = now(), close_reason = 'Annulée par le patient' where id = t.id;
    insert into public.prescription_events (transmission_id, status, actor) values (t.id, 'annulee', 'patient');
  else raise exception 'PP422: action inconnue'; end if;
  perform public.log_audit('rx.' || p_action, 'prescription_transmission', t.id::text);
end $$;
revoke execute on function public.rx_patient_action(uuid, text) from public, anon;
grant execute on function public.rx_patient_action(uuid, text) to authenticated;

-- La pharmacie : prête, retirée (ordonnance originale vérifiée au comptoir) ou refus motivé
create or replace function public.rx_pharmacy_action(p_id uuid, p_action text, p_note text default null) returns void language plpgsql security definer set search_path = public as $$
declare t public.prescription_transmissions; msg text;
begin
  perform public.rx_expire();
  select * into t from public.prescription_transmissions where id = p_id for update;
  if t.id is null or not public.can_manage_pharmacy(t.pharmacy_id) then raise exception 'PP403: accès refusé' using errcode = '42501'; end if;
  if p_action = 'prete' and t.status = 'reservee' then
    update public.prescription_transmissions set status = 'prete', hold_until = greatest(hold_until, now() + interval '24 hours') where id = t.id; msg := 'Votre commande sur ordonnance est prête';
  elsif p_action = 'retiree' and t.status in ('reservee', 'prete') then
    update public.prescription_transmissions set status = 'retiree', closed_at = now(), close_reason = 'Retirée au comptoir' where id = t.id; msg := 'Retrait enregistré';
  elsif p_action = 'refusee' and t.status in ('envoyee', 'vue', 'repondue', 'reservee', 'prete') then
    if char_length(btrim(coalesce(p_note, ''))) < 5 then raise exception 'PP422: indiquez le motif du refus'; end if;
    update public.prescription_transmissions set status = 'refusee', closed_at = now(), close_reason = left(btrim(p_note), 300) where id = t.id; msg := 'La pharmacie ne peut pas traiter votre ordonnance';
  else raise exception 'PP409: action impossible à ce stade'; end if;
  insert into public.prescription_events (transmission_id, status, actor, note) values (t.id, p_action, 'pharmacie', nullif(btrim(coalesce(p_note, '')), ''));
  insert into public.notifications (user_id, kind, title, body, link) values (t.patient_id, 'ordonnance', msg, t.reference || coalesce(' — ' || nullif(btrim(coalesce(p_note, '')), ''), ''), '/ma-sante/dossier/ordonnances');
  perform public.log_audit('rx.' || p_action, 'prescription_transmission', t.id::text);
end $$;
revoke execute on function public.rx_pharmacy_action(uuid, text, text) from public, anon;
grant execute on function public.rx_pharmacy_action(uuid, text, text) to authenticated;

-- Liste côté pharmacie : prénom et initiale du patient seulement
create or replace function public.rx_pharmacy_inbox(p_pharmacy uuid)
returns table (id uuid, reference text, patient text, status text, patient_note text, created_at timestamptz, expires_at timestamptz, response_valid_until timestamptz, hold_until timestamptz, mime text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_pharmacy_member(p_pharmacy) then raise exception 'PP403: accès refusé' using errcode = '42501'; end if;
  return query select t.id, t.reference, split_part(btrim(p.full_name), ' ', 1) || coalesce(' ' || left(nullif(split_part(btrim(p.full_name), ' ', 2), ''), 1) || '.', ''),
    t.status, t.patient_note, t.created_at, t.expires_at, t.response_valid_until, t.hold_until, d.mime
  from public.prescription_transmissions t join public.profiles p on p.id = t.patient_id join public.record_documents d on d.id = t.document_id
  where t.pharmacy_id = p_pharmacy order by t.created_at desc limit 200;
end $$;
revoke execute on function public.rx_pharmacy_inbox(uuid) from public, anon;
grant execute on function public.rx_pharmacy_inbox(uuid) to authenticated;
