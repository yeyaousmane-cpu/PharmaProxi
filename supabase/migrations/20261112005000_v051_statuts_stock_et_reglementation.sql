-- v051 — Statuts de stock, ajout rapide depuis le catalogue, garde-fou
--        réglementaire, recherche dans le catalogue national
--
-- Statuts (ordre d'évaluation, le premier qui s'applique gagne) :
--   non_declare  ligne ajoutée depuis le catalogue, rien de saisi encore :
--                invisible du public (on n'affirme ni présence ni absence)
--   stale        déclaration de plus de 72 h : jamais présentée comme disponible
--   on_order     rupture, mais disponible sur commande selon la pharmacie
--   unavailable  rupture
--   to_confirm   déclaration de 24 à 72 h
--   low          déclaration de moins de 24 h, quantité sous le seuil
--   available    déclaration de moins de 24 h
-- Seuils : réglages stock_fresh_hours (24) et stock_stale_hours (72).
--
-- Réglementation : un produit contrôlé (stupéfiant, psychotrope) ou réservé à
-- l'usage hospitalier ne peut pas être réservé en ligne. Les produits sur
-- ordonnance restent réservables : la pharmacie valide la demande et exige
-- l'ordonnance au retrait. La livraison n'est plus proposée.

alter table public.pharmacy_inventory
  add column if not exists on_order boolean not null default false,
  add column if not exists declared boolean not null default true;

comment on column public.pharmacy_inventory.on_order is
  'La pharmacie déclare pouvoir commander ce produit quand il est en rupture.';
comment on column public.pharmacy_inventory.declared is
  'Faux tant que la pharmacie n''a rien saisi pour une ligne ajoutée depuis le catalogue : la ligne reste invisible du public.';

create or replace function public.inventory_mark_declared()
returns trigger language plpgsql set search_path to 'public' as $f$
begin
  if not new.declared and (
       new.quantity is distinct from old.quantity or new.is_available is distinct from old.is_available
    or new.price_xof is distinct from old.price_xof or new.on_order is distinct from old.on_order
    or new.stock_updated_at is distinct from old.stock_updated_at) then
    new.declared := true;
  end if;
  return new;
end $f$;

create or replace trigger inventory_mark_declared before update on public.pharmacy_inventory
  for each row execute function public.inventory_mark_declared();

create or replace function public.stock_status(
  p_quantity integer, p_reserved integer, p_available boolean, p_updated timestamptz,
  p_threshold integer, p_on_order boolean, p_declared boolean default true, p_now timestamptz default now())
returns text language sql stable set search_path to 'public' as $f$
  select case
    when not coalesce(p_declared, true) then 'non_declare'
    when p_updated < p_now - make_interval(hours => public.setting_int('stock_stale_hours', 72)) then 'stale'
    when not p_available or (p_quantity - p_reserved) <= 0 then
      case when coalesce(p_on_order, false) then 'on_order' else 'unavailable' end
    when p_updated < p_now - make_interval(hours => public.setting_int('stock_fresh_hours', 24)) then 'to_confirm'
    when (p_quantity - p_reserved) <= coalesce(p_threshold, 0) then 'low'
    else 'available'
  end
$f$;

comment on function public.stock_status(integer, integer, boolean, timestamptz, integer, boolean, boolean, timestamptz) is
  'Statut affiché d''une ligne de stock. Jamais « disponible » au-delà de 72 h sans nouvelle déclaration.';

-- Bascule des fonctions de lecture sur stock_status, par remplacement exact.
-- Chaque remplacement est vérifié : si un fragment n'est pas trouvé, la
-- migration échoue au lieu de laisser une fonction à moitié modifiée.
do $patch$
declare
  f record; def text; nouveau text;
  appel_ancien constant text := 'public.stock_freshness(i.quantity, i.reserved_quantity, i.is_available, i.stock_updated_at)';
  appel_nouveau constant text := 'public.stock_status(i.quantity, i.reserved_quantity, i.is_available, i.stock_updated_at, i.low_stock_threshold, i.on_order, i.declared)';
begin
  for f in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('search_inventory', 'pharmacy_public_inventory', 'pharmacy_stock_page') loop
    def := pg_get_functiondef(f.oid);
    nouveau := replace(def, appel_ancien, appel_nouveau);
    if nouveau = def then raise exception 'v051 : appel à stock_freshness introuvable dans %', f.proname; end if;

    if f.proname = 'search_inventory' then
      def := nouveau;
      nouveau := replace(def, 'join public.pharmacy_inventory i on i.catalog_id = m.id', 'join public.pharmacy_inventory i on i.catalog_id = m.id and i.declared');
      if nouveau = def then raise exception 'v051 : jointure inventaire introuvable dans search_inventory'; end if;
      def := nouveau;
      nouveau := replace(def, 'r.freshness in (''available'', ''to_confirm'')', 'r.freshness in (''available'', ''low'', ''to_confirm'')');
      if nouveau = def then raise exception 'v051 : filtre de disponibilité introuvable dans search_inventory'; end if;
      def := nouveau;
      nouveau := replace(def, 'case f.freshness when ''available'' then 0 when ''to_confirm'' then 1 when ''stale'' then 2 else 3 end',
                              'case f.freshness when ''available'' then 0 when ''low'' then 0 when ''to_confirm'' then 1 when ''on_order'' then 2 when ''stale'' then 3 else 4 end');
      if nouveau = def then raise exception 'v051 : tri par disponibilité introuvable dans search_inventory'; end if;
    elsif f.proname = 'pharmacy_public_inventory' then
      def := nouveau;
      nouveau := replace(def, 'where i.pharmacy_id = p_pharmacy and coalesce(pc.is_authorized, true)', 'where i.pharmacy_id = p_pharmacy and i.declared and coalesce(pc.is_authorized, true)');
      if nouveau = def then raise exception 'v051 : filtre public introuvable dans pharmacy_public_inventory'; end if;
    end if;
    execute nouveau;
  end loop;

  -- create_order : refus des produits contrôlés ou hospitaliers, et de la livraison.
  select p.oid into f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_order';
  def := pg_get_functiondef(f.oid);
  nouveau := replace(def, 'coalesce(pc.delivery_allowed, false) as delivery_ok', 'coalesce(pc.delivery_allowed, false) as delivery_ok, c.regulatory_class as reg');
  if nouveau = def then raise exception 'v051 : sélection introuvable dans create_order'; end if;
  def := nouveau;
  nouveau := replace(def, 'if inv.id is null then raise exception ''PP422: produit introuvable dans cette pharmacie''; end if;',
    'if inv.id is null then raise exception ''PP422: produit introuvable dans cette pharmacie''; end if;'
    || ' if inv.reg in (''controle'', ''hospitalier'') then raise exception ''PP422: % ne peut pas être réservé en ligne : produit à dispensation contrôlée ou réservé à l''''usage hospitalier. Adressez-vous directement à la pharmacie avec votre ordonnance.'', inv.label; end if;');
  if nouveau = def then raise exception 'v051 : contrôle produit introuvable dans create_order'; end if;
  def := nouveau;
  nouveau := replace(def, 'if p_fulfillment = ''pickup'' and not ph.offers_pickup then',
    'if p_fulfillment = ''delivery'' then raise exception ''PP422: SantéProxi ne propose pas la livraison : choisissez le retrait en pharmacie''; end if; if p_fulfillment = ''pickup'' and not ph.offers_pickup then');
  if nouveau = def then raise exception 'v051 : contrôle du mode de retrait introuvable dans create_order'; end if;
  execute nouveau;
end
$patch$;

-- Ajout groupé depuis le catalogue national : la pharmacie coche des
-- présentations, les lignes sont créées « non déclarées » et restent
-- invisibles du public tant qu'elle n'a pas saisi quantité ou disponibilité.
create or replace function public.add_catalog_to_inventory(p_pharmacy uuid, p_catalog_ids uuid[])
returns integer language plpgsql security definer set search_path to 'public' as $f$
declare uid uuid := public.require_auth(); n int := 0; cid uuid; new_id uuid;
begin
  if not public.can_manage_pharmacy(p_pharmacy) then raise exception 'PP403: accès refusé'; end if;
  if coalesce(array_length(p_catalog_ids, 1), 0) = 0 then return 0; end if;
  if array_length(p_catalog_ids, 1) > 300 then raise exception 'PP422: 300 produits maximum par ajout'; end if;
  foreach cid in array p_catalog_ids loop
    insert into public.pharmacy_inventory (pharmacy_id, catalog_id, quantity, reserved_quantity, is_available, declared, updated_by)
    select p_pharmacy, c.id, 0, 0, false, false, uid
      from public.medicine_catalog c
     where c.id = cid and c.merged_into is null and c.review_status = 'approved' and not c.is_demo
    on conflict (pharmacy_id, catalog_id) do nothing
    returning id into new_id;
    if new_id is not null then
      insert into public.inventory_movements (inventory_id, pharmacy_id, kind, quantity_delta, quantity_after, reserved_after, note, actor_id)
      values (new_id, p_pharmacy, 'import', 0, 0, 0, 'Ajouté depuis le catalogue national, à renseigner', uid);
      n := n + 1;
      new_id := null;
    end if;
  end loop;
  return n;
end $f$;

revoke all on function public.add_catalog_to_inventory(uuid, uuid[]) from public, anon;
grant execute on function public.add_catalog_to_inventory(uuid, uuid[]) to authenticated;

-- « Disponible sur commande », pour une ou plusieurs lignes.
create or replace function public.set_inventory_on_order(p_inventory_ids uuid[], p_on_order boolean)
returns integer language plpgsql security definer set search_path to 'public' as $f$
declare uid uuid := public.require_auth(); n int := 0; r record;
begin
  if coalesce(array_length(p_inventory_ids, 1), 0) > 500 then raise exception 'PP422: trop de lignes'; end if;
  for r in select * from public.pharmacy_inventory where id = any(p_inventory_ids) for update loop
    if not public.can_manage_pharmacy(r.pharmacy_id) then raise exception 'PP403: accès refusé'; end if;
    update public.pharmacy_inventory
       set on_order = coalesce(p_on_order, false), stock_updated_at = now(), updated_by = uid
     where id = r.id;
    insert into public.inventory_movements (inventory_id, pharmacy_id, kind, quantity_after, reserved_after, price_after, note, actor_id)
    values (r.id, r.pharmacy_id, 'correction', r.quantity, r.reserved_quantity, r.price_xof,
            case when p_on_order then 'Déclaré disponible sur commande' else 'Plus disponible sur commande' end, uid);
    n := n + 1;
  end loop;
  return n;
end $f$;

revoke all on function public.set_inventory_on_order(uuid[], boolean) from public, anon;
grant execute on function public.set_inventory_on_order(uuid[], boolean) to authenticated;

-- Recherche dans le catalogue national, indépendamment des stocks. Pour chaque
-- présentation : combien de pharmacies vérifiées la déclarent actuellement
-- (disponible, stock faible ou à confirmer), sans jamais en déduire une
-- disponibilité.
create or replace function public.catalog_search(
  p_query text default null, p_family text default null, p_form text default null,
  p_regulation text default null, p_tier text default null,
  p_limit integer default 30, p_offset integer default 0)
returns table (
  catalog_id uuid, generic_name text, brand_name text, dosage text, form text,
  therapeutic_family text, family_label text, therapeutic_subfamily text,
  regulatory_class text, priority_tier text, lnme_2024 boolean, amm_status text,
  brands text, common_names text, pharmacies_declaring bigint, total_count bigint)
language sql stable security definer set search_path to 'public', 'extensions' as $f$
  with q as (select nullif(public.normalize_text(coalesce(p_query, '')), '') as t),
  base as (
    select c.*
    from public.medicine_catalog c, q
    where c.merged_into is null and c.review_status = 'approved' and not c.is_demo
      and (p_family is null or c.therapeutic_family = p_family or p_family = any(c.therapeutic_families))
      and (p_form is null or public.normalize_text(c.form) like '%' || public.normalize_text(p_form) || '%')
      and (p_regulation is null or c.regulatory_class = p_regulation)
      and (p_tier is null or c.priority_tier = p_tier)
      and (q.t is null or c.search_text like '%' || q.t || '%' or public.all_words_match(c.search_text, q.t)
           or c.search_text % q.t)
  )
  select b.id, b.generic_name, b.brand_name, b.dosage, b.form,
         b.therapeutic_family, tf.label, b.therapeutic_subfamily,
         b.regulatory_class, b.priority_tier, b.lnme_2024, b.amm_status,
         nullif(b.brand_aliases, ''), nullif(b.common_names, ''),
         (select count(distinct i.pharmacy_id) from public.pharmacy_inventory i
            join public.pharmacies ph on ph.id = i.pharmacy_id and ph.status = 'verified'
           where i.catalog_id = b.id and i.declared
             and public.stock_status(i.quantity, i.reserved_quantity, i.is_available, i.stock_updated_at,
                                     i.low_stock_threshold, i.on_order, i.declared) in ('available', 'low', 'to_confirm')),
         count(*) over ()
  from base b
  left join public.therapeutic_families tf on tf.slug = b.therapeutic_family, q
  order by case when q.t is null then 0 else (public.all_words_match(b.search_text, q.t))::int end desc,
           (q.t is not null and public.normalize_text(b.generic_name) like q.t || '%') desc,
           (position('+' in b.generic_name) > 0) asc,
           coalesce(similarity(b.search_text, q.t), 0) desc,
           b.generic_name, b.form, b.dosage
  limit least(greatest(coalesce(p_limit, 30), 1), 60)
  offset least(greatest(coalesce(p_offset, 0), 0), 2000)
$f$;

revoke all on function public.catalog_search(text, text, text, text, text, integer, integer) from public;
grant execute on function public.catalog_search(text, text, text, text, text, integer, integer) to anon, authenticated;
