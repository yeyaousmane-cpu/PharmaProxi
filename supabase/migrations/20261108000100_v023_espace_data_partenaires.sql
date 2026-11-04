-- =============================================================================
-- SantéProxi 0.23 — centres spécialisés, statistiques des établissements,
-- lexique des analyses, SantéProxi Data (évolution, carte, communiqués officiels,
-- validation des données), rendez-vous et résultats chiffrés des laboratoires,
-- documents personnels chiffrés, scanner de médicaments, santé mentale (lignes
-- d'écoute), langues nationales (traductions validées).
--
-- Rien n'est inventé : les spécialités des centres, les codes-barres, les lignes
-- d'écoute, les traductions et les textes du lexique sont saisis ou validés par
-- l'équipe. Les fichiers de santé (résultats, documents) sont chiffrés par le
-- serveur avant d'être stockés et ne sont lus par aucune intelligence artificielle.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Centres spécialisés (diabète, drépanocytose, maternité…)
-- ---------------------------------------------------------------------------
create table if not exists public.care_focus (
  code text primary key check (code ~ '^[a-z0-9_]{2,40}$'),
  label text not null,
  hint text,
  sort int not null default 100
);
alter table public.care_focus enable row level security;
drop policy if exists "pp_care_focus_read" on public.care_focus;
create policy "pp_care_focus_read" on public.care_focus for select to anon, authenticated using (true);
revoke insert, update, delete on public.care_focus from anon, authenticated;
grant select on public.care_focus to anon, authenticated;
insert into public.care_focus (code, label, hint, sort) values
  ('diabete', 'Diabète', 'Suivi du diabète, glycémie, pied diabétique', 10),
  ('drepanocytose', 'Drépanocytose', 'Suivi des enfants et adultes drépanocytaires', 20),
  ('hypertension_coeur', 'Cœur et hypertension', 'Cardiologie, tension artérielle', 30),
  ('cancer', 'Cancers', 'Oncologie, dépistage, traitements', 40),
  ('sante_mentale', 'Santé mentale', 'Psychiatrie, psychologie, addictions', 50),
  ('maternite', 'Maternité et accouchement', 'Consultations prénatales, accouchement', 60),
  ('pediatrie', 'Enfants', 'Pédiatrie, néonatologie, nutrition', 70),
  ('vih', 'VIH', 'Dépistage, traitement et suivi', 80),
  ('tuberculose', 'Tuberculose', 'Dépistage et traitement', 90),
  ('rein_dialyse', 'Reins et dialyse', 'Néphrologie, dialyse', 100),
  ('yeux', 'Yeux', 'Ophtalmologie', 110),
  ('dents', 'Dents', 'Soins dentaires', 120),
  ('orl', 'Oreilles, nez, gorge', 'ORL', 130),
  ('handicap_reeducation', 'Rééducation et handicap', 'Kinésithérapie, appareillage', 140),
  ('urgences_24h', 'Urgences 24 h/24', 'Accueil des urgences jour et nuit', 150),
  ('vaccination', 'Vaccination', 'Centres de vaccination', 160)
on conflict (code) do nothing;

create table if not exists public.facility_focus (
  id uuid primary key default gen_random_uuid(),
  focus_code text not null references public.care_focus(code) on delete cascade,
  clinic_id uuid references public.clinics(id) on delete cascade,
  facility_id uuid references public.facility_listings(id) on delete cascade,
  source text not null check (char_length(btrim(source)) between 3 and 200),
  verified_at date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(clinic_id, facility_id) = 1)
);
create unique index if not exists facility_focus_unique on public.facility_focus (focus_code, coalesce(clinic_id, facility_id));
alter table public.facility_focus enable row level security;
drop policy if exists "pp_facility_focus_read" on public.facility_focus;
create policy "pp_facility_focus_read" on public.facility_focus for select to anon, authenticated using (true);
drop policy if exists "pp_facility_focus_admin" on public.facility_focus;
create policy "pp_facility_focus_admin" on public.facility_focus for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.facility_focus from anon;
grant select on public.facility_focus to anon;
grant select, insert, update, delete on public.facility_focus to authenticated;

create or replace function public.specialized_centres(p_focus text, p_region uuid default null, p_limit int default 100)
returns table (kind text, id uuid, name text, category text, city text, address text, phone text, latitude double precision, longitude double precision,
               source text, verified_at date, link text)
language sql stable security definer set search_path = public as $$
  select 'clinique', c.id, c.name, c.kind, coalesce(co.name, r.name), c.address, c.phone, c.latitude, c.longitude, ff.source, ff.verified_at, '/cliniques/' || c.id
    from public.facility_focus ff join public.clinics c on c.id = ff.clinic_id and c.status = 'verified' and not c.is_demo
    left join public.communes co on co.id = c.commune_id left join public.regions r on r.id = c.region_id
   where ff.focus_code = p_focus and (p_region is null or c.region_id = p_region)
  union all
  select case when f.kind = 'laboratoire' then 'laboratoire' else 'etablissement' end, f.id, f.name, f.kind, coalesce(f.city_label, r.name), f.address, f.phone,
         f.latitude, f.longitude, ff.source, ff.verified_at, case when f.kind = 'laboratoire' then '/laboratoires/fiche/' || f.id else null end
    from public.facility_focus ff join public.facility_listings f on f.id = ff.facility_id and f.is_published
    left join public.regions r on r.id = f.region_id
   where ff.focus_code = p_focus and (p_region is null or f.region_id = p_region)
  order by 3 limit greatest(1, least(p_limit, 300));
$$;
grant execute on function public.specialized_centres(text, uuid, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Statistiques de consultation des fiches (aucune donnée personnelle)
-- ---------------------------------------------------------------------------
create table if not exists public.listing_daily_stats (
  entity_kind text not null check (entity_kind in ('pharmacie', 'medecin', 'clinique', 'laboratoire', 'etablissement')),
  entity_id uuid not null,
  day date not null default current_date,
  views int not null default 0,
  calls int not null default 0,
  directions int not null default 0,
  requests int not null default 0,
  primary key (entity_kind, entity_id, day)
);
alter table public.listing_daily_stats enable row level security;
revoke all on public.listing_daily_stats from anon, authenticated;

create or replace function public.track_listing_event(p_kind text, p_id uuid, p_event text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_kind not in ('pharmacie', 'medecin', 'clinique', 'laboratoire', 'etablissement') or p_event not in ('view', 'call', 'directions', 'request') then return; end if;
  insert into public.listing_daily_stats (entity_kind, entity_id, day, views, calls, directions, requests)
  values (p_kind, p_id, current_date, (p_event = 'view')::int, (p_event = 'call')::int, (p_event = 'directions')::int, (p_event = 'request')::int)
  on conflict (entity_kind, entity_id, day) do update set
    views = listing_daily_stats.views + excluded.views, calls = listing_daily_stats.calls + excluded.calls,
    directions = listing_daily_stats.directions + excluded.directions, requests = listing_daily_stats.requests + excluded.requests;
end $$;
revoke execute on function public.track_listing_event(text, uuid, text) from public;
grant execute on function public.track_listing_event(text, uuid, text) to anon, authenticated;

create or replace function public.can_see_listing_stats(p_kind text, p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or case p_kind
    when 'pharmacie' then public.is_pharmacy_member(p_id)
    when 'medecin' then exists (select 1 from public.doctors d where d.id = p_id and d.user_id = auth.uid())
    when 'clinique' then public.is_clinic_member(p_id)
    else public.is_facility_member(p_id) end;
$$;

create or replace function public.my_listing_stats(p_kind text, p_id uuid, p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d int := greatest(7, least(coalesce(p_days, 30), 365));
begin
  perform public.require_auth();
  if not public.can_see_listing_stats(p_kind, p_id) then raise exception 'PP403: statistiques réservées à l''établissement' using errcode = '42501'; end if;
  return jsonb_build_object(
    'days', d,
    'total', (select jsonb_build_object('views', coalesce(sum(views), 0), 'calls', coalesce(sum(calls), 0), 'directions', coalesce(sum(directions), 0), 'requests', coalesce(sum(requests), 0))
                from public.listing_daily_stats where entity_kind = p_kind and entity_id = p_id and day > current_date - d),
    'previous', (select jsonb_build_object('views', coalesce(sum(views), 0), 'calls', coalesce(sum(calls), 0))
                from public.listing_daily_stats where entity_kind = p_kind and entity_id = p_id and day <= current_date - d and day > current_date - 2 * d),
    'weeks', coalesce((select jsonb_agg(jsonb_build_object('week', w, 'views', v, 'calls', c) order by w) from (
                select date_trunc('week', day)::date w, sum(views) v, sum(calls) c from public.listing_daily_stats
                 where entity_kind = p_kind and entity_id = p_id and day > current_date - d group by 1) x), '[]'::jsonb));
end $$;
revoke execute on function public.my_listing_stats(text, uuid, int) from public, anon;
grant execute on function public.my_listing_stats(text, uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Lexique des analyses (textes publiés seulement après validation)
-- ---------------------------------------------------------------------------
alter table public.medical_exams add column if not exists lay_text text check (char_length(coalesce(lay_text, '')) <= 900);
alter table public.medical_exams add column if not exists lay_status text not null default 'brouillon' check (lay_status in ('brouillon', 'valide'));
alter table public.medical_exams add column if not exists lay_validated_by text check (char_length(coalesce(lay_validated_by, '')) <= 160);
alter table public.medical_exams add column if not exists lay_validated_at date;

create or replace function public.admin_save_lexicon(p_exam uuid, p_text text, p_validated_by text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if char_length(btrim(coalesce(p_text, ''))) < 20 then raise exception 'PP422: texte trop court'; end if;
  update public.medical_exams set lay_text = btrim(p_text),
    lay_status = case when nullif(btrim(coalesce(p_validated_by, '')), '') is null then 'brouillon' else 'valide' end,
    lay_validated_by = nullif(btrim(coalesce(p_validated_by, '')), ''),
    lay_validated_at = case when nullif(btrim(coalesce(p_validated_by, '')), '') is null then null else current_date end
  where id = p_exam;
  perform public.log_audit('lexicon_save', 'medical_exam', p_exam::text, jsonb_build_object('validated', p_validated_by is not null));
end $$;
revoke execute on function public.admin_save_lexicon(uuid, text, text) from public, anon;
grant execute on function public.admin_save_lexicon(uuid, text, text) to authenticated;

-- Brouillons rédigés par l'équipe : à relire et valider par un biologiste avant publication.
update public.medical_exams m set lay_text = x.t
  from (values
  ('nfs', 'Compte les globules rouges, les globules blancs et les plaquettes du sang. Le médecin la demande souvent en cas de fatigue, de fièvre, de pâleur ou pour un bilan général. Prise de sang au bras.'),
  ('glycemie', 'Mesure le sucre (glucose) dans le sang, le matin avant de manger. Sert à rechercher ou suivre un diabète. Il faut être à jeun : demandez au laboratoire combien d''heures avant.'),
  ('glycemie_pp', 'Mesure le sucre dans le sang environ deux heures après un repas. Complète la glycémie à jeun pour le suivi du diabète. Le laboratoire vous indique l''heure exacte du prélèvement.'),
  ('hba1c', 'Reflète la moyenne du sucre dans le sang sur les deux à trois derniers mois. Utilisée pour suivre un diabète. Il n''est en général pas nécessaire d''être à jeun.'),
  ('hgpo', 'Mesure la façon dont le corps gère le sucre : on boit une boisson sucrée puis on fait plusieurs prises de sang. Utilisée notamment pendant la grossesse. L''examen dure environ deux heures.'),
  ('groupe_sanguin', 'Détermine votre groupe sanguin (A, B, AB ou O) et le rhésus (positif ou négatif). Indispensable avant une transfusion, une opération ou pendant la grossesse. Un résultat à garder toute la vie.'),
  ('paludisme', 'Recherche le parasite du paludisme dans le sang, par une goutte de sang au doigt (test rapide) ou au bras (goutte épaisse). À faire dès qu''il y a de la fièvre, surtout chez l''enfant.'),
  ('crp', 'Mesure une protéine qui augmente lors d''une inflammation ou d''une infection. Aide le médecin à suivre une maladie ou l''effet d''un traitement. Prise de sang au bras.'),
  ('vs', 'Mesure la vitesse à laquelle les globules rouges tombent au fond d''un tube. Elle peut augmenter lors d''inflammations. Le médecin l''interprète avec les autres examens.'),
  ('creatinine', 'Mesure une substance éliminée par les reins. Sert à vérifier que les reins fonctionnent bien, par exemple en cas de diabète, d''hypertension ou avant certains médicaments.'),
  ('uree', 'Mesure un déchet éliminé par les reins. Souvent demandée avec la créatinine pour évaluer le fonctionnement des reins.'),
  ('ionogramme', 'Mesure le sodium, le potassium et d''autres sels minéraux du sang. Utile en cas de diarrhée, de vomissements, de déshydratation ou de traitement par certains médicaments.'),
  ('transaminases', 'Mesure deux enzymes (ASAT et ALAT) qui renseignent sur l''état du foie. Demandées en cas de suspicion d''hépatite ou pour surveiller certains traitements.'),
  ('gamma_gt', 'Mesure une enzyme du foie et des voies biliaires. Le médecin l''interprète avec les autres analyses du foie.'),
  ('bilirubine', 'Mesure un pigment jaune issu de la destruction des globules rouges. Aide à comprendre une jaunisse (yeux ou peau jaunes), chez l''adulte comme chez le nouveau-né.'),
  ('bilan_lipidique', 'Mesure le cholestérol et les triglycérides (graisses du sang). Sert à évaluer le risque pour le cœur et les vaisseaux. Il faut souvent être à jeun : demandez au laboratoire.'),
  ('acide_urique', 'Mesure l''acide urique dans le sang. Le médecin le demande notamment en cas de douleurs articulaires évoquant la goutte.'),
  ('aghbs', 'Recherche le virus de l''hépatite B dans le sang. Recommandé pendant la grossesse et lors d''un dépistage. Un résultat positif doit être expliqué par un médecin, qui propose le suivi adapté.'),
  ('charge_virale_vhb', 'Mesure la quantité de virus de l''hépatite B dans le sang. Sert au suivi des personnes porteuses du virus et à décider d''un traitement.'),
  ('hepatite_c', 'Recherche une infection par le virus de l''hépatite C. Le résultat est expliqué par le médecin, qui demande d''autres examens si besoin.'),
  ('vih', 'Recherche une infection par le VIH. Le dépistage est confidentiel. Un résultat positif est toujours confirmé par un second test et expliqué par un professionnel ; des traitements efficaces existent.'),
  ('charge_virale_vih', 'Mesure la quantité de VIH dans le sang des personnes suivies. Elle montre si le traitement est efficace.'),
  ('cd4', 'Compte certaines cellules de défense du corps (lymphocytes CD4). Utilisé dans le suivi des personnes vivant avec le VIH.'),
  ('syphilis', 'Recherche une infection par la syphilis, une infection sexuellement transmissible qui se soigne. Recommandé pendant la grossesse.'),
  ('widal', 'Recherche des anticorps liés à la fièvre typhoïde. Son interprétation est délicate : seul le médecin peut conclure, souvent avec d''autres examens comme l''hémoculture.'),
  ('hemoculture', 'Recherche des microbes dans le sang en le mettant en culture. Demandée en cas de fièvre importante. Le résultat peut prendre plusieurs jours.'),
  ('ecbu', 'Analyse les urines pour rechercher une infection urinaire et le microbe en cause. Il faut recueillir les urines proprement, de préférence le matin : le laboratoire explique comment.'),
  ('bandelette_urinaire', 'Test rapide des urines avec une bandelette qui change de couleur. Il oriente vers une infection, du sucre ou du sang dans les urines.'),
  ('selles', 'Recherche des parasites dans les selles (vers, amibes…). Le laboratoire indique comment recueillir l''échantillon.'),
  ('coproculture', 'Recherche des microbes dans les selles, par exemple en cas de diarrhée qui dure.'),
  ('tsh', 'Mesure une hormone qui commande la glande thyroïde. Premier examen pour vérifier le fonctionnement de la thyroïde.'),
  ('t3_t4', 'Mesure les hormones fabriquées par la thyroïde. Souvent demandées en complément de la TSH.'),
  ('bhcg', 'Recherche dans le sang l''hormone de la grossesse. Permet de confirmer une grossesse débutante.'),
  ('electrophorese_hb', 'Analyse les différents types d''hémoglobine du sang. C''est l''examen qui permet de savoir si l''on est porteur de la drépanocytose (AS) ou malade (SS). Recommandé avant le mariage.'),
  ('test_emmel', 'Test de dépistage simple de la drépanocytose. Un résultat positif doit être confirmé par l''électrophorèse de l''hémoglobine.'),
  ('tp_inr', 'Mesure la capacité du sang à coaguler. Sert à surveiller certains traitements anticoagulants ou avant une opération.'),
  ('fer_ferritine', 'Mesure le fer et les réserves de fer du corps. Utile en cas d''anémie ou de fatigue, notamment pendant la grossesse.'),
  ('psa', 'Mesure une protéine fabriquée par la prostate. Le médecin l''utilise pour surveiller la prostate chez l''homme ; un résultat élevé n''est pas forcément un cancer et doit être discuté avec lui.'),
  ('frottis', 'Prélèvement de cellules du col de l''utérus, fait par un professionnel. Sert à dépister tôt les lésions qui peuvent mener au cancer du col.'),
  ('bk_crachat', 'Recherche le microbe de la tuberculose dans les crachats. Le laboratoire explique comment recueillir les crachats, souvent le matin.'),
  ('microalbuminurie', 'Recherche de petites quantités de protéines dans les urines. Permet de surveiller les reins chez les personnes diabétiques ou hypertendues.'),
  ('calcemie', 'Mesure le calcium dans le sang, important pour les os, les muscles et le cœur.'),
  ('vitamine_d', 'Mesure la vitamine D dans le sang, utile pour les os.'),
  ('spermogramme', 'Analyse le sperme (nombre et mobilité des spermatozoïdes). Demandé dans le bilan d''un couple qui n''arrive pas à avoir d''enfant. Le laboratoire donne les consignes à respecter.')
  ) as x(code, t)
 where m.code = x.code and m.lay_text is null;

-- ---------------------------------------------------------------------------
-- 4. SantéProxi Data : évolution du référentiel, carte, communiqués, validation
-- ---------------------------------------------------------------------------
create or replace function public.authority_registry_trend(p_region uuid default null, p_months int default 12)
returns table (month date, pharmacies_verified bigint, pharmacies_listed bigint, facilities bigint, labs bigint, doctors bigint, exams_with_price bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.authority_require('stats:registry_trend', jsonb_build_object('region', p_region));
  return query
  select m::date,
    (select count(*) from public.pharmacies p where p.status = 'verified' and not p.is_demo and coalesce(p.verified_at, p.created_at) < m + interval '1 month' and (p_region is null or p.region_id = p_region)),
    (select count(*) from public.pharmacy_listings l where l.is_published and l.created_at < m + interval '1 month' and (p_region is null or l.region_id = p_region)),
    (select count(*) from public.facility_listings f where f.is_published and f.kind <> 'laboratoire' and f.created_at < m + interval '1 month' and (p_region is null or f.region_id = p_region)),
    (select count(*) from public.facility_listings f where f.is_published and f.kind = 'laboratoire' and f.created_at < m + interval '1 month' and (p_region is null or f.region_id = p_region)),
    (select count(*) from public.doctors d where d.status = 'verified' and not d.is_demo and coalesce(d.verified_at, d.created_at) < m + interval '1 month'),
    (select count(*) from public.facility_exams fe join public.facility_listings f on f.id = fe.facility_id
      where fe.price_xof is not null and fe.updated_at < m + interval '1 month' and (p_region is null or f.region_id = p_region))
  from generate_series(date_trunc('month', current_date) - make_interval(months => greatest(1, least(p_months, 36)) - 1), date_trunc('month', current_date), interval '1 month') m;
end $$;

create or replace function public.authority_map_points(p_region uuid default null)
returns table (kind text, name text, latitude double precision, longitude double precision)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.authority_require('stats:map', jsonb_build_object('region', p_region));
  return query
  select 'pharmacie'::text, p.name, p.latitude, p.longitude from public.pharmacies p
   where p.status = 'verified' and not p.is_demo and p.latitude is not null and (p_region is null or p.region_id = p_region)
  union all
  select 'officine', l.name, l.latitude, l.longitude from public.pharmacy_listings l
   where l.is_published and l.claimed_pharmacy_id is null and l.latitude is not null and (p_region is null or l.region_id = p_region)
  union all
  select case when f.kind = 'laboratoire' then 'laboratoire' else 'etablissement' end, f.name, f.latitude, f.longitude from public.facility_listings f
   where f.is_published and f.latitude is not null and (p_region is null or f.region_id = p_region)
  union all
  select 'clinique', c.name, c.latitude, c.longitude from public.clinics c
   where c.status = 'verified' and not c.is_demo and c.latitude is not null and (p_region is null or c.region_id = p_region)
  limit 20000;
end $$;

-- Communiqués officiels publiés par les institutions sous convention
alter table public.authority_members add column if not exists can_publish boolean not null default false;

create table if not exists public.official_communiques (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles(id) on delete set null,
  organisation text not null check (char_length(btrim(organisation)) between 2 and 120),
  title text not null check (char_length(btrim(title)) between 5 and 160),
  body text not null check (char_length(btrim(body)) between 20 and 4000),
  link text check (link is null or link ~ '^https?://'),
  region_id uuid references public.regions(id) on delete set null,
  status text not null default 'publie' check (status in ('publie', 'retire')),
  published_at timestamptz not null default now()
);
create index if not exists official_communiques_pub on public.official_communiques (status, published_at desc);
alter table public.official_communiques enable row level security;
drop policy if exists "pp_communiques_read" on public.official_communiques;
create policy "pp_communiques_read" on public.official_communiques for select to anon, authenticated using (status = 'publie' or public.is_admin() or author_id = auth.uid());
revoke insert, update, delete on public.official_communiques from anon, authenticated;
grant select on public.official_communiques to anon, authenticated;

create or replace function public.authority_publish(p_title text, p_body text, p_link text default null, p_region uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); org text; v_id uuid;
begin
  select organisation into org from public.authority_members where user_id = uid and active and can_publish;
  if org is null and not public.is_admin() then raise exception 'PP403: publication réservée aux institutions sous convention' using errcode = '42501'; end if;
  insert into public.official_communiques (author_id, organisation, title, body, link, region_id)
  values (uid, coalesce(org, 'SantéProxi'), btrim(p_title), btrim(p_body), nullif(btrim(coalesce(p_link, '')), ''), p_region)
  returning id into v_id;
  perform public.log_audit('communique_publish', 'official_communique', v_id::text, '{}'::jsonb);
  return v_id;
exception when check_violation then raise exception 'PP422: vérifiez le titre (5 caractères minimum), le texte (20 minimum) et le lien (https://…)';
end $$;

create or replace function public.withdraw_communique(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.official_communiques set status = 'retire' where id = p_id and (author_id = auth.uid() or public.is_admin());
  if not found then raise exception 'PP403: communiqué introuvable'; end if;
end $$;

create or replace function public.admin_set_can_publish(p_user uuid, p_value boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.authority_members set can_publish = coalesce(p_value, false) where user_id = p_user;
  perform public.log_audit('authority_can_publish', 'profile', p_user::text, jsonb_build_object('value', p_value));
end $$;

-- Validation des données du référentiel par les institutions
create table if not exists public.data_validation_reports (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles(id) on delete set null,
  organisation text,
  public_code text not null check (public_code ~ '^SP-(PH|MD|LB|ET)-[0-9]{6}$'),
  verdict text not null check (verdict in ('confirme', 'a_corriger', 'ferme', 'inconnu')),
  comment text check (char_length(coalesce(comment, '')) <= 1000),
  status text not null default 'nouveau' check (status in ('nouveau', 'traite')),
  created_at timestamptz not null default now()
);
alter table public.data_validation_reports enable row level security;
drop policy if exists "pp_data_validation_read" on public.data_validation_reports;
create policy "pp_data_validation_read" on public.data_validation_reports for select to authenticated using (public.is_admin() or author_id = auth.uid());
revoke all on public.data_validation_reports from anon, authenticated;
grant select on public.data_validation_reports to authenticated;

create or replace function public.authority_validate_data(p_code text, p_verdict text, p_comment text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.authority_require('data:validate', jsonb_build_object('code', p_code)); org text; v_id uuid; c text := upper(btrim(p_code));
begin
  select organisation into org from public.authority_members where user_id = uid;
  if not exists (select 1 from public.pharmacies where public_code = c union all select 1 from public.doctors where public_code = c
                 union all select 1 from public.clinics where public_code = c union all select 1 from public.facility_listings where public_code = c) then
    raise exception 'PP404: aucun établissement avec cet identifiant';
  end if;
  insert into public.data_validation_reports (author_id, organisation, public_code, verdict, comment)
  values (uid, org, c, p_verdict, nullif(btrim(coalesce(p_comment, '')), '')) returning id into v_id;
  return v_id;
exception when check_violation then raise exception 'PP422: identifiant ou avis invalide';
end $$;

create or replace function public.admin_close_data_report(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.data_validation_reports set status = 'traite' where id = p_id;
end $$;

revoke execute on function public.authority_registry_trend(uuid, int), public.authority_map_points(uuid), public.authority_publish(text, text, text, uuid),
  public.withdraw_communique(uuid), public.admin_set_can_publish(uuid, boolean), public.authority_validate_data(text, text, text), public.admin_close_data_report(uuid) from public, anon;
grant execute on function public.authority_registry_trend(uuid, int), public.authority_map_points(uuid), public.authority_publish(text, text, text, uuid),
  public.withdraw_communique(uuid), public.admin_set_can_publish(uuid, boolean), public.authority_validate_data(text, text, text), public.admin_close_data_report(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Laboratoires : rendez-vous au laboratoire et consentement aux résultats
-- ---------------------------------------------------------------------------
alter table public.lab_home_service add column if not exists appointments_enabled boolean not null default false;
alter table public.lab_home_service add column if not exists appointment_hours text check (char_length(coalesce(appointment_hours, '')) <= 200);
alter table public.lab_home_service add column if not exists results_enabled boolean not null default false;
-- un laboratoire peut proposer les rendez-vous sans le domicile : la ligne existe dès que l'un des deux est réglé
alter table public.home_sampling_requests add column if not exists mode text not null default 'domicile';
alter table public.home_sampling_requests drop constraint if exists home_sampling_requests_mode_check;
alter table public.home_sampling_requests add constraint home_sampling_requests_mode_check check (mode in ('domicile', 'laboratoire'));
alter table public.home_sampling_requests add column if not exists results_consent boolean not null default false;
alter table public.home_sampling_requests alter column address drop not null;
alter table public.home_sampling_requests drop constraint if exists home_sampling_address_needed;
alter table public.home_sampling_requests add constraint home_sampling_address_needed check (mode = 'laboratoire' or address is not null);

create or replace function public.lab_save_options(p_facility uuid, p_appointments boolean, p_hours text, p_results boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_facility_member(p_facility) then raise exception 'PP403: réservé aux membres de ce laboratoire' using errcode = '42501'; end if;
  insert into public.lab_home_service (facility_id, enabled, appointments_enabled, appointment_hours, results_enabled)
  values (p_facility, false, coalesce(p_appointments, false), nullif(btrim(coalesce(p_hours, '')), ''), coalesce(p_results, false))
  on conflict (facility_id) do update set appointments_enabled = excluded.appointments_enabled,
    appointment_hours = excluded.appointment_hours, results_enabled = excluded.results_enabled, updated_at = now();
end $$;
revoke execute on function public.lab_save_options(uuid, boolean, text, boolean) from public, anon;
grant execute on function public.lab_save_options(uuid, boolean, text, boolean) to authenticated;

create or replace function public.request_home_sampling(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); fac uuid := (p ->> 'facility_id')::uuid; v_id uuid; ex uuid[];
        md text := coalesce(nullif(p ->> 'mode', ''), 'domicile');
begin
  if md = 'laboratoire' then
    if not exists (select 1 from public.lab_home_service s join public.facility_listings f on f.id = s.facility_id and f.is_published where s.facility_id = fac and s.appointments_enabled) then
      raise exception 'PP409: ce laboratoire ne prend pas encore de rendez-vous sur SantéProxi';
    end if;
  elsif not exists (select 1 from public.lab_home_service s join public.facility_listings f on f.id = s.facility_id and f.is_published where s.facility_id = fac and s.enabled) then
    raise exception 'PP409: ce laboratoire ne propose pas de prélèvement à domicile';
  end if;
  if (select count(*) from public.home_sampling_requests where user_id = uid and created_at > now() - interval '1 day') >= 3 then
    raise exception 'PP429: 3 demandes par jour au maximum';
  end if;
  ex := coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p -> 'exam_ids', '[]'::jsonb)) x), '{}');
  if exists (select 1 from unnest(ex) e where not exists (select 1 from public.medical_exams m where m.id = e)) then raise exception 'PP422: analyse inconnue'; end if;
  insert into public.home_sampling_requests (user_id, facility_id, mode, exam_ids, other_exams, patient_name, patient_age, for_relative, address, region_id, phone,
    preferred_date, slot, has_prescription, fasting_known, notes, results_consent)
  values (uid, fac, md, ex, nullif(btrim(p ->> 'other_exams'), ''), btrim(p ->> 'patient_name'), nullif(p ->> 'patient_age', '')::int,
    coalesce((p ->> 'for_relative')::boolean, false), case when md = 'laboratoire' then null else btrim(p ->> 'address') end,
    nullif(p ->> 'region_id', '')::uuid, btrim(p ->> 'phone'),
    (p ->> 'preferred_date')::date, coalesce(nullif(p ->> 'slot', ''), 'matin'), coalesce((p ->> 'has_prescription')::boolean, false),
    coalesce((p ->> 'fasting_known')::boolean, false), nullif(btrim(p ->> 'notes'), ''), coalesce((p ->> 'results_consent')::boolean, false))
  returning id into v_id;
  insert into public.notifications (user_id, kind, title, body, link)
  select m.user_id, 'laboratoire',
         case when md = 'laboratoire' then 'Nouvelle demande de rendez-vous au laboratoire' else 'Nouvelle demande de prélèvement à domicile' end,
         'Une demande attend votre réponse.', '/laboratoire/prelevements'
    from public.facility_members m where m.facility_id = fac;
  perform public.track_listing_event('laboratoire', fac, 'request');
  return v_id;
exception
  when check_violation then raise exception 'PP422: vérifiez le nom, l''adresse, le téléphone, la date et les analyses';
  when invalid_text_representation or invalid_datetime_format then raise exception 'PP422: informations invalides';
end $$;

create or replace function public.lab_update_sampling(p_id uuid, p_status text, p_scheduled timestamptz default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.home_sampling_requests; lbl text; what text;
begin
  select * into r from public.home_sampling_requests where id = p_id for update;
  if not found or not public.is_facility_member(r.facility_id) then raise exception 'PP403: demande introuvable' using errcode = '42501'; end if;
  if p_status not in ('acceptee', 'planifiee', 'prelevee', 'terminee', 'refusee') then raise exception 'PP422: statut invalide'; end if;
  if r.status in ('annulee', 'terminee', 'refusee') then raise exception 'PP409: cette demande est close'; end if;
  update public.home_sampling_requests set status = p_status, scheduled_at = coalesce(p_scheduled, scheduled_at),
    lab_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), lab_note), updated_at = now() where id = p_id;
  what := case when r.mode = 'laboratoire' then 'rendez-vous au laboratoire' else 'prélèvement à domicile' end;
  lbl := case p_status when 'acceptee' then 'Votre demande de ' || what || ' est acceptée'
    when 'planifiee' then 'Votre ' || what || ' est planifié' when 'prelevee' then 'Prélèvement effectué'
    when 'terminee' then 'Votre demande de ' || what || ' est terminée' else 'Votre demande de ' || what || ' n''a pas pu être acceptée' end;
  perform public.notify_user(r.user_id, 'laboratoire', lbl,
    case when p_status = 'planifiee' and coalesce(p_scheduled, r.scheduled_at) is not null
      then 'Rendez-vous le ' || to_char(coalesce(p_scheduled, r.scheduled_at) at time zone 'utc', 'DD/MM/YYYY à HH24"h"MI') || '.' else 'Ouvrez SantéProxi pour voir le détail.' end,
    null, '/compte/prelevements');
end $$;

-- ---------------------------------------------------------------------------
-- 6. Résultats d'analyses envoyés par le laboratoire (fichier chiffré)
-- ---------------------------------------------------------------------------
create table if not exists public.lab_results (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.home_sampling_requests(id) on delete cascade,
  facility_id uuid not null references public.facility_listings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  file_name text check (char_length(coalesce(file_name, '')) <= 160),
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes int not null check (size_bytes between 1 and 10485760),
  note text check (char_length(coalesce(note, '')) <= 500),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  first_opened_at timestamptz
);
create index if not exists lab_results_user on public.lab_results (user_id, created_at desc);
alter table public.lab_results enable row level security;
drop policy if exists "pp_lab_results_read" on public.lab_results;
create policy "pp_lab_results_read" on public.lab_results for select to authenticated using (user_id = auth.uid() or public.is_facility_member(facility_id));
revoke all on public.lab_results from anon, authenticated;
grant select on public.lab_results to authenticated;

create or replace function public.lab_can_upload_result(p_request uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.home_sampling_requests r join public.lab_home_service s on s.facility_id = r.facility_id and s.results_enabled
                  where r.id = p_request and r.results_consent and r.status in ('prelevee', 'terminee', 'planifiee', 'acceptee')
                    and public.is_facility_member(r.facility_id));
$$;

create or replace function public.lab_add_result(p_request uuid, p_path text, p_name text, p_mime text, p_size int, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.home_sampling_requests; v_id uuid;
begin
  select * into r from public.home_sampling_requests where id = p_request;
  if not found or not public.lab_can_upload_result(p_request) then
    raise exception 'PP403: envoi impossible : le patient doit avoir accepté de recevoir ses résultats sur SantéProxi' using errcode = '42501';
  end if;
  if p_path !~ ('^' || r.facility_id::text || '/' || r.id::text || '/[0-9a-f-]{36}\.bin$') then raise exception 'PP422: fichier invalide'; end if;
  insert into public.lab_results (request_id, facility_id, user_id, storage_path, file_name, mime, size_bytes, note, created_by)
  values (r.id, r.facility_id, r.user_id, p_path, left(p_name, 160), p_mime, p_size, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;
  perform public.notify_user(r.user_id, 'laboratoire', 'Vos résultats d''analyses sont disponibles',
    'Ouvrez SantéProxi pour les consulter. Faites-les interpréter par votre médecin.', null, '/compte/resultats');
  perform public.log_audit('lab_result_add', 'lab_result', v_id::text, jsonb_build_object('request', r.id));
  return v_id;
end $$;

create or replace function public.mark_result_opened(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.lab_results set first_opened_at = coalesce(first_opened_at, now()) where id = p_id and user_id = auth.uid();
$$;

create or replace function public.delete_lab_result(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare p text;
begin
  delete from public.lab_results where id = p_id and (user_id = auth.uid() or public.is_facility_member(facility_id)) returning storage_path into p;
  if p is null then raise exception 'PP404: résultat introuvable'; end if;
  return p;
end $$;
revoke execute on function public.lab_add_result(uuid, text, text, text, int, text), public.mark_result_opened(uuid), public.delete_lab_result(uuid) from public, anon;
grant execute on function public.lab_add_result(uuid, text, text, text, int, text), public.mark_result_opened(uuid), public.delete_lab_result(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lab-results', 'lab-results', false, 11534336, array['application/octet-stream'])
on conflict (id) do nothing;
drop policy if exists "pp_lab_results_insert" on storage.objects;
create policy "pp_lab_results_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'lab-results' and public.lab_can_upload_result(((storage.foldername(name))[2])::uuid)
              and exists (select 1 from public.home_sampling_requests r where r.id = ((storage.foldername(name))[2])::uuid and r.facility_id::text = (storage.foldername(name))[1]));
drop policy if exists "pp_lab_results_select" on storage.objects;
create policy "pp_lab_results_select" on storage.objects for select to authenticated
  using (bucket_id = 'lab-results' and exists (select 1 from public.lab_results x where x.storage_path = name and (x.user_id = auth.uid() or public.is_facility_member(x.facility_id))));
drop policy if exists "pp_lab_results_delete" on storage.objects;
create policy "pp_lab_results_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'lab-results' and (public.is_facility_member(((storage.foldername(name))[1])::uuid)
         or exists (select 1 from public.home_sampling_requests r where r.id = ((storage.foldername(name))[2])::uuid and r.user_id = auth.uid())));

-- ---------------------------------------------------------------------------
-- 7. Documents personnels du dossier santé (fichiers chiffrés, visibles par le seul titulaire)
-- ---------------------------------------------------------------------------
create table if not exists public.record_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  person_id uuid not null references public.record_persons(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  doc_kind text not null default 'autre' check (doc_kind in ('ordonnance', 'resultat', 'compte_rendu', 'certificat', 'vaccination', 'autre')),
  doc_date date,
  storage_path text not null unique,
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes int not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now()
);
create index if not exists record_documents_person on public.record_documents (person_id, created_at desc);
alter table public.record_documents enable row level security;
drop policy if exists "pp_record_documents_owner" on public.record_documents;
create policy "pp_record_documents_owner" on public.record_documents for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.record_persons p where p.id = person_id and p.owner_id = auth.uid())
              and storage_path like auth.uid()::text || '/%');
revoke all on public.record_documents from anon;
grant select, insert, delete on public.record_documents to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('personal-documents', 'personal-documents', false, 11534336, array['application/octet-stream'])
on conflict (id) do nothing;
drop policy if exists "pp_personal_docs_insert" on storage.objects;
create policy "pp_personal_docs_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'personal-documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "pp_personal_docs_select" on storage.objects;
create policy "pp_personal_docs_select" on storage.objects for select to authenticated
  using (bucket_id = 'personal-documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "pp_personal_docs_delete" on storage.objects;
create policy "pp_personal_docs_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'personal-documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 8. Scanner de médicaments : propositions de codes-barres (validées par l'équipe)
-- ---------------------------------------------------------------------------
create table if not exists public.gtin_suggestions (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[0-9]{8,14}$'),
  catalog_id uuid not null references public.medicine_catalog(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  status text not null default 'nouvelle' check (status in ('nouvelle', 'acceptee', 'refusee')),
  created_at timestamptz not null default now(),
  unique (code, catalog_id)
);
alter table public.gtin_suggestions enable row level security;
drop policy if exists "pp_gtin_suggestions_admin" on public.gtin_suggestions;
create policy "pp_gtin_suggestions_admin" on public.gtin_suggestions for select to authenticated using (public.is_admin() or user_id = auth.uid());
revoke all on public.gtin_suggestions from anon, authenticated;
grant select on public.gtin_suggestions to authenticated;

create or replace function public.suggest_gtin(p_code text, p_catalog uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth();
begin
  if (select count(*) from public.gtin_suggestions where user_id = uid and created_at > now() - interval '1 day') >= 10 then raise exception 'PP429: trop de propositions aujourd''hui'; end if;
  if exists (select 1 from public.medicine_identifiers where id_type = 'gtin' and value = btrim(p_code)) then raise exception 'PP409: ce code est déjà connu'; end if;
  insert into public.gtin_suggestions (code, catalog_id, user_id) values (btrim(p_code), p_catalog, uid) on conflict do nothing;
exception when check_violation then raise exception 'PP422: code-barres invalide (8 à 14 chiffres)';
end $$;

create or replace function public.admin_review_gtin(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare s public.gtin_suggestions;
begin
  perform public.require_admin();
  select * into s from public.gtin_suggestions where id = p_id for update;
  if not found then raise exception 'PP404: proposition introuvable'; end if;
  if p_accept then
    insert into public.medicine_identifiers (catalog_id, id_type, value) values (s.catalog_id, 'gtin', s.code) on conflict (id_type, value) do nothing;
  end if;
  update public.gtin_suggestions set status = case when p_accept then 'acceptee' else 'refusee' end where id = p_id;
end $$;
revoke execute on function public.suggest_gtin(text, uuid), public.admin_review_gtin(uuid, boolean) from public, anon;
grant execute on function public.suggest_gtin(text, uuid), public.admin_review_gtin(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Santé mentale : lignes d'écoute et d'aide (saisies et vérifiées par l'équipe)
-- ---------------------------------------------------------------------------
create table if not exists public.support_lines (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  phone text not null check (char_length(btrim(phone)) between 3 and 30),
  hours text check (char_length(coalesce(hours, '')) <= 120),
  description text check (char_length(coalesce(description, '')) <= 400),
  topic text not null default 'sante_mentale' check (topic in ('sante_mentale', 'violences', 'addictions', 'jeunes', 'autre')),
  source text not null check (char_length(btrim(source)) between 3 and 200),
  verified_at date not null default current_date,
  active boolean not null default true,
  sort int not null default 100
);
alter table public.support_lines enable row level security;
drop policy if exists "pp_support_lines_read" on public.support_lines;
create policy "pp_support_lines_read" on public.support_lines for select to anon, authenticated using (active or public.is_admin());
drop policy if exists "pp_support_lines_admin" on public.support_lines;
create policy "pp_support_lines_admin" on public.support_lines for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.support_lines from anon;
grant select on public.support_lines to anon;
grant select, insert, update, delete on public.support_lines to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Langues nationales : traductions de l'interface, publiées après validation
-- ---------------------------------------------------------------------------
create table if not exists public.ui_translations (
  key text not null check (key ~ '^[a-z0-9_.]{2,80}$'),
  lang text not null check (lang in ('bm', 'snk', 'ff', 'son')),
  text text not null check (char_length(btrim(text)) between 1 and 400),
  status text not null default 'propose' check (status in ('propose', 'valide')),
  proposed_by text check (char_length(coalesce(proposed_by, '')) <= 120),
  validated_by text check (char_length(coalesce(validated_by, '')) <= 120),
  updated_at timestamptz not null default now(),
  primary key (key, lang)
);
alter table public.ui_translations enable row level security;
drop policy if exists "pp_translations_read" on public.ui_translations;
create policy "pp_translations_read" on public.ui_translations for select to anon, authenticated using (status = 'valide' or public.is_admin());
drop policy if exists "pp_translations_admin" on public.ui_translations;
create policy "pp_translations_admin" on public.ui_translations for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.ui_translations from anon;
grant select on public.ui_translations to anon;
grant select, insert, update, delete on public.ui_translations to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Effacement avec le compte
-- ---------------------------------------------------------------------------
create or replace function public.purge_v023_on_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.record_documents where user_id = new.id;
    delete from public.lab_results where user_id = new.id;
    update public.gtin_suggestions set user_id = null where user_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists purge_v023_on_delete on public.profiles;
create trigger purge_v023_on_delete after update of deleted_at on public.profiles
  for each row execute function public.purge_v023_on_delete();
