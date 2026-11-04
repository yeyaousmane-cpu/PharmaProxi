-- =============================================================================
-- PharmaProxi 0.20 — Espace Autorités, statistiques anonymes, signalements de
-- médicaments, courbe de croissance, campagnes de don de sang, avis des utilisateurs.
--
-- Règles des statistiques :
--   1. Uniquement des chiffres agrégés ; une case de moins de 10 n'est pas affichée.
--   2. Le dossier santé, le suivi Femme, les traitements, les mesures et la croissance
--      des enfants ne nourrissent JAMAIS les statistiques.
--   3. Accès réservé aux comptes désignés par l'administrateur, chaque consultation est
--      journalisée.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Membres des autorités et journal d'accès
-- ---------------------------------------------------------------------------
create table if not exists public.authority_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  scope text not null check (scope in ('ministere', 'dpm', 'cnts', 'ordre_pharmaciens', 'ordre_medecins', 'canam', 'autre')),
  organisation text not null check (char_length(btrim(organisation)) between 2 and 120),
  title text check (char_length(coalesce(title, '')) <= 120),
  active boolean not null default true,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.authority_members enable row level security;
drop policy if exists "pp_authority_self" on public.authority_members;
create policy "pp_authority_self" on public.authority_members for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke all on public.authority_members from anon;
revoke insert, update, delete on public.authority_members from authenticated;
grant select on public.authority_members to authenticated;

create table if not exists public.authority_access_log (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  scope text,
  action text not null,
  params jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index if not exists authority_access_log_at on public.authority_access_log (at desc);
alter table public.authority_access_log enable row level security;
drop policy if exists "pp_authority_log_admin" on public.authority_access_log;
create policy "pp_authority_log_admin" on public.authority_access_log for select to authenticated using (public.is_admin());
revoke all on public.authority_access_log from anon;
revoke insert, update, delete on public.authority_access_log from authenticated;
grant select on public.authority_access_log to authenticated;

create or replace function public.authority_scope(p_user uuid default auth.uid())
returns text language sql stable security definer set search_path = public as $$
  select scope from public.authority_members where user_id = p_user and active
$$;

create or replace function public.is_authority()
returns boolean language sql stable security definer set search_path = public as $$
  select public.authority_scope(auth.uid()) is not null
$$;

-- Contrôle d'accès + journal. p_scopes null = toutes les autorités. L'administrateur passe toujours.
create or replace function public.authority_require(p_action text, p_params jsonb default '{}'::jsonb, p_scopes text[] default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); sc text := public.authority_scope(uid);
begin
  if not public.is_admin() and (sc is null or (p_scopes is not null and not sc = any(p_scopes))) then
    raise exception 'PP403: réservé aux autorités de santé désignées' using errcode = '42501';
  end if;
  insert into public.authority_access_log (user_id, scope, action, params) values (uid, coalesce(sc, 'admin'), p_action, coalesce(p_params, '{}'::jsonb));
  return uid;
end $$;

create or replace function public.admin_set_authority(p_email text, p_scope text, p_organisation text, p_title text default null, p_active boolean default true)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare uid uuid; me uuid := public.require_admin();
begin
  select u.id into uid from auth.users u join public.profiles p on p.id = u.id and p.deleted_at is null where lower(u.email) = lower(btrim(p_email));
  if uid is null then raise exception 'PP404: aucun compte avec cette adresse e-mail (la personne doit d''abord créer son compte)'; end if;
  insert into public.authority_members (user_id, scope, organisation, title, active, granted_by)
  values (uid, p_scope, btrim(p_organisation), nullif(btrim(coalesce(p_title, '')), ''), coalesce(p_active, true), me)
  on conflict (user_id) do update set scope = excluded.scope, organisation = excluded.organisation, title = excluded.title,
    active = excluded.active, granted_by = me, updated_at = now();
  perform public.log_audit(case when coalesce(p_active, true) then 'authority_grant' else 'authority_revoke' end, 'authority_member', uid::text,
    jsonb_build_object('scope', p_scope, 'organisation', p_organisation));
  return uid;
exception when check_violation then raise exception 'PP422: type d''autorité ou organisation invalide';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Lectures de fiches (compteur anonyme par jour, sans aucune donnée de personne)
-- ---------------------------------------------------------------------------
create table if not exists public.article_daily_views (
  article_id uuid not null references public.health_articles(id) on delete cascade,
  day date not null,
  views int not null default 0,
  primary key (article_id, day)
);
alter table public.article_daily_views enable row level security;
revoke all on public.article_daily_views from anon, authenticated;

create or replace function public.log_article_view(p_slug text)
returns void language sql security definer set search_path = public as $$
  insert into public.article_daily_views (article_id, day, views)
  select id, (now() at time zone 'utc')::date, 1 from public.health_articles where slug = p_slug and status = 'published'
  on conflict (article_id, day) do update set views = public.article_daily_views.views + 1
$$;
revoke execute on function public.log_article_view(text) from public;
grant execute on function public.log_article_view(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Statistiques anonymes (seuil : 10)
-- ---------------------------------------------------------------------------
create or replace function public.stat_k() returns int language sql immutable as $$ select 10 $$;
create or replace function public.stat_mask(n bigint) returns bigint language sql immutable as $$ select case when n >= public.stat_k() then n end $$;

create or replace function public.authority_params(p_region uuid, p_from date, p_to date)
returns jsonb language sql immutable as $$
  select jsonb_build_object('region', p_region, 'from', p_from, 'to', p_to)
$$;

-- Vue d'ensemble
create or replace function public.authority_overview(p_region uuid default null, p_from date default null, p_to date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f timestamptz := coalesce(p_from, current_date - 30)::timestamptz; t timestamptz := (coalesce(p_to, current_date) + 1)::timestamptz;
  s_all bigint; s_none bigint; r jsonb;
begin
  perform public.authority_require('stats:overview', public.authority_params(p_region, p_from, p_to));
  select count(*), count(*) filter (where result_count = 0) into s_all, s_none
    from public.search_logs where kind = 'medicine' and created_at >= f and created_at < t and (p_region is null or region_id = p_region);
  r := jsonb_build_object(
    'searches', public.stat_mask(s_all),
    'searches_unfound', public.stat_mask(s_none),
    'unfound_rate', case when s_all >= public.stat_k() then round(100.0 * s_none / s_all) end,
    'pharmacies_verified', (select count(*) from public.pharmacies where status = 'verified' and not is_demo and (p_region is null or region_id = p_region)),
    'pharmacies_fresh_stock', (select count(distinct i.pharmacy_id) from public.pharmacy_inventory i join public.pharmacies p on p.id = i.pharmacy_id
        where p.status = 'verified' and not p.is_demo and i.stock_updated_at > now() - interval '30 days' and (p_region is null or p.region_id = p_region)),
    'on_duty_now', (select count(distinct d.pharmacy_id) from public.pharmacy_duty d join public.pharmacies p on p.id = d.pharmacy_id
        where now() between d.starts_at and d.ends_at and p.status = 'verified' and (p_region is null or p.region_id = p_region)),
    'blood_donors', public.stat_mask((select count(*) from public.user_alert_prefs a join public.profiles pr on pr.id = a.user_id and pr.deleted_at is null
        where a.blood_alerts and (p_region is null or a.region_id = p_region))),
    'questions', public.stat_mask((select count(*) from public.pharmacist_questions where created_at >= f and created_at < t)),
    'reports', public.stat_mask((select count(*) from public.drug_reports where created_at >= f and created_at < t and (p_region is null or region_id = p_region))),
    'k', public.stat_k());
  return r;
end $$;

-- Médicaments cherchés (sans résultat si p_unfound)
create or replace function public.authority_searches(p_region uuid default null, p_from date default null, p_to date default null, p_unfound boolean default true, p_limit int default 20)
returns table (query text, searches bigint, unfound bigint, regions bigint) language plpgsql security definer set search_path = public as $$
declare f timestamptz := coalesce(p_from, current_date - 30)::timestamptz; t timestamptz := (coalesce(p_to, current_date) + 1)::timestamptz;
begin
  perform public.authority_require(case when p_unfound then 'stats:unfound' else 'stats:searches' end, public.authority_params(p_region, p_from, p_to));
  return query
    select s.query_normalized, count(*), count(*) filter (where s.result_count = 0), count(distinct s.region_id)
      from public.search_logs s
     where s.kind = 'medicine' and s.created_at >= f and s.created_at < t and (p_region is null or s.region_id = p_region)
     group by s.query_normalized
    having (case when p_unfound then count(*) filter (where s.result_count = 0) else count(*) end) >= public.stat_k()
     order by (case when p_unfound then count(*) filter (where s.result_count = 0) else count(*) end) desc, s.query_normalized
     limit least(greatest(coalesce(p_limit, 20), 1), 100);
end $$;

-- Évolution par semaine d'un mot (ex. « paludisme »)
create or replace function public.authority_trend(p_term text, p_region uuid default null, p_weeks int default 12)
returns table (week date, searches bigint, unfound bigint) language plpgsql security definer set search_path = public as $$
declare term text := public.normalize_text(coalesce(p_term, '')); w int := least(greatest(coalesce(p_weeks, 12), 4), 52);
begin
  if char_length(term) < 3 then raise exception 'PP422: au moins 3 lettres'; end if;
  perform public.authority_require('stats:trend', jsonb_build_object('term', term, 'region', p_region, 'weeks', w));
  return query
    with weeks as (select generate_series(date_trunc('week', now() - make_interval(weeks => w - 1))::date, date_trunc('week', now())::date, interval '1 week')::date as wk)
    select weeks.wk, public.stat_mask(count(s.id)), public.stat_mask(count(s.id) filter (where s.result_count = 0))
      from weeks left join public.search_logs s on date_trunc('week', s.created_at)::date = weeks.wk and s.kind = 'medicine'
        and s.query_normalized like '%' || term || '%' and (p_region is null or s.region_id = p_region)
     group by weeks.wk order by weeks.wk;
end $$;

-- Par région : recherches, échecs, pharmacies, garde
create or replace function public.authority_regions(p_from date default null, p_to date default null)
returns table (region_id uuid, region text, searches bigint, unfound_rate int, pharmacies bigint, fresh_stock bigint, on_duty_now bigint)
language plpgsql security definer set search_path = public as $$
declare f timestamptz := coalesce(p_from, current_date - 30)::timestamptz; t timestamptz := (coalesce(p_to, current_date) + 1)::timestamptz;
begin
  perform public.authority_require('stats:regions', public.authority_params(null, p_from, p_to));
  return query
    select r.id, r.name,
      public.stat_mask(sl.n),
      case when sl.n >= public.stat_k() then round(100.0 * sl.none / sl.n)::int end,
      coalesce(ph.n, 0), coalesce(ph.fresh, 0), coalesce(ph.duty, 0)
    from public.regions r
    left join lateral (select count(*) n, count(*) filter (where s.result_count = 0) none from public.search_logs s
                        where s.region_id = r.id and s.kind = 'medicine' and s.created_at >= f and s.created_at < t) sl on true
    left join lateral (select count(*) n,
                              count(*) filter (where exists (select 1 from public.pharmacy_inventory i where i.pharmacy_id = p.id and i.stock_updated_at > now() - interval '30 days')) fresh,
                              count(*) filter (where exists (select 1 from public.pharmacy_duty d where d.pharmacy_id = p.id and now() between d.starts_at and d.ends_at)) duty
                         from public.pharmacies p where p.region_id = r.id and p.status = 'verified' and not p.is_demo) ph on true
    order by coalesce(sl.n, 0) desc, coalesce(ph.n, 0) desc, r.name;
end $$;

-- Communes sans pharmacie de garde dans les prochaines 24 heures (données publiques, pas de seuil)
create or replace function public.authority_duty_gaps(p_region uuid default null)
returns table (region text, commune text, pharmacies bigint, on_duty_24h bigint) language plpgsql security definer set search_path = public as $$
begin
  perform public.authority_require('stats:duty', jsonb_build_object('region', p_region));
  return query
    select r.name, c.name, count(p.id),
      count(p.id) filter (where exists (select 1 from public.pharmacy_duty d where d.pharmacy_id = p.id and d.starts_at < now() + interval '24 hours' and d.ends_at > now()))
      from public.communes c join public.regions r on r.id = c.region_id
      join public.pharmacies p on p.commune_id = c.id and p.status = 'verified' and not p.is_demo
     where (p_region is null or c.region_id = p_region) and not c.is_demo
     group by r.name, c.name
     order by 4, 3 desc, 1, 2;
end $$;

-- AMO : prix déclarés par les pharmacies vérifiées (30 derniers jours) comparés au tarif de référence
create or replace function public.authority_amo_prices(p_region uuid default null, p_limit int default 30)
returns table (product text, tariff int, prices bigint, min_price int, avg_price int, max_price int, gap_pct int)
language plpgsql security definer set search_path = public as $$
begin
  perform public.authority_require('stats:amo', jsonb_build_object('region', p_region));
  return query
    select a.name, a.tariff_xof, count(*), min(i.price_xof), round(avg(i.price_xof))::int, max(i.price_xof),
           round(100.0 * (avg(i.price_xof) - a.tariff_xof) / nullif(a.tariff_xof, 0))::int
      from public.amo_catalog_links l join public.amo_medicines a on a.id = l.amo_id and a.tariff_xof > 0
      join public.pharmacy_inventory i on i.catalog_id = l.catalog_id and i.price_xof > 0 and i.stock_updated_at > now() - interval '30 days'
      join public.pharmacies p on p.id = i.pharmacy_id and p.status = 'verified' and not p.is_demo and (p_region is null or p.region_id = p_region)
     group by a.id, a.name, a.tariff_xof
    having count(*) >= 3
     order by abs(avg(i.price_xof) - a.tariff_xof) / nullif(a.tariff_xof, 0) desc nulls last
     limit least(greatest(coalesce(p_limit, 30), 1), 100);
end $$;

-- Sujets qui préoccupent : questions aux pharmaciens par public, fiches les plus lues
create or replace function public.authority_topics(p_from date default null, p_to date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f date := coalesce(p_from, current_date - 30); t date := coalesce(p_to, current_date);
begin
  perform public.authority_require('stats:topics', public.authority_params(null, p_from, p_to));
  return jsonb_build_object(
    'questions', coalesce((select jsonb_agg(jsonb_build_object('about', about, 'n', n) order by n desc) from (
        select about, count(*) n from public.pharmacist_questions where created_at::date between f and t group by about having count(*) >= public.stat_k()) x), '[]'::jsonb),
    'urgent_questions', public.stat_mask((select count(*) from public.pharmacist_questions where urgent and created_at::date between f and t)),
    'articles', coalesce((select jsonb_agg(jsonb_build_object('title', title, 'slug', slug, 'n', n) order by n desc) from (
        select a.title, a.slug, sum(v.views) n from public.article_daily_views v join public.health_articles a on a.id = v.article_id
         where v.day between f and t group by a.id, a.title, a.slug having sum(v.views) >= public.stat_k() order by 3 desc limit 15) y), '[]'::jsonb));
end $$;

-- Don de sang : donneurs volontaires par groupe et par région, campagnes
create or replace function public.authority_blood(p_region uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.authority_require('stats:blood', jsonb_build_object('region', p_region), array['ministere', 'cnts']);
  return jsonb_build_object(
    'by_group', coalesce((select jsonb_agg(jsonb_build_object('group', g, 'n', public.stat_mask(n)) order by g) from (
        select coalesce(a.blood_group, 'inconnu') g, count(*) n from public.user_alert_prefs a join public.profiles pr on pr.id = a.user_id and pr.deleted_at is null
         where a.blood_alerts and (p_region is null or a.region_id = p_region) group by 1) x), '[]'::jsonb),
    'by_region', coalesce((select jsonb_agg(jsonb_build_object('region', coalesce(r.name, 'Non précisée'), 'n', public.stat_mask(n)) order by n desc) from (
        select a.region_id, count(*) n from public.user_alert_prefs a join public.profiles pr on pr.id = a.user_id and pr.deleted_at is null
         where a.blood_alerts group by 1) y left join public.regions r on r.id = y.region_id), '[]'::jsonb),
    'needs_30d', (select count(*) from public.blood_needs where created_at > now() - interval '30 days'),
    'campaigns', coalesce((select jsonb_agg(jsonb_build_object('title', c.title, 'date', c.starts_on, 'place', c.place, 'going', public.stat_mask(
          (select count(*) from public.blood_campaign_attendance x where x.campaign_id = c.id))) order by c.starts_on desc)
        from (select * from public.blood_campaigns where published and starts_on > current_date - 90 and (p_region is null or region_id = p_region) order by starts_on desc limit 20) c), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- 4. Signalements : médicament suspect ou effet indésirable
-- ---------------------------------------------------------------------------
create table if not exists public.drug_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('suspect', 'effet')),
  reporter_type text not null check (reporter_type in ('patient', 'proche', 'pharmacien', 'medecin', 'autre')),
  product_name text not null check (char_length(btrim(product_name)) between 2 and 160),
  batch_number text check (char_length(coalesce(batch_number, '')) <= 60),
  expiry text check (char_length(coalesce(expiry, '')) <= 20),
  manufacturer text check (char_length(coalesce(manufacturer, '')) <= 120),
  where_bought text check (where_bought in ('pharmacie', 'depot', 'centre_sante', 'rue', 'marche', 'internet', 'autre')),
  place_detail text check (char_length(coalesce(place_detail, '')) <= 160),
  region_id uuid references public.regions(id) on delete set null,
  price_xof int check (price_xof is null or price_xof between 0 and 10000000),
  problems text[] not null default '{}' check (problems <@ array['emballage', 'etiquette', 'aspect', 'prix', 'non_autorise', 'inefficace', 'perime', 'autre']::text[]),
  description text check (char_length(coalesce(description, '')) <= 2000),
  reaction text check (char_length(coalesce(reaction, '')) <= 2000),
  severity text check (severity in ('legere', 'moderee', 'grave')),
  outcome text check (outcome in ('gueri', 'en_cours', 'sequelles', 'inconnu')),
  patient_age text check (patient_age in ('0-4', '5-14', '15-24', '25-49', '50-64', '65+')),
  patient_sex text check (patient_sex in ('F', 'M')),
  pregnant boolean,
  other_meds text check (char_length(coalesce(other_meds, '')) <= 500),
  contact_ok boolean not null default false,
  contact_phone text check (contact_phone is null or contact_phone ~ '^\+?[0-9 ]{8,20}$'),
  status text not null default 'nouveau' check (status in ('nouveau', 'en_cours', 'transmis', 'clos')),
  authority_note text check (char_length(coalesce(authority_note, '')) <= 2000),
  handled_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'suspect' or reaction is not null)
);
create index if not exists drug_reports_status on public.drug_reports (status, created_at desc);
alter table public.drug_reports enable row level security;
drop policy if exists "pp_drug_reports_own" on public.drug_reports;
create policy "pp_drug_reports_own" on public.drug_reports for select to authenticated using (reporter_id = auth.uid());
revoke all on public.drug_reports from anon;
revoke insert, update, delete on public.drug_reports from authenticated;
grant select on public.drug_reports to authenticated;

create or replace function public.submit_drug_report(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); v_id uuid; k text := p ->> 'kind';
begin
  if coalesce((p ->> 'consent')::boolean, false) is not true then raise exception 'PP422: votre accord pour transmettre le signalement est nécessaire'; end if;
  if (select count(*) from public.drug_reports where reporter_id = uid and created_at > now() - interval '1 day') >= 5 then
    raise exception 'PP429: 5 signalements par jour au maximum';
  end if;
  if k = 'effet' and nullif(btrim(p ->> 'reaction'), '') is null then raise exception 'PP422: décrivez la réaction observée'; end if;
  insert into public.drug_reports (reporter_id, kind, reporter_type, product_name, batch_number, expiry, manufacturer, where_bought, place_detail, region_id,
    price_xof, problems, description, reaction, severity, outcome, patient_age, patient_sex, pregnant, other_meds, contact_ok, contact_phone)
  values (uid, k, coalesce(nullif(p ->> 'reporter_type', ''), 'patient'), btrim(p ->> 'product_name'), nullif(btrim(p ->> 'batch_number'), ''),
    nullif(btrim(p ->> 'expiry'), ''), nullif(btrim(p ->> 'manufacturer'), ''), nullif(p ->> 'where_bought', ''), nullif(btrim(p ->> 'place_detail'), ''),
    nullif(p ->> 'region_id', '')::uuid, nullif(p ->> 'price_xof', '')::int,
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p -> 'problems', '[]'::jsonb)) x), '{}'),
    nullif(btrim(p ->> 'description'), ''), nullif(btrim(p ->> 'reaction'), ''), nullif(p ->> 'severity', ''), nullif(p ->> 'outcome', ''),
    nullif(p ->> 'patient_age', ''), nullif(p ->> 'patient_sex', ''), (p ->> 'pregnant')::boolean, nullif(btrim(p ->> 'other_meds'), ''),
    coalesce((p ->> 'contact_ok')::boolean, false), case when coalesce((p ->> 'contact_ok')::boolean, false) then nullif(btrim(p ->> 'contact_phone'), '') end)
  returning id into v_id;
  return v_id;
exception
  when check_violation then raise exception 'PP422: certaines informations sont invalides ou trop longues';
  when invalid_text_representation then raise exception 'PP422: certaines informations sont invalides';
end $$;

-- File des autorités : l'identité de la personne n'est jamais donnée ; son téléphone seulement si elle l'a accepté
create or replace function public.authority_reports(p_status text default null, p_kind text default null, p_region uuid default null, p_limit int default 30, p_offset int default 0)
returns table (id uuid, kind text, reporter_type text, product_name text, batch_number text, expiry text, manufacturer text, where_bought text, place_detail text,
  region text, price_xof int, problems text[], description text, reaction text, severity text, outcome text, patient_age text, patient_sex text, pregnant boolean,
  other_meds text, contact_phone text, status text, authority_note text, created_at timestamptz, total_count bigint)
language plpgsql security definer set search_path = public as $$
begin
  perform public.authority_require('reports:list', jsonb_build_object('status', p_status, 'kind', p_kind, 'region', p_region), array['ministere', 'dpm', 'ordre_pharmaciens']);
  return query
    select d.id, d.kind, d.reporter_type, d.product_name, d.batch_number, d.expiry, d.manufacturer, d.where_bought, d.place_detail, r.name, d.price_xof, d.problems,
           d.description, d.reaction, d.severity, d.outcome, d.patient_age, d.patient_sex, d.pregnant, d.other_meds, case when d.contact_ok then d.contact_phone end,
           d.status, d.authority_note, d.created_at, count(*) over ()
      from public.drug_reports d left join public.regions r on r.id = d.region_id
     where (p_status is null or d.status = p_status) and (p_kind is null or d.kind = p_kind) and (p_region is null or d.region_id = p_region)
     order by coalesce(d.severity = 'grave' and d.status = 'nouveau', false) desc, d.created_at desc
     limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end $$;

create or replace function public.authority_update_report(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid; d public.drug_reports;
begin
  uid := public.authority_require('reports:update', jsonb_build_object('id', p_id, 'status', p_status), array['ministere', 'dpm', 'ordre_pharmaciens']);
  if p_status not in ('nouveau', 'en_cours', 'transmis', 'clos') then raise exception 'PP422: statut invalide'; end if;
  update public.drug_reports set status = p_status, authority_note = nullif(btrim(coalesce(p_note, '')), ''), handled_by = uid, updated_at = now()
   where id = p_id returning * into d;
  if not found then raise exception 'PP404: signalement introuvable'; end if;
  if p_status in ('transmis', 'clos') then
    perform public.notify_user(d.reporter_id, 'signalement', 'Votre signalement a été pris en charge',
      'Merci : les autorités de santé ont examiné votre signalement.', null, '/signaler/mes-signalements');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Courbe de croissance des enfants (privée, comme le carnet de vaccination)
-- ---------------------------------------------------------------------------
create table if not exists public.child_growth (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  measured_on date not null check (measured_on <= current_date + 1),
  weight_kg numeric(4, 1) check (weight_kg between 0.5 and 40),
  height_cm numeric(4, 1) check (height_cm between 35 and 130),
  place text check (char_length(coalesce(place, '')) <= 100),
  created_at timestamptz not null default now(),
  check (weight_kg is not null or height_cm is not null),
  unique (child_id, measured_on)
);
alter table public.child_growth enable row level security;
drop policy if exists "pp_child_growth_owner" on public.child_growth;
create policy "pp_child_growth_owner" on public.child_growth for all to authenticated
  using (exists (select 1 from public.children c where c.id = child_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.children c where c.id = child_id and c.user_id = auth.uid()));
revoke all on public.child_growth from anon;
grant select, insert, update, delete on public.child_growth to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Campagnes de don de sang (collectes mobiles du CNTS) et « j'y serai »
-- ---------------------------------------------------------------------------
create table if not exists public.blood_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 140),
  organizer text not null default 'CNTS' check (char_length(btrim(organizer)) between 2 and 120),
  region_id uuid references public.regions(id) on delete set null,
  place text not null check (char_length(btrim(place)) between 3 and 200),
  starts_on date not null,
  start_time text check (start_time is null or start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time text check (end_time is null or end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  details text check (char_length(coalesce(details, '')) <= 1000),
  source_url text not null check (source_url ~ '^https?://'),
  published boolean not null default true,
  notified_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.blood_campaigns enable row level security;
drop policy if exists "pp_blood_campaigns_read" on public.blood_campaigns;
create policy "pp_blood_campaigns_read" on public.blood_campaigns for select to anon, authenticated using (published or public.is_admin());
revoke insert, update, delete on public.blood_campaigns from anon, authenticated;
grant select on public.blood_campaigns to anon, authenticated;

create table if not exists public.blood_campaign_attendance (
  campaign_id uuid not null references public.blood_campaigns(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);
alter table public.blood_campaign_attendance enable row level security;
drop policy if exists "pp_campaign_attendance_own" on public.blood_campaign_attendance;
create policy "pp_campaign_attendance_own" on public.blood_campaign_attendance for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.blood_campaign_attendance from anon;
grant select, insert, delete on public.blood_campaign_attendance to authenticated;

-- Nombre de participants annoncés : affiché seulement à partir de 10
create or replace function public.campaign_going(p_campaign uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select public.stat_mask((select count(*) from public.blood_campaign_attendance where campaign_id = p_campaign))
$$;
grant execute on function public.campaign_going(uuid) to anon, authenticated;

create or replace function public.save_blood_campaign(p jsonb, p_notify boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid; v_id uuid := nullif(p ->> 'id', '')::uuid; c public.blood_campaigns;
begin
  uid := public.authority_require('campaign:save', jsonb_build_object('id', v_id), array['ministere', 'cnts']);
  if v_id is null then
    insert into public.blood_campaigns (title, organizer, region_id, place, starts_on, start_time, end_time, details, source_url, published, created_by)
    values (btrim(p ->> 'title'), coalesce(nullif(btrim(p ->> 'organizer'), ''), 'CNTS'), nullif(p ->> 'region_id', '')::uuid, btrim(p ->> 'place'),
      (p ->> 'starts_on')::date, nullif(p ->> 'start_time', ''), nullif(p ->> 'end_time', ''), nullif(btrim(p ->> 'details'), ''),
      btrim(p ->> 'source_url'), coalesce((p ->> 'published')::boolean, true), uid)
    returning * into c;
  else
    update public.blood_campaigns set title = btrim(p ->> 'title'), organizer = coalesce(nullif(btrim(p ->> 'organizer'), ''), 'CNTS'),
      region_id = nullif(p ->> 'region_id', '')::uuid, place = btrim(p ->> 'place'), starts_on = (p ->> 'starts_on')::date,
      start_time = nullif(p ->> 'start_time', ''), end_time = nullif(p ->> 'end_time', ''), details = nullif(btrim(p ->> 'details'), ''),
      source_url = btrim(p ->> 'source_url'), published = coalesce((p ->> 'published')::boolean, true)
     where id = v_id returning * into c;
    if not found then raise exception 'PP404: campagne introuvable'; end if;
  end if;
  if p_notify and c.published and c.notified_at is null and c.starts_on >= current_date then
    insert into public.notifications (user_id, kind, title, body, link)
    select a.user_id, 'don', 'Collecte de sang près de chez vous',
           c.title || ' — ' || to_char(c.starts_on, 'DD/MM/YYYY') || ', ' || c.place || '.', '/don-de-sang#campagnes'
      from public.user_alert_prefs a join public.profiles pr on pr.id = a.user_id and pr.deleted_at is null
     where a.blood_alerts and (c.region_id is null or a.region_id is null or a.region_id = c.region_id);
    update public.blood_campaigns set notified_at = now() where id = c.id;
  end if;
  perform public.log_audit('blood_campaign_save', 'blood_campaign', c.id::text, jsonb_build_object('title', c.title));
  return c.id;
exception
  when check_violation then raise exception 'PP422: titre, lieu, date et lien vers la source officielle sont obligatoires';
  when not_null_violation then raise exception 'PP422: titre, lieu, date et lien vers la source officielle sont obligatoires';
  when invalid_datetime_format then raise exception 'PP422: date invalide';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Avis des utilisateurs
-- ---------------------------------------------------------------------------
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  page_path text check (page_path ~ '^/' and char_length(page_path) <= 200),
  mood text check (mood in ('content', 'moyen', 'pas_content')),
  category text not null default 'autre' check (category in ('bug', 'idee', 'contenu', 'difficile', 'autre')),
  message text check (char_length(coalesce(message, '')) <= 1000),
  status text not null default 'nouveau' check (status in ('nouveau', 'lu', 'traite')),
  created_at timestamptz not null default now(),
  check (mood is not null or message is not null)
);
create index if not exists feedback_created on public.feedback (created_at desc);
alter table public.feedback enable row level security;
drop policy if exists "pp_feedback_admin" on public.feedback;
create policy "pp_feedback_admin" on public.feedback for select to authenticated using (public.is_admin());
revoke all on public.feedback from anon;
revoke insert, update, delete on public.feedback from authenticated;
grant select on public.feedback to authenticated;

create or replace function public.submit_feedback(p_page text, p_mood text, p_category text, p_message text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.feedback (user_id, page_path, mood, category, message)
  values (auth.uid(), nullif(left(p_page, 200), ''), nullif(p_mood, ''), coalesce(nullif(p_category, ''), 'autre'), nullif(btrim(coalesce(p_message, '')), ''));
exception when check_violation then raise exception 'PP422: avis invalide (1 000 caractères au maximum)';
end $$;
grant execute on function public.submit_feedback(text, text, text, text) to anon, authenticated;

create or replace function public.admin_feedback_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.feedback set status = p_status where id = p_id;
exception when check_violation then raise exception 'PP422: statut invalide';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Guides audio : nouvelles pages à enregistrer en langues nationales
-- ---------------------------------------------------------------------------
insert into public.audio_targets (key, label, page_path, sort_order, script_fr) values
  ('premiers-secours', 'Premiers secours', '/premiers-secours', 20,
   'En cas d''urgence grave, appelez d''abord les secours ou partez tout de suite vers le centre de santé le plus proche. Cette page explique les gestes simples à faire en attendant : arrêter un saignement en appuyant fort sur la plaie, refroidir une brûlure avec de l''eau propre, mettre sur le côté une personne qui ne répond plus mais qui respire. Chaque fiche est vérifiée par un professionnel de santé. Ouvrez cette page une fois avec une connexion : elle reste ensuite lisible sans réseau.'),
  ('don-de-sang', 'Don de sang', '/don-de-sang', 21,
   'Donner son sang sauve des vies, surtout celles des femmes qui accouchent et des enfants malades du paludisme. Vous pouvez donner si vous avez entre dix-huit et soixante ans, si vous pesez au moins cinquante-cinq kilos et si vous êtes en bonne santé. Un homme peut donner tous les trois mois, une femme tous les quatre mois. Le don est gratuit : le sang ne se vend pas. Rendez-vous au Centre national de transfusion sanguine, ou à une collecte près de chez vous.'),
  ('droits', 'Vos droits', '/droits', 22,
   'Cette rubrique explique vos droits en matière de santé et de protection sociale au Mali : le congé de maternité, les allocations familiales, la déclaration de naissance, l''assurance maladie obligatoire, les soins gratuits, l''accident du travail et la retraite. Chaque fiche cite les textes officiels. Pour votre situation personnelle, renseignez-vous auprès de l''INPS, de la CANAM ou de votre employeur.'),
  ('vaccination-enfants', 'Carnet de vaccination des enfants', '/ma-sante/enfants', 23,
   'Ajoutez votre enfant avec sa date de naissance. PharmaProxi affiche les vaccins du calendrier national et vous prévient trois jours avant chaque rendez-vous. Notez chaque vaccin fait au centre de santé. Vous pouvez aussi noter son poids et sa taille à chaque pesée, pour suivre sa courbe de croissance. Gardez toujours le carnet papier : c''est lui qui fait foi.'),
  ('dossier-sante', 'Mon dossier santé', '/ma-sante/dossier', 24,
   'Mon dossier santé garde votre histoire de santé dans votre téléphone : votre groupe sanguin, vos allergies, vos maladies, vos opérations, vos vaccins, vos analyses et vos ordonnances. Chez le médecin, touchez Montrer à mon médecin : tout s''affiche sur une page. Votre dossier est visible par vous seul et peut être protégé par un code secret.'),
  ('signaler', 'Signaler un médicament suspect', '/signaler', 25,
   'Vous avez un doute sur un médicament : une boîte abîmée, un prix anormal, un produit vendu dans la rue, ou une mauvaise réaction après l''avoir pris ? Signalez-le ici. Votre signalement est transmis aux autorités de santé, qui vérifient. Il n''est jamais publié. Si la réaction est grave, allez d''abord au centre de santé.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 9. Droits d'exécution, effacement avec le compte
-- ---------------------------------------------------------------------------
revoke execute on function public.authority_require(text, jsonb, text[]), public.stat_k(), public.stat_mask(bigint) from public, anon;
revoke execute on function public.authority_overview(uuid, date, date), public.authority_searches(uuid, date, date, boolean, int), public.authority_trend(text, uuid, int),
  public.authority_regions(date, date), public.authority_duty_gaps(uuid), public.authority_amo_prices(uuid, int), public.authority_topics(date, date),
  public.authority_blood(uuid), public.authority_reports(text, text, uuid, int, int), public.authority_update_report(uuid, text, text),
  public.save_blood_campaign(jsonb, boolean), public.admin_set_authority(text, text, text, text, boolean), public.submit_drug_report(jsonb),
  public.admin_feedback_status(uuid, text), public.is_authority(), public.authority_scope(uuid) from public, anon;
grant execute on function public.authority_overview(uuid, date, date), public.authority_searches(uuid, date, date, boolean, int), public.authority_trend(text, uuid, int),
  public.authority_regions(date, date), public.authority_duty_gaps(uuid), public.authority_amo_prices(uuid, int), public.authority_topics(date, date),
  public.authority_blood(uuid), public.authority_reports(text, text, uuid, int, int), public.authority_update_report(uuid, text, text),
  public.save_blood_campaign(jsonb, boolean), public.admin_set_authority(text, text, text, text, boolean), public.submit_drug_report(jsonb),
  public.admin_feedback_status(uuid, text), public.is_authority(), public.authority_scope(uuid) to authenticated;

create or replace function public.purge_personal_health_data()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.record_persons where owner_id = new.id;
    delete from public.record_settings where user_id = new.id;
    delete from public.children where user_id = new.id;
    delete from public.treatments where user_id = new.id;
    delete from public.health_measures where user_id = new.id;
    delete from public.user_alert_prefs where user_id = new.id;
    delete from public.blood_campaign_attendance where user_id = new.id;
    delete from public.authority_members where user_id = new.id;
    update public.drug_reports set reporter_id = null, contact_phone = null, contact_ok = false where reporter_id = new.id;
    delete from public.pharmacist_questions where user_id = new.id and not (allow_public and status <> 'open');
    delete from public.femme_days where user_id = new.id;
    delete from public.femme_periods where user_id = new.id;
    delete from public.femme_reminders where user_id = new.id;
    delete from public.femme_access_log where user_id = new.id;
    delete from public.femme_profiles where user_id = new.id;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Politique de confidentialité : mise à jour du texte provisoire (seulement s'il n'a pas été réécrit)
-- ---------------------------------------------------------------------------
update public.content_pages set body =
'Version provisoire — à faire valider par un juriste au regard de la loi n° 2013-015 du 21 mai 2013 sur la protection des données à caractère personnel et des exigences de l''Autorité de protection des données à caractère personnel (APDP).

Données de compte : nom, téléphone, adresse e-mail, adresses de livraison, historique des commandes et des rendez-vous.
Espaces de santé personnels (Mon dossier santé, Ma santé, PharmaProxi Femme) : les informations que vous y notez (allergies, maladies, traitements, vaccins, mesures, croissance des enfants, cycle…) sont visibles par vous seul. Ni les pharmacies, ni les médecins, ni les assureurs, ni l''équipe de PharmaProxi n''y ont accès. Elles ne sont utilisées ni pour de la publicité, ni par l''assistant automatique, ni dans les statistiques, et sont effacées avec votre compte.
Finalités : mise en relation avec les pharmacies et les professionnels, suivi des commandes et des rendez-vous, rappels que vous avez demandés, sécurité de la plateforme.
Destinataires : la pharmacie ou le professionnel choisi et, en cas de livraison, le livreur affecté reçoivent uniquement les informations nécessaires.
Statistiques anonymes : les recherches de médicaments sont enregistrées sans votre identité. Des statistiques anonymes et agrégées (par exemple les médicaments les plus cherchés sans résultat) aident les autorités de santé à repérer les ruptures ; un chiffre inférieur à 10 n''est jamais affiché.
Signalements de médicaments : un signalement de médicament suspect ou d''effet indésirable est transmis, avec votre accord, aux autorités de santé (ministère de la Santé, Direction de la pharmacie et du médicament, Ordre des pharmaciens). Il n''est jamais publié ; votre nom n''est pas communiqué, votre téléphone seulement si vous l''acceptez.
Conservation : les commandes sont conservées pour la durée légale applicable ; la suppression du compte efface vos espaces de santé et anonymise le profil.
Droits : accès, rectification, suppression depuis votre espace « Mon compte » ou en écrivant au contact de la plateforme.'
where slug = 'confidentialite' and body like 'Version provisoire%' and body not like '%Mon dossier santé%';
