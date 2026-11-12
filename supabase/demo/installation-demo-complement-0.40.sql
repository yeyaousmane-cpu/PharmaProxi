-- SantéProxi — complément 0.40 pour le projet de démonstration (après le complément 0.39).
-- =============================================================================
-- SantéProxi 0.40 — Campagnes de collecte proposées par des organisations + Observatoire du don de sang
-- * Une association, une entreprise, une université, un lieu de culte… propose une collecte. Elle n'est publiée
--   qu'après validation par le CNTS (compte autorité « cnts ») ou l'administration, avec la structure de collecte
--   nommée. SantéProxi ne remplace pas le CNTS : la collecte est toujours réalisée par une structure habilitée.
-- * Inscriptions par créneau horaire (« je viens à 10 h »), rappel dans l'application ; bilan déclaré après la
--   collecte par l'organisateur (« déclaré par l'organisateur », jamais présenté comme chiffre officiel).
-- * Observatoire : agrégats de l'activité sur SantéProxi seulement, masqués sous le seuil de confidentialité
--   (stat_k, 10), datés, jamais présentés comme statistiques officielles du ministère ou du CNTS.
-- Migration additive. Retour arrière : drop des tables blood_campaign_* ajoutées et des fonctions campaign_* / observatoire_*.
-- =============================================================================

-- Les collectes validées par le CNTS sans page source externe sont acceptées (validation tracée)
alter table public.blood_campaigns add column if not exists proposal_id uuid;
alter table public.blood_campaigns add column if not exists validated_by uuid references public.profiles(id) on delete set null;
alter table public.blood_campaigns add column if not exists validated_at timestamptz;
alter table public.blood_campaigns add column if not exists collecting_structure text check (char_length(coalesce(collecting_structure, '')) <= 160);
alter table public.blood_campaigns add column if not exists slot_minutes int check (slot_minutes is null or slot_minutes in (30, 60));
alter table public.blood_campaigns add column if not exists slot_capacity int check (slot_capacity is null or slot_capacity between 1 and 200);
alter table public.blood_campaigns alter column source_url drop not null;
alter table public.blood_campaigns drop constraint if exists blood_campaigns_source_or_validated;
alter table public.blood_campaigns add constraint blood_campaigns_source_or_validated check ((source_url is not null and source_url ~ '^https?://') or (source_url is null and validated_at is not null));

create or replace function public.has_authority(p_kind text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.authority_members m where m.user_id = auth.uid() and m.scope = p_kind and m.active)
$$;
grant execute on function public.has_authority(text) to authenticated;

create table if not exists public.blood_campaign_proposals (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('COL-' || upper(substr(md5(gen_random_uuid()::text), 1, 6))),
  proposer_id uuid not null references public.profiles(id) on delete cascade,
  organization_name text not null check (char_length(btrim(organization_name)) between 2 and 140),
  organization_kind text not null check (organization_kind in ('association', 'entreprise', 'universite', 'ecole', 'lieu_de_culte', 'mairie', 'club', 'structure_sante', 'autre')),
  contact_phone text not null check (contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  title text not null check (char_length(btrim(title)) between 3 and 140),
  region_id uuid not null references public.regions(id) on delete restrict,
  place text not null check (char_length(btrim(place)) between 3 and 200),
  starts_on date not null,
  start_time text not null check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time text not null check (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and end_time > start_time),
  expected_donors int check (expected_donors is null or expected_donors between 1 and 5000),
  collecting_structure text not null check (char_length(btrim(collecting_structure)) between 3 and 160),
  collecting_agreement text not null check (collecting_agreement in ('confirme', 'en_discussion')),
  details text check (char_length(coalesce(details, '')) <= 1000),
  slot_minutes int check (slot_minutes is null or slot_minutes in (30, 60)),
  slot_capacity int check (slot_capacity is null or slot_capacity between 1 and 200),
  status text not null default 'soumise' check (status in ('soumise', 'a_completer', 'validee', 'refusee', 'retiree')),
  review_note text check (char_length(coalesce(review_note, '')) <= 500),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  campaign_id uuid references public.blood_campaigns(id) on delete set null,
  outcome_present int check (outcome_present is null or outcome_present between 0 and 10000),
  outcome_collected int check (outcome_collected is null or outcome_collected between 0 and 10000),
  outcome_note text check (char_length(coalesce(outcome_note, '')) <= 500),
  outcome_at timestamptz,
  created_at timestamptz not null default now(),
  check (outcome_collected is null or outcome_present is null or outcome_collected <= outcome_present)
);
create index if not exists blood_campaign_proposals_status on public.blood_campaign_proposals (status, starts_on);
alter table public.blood_campaign_proposals enable row level security;
drop policy if exists "pp_campaign_proposals_read" on public.blood_campaign_proposals;
create policy "pp_campaign_proposals_read" on public.blood_campaign_proposals for select to authenticated
  using (proposer_id = auth.uid() or public.is_admin() or public.has_authority('cnts'));
revoke all on public.blood_campaign_proposals from anon, authenticated;
grant select on public.blood_campaign_proposals to authenticated;

-- Inscription à un créneau (le titulaire seul voit son inscription ; l'organisateur ne voit que des nombres)
create table if not exists public.blood_campaign_slot_signups (
  campaign_id uuid not null references public.blood_campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  slot_start text not null check (slot_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  created_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);
alter table public.blood_campaign_slot_signups enable row level security;
drop policy if exists "pp_campaign_slots_own" on public.blood_campaign_slot_signups;
create policy "pp_campaign_slots_own" on public.blood_campaign_slot_signups for select to authenticated using (user_id = auth.uid());
revoke all on public.blood_campaign_slot_signups from anon, authenticated;
grant select on public.blood_campaign_slot_signups to authenticated;


create or replace function public.campaign_propose(p jsonb) returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); ref text; d date := (p->>'starts_on')::date;
begin
  if d < current_date + 7 then raise exception 'PP422: proposez la collecte au moins 7 jours à l''avance (le temps que le CNTS valide)'; end if;
  if d > current_date + 365 then raise exception 'PP422: date trop lointaine'; end if;
  if (select count(*) from public.blood_campaign_proposals where proposer_id = uid and status in ('soumise', 'a_completer')) >= 3 then raise exception 'PP429: 3 propositions en attente au maximum'; end if;
  insert into public.blood_campaign_proposals (proposer_id, organization_name, organization_kind, contact_phone, title, region_id, place, starts_on, start_time, end_time, expected_donors, collecting_structure, collecting_agreement, details, slot_minutes, slot_capacity)
  values (uid, btrim(p->>'organization_name'), p->>'organization_kind', (select case when x ~ '^[0-9]{8}$' then '+223' || x when x ~ '^223[0-9]{8}$' then '+' || x else x end from (select regexp_replace(coalesce(p->>'contact_phone', ''), '[\s.\-()]', '', 'g') x) z), btrim(p->>'title'), (p->>'region_id')::uuid, btrim(p->>'place'), d,
    p->>'start_time', p->>'end_time', nullif(p->>'expected_donors', '')::int, btrim(p->>'collecting_structure'), p->>'collecting_agreement', nullif(btrim(coalesce(p->>'details', '')), ''),
    nullif(p->>'slot_minutes', '')::int, nullif(p->>'slot_capacity', '')::int)
  returning reference into ref;
  perform public.log_audit('campaign.propose', 'blood_campaign_proposal', ref);
  return ref;
exception when check_violation or not_null_violation then raise exception 'PP422: vérifiez les champs (organisation, téléphone, lieu, horaires, structure de collecte)';
end $$;
revoke execute on function public.campaign_propose(jsonb) from public, anon;
grant execute on function public.campaign_propose(jsonb) to authenticated;

-- Validation : CNTS ou administration ; la publication crée la collecte publique
create or replace function public.campaign_review(p_id uuid, p_decision text, p_note text default null) returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); pr public.blood_campaign_proposals; cid uuid;
begin
  if not (public.is_admin() or public.has_authority('cnts')) then raise exception 'PP403: validation réservée au CNTS ou à l''administration' using errcode = '42501'; end if;
  select * into pr from public.blood_campaign_proposals where id = p_id for update;
  if pr.id is null then raise exception 'PP404: proposition introuvable'; end if;
  if pr.proposer_id = uid then raise exception 'PP422: vous ne pouvez pas valider votre propre proposition'; end if;
  if pr.status not in ('soumise', 'a_completer') then raise exception 'PP409: proposition déjà traitée'; end if;
  if p_decision in ('a_completer', 'refusee') and char_length(btrim(coalesce(p_note, ''))) < 5 then raise exception 'PP422: indiquez la raison à l''organisateur'; end if;
  if p_decision = 'validee' then
    if pr.collecting_agreement <> 'confirme' then raise exception 'PP422: la structure de collecte doit avoir confirmé sa participation avant publication'; end if;
    insert into public.blood_campaigns (title, organizer, region_id, place, starts_on, start_time, end_time, details, source_url, published, created_by, proposal_id, validated_by, validated_at, collecting_structure, slot_minutes, slot_capacity)
    values (pr.title, pr.organization_name, pr.region_id, pr.place, pr.starts_on, pr.start_time, pr.end_time, pr.details, null, true, uid, pr.id, uid, now(), pr.collecting_structure, pr.slot_minutes, pr.slot_capacity)
    returning id into cid;
  elsif p_decision not in ('a_completer', 'refusee') then raise exception 'PP422: décision inconnue'; end if;
  update public.blood_campaign_proposals set status = p_decision, review_note = nullif(btrim(coalesce(p_note, '')), ''), reviewed_by = uid, reviewed_at = now(), campaign_id = cid where id = pr.id;
  insert into public.notifications (user_id, kind, title, body, link) values (pr.proposer_id, 'don',
    case p_decision when 'validee' then 'Votre collecte est validée et publiée' when 'a_completer' then 'Votre proposition de collecte est à compléter' else 'Votre proposition de collecte n''a pas été retenue' end,
    pr.reference || coalesce(' — ' || nullif(btrim(coalesce(p_note, '')), ''), ''), '/don-de-sang/collectes/organiser');
  perform public.log_audit('campaign.review', 'blood_campaign_proposal', pr.id::text, jsonb_build_object('decision', p_decision));
  return cid;
end $$;
revoke execute on function public.campaign_review(uuid, text, text) from public, anon;
grant execute on function public.campaign_review(uuid, text, text) to authenticated;

create or replace function public.campaign_withdraw(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.blood_campaign_proposals set status = 'retiree' where id = p_id and proposer_id = auth.uid() and status in ('soumise', 'a_completer');
  if not found then raise exception 'PP404: proposition introuvable ou déjà traitée'; end if;
end $$;
revoke execute on function public.campaign_withdraw(uuid) from public, anon;
grant execute on function public.campaign_withdraw(uuid) to authenticated;

-- Créneaux : liste calculée à partir des horaires ; places restantes
create or replace function public.campaign_slots(p_campaign uuid)
returns table (slot_start text, capacity int, taken int, mine boolean) language sql stable security definer set search_path = public as $$
  with c as (select * from public.blood_campaigns where id = p_campaign and published and slot_minutes is not null and start_time is not null and end_time is not null)
  select to_char(t, 'HH24:MI'), c.slot_capacity,
    (select count(*)::int from public.blood_campaign_slot_signups s where s.campaign_id = c.id and s.slot_start = to_char(t, 'HH24:MI')),
    exists (select 1 from public.blood_campaign_slot_signups s where s.campaign_id = c.id and s.user_id = auth.uid() and s.slot_start = to_char(t, 'HH24:MI'))
  from c, generate_series(('2000-01-01 ' || c.start_time)::timestamp, ('2000-01-01 ' || c.end_time)::timestamp - make_interval(mins => c.slot_minutes), make_interval(mins => c.slot_minutes)) t
  order by 1;
$$;
grant execute on function public.campaign_slots(uuid) to anon, authenticated;

create or replace function public.campaign_book_slot(p_campaign uuid, p_slot text) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); c public.blood_campaigns; cap int; n int;
begin
  select * into c from public.blood_campaigns where id = p_campaign and published for update;
  if c.id is null or c.slot_minutes is null then raise exception 'PP404: collecte sans créneaux'; end if;
  if c.starts_on < current_date then raise exception 'PP410: collecte passée'; end if;
  select capacity, taken into cap, n from public.campaign_slots(c.id) where slot_start = p_slot;
  if cap is null then raise exception 'PP422: créneau inconnu'; end if;
  delete from public.blood_campaign_slot_signups where campaign_id = c.id and user_id = uid;
  if n >= cap then raise exception 'PP409: ce créneau est complet, choisissez-en un autre'; end if;
  insert into public.blood_campaign_slot_signups (campaign_id, user_id, slot_start) values (c.id, uid, p_slot);
  insert into public.blood_campaign_attendance (campaign_id, user_id) values (c.id, uid) on conflict do nothing;
end $$;
revoke execute on function public.campaign_book_slot(uuid, text) from public, anon;
grant execute on function public.campaign_book_slot(uuid, text) to authenticated;

create or replace function public.campaign_cancel_slot(p_campaign uuid) returns void language sql security definer set search_path = public as $$
  delete from public.blood_campaign_slot_signups where campaign_id = p_campaign and user_id = auth.uid();
$$;
revoke execute on function public.campaign_cancel_slot(uuid) from public, anon;
grant execute on function public.campaign_cancel_slot(uuid) to authenticated;

-- Pour l'organisateur : nombres seulement, jamais de noms
create or replace function public.campaign_organizer_counts(p_proposal uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pr public.blood_campaign_proposals;
begin
  select * into pr from public.blood_campaign_proposals where id = p_proposal and (proposer_id = auth.uid() or public.is_admin() or public.has_authority('cnts'));
  if pr.id is null then raise exception 'PP404: proposition introuvable'; end if;
  return jsonb_build_object('inscrits_creneaux', (select count(*) from public.blood_campaign_slot_signups where campaign_id = pr.campaign_id),
    'j_y_serai', (select count(*) from public.blood_campaign_attendance where campaign_id = pr.campaign_id));
end $$;
revoke execute on function public.campaign_organizer_counts(uuid) from public, anon;
grant execute on function public.campaign_organizer_counts(uuid) to authenticated;

-- Bilan déclaré par l'organisateur après la collecte
create or replace function public.campaign_report_outcome(p_id uuid, p_present int, p_collected int, p_note text default null) returns void language plpgsql security definer set search_path = public as $$
declare pr public.blood_campaign_proposals;
begin
  select * into pr from public.blood_campaign_proposals where id = p_id and proposer_id = auth.uid() for update;
  if pr.id is null or pr.status <> 'validee' then raise exception 'PP404: collecte validée introuvable'; end if;
  if pr.starts_on > current_date then raise exception 'PP409: le bilan se déclare après la collecte'; end if;
  update public.blood_campaign_proposals set outcome_present = p_present, outcome_collected = p_collected, outcome_note = nullif(btrim(coalesce(p_note, '')), ''), outcome_at = now() where id = pr.id;
exception when check_violation then raise exception 'PP422: le nombre de poches ne peut pas dépasser le nombre de personnes venues';
end $$;
revoke execute on function public.campaign_report_outcome(uuid, int, int, text) from public, anon;
grant execute on function public.campaign_report_outcome(uuid, int, int, text) to authenticated;

-- Observatoire : activité sur SantéProxi, par région, masquée sous le seuil, datée
create or replace function public.blood_observatory(p_days int default 90) returns jsonb language sql stable security definer set search_path = public as $$
  with d as (select greatest(7, least(coalesce(p_days, 90), 365)) n)
  select jsonb_build_object(
    'genere_le', now(), 'periode_jours', (select n from d), 'seuil', public.stat_k(),
    'national', jsonb_build_object(
      'collectes_publiees', (select count(*) from public.blood_campaigns c where c.published and c.starts_on >= current_date - (select n from d)),
      'collectes_a_venir', (select count(*) from public.blood_campaigns c where c.published and c.starts_on >= current_date),
      'j_y_serai', public.stat_mask((select count(*) from public.blood_campaign_attendance a join public.blood_campaigns c on c.id = a.campaign_id where c.starts_on >= current_date - (select n from d))),
      'donneurs_inscrits', public.stat_mask((select count(*) from public.blood_donor_profiles)),
      'demandes_sos', public.stat_mask((select count(*) from public.blood_requests r where r.created_at >= now() - make_interval(days => (select n from d)))),
      'bilans_declares_poches', public.stat_mask((select sum(outcome_collected) from public.blood_campaign_proposals where outcome_at is not null and starts_on >= current_date - (select n from d)))),
    'regions', coalesce((select jsonb_agg(jsonb_build_object('region', g.name,
        'collectes', (select count(*) from public.blood_campaigns c where c.published and c.region_id = g.id and c.starts_on >= current_date - (select n from d)),
        'j_y_serai', public.stat_mask((select count(*) from public.blood_campaign_attendance a join public.blood_campaigns c on c.id = a.campaign_id where c.region_id = g.id and c.starts_on >= current_date - (select n from d))),
        'demandes_sos', public.stat_mask((select count(*) from public.blood_requests r where r.region_id = g.id and r.created_at >= now() - make_interval(days => (select n from d)))))
      order by g.name) from public.regions g), '[]'::jsonb),
    'mois', coalesce((select jsonb_agg(jsonb_build_object('mois', to_char(m, 'YYYY-MM'),
        'collectes', (select count(*) from public.blood_campaigns c where c.published and date_trunc('month', c.starts_on) = m)) order by m)
      from generate_series(date_trunc('month', current_date - (select n from d)), date_trunc('month', current_date + 60), interval '1 month') m), '[]'::jsonb)
  );
$$;
grant execute on function public.blood_observatory(int) to anon, authenticated;
