-- ============================================================================
-- PharmaProxi — Migration : Assurance maladie obligatoire (AMO)
--   * Liste officielle des médicaments pris en charge (CANAM), importée par
--     l'administration à partir du fichier officiel : aucune donnée n'est saisie ici.
--   * Lien entre le catalogue PharmaProxi et la liste AMO (rapprochement automatique
--     par nom + dosage, corrigeable par l'administration).
--   * Pharmacies conventionnées : déclaration par la pharmacie, vérification par l'équipe.
--   * Estimation du reste à payer : prix − taux × min(prix, tarif officiel).
-- Peut être relancé sans erreur.
-- ============================================================================

create table if not exists public.amo_config (
  id boolean primary key default true check (id),
  rate_medicines numeric(5, 2) not null default 70 check (rate_medicines between 0 and 100),  -- part AMO en officine (%)
  list_label text,          -- ex. « Liste AMO des médicaments — révision CANAM 2022 »
  list_reference text,      -- ex. arrêté ou note de la CANAM
  list_date date,
  source_url text check (source_url is null or source_url ~ '^https?://'),
  updated_at timestamptz not null default now()
);
insert into public.amo_config (id) values (true) on conflict do nothing;
alter table public.amo_config enable row level security;
drop policy if exists "pp_amo_config_read" on public.amo_config;
create policy "pp_amo_config_read" on public.amo_config for select to anon, authenticated using (true);
revoke insert, update, delete on public.amo_config from anon, authenticated;
grant select on public.amo_config to anon, authenticated;

-- Clé de rapprochement : minuscules sans accents, « 500 mg » → « 500mg », « 0,5 % » → « 0.5% »
create or replace function public.amo_key(t text)
returns text language sql immutable parallel safe set search_path = public, extensions as $$
  select btrim(regexp_replace(regexp_replace(regexp_replace(
           public.normalize_text(t),
           '(\d),(\d)', '\1.\2', 'g'),                         -- virgule décimale
           '(\d) +((mg|g|ml|l|ui|mui|µg|mcg|ug|meq|mmol|cl)\M|%)', '\1\2', 'g'),
           '\s+', ' ', 'g'))
$$;

create table if not exists public.amo_medicines (
  id uuid primary key default gen_random_uuid(),
  code text check (char_length(coalesce(code, '')) <= 40),
  name text not null check (char_length(btrim(name)) between 1 and 400),   -- désignation officielle (nom, dosage, forme, conditionnement)
  dci text check (char_length(coalesce(dci, '')) <= 200),
  dosage text check (char_length(coalesce(dosage, '')) <= 80),
  form text check (char_length(coalesce(form, '')) <= 80),
  presentation text check (char_length(coalesce(presentation, '')) <= 120),
  category text check (category is null or category in ('specialite', 'generique_marque', 'generique_dci', 'dispositif')),
  tariff_xof int check (tariff_xof is null or tariff_xof between 0 and 10000000),   -- tarif de responsabilité / prix de référence
  rate numeric(5, 2) check (rate is null or rate between 0 and 100),                 -- taux particulier, sinon taux général
  list_version text not null check (char_length(list_version) between 1 and 80),
  match_key text generated always as (public.amo_key(name || coalesce(' ' || dosage, ''))) stored,
  search_text text generated always as (public.amo_key(coalesce(name, '') || ' ' || coalesce(dci, '') || ' ' || coalesce(code, ''))) stored,
  created_at timestamptz not null default now()
);
create index if not exists amo_medicines_trgm on public.amo_medicines using gin (search_text extensions.gin_trgm_ops);
create index if not exists amo_medicines_key on public.amo_medicines (match_key text_pattern_ops);
create unique index if not exists amo_medicines_unique on public.amo_medicines (list_version, coalesce(code, ''), match_key, public.normalize_text(coalesce(form, '')), public.normalize_text(coalesce(presentation, '')));
alter table public.amo_medicines enable row level security;
drop policy if exists "pp_amo_meds_read" on public.amo_medicines;
create policy "pp_amo_meds_read" on public.amo_medicines for select to anon, authenticated using (true);
revoke insert, update, delete on public.amo_medicines from anon, authenticated;
grant select on public.amo_medicines to anon, authenticated;

-- Lien catalogue → liste AMO
create table if not exists public.amo_catalog_links (
  catalog_id uuid primary key references public.medicine_catalog(id) on delete cascade,
  amo_id uuid references public.amo_medicines(id) on delete cascade,   -- null + manual = « non pris en charge » confirmé
  manual boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.amo_catalog_links enable row level security;
drop policy if exists "pp_amo_links_read" on public.amo_catalog_links;
create policy "pp_amo_links_read" on public.amo_catalog_links for select to anon, authenticated using (true);
revoke insert, update, delete on public.amo_catalog_links from anon, authenticated;
grant select on public.amo_catalog_links to anon, authenticated;

-- Pharmacies conventionnées
create table if not exists public.pharmacy_amo (
  pharmacy_id uuid primary key references public.pharmacies(id) on delete cascade,
  status text not null check (status in ('declared', 'verified', 'rejected')),
  declared_at timestamptz not null default now(),
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  note text check (char_length(coalesce(note, '')) <= 300)
);
alter table public.pharmacy_amo enable row level security;
drop policy if exists "pp_pharmacy_amo_read" on public.pharmacy_amo;
create policy "pp_pharmacy_amo_read" on public.pharmacy_amo for select to anon, authenticated using (status <> 'rejected' or public.is_admin() or public.is_pharmacy_member(pharmacy_id));
revoke insert, update, delete on public.pharmacy_amo from anon, authenticated;
grant select on public.pharmacy_amo to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Calcul
-- ---------------------------------------------------------------------------
create or replace function public.amo_patient_share(p_price int, p_tariff int, p_rate numeric)
returns int language sql immutable as $$
  select case when p_price is null or p_rate is null then null
    else greatest(0, p_price - round(p_rate / 100.0 * least(p_price, coalesce(p_tariff, p_price))))::int end
$$;

-- Rapprochement d'un produit du catalogue avec la liste AMO.
--   * la désignation officielle doit commencer par le nom commercial du produit ;
--   * chaque dosage du produit (« 500 mg/5 ml » → 500mg, 5ml) doit figurer dans la désignation ;
--   * la forme départage les candidats (comprimé, sirop, injectable…) ;
--   * s'il reste plusieurs candidats à des tarifs différents, aucun lien automatique
--     (l'administration choisit à la main) : on n'affiche jamais un tarif douteux.
create or replace function public.amo_form_pattern(p_form text)
returns text language sql immutable parallel safe set search_path = public as $$
  select case
    when f ~ 'effervescent' then '\m(effv?|eff|effervescents?)\M'
    when f ~ 'comprime|cpr|comp\M' then '\m(comp|cpr|cp|comprimes?|dragees?)\M'
    when f ~ 'gelule|capsule' then '\m(gelu|gel|gelules?|caps|capsules?)\M'
    when f ~ 'sirop' then '\msirop\M'
    when f ~ 'suspension|poudre' then '\m(susp|suspension|pdre|poudre)\M'
    when f ~ 'inject|ampoule|perfusion' then '\m(inj|injectable|amp|perf|flacon|iv|im)\M'
    when f ~ 'suppositoire' then '\msuppo'
    when f ~ 'sachet' then '\msach'
    when f ~ 'pommade' then '\mpom'
    when f ~ 'creme' then '\mcre?me?\M'
    when f ~ 'gel\M' then '\mgel\M'
    when f ~ 'collyre' then '\mcoll?yre'
    when f ~ 'goutte' then '\m(gtte?s?|gouttes?)\M'
    when f ~ 'ovule' then '\movule'
    when f ~ 'solution' then '\m(sol|solution|buv)\M'
    else null end
  from (select public.normalize_text(p_form) as f) x
$$;

drop function if exists public.amo_best_match(text, text, text, text);
create or replace function public.amo_best_match(p_brand text, p_dosage text, p_form text, p_pack text default null)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare b text := public.amo_key(p_brand); toks text[]; fp text := public.amo_form_pattern(p_form);
        pk text := substring(public.normalize_text(coalesce(p_pack, '')) from '(\d+)'); r uuid;
        forms constant text := '\m(comp|cpr|cp|gelu|gel|caps|sirop|susp|pdre|inj|injectable|amp|perf|iv|suppo|sach|sachets?|pom|pommade|creme|crem|collyre|gtte|gouttes?|ovule|sol|buv)\M';
begin
  if char_length(coalesce(b, '')) < 3 then return null; end if;
  b := replace(replace(replace(b, '\', '\\'), '%', '\%'), '_', '\_');
  select coalesce(array_agg(regexp_replace(t, '([.%])', '\\\1', 'g')), '{}') into toks
    from regexp_split_to_table(regexp_replace(public.amo_key(coalesce(p_dosage, '')), ' ', '', 'g'), '[/+;]') t
   where t ~ '^[0-9.]+[a-zµ%]*$' and t ~ '[0-9]';
  with c as (
    select a.id, a.tariff_xof, a.match_key from public.amo_medicines a
     where (a.match_key = replace(replace(replace(b, '\%', '%'), '\_', '_'), '\\', '\') or a.match_key like b || ' %')
       and not exists (select 1 from unnest(toks) t where a.match_key !~ ('(^|[^0-9.])' || t || '($|[^0-9a-z.])'))),
  f0 as (  -- la forme : on garde les désignations de cette forme ; à défaut, celles qui n'indiquent aucune autre forme
    select * from c where fp is null or match_key ~ fp
       or (not exists (select 1 from c where match_key ~ fp) and match_key !~ forms)),
  f1 as (  -- un comprimé simple n'est pas un comprimé effervescent (ni l'inverse)
    select * from f0 where coalesce(fp, '') ~ 'eff' or match_key !~ '\m(effv?|effervescents?)\M'
       or not exists (select 1 from f0 where match_key !~ '\m(effv?|effervescents?)\M')),
  f as (   -- le conditionnement (« boîte de 24 » ↔ « BTE/24 ») départage les boîtes
    select * from f1 where pk is null or match_key ~ ('[/x] ?' || pk || '\M')
       or not exists (select 1 from f1 where match_key ~ ('[/x] ?' || pk || '\M')))
  select case when count(distinct coalesce(tariff_xof, -1)) = 1 then (array_agg(id order by match_key))[1] end into r from f;
  return r;
end $$;

create or replace function public.amo_rematch()
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; c record; m uuid;
begin
  delete from public.amo_catalog_links where not manual;
  for c in select id, brand_name, dosage, form, packaging from public.medicine_catalog mc
            where merged_into is null and not exists (select 1 from public.amo_catalog_links l where l.catalog_id = mc.id) loop
    m := public.amo_best_match(c.brand_name, c.dosage, c.form, c.packaging);
    if m is not null then
      insert into public.amo_catalog_links (catalog_id, amo_id, manual) values (c.id, m, false);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Import de la liste officielle (par lots). p_rows : [{line, code, nom, dci, dosage, forme, presentation, categorie, tarif, taux}]
-- ---------------------------------------------------------------------------
create or replace function public.admin_import_amo(p_version text, p_rows jsonb, p_replace boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin(); rec record; ok int := 0; dup int := 0; errors jsonb := '[]'::jsonb; removed int := 0;
        v_tarif int; v_taux numeric; v_cat text; c text;
begin
  if char_length(btrim(coalesce(p_version, ''))) < 1 then raise exception 'PP422: indiquez la version de la liste (ex. CANAM 2022)'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 6000 then raise exception 'PP422: 6 000 lignes maximum par lot'; end if;
  if p_replace then
    delete from public.amo_medicines; get diagnostics removed = row_count;
  end if;
  for rec in select coalesce((e ->> 'line')::int, o::int + 1) as line, e from jsonb_array_elements(p_rows) with ordinality as t(e, o) loop
    begin
      rec.e := rec.e || jsonb_build_object('nom', coalesce(nullif(btrim(rec.e ->> 'nom'), ''), nullif(btrim(rec.e ->> 'designation'), ''), ''),
                                           'tarif', coalesce(nullif(btrim(rec.e ->> 'tarif'), ''), nullif(btrim(rec.e ->> 'prix_plafond'), ''), ''));
      if char_length(btrim(coalesce(rec.e ->> 'nom', ''))) < 1 then raise exception 'PP422: nom du médicament manquant'; end if;
      c := regexp_replace(coalesce(rec.e ->> 'tarif', ''), '[^0-9,.]', '', 'g');
      if c = '' and btrim(coalesce(rec.e ->> 'tarif', '')) <> '' then raise exception 'PP422: tarif invalide'; end if;
      v_tarif := case when c = '' then null else round(replace(c, ',', '.')::numeric)::int end;
      c := regexp_replace(coalesce(rec.e ->> 'taux', ''), '[^0-9,.]', '', 'g');
      v_taux := case when c = '' then null else replace(c, ',', '.')::numeric end;
      if v_taux is not null and v_taux <= 1 then v_taux := v_taux * 100; end if;  -- 0,7 → 70 %
      c := public.normalize_text(coalesce(rec.e ->> 'categorie', ''));
      v_cat := case when c = '' then null when c ~ 'dispositif|consommable' then 'dispositif' when c ~ 'dci' then 'generique_dci'
                    when c ~ 'generique' then 'generique_marque' when c ~ 'specialite|princeps' then 'specialite' else null end;
      insert into public.amo_medicines (code, name, dci, dosage, form, presentation, category, tariff_xof, rate, list_version)
      values (nullif(btrim(rec.e ->> 'code'), ''), btrim(rec.e ->> 'nom'), nullif(btrim(rec.e ->> 'dci'), ''), nullif(btrim(rec.e ->> 'dosage'), ''),
              nullif(btrim(rec.e ->> 'forme'), ''), nullif(btrim(rec.e ->> 'presentation'), ''), v_cat, v_tarif, v_taux, btrim(p_version));
      ok := ok + 1;
    exception
      when unique_violation then dup := dup + 1;
      when invalid_text_representation or numeric_value_out_of_range then errors := errors || jsonb_build_object('row', rec.line, 'error', 'tarif ou taux invalide');
      when others then errors := errors || jsonb_build_object('row', rec.line, 'error', regexp_replace(sqlerrm, '^PP[0-9]+: ', ''));
    end;
  end loop;
  perform public.log_audit('amo.import', 'amo_medicines', p_version, jsonb_build_object('imported', ok, 'duplicates', dup, 'failed', jsonb_array_length(errors), 'replaced', removed));
  return jsonb_build_object('imported', ok, 'duplicates', dup, 'failed', jsonb_array_length(errors), 'errors', errors, 'replaced', removed);
end $$;

create or replace function public.admin_amo_finish_import()
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform public.require_admin();
  n := public.amo_rematch();
  return jsonb_build_object('matched', n, 'total', (select count(*) from public.amo_medicines));
end $$;

create or replace function public.admin_amo_config(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.amo_config set
    rate_medicines = coalesce((p ->> 'rate_medicines')::numeric, rate_medicines),
    list_label = nullif(btrim(coalesce(p ->> 'list_label', '')), ''),
    list_reference = nullif(btrim(coalesce(p ->> 'list_reference', '')), ''),
    list_date = nullif(p ->> 'list_date', '')::date,
    source_url = nullif(btrim(coalesce(p ->> 'source_url', '')), ''),
    updated_at = now();
  perform public.log_audit('amo.config', 'amo_config', null, p);
exception
  when check_violation or invalid_datetime_format or invalid_text_representation then raise exception 'PP422: valeurs invalides (taux 0 à 100, lien en http)';
end $$;

-- Lien manuel : p_amo = null + p_none = true → « non pris en charge » ; p_amo = null + p_none = false → retour au rapprochement automatique
create or replace function public.admin_amo_link(p_catalog uuid, p_amo uuid, p_none boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if p_amo is null and not coalesce(p_none, false) then
    delete from public.amo_catalog_links where catalog_id = p_catalog;
    perform public.amo_rematch();
  else
    insert into public.amo_catalog_links (catalog_id, amo_id, manual) values (p_catalog, p_amo, true)
    on conflict (catalog_id) do update set amo_id = excluded.amo_id, manual = true, updated_at = now();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Pharmacies conventionnées
-- ---------------------------------------------------------------------------
create or replace function public.pharmacy_declare_amo(p_pharmacy uuid, p_conventioned boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_pharmacy_owner(p_pharmacy) then raise exception 'PP403: seul le propriétaire de la pharmacie peut faire cette déclaration'; end if;
  if exists (select 1 from public.pharmacy_amo where pharmacy_id = p_pharmacy and status = 'rejected') and coalesce(p_conventioned, false) then
    raise exception 'PP409: déclaration refusée par l''équipe PharmaProxi ; contactez-la avec le justificatif de convention';
  end if;
  if coalesce(p_conventioned, false) then
    insert into public.pharmacy_amo (pharmacy_id, status) values (p_pharmacy, 'declared')
    on conflict (pharmacy_id) do update set status = case when pharmacy_amo.status = 'verified' then 'verified' else 'declared' end, declared_at = now();
  else
    delete from public.pharmacy_amo where pharmacy_id = p_pharmacy;
  end if;
  perform public.log_audit('amo.declare', 'pharmacy', p_pharmacy::text, jsonb_build_object('conventioned', p_conventioned));
end $$;

create or replace function public.admin_set_pharmacy_amo(p_pharmacy uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin();
begin
  if p_status = 'none' then delete from public.pharmacy_amo where pharmacy_id = p_pharmacy; return; end if;
  if p_status not in ('declared', 'verified', 'rejected') then raise exception 'PP422: statut inconnu'; end if;
  insert into public.pharmacy_amo (pharmacy_id, status, verified_at, verified_by, note)
  values (p_pharmacy, p_status, case when p_status = 'verified' then now() end, case when p_status = 'verified' then uid end, nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (pharmacy_id) do update set status = excluded.status, verified_at = excluded.verified_at, verified_by = excluded.verified_by, note = excluded.note;
  perform public.log_audit('amo.verify', 'pharmacy', p_pharmacy::text, jsonb_build_object('status', p_status));
end $$;

-- ---------------------------------------------------------------------------
-- Lecture publique
-- ---------------------------------------------------------------------------
create or replace function public.amo_search(p_query text default null, p_limit int default 20, p_offset int default 0)
returns table (id uuid, code text, name text, dci text, dosage text, form text, presentation text, category text, tariff_xof int, rate numeric,
               patient_share int, list_version text, total_count bigint)
language sql stable security definer set search_path = public, extensions as $$
  with q as (select nullif(public.amo_key(left(coalesce(p_query, ''), 80)), '') as t),
       cfg as (select rate_medicines from public.amo_config)
  select a.id, a.code, a.name, a.dci, a.dosage, a.form, a.presentation, a.category, a.tariff_xof, coalesce(a.rate, cfg.rate_medicines),
         public.amo_patient_share(a.tariff_xof, a.tariff_xof, coalesce(a.rate, cfg.rate_medicines)), a.list_version, count(*) over ()
  from public.amo_medicines a cross join q cross join cfg
  where q.t is not null and not exists (select 1 from regexp_split_to_table(q.t, '\s+') w where w <> '' and a.search_text not like '%' || w || '%')
  order by (a.search_text like q.t || '%') desc, a.name, a.dosage
  limit least(greatest(coalesce(p_limit, 20), 1), 50) offset greatest(coalesce(p_offset, 0), 0)
$$;
alter function public.amo_search(text, int, int) set statement_timeout = '5s';

-- Informations AMO pour des résultats de recherche (produits + pharmacies)
create or replace function public.amo_for_results(p_catalog uuid[], p_pharmacies uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'rate', (select rate_medicines from public.amo_config),
    'products', coalesce((select jsonb_object_agg(l.catalog_id, jsonb_build_object('amo', l.amo_id is not null, 'code', a.code, 'name', a.name, 'tariff', a.tariff_xof,
                                                                       'rate', coalesce(a.rate, (select rate_medicines from public.amo_config))))
                          from public.amo_catalog_links l left join public.amo_medicines a on a.id = l.amo_id
                          where l.catalog_id = any(coalesce(p_catalog, '{}'))), '{}'::jsonb),
    'pharmacies', coalesce((select jsonb_object_agg(pharmacy_id, status) from public.pharmacy_amo
                            where pharmacy_id = any(coalesce(p_pharmacies, '{}')) and status in ('declared', 'verified')), '{}'::jsonb))
$$;

create or replace function public.amo_summary()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('total', (select count(*) from public.amo_medicines), 'rate', c.rate_medicines, 'label', c.list_label,
    'reference', c.list_reference, 'date', c.list_date, 'source', c.source_url,
    'pharmacies', (select count(*) from public.pharmacy_amo where status in ('declared', 'verified')),
    'verified', (select count(*) from public.pharmacy_amo where status = 'verified'))
  from public.amo_config c
$$;

create or replace function public.admin_amo_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return jsonb_build_object('total', (select count(*) from public.amo_medicines),
    'versions', (select coalesce(jsonb_agg(distinct list_version), '[]') from public.amo_medicines),
    'linked', (select count(*) from public.amo_catalog_links where amo_id is not null),
    'catalog', (select count(*) from public.medicine_catalog),
    'declared', (select count(*) from public.pharmacy_amo where status = 'declared'),
    'verified', (select count(*) from public.pharmacy_amo where status = 'verified'));
end $$;

revoke execute on function public.amo_rematch(), public.amo_best_match(text, text, text, text), public.admin_import_amo(text, jsonb, boolean), public.admin_amo_finish_import(), public.admin_amo_config(jsonb),
  public.admin_amo_link(uuid, uuid, boolean), public.pharmacy_declare_amo(uuid, boolean), public.admin_set_pharmacy_amo(uuid, text, text), public.admin_amo_stats() from public, anon;
grant execute on function public.admin_import_amo(text, jsonb, boolean), public.admin_amo_finish_import(), public.admin_amo_config(jsonb),
  public.admin_amo_link(uuid, uuid, boolean), public.pharmacy_declare_amo(uuid, boolean), public.admin_set_pharmacy_amo(uuid, text, text), public.admin_amo_stats() to authenticated;
revoke execute on function public.amo_rematch(), public.amo_best_match(text, text, text, text) from authenticated;
grant execute on function public.amo_patient_share(int, int, numeric), public.amo_search(text, int, int), public.amo_for_results(uuid[], uuid[]), public.amo_summary() to anon, authenticated;

-- Nouveau produit au catalogue (ou nom/dosage modifié) : rapprochement automatique immédiat
create or replace function public.amo_link_catalog()
returns trigger language plpgsql security definer set search_path = public as $$
declare m uuid;
begin
  if exists (select 1 from public.amo_catalog_links where catalog_id = new.id and manual) then return new; end if;
  delete from public.amo_catalog_links where catalog_id = new.id;
  m := public.amo_best_match(new.brand_name, new.dosage, new.form, new.packaging);
  if m is not null then insert into public.amo_catalog_links (catalog_id, amo_id, manual) values (new.id, m, false); end if;
  return new;
end $$;
drop trigger if exists medicine_catalog_amo on public.medicine_catalog;
create trigger medicine_catalog_amo after insert or update of brand_name, dosage, form, packaging, merged_into on public.medicine_catalog
  for each row execute function public.amo_link_catalog();
revoke execute on function public.amo_link_catalog() from public, anon, authenticated;
