-- ============================================================================
-- PharmaProxi — Migration 0004 : logique métier côté base de données
-- Toutes les opérations sensibles passent par des fonctions SECURITY DEFINER
-- qui vérifient explicitement l'identité (auth.uid()) et les droits, et
-- s'exécutent dans une transaction unique.
-- Codes d'erreur : les messages commencent par un code stable « PPxxx: »
-- interprété par l'interface.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Utilitaires
-- ---------------------------------------------------------------------------
create or replace function public.require_auth()
returns uuid language plpgsql stable as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'PP401: authentification requise' using errcode = '28000'; end if;
  return uid;
end $$;

create or replace function public.require_admin()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public.require_auth();
begin
  if not public.is_admin() then raise exception 'PP403: action réservée à l''administration' using errcode = '42501'; end if;
  return uid;
end $$;

create or replace function public.valid_phone(p text)
returns boolean language sql immutable as $$ select p ~ '^\+[1-9][0-9]{7,14}$' $$;

create or replace function public.notify_user(p_user uuid, p_kind text, p_title text, p_body text, p_order uuid default null, p_link text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications (user_id, kind, title, body, order_id, link)
  values (p_user, p_kind, p_title, p_body, p_order, p_link);
end $$;

create or replace function public.notify_pharmacy(p_pharmacy uuid, p_kind text, p_title text, p_body text, p_order uuid default null, p_link text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body, order_id, link)
  select m.user_id, p_kind, p_title, p_body, p_order, p_link
  from public.pharmacy_members m where m.pharmacy_id = p_pharmacy;
$$;

create or replace function public.order_status_label(s public.order_status)
returns text language sql immutable as $$
  select case s
    when 'pending_confirmation' then 'En attente de confirmation'
    when 'confirmed' then 'Confirmée par la pharmacie'
    when 'preparing' then 'En préparation'
    when 'ready_for_pickup' then 'Prête au retrait'
    when 'awaiting_courier' then 'En attente d''affectation d''un livreur'
    when 'courier_assigned' then 'Livreur affecté'
    when 'in_delivery' then 'En cours de livraison'
    when 'delivered' then 'Livrée'
    when 'completed' then 'Retirée en pharmacie'
    when 'cancelled' then 'Annulée'
    when 'rejected' then 'Refusée par la pharmacie'
    when 'expired' then 'Expirée'
    when 'delivery_failed' then 'Échec de livraison'
  end
$$;

create or replace function public.is_terminal_status(s public.order_status)
returns boolean language sql immutable as $$
  select s in ('delivered', 'completed', 'cancelled', 'rejected', 'expired', 'delivery_failed')
$$;

-- ---------------------------------------------------------------------------
-- Garde-fou : un pharmacien ne peut pas modifier le statut de vérification
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER volontaire : current_user doit refléter le rôle de l'appelant
create or replace function public.pharmacies_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Les fonctions SECURITY DEFINER (propriétaire) et service_role ne sont pas concernées
  if current_user not in ('authenticated', 'anon') or auth.uid() is null then return new; end if;
  if new.is_demo is distinct from old.is_demo then
    raise exception 'PP403: champ non modifiable';
  end if;
  if not public.is_admin() and (
       new.status is distinct from old.status
    or new.verified_at is distinct from old.verified_at
    or new.hours_verified is distinct from old.hours_verified) then
    raise exception 'PP403: champ réservé à l''administration';
  end if;
  -- Toute modification des horaires par la pharmacie annule leur vérification
  if new.opening_hours is distinct from old.opening_hours and not public.is_admin() then
    new.hours_verified := false;
  end if;
  return new;
end $$;
create trigger pharmacies_guard before update on public.pharmacies
  for each row execute function public.pharmacies_guard();

-- Validation de la structure des horaires
create or replace function public.valid_opening_hours(h jsonb)
returns boolean language plpgsql immutable as $$
declare k text; slot jsonb;
begin
  if h is null or jsonb_typeof(h) <> 'object' then return false; end if;
  for k in select jsonb_object_keys(h) loop
    if k not in ('mon','tue','wed','thu','fri','sat','sun') then return false; end if;
    if jsonb_typeof(h -> k) <> 'array' then return false; end if;
    for slot in select * from jsonb_array_elements(h -> k) loop
      if jsonb_typeof(slot) <> 'array' or jsonb_array_length(slot) <> 2 then return false; end if;
      if (slot ->> 0) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (slot ->> 1) !~ '^([01][0-9]|2[0-4]):[0-5][0-9]$' then return false; end if;
    end loop;
  end loop;
  return true;
end $$;
alter table public.pharmacies add constraint pharmacies_hours_valid check (public.valid_opening_hours(opening_hours));

-- ---------------------------------------------------------------------------
-- Inscription d'une pharmacie (statut « pending », jamais vérifiée d'office)
-- ---------------------------------------------------------------------------
create or replace function public.register_pharmacy(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_auth();
  pid uuid;
  v_region uuid := (p ->> 'region_id')::uuid;
  v_circle uuid := nullif(p ->> 'circle_id', '')::uuid;
  v_commune uuid := nullif(p ->> 'commune_id', '')::uuid;
  v_locality uuid := nullif(p ->> 'locality_id', '')::uuid;
  pending_count int;
begin
  select count(*) into pending_count
  from public.pharmacy_members m join public.pharmacies ph on ph.id = m.pharmacy_id
  where m.user_id = uid and ph.status = 'pending';
  if pending_count >= 3 then raise exception 'PP429: trop de demandes d''inscription en attente'; end if;

  if v_region is null or not exists (select 1 from public.regions where id = v_region) then
    raise exception 'PP422: région invalide';
  end if;
  if v_commune is not null and not exists (select 1 from public.communes where id = v_commune and region_id = v_region) then
    raise exception 'PP422: la commune ne correspond pas à la région';
  end if;
  if v_circle is not null and not exists (select 1 from public.circles where id = v_circle and region_id = v_region) then
    raise exception 'PP422: le cercle ne correspond pas à la région';
  end if;
  if v_locality is not null and (v_commune is null or not exists (select 1 from public.localities where id = v_locality and commune_id = v_commune)) then
    raise exception 'PP422: le quartier ne correspond pas à la commune';
  end if;
  if coalesce(trim(p ->> 'pharmacist_in_charge'), '') = '' then
    raise exception 'PP422: le nom du pharmacien responsable est obligatoire';
  end if;

  insert into public.pharmacies (name, address, region_id, circle_id, commune_id, locality_id, latitude, longitude,
                                 phone, whatsapp, email, opening_hours, offers_pickup, offers_delivery, created_by)
  values (trim(p ->> 'name'), trim(p ->> 'address'), v_region, v_circle, v_commune, v_locality,
          nullif(p ->> 'latitude', '')::double precision, nullif(p ->> 'longitude', '')::double precision,
          p ->> 'phone', nullif(p ->> 'whatsapp', ''), nullif(p ->> 'email', ''),
          coalesce(p -> 'opening_hours', '{}'::jsonb), coalesce((p ->> 'offers_pickup')::boolean, true),
          coalesce((p ->> 'offers_delivery')::boolean, false), uid)
  returning id into pid;

  insert into public.pharmacy_private (pharmacy_id, legal_name, license_number, pharmacist_in_charge, manager_phone, order_registration, tax_id, rccm)
  values (pid, nullif(p ->> 'legal_name', ''), nullif(p ->> 'license_number', ''), trim(p ->> 'pharmacist_in_charge'),
          nullif(p ->> 'manager_phone', ''), nullif(p ->> 'order_registration', ''), nullif(p ->> 'tax_id', ''), nullif(p ->> 'rccm', ''));

  insert into public.pharmacy_members (pharmacy_id, user_id, member_role) values (pid, uid, 'owner');
  insert into public.user_roles (user_id, role) values (uid, 'pharmacist') on conflict do nothing;
  insert into public.pharmacy_verifications (pharmacy_id, decision, reason, reviewer_id)
  values (pid, 'pending', 'Demande d''inscription déposée', uid);

  perform public.log_audit('pharmacy.register', 'pharmacy', pid::text, jsonb_build_object('name', p ->> 'name'));
  return pid;
end $$;

-- Nouvelle soumission après un refus (corrections effectuées)
create or replace function public.resubmit_pharmacy(p_pharmacy uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth();
begin
  if not public.is_pharmacy_member(p_pharmacy) then raise exception 'PP403: accès refusé'; end if;
  perform set_config('pharmaproxi.internal', 'on', true);
  update public.pharmacies set status = 'pending' where id = p_pharmacy and status = 'rejected';
  if not found then raise exception 'PP409: seule une demande refusée peut être soumise à nouveau'; end if;
  perform set_config('pharmaproxi.internal', 'off', true);
  insert into public.pharmacy_verifications (pharmacy_id, decision, reason, reviewer_id)
  values (p_pharmacy, 'pending', 'Nouvelle soumission après corrections', uid);
  perform public.log_audit('pharmacy.resubmit', 'pharmacy', p_pharmacy::text);
end $$;

-- ---------------------------------------------------------------------------
-- Vérification administrative des pharmacies
-- Transitions autorisées :
--   pending   -> verified | rejected
--   verified  -> suspended
--   suspended -> verified (réactivation) | rejected
-- ---------------------------------------------------------------------------
create or replace function public.admin_review_pharmacy(p_pharmacy uuid, p_decision public.pharmacy_status, p_reason text default null, p_checklist jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_admin();
  cur public.pharmacy_status;
  pname text;
begin
  select status, name into cur, pname from public.pharmacies where id = p_pharmacy for update;
  if cur is null then raise exception 'PP404: pharmacie introuvable'; end if;
  if not (
    (cur = 'pending' and p_decision in ('verified', 'rejected')) or
    (cur = 'verified' and p_decision = 'suspended') or
    (cur = 'suspended' and p_decision in ('verified', 'rejected'))
  ) then
    raise exception 'PP409: transition % -> % non autorisée', cur, p_decision;
  end if;
  if p_decision in ('rejected', 'suspended') and coalesce(trim(p_reason), '') = '' then
    raise exception 'PP422: un motif est obligatoire pour un refus ou une suspension';
  end if;
  if p_decision = 'verified' and cur = 'pending' and not exists (select 1 from public.pharmacy_documents where pharmacy_id = p_pharmacy) then
    raise exception 'PP422: aucun justificatif déposé, validation impossible';
  end if;

  perform set_config('pharmaproxi.internal', 'on', true);
  update public.pharmacies
     set status = p_decision,
         verified_at = case when p_decision = 'verified' then now() else verified_at end
   where id = p_pharmacy;
  perform set_config('pharmaproxi.internal', 'off', true);

  insert into public.pharmacy_verifications (pharmacy_id, decision, reason, checklist, reviewer_id)
  values (p_pharmacy, p_decision, p_reason, coalesce(p_checklist, '{}'::jsonb), uid);

  perform public.log_audit('pharmacy.review', 'pharmacy', p_pharmacy::text,
    jsonb_build_object('from', cur, 'to', p_decision, 'reason', p_reason));

  perform public.notify_pharmacy(p_pharmacy, 'pharmacy_review',
    case p_decision when 'verified' then 'Pharmacie vérifiée'
                    when 'rejected' then 'Demande d''inscription refusée'
                    when 'suspended' then 'Pharmacie suspendue' else 'Statut mis à jour' end,
    coalesce(p_reason, pname), null, '/pharmacien');
end $$;

create or replace function public.admin_set_hours_verified(p_pharmacy uuid, p_verified boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.pharmacies set hours_verified = p_verified where id = p_pharmacy;
  perform public.log_audit('pharmacy.hours_verified', 'pharmacy', p_pharmacy::text, jsonb_build_object('verified', p_verified));
end $$;

-- ---------------------------------------------------------------------------
-- Catalogue : création avec dédoublonnage
-- ---------------------------------------------------------------------------
create or replace function public.upsert_catalog_item(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_auth();
  admin boolean := public.is_admin();
  cid uuid;
  v_brand text := trim(p ->> 'brand_name');
  v_category uuid := nullif(p ->> 'category_id', '')::uuid;
  cat_rx boolean := false;
begin
  if not (admin or public.has_role('pharmacist')) then raise exception 'PP403: accès refusé'; end if;
  if v_brand is null or char_length(v_brand) < 2 then raise exception 'PP422: nom commercial obligatoire'; end if;
  if v_category is not null then
    select requires_prescription into cat_rx from public.product_categories where id = v_category and is_authorized;
    if not found then raise exception 'PP422: catégorie de produit non autorisée'; end if;
  end if;

  select id into cid from public.medicine_catalog
   where merged_into is null and review_status <> 'rejected'
     and public.normalize_text(brand_name) = public.normalize_text(v_brand)
     and public.normalize_text(coalesce(dosage, '')) = public.normalize_text(coalesce(p ->> 'dosage', ''))
     and public.normalize_text(coalesce(form, '')) = public.normalize_text(coalesce(p ->> 'form', ''))
     and public.normalize_text(coalesce(packaging, '')) = public.normalize_text(coalesce(p ->> 'packaging', ''));
  if cid is not null then return cid; end if;

  insert into public.medicine_catalog (brand_name, generic_name, active_ingredient, dosage, form, packaging, manufacturer,
                                       category_id, requires_prescription, review_status, created_by)
  values (v_brand, nullif(trim(p ->> 'generic_name'), ''), nullif(trim(p ->> 'active_ingredient'), ''),
          nullif(trim(p ->> 'dosage'), ''), nullif(trim(p ->> 'form'), ''), nullif(trim(p ->> 'packaging'), ''),
          nullif(trim(p ->> 'manufacturer'), ''), v_category,
          coalesce((p ->> 'requires_prescription')::boolean, false) or coalesce(cat_rx, false),
          case when admin then 'approved' else 'pending' end, uid)
  returning id into cid;
  return cid;
end $$;

-- ---------------------------------------------------------------------------
-- Stocks
-- ---------------------------------------------------------------------------
create or replace function public.set_inventory(
  p_pharmacy uuid, p_catalog uuid, p_quantity int, p_price int, p_available boolean default true,
  p_threshold int default null, p_note text default null, p_kind public.movement_kind default 'adjustment')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_auth();
  inv public.pharmacy_inventory%rowtype;
  old_free int;
  new_free int;
  cat record;
begin
  if not public.can_manage_pharmacy(p_pharmacy) then raise exception 'PP403: vous ne gérez pas cette pharmacie'; end if;
  if p_quantity is null or p_quantity < 0 or p_quantity > 1000000 then raise exception 'PP422: quantité invalide'; end if;
  if p_price is not null and (p_price < 0 or p_price > 10000000) then raise exception 'PP422: prix invalide'; end if;

  select c.id, c.merged_into, c.review_status, coalesce(pc.is_authorized, true) as authorized
    into cat
    from public.medicine_catalog c left join public.product_categories pc on pc.id = c.category_id
   where c.id = p_catalog;
  if cat.id is null then raise exception 'PP404: produit introuvable dans le catalogue'; end if;
  if cat.merged_into is not null then raise exception 'PP409: produit fusionné, utilisez la fiche de référence'; end if;
  if cat.review_status = 'rejected' or not cat.authorized then raise exception 'PP422: produit non autorisé sur la plateforme'; end if;

  select * into inv from public.pharmacy_inventory where pharmacy_id = p_pharmacy and catalog_id = p_catalog for update;
  if inv.id is null then
    insert into public.pharmacy_inventory (pharmacy_id, catalog_id, price_xof, quantity, is_available, low_stock_threshold, stock_updated_at, updated_by)
    values (p_pharmacy, p_catalog, p_price, p_quantity, coalesce(p_available, true), coalesce(p_threshold, 5), now(), uid)
    returning * into inv;
    insert into public.inventory_movements (inventory_id, pharmacy_id, kind, quantity_delta, quantity_after, reserved_after, price_after, note, actor_id)
    values (inv.id, p_pharmacy, p_kind, p_quantity, p_quantity, 0, p_price, p_note, uid);
    old_free := 1000000000;
  else
    if p_quantity < inv.reserved_quantity then
      raise exception 'PP409: la quantité (%) ne peut pas être inférieure à la quantité réservée (%)', p_quantity, inv.reserved_quantity;
    end if;
    old_free := inv.quantity - inv.reserved_quantity;
    update public.pharmacy_inventory
       set quantity = p_quantity, price_xof = p_price, is_available = coalesce(p_available, is_available),
           low_stock_threshold = coalesce(p_threshold, low_stock_threshold), stock_updated_at = now(), updated_by = uid
     where id = inv.id
     returning * into inv;
    insert into public.inventory_movements (inventory_id, pharmacy_id, kind, quantity_delta, quantity_after, reserved_after, price_after, note, actor_id)
    values (inv.id, p_pharmacy, p_kind, p_quantity - (old_free + inv.reserved_quantity), inv.quantity, inv.reserved_quantity, inv.price_xof, p_note, uid);
  end if;

  new_free := inv.quantity - inv.reserved_quantity;
  if inv.is_available and new_free <= inv.low_stock_threshold and old_free > inv.low_stock_threshold then
    perform public.notify_pharmacy(p_pharmacy, 'low_stock', 'Stock faible',
      (select brand_name from public.medicine_catalog where id = p_catalog) || ' : ' || new_free || ' unité(s) disponible(s)', null, '/pharmacien/stocks');
  end if;
  return inv.id;
end $$;

-- Confirmation rapide « stock toujours exact » (mise à jour depuis un téléphone)
create or replace function public.confirm_inventory_fresh(p_inventory_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); n int := 0; r record;
begin
  if coalesce(array_length(p_inventory_ids, 1), 0) > 500 then raise exception 'PP422: trop de lignes'; end if;
  for r in select * from public.pharmacy_inventory where id = any(p_inventory_ids) for update loop
    if not public.can_manage_pharmacy(r.pharmacy_id) then raise exception 'PP403: accès refusé'; end if;
    update public.pharmacy_inventory set stock_updated_at = now(), updated_by = uid where id = r.id;
    insert into public.inventory_movements (inventory_id, pharmacy_id, kind, quantity_after, reserved_after, price_after, note, actor_id)
    values (r.id, r.pharmacy_id, 'correction', r.quantity, r.reserved_quantity, r.price_xof, 'Stock confirmé à l''identique', uid);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Import CSV (lignes déjà analysées côté serveur). Chaque ligne est isolée :
-- une ligne invalide n'annule pas les autres, le rapport détaille les erreurs.
create or replace function public.import_inventory(p_pharmacy uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb; i int := 0; ok int := 0; errors jsonb := '[]'::jsonb; cid uuid;
begin
  perform public.require_auth();
  if not public.can_manage_pharmacy(p_pharmacy) then raise exception 'PP403: vous ne gérez pas cette pharmacie'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'PP422: 2000 lignes maximum par import';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    begin
      cid := public.upsert_catalog_item(r);
      perform public.set_inventory(p_pharmacy, cid, (r ->> 'quantity')::int, nullif(r ->> 'price_xof', '')::int,
                                   coalesce((r ->> 'is_available')::boolean, true), null, 'Import CSV', 'import');
      ok := ok + 1;
    exception when others then
      errors := errors || jsonb_build_object('row', i, 'error', regexp_replace(sqlerrm, '^PP[0-9]+: ', ''));
    end;
  end loop;
  return jsonb_build_object('imported', ok, 'failed', jsonb_array_length(errors), 'errors', errors);
end $$;

-- ---------------------------------------------------------------------------
-- Recherche publique
-- ---------------------------------------------------------------------------
-- Tous les mots de la requête (≥ 2 caractères) figurent dans le texte, dans n'importe quel ordre
create or replace function public.all_words_match(p_text text, p_query text)
returns boolean language sql immutable parallel safe as $$
  select coalesce(bool_and(p_text like '%' || w || '%'), false)
  from unnest(string_to_array(p_query, ' ')) as w
  where char_length(w) >= 2
$$;

create or replace function public.search_inventory(
  p_query text,
  p_region uuid default null,
  p_commune uuid default null,
  p_locality uuid default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_max_km double precision default null,
  p_open_only boolean default false,
  p_max_price int default null,
  p_include_unavailable boolean default true,
  p_sort text default 'relevance',
  p_limit int default 20,
  p_offset int default 0,
  p_catalog uuid default null
) returns table (
  inventory_id uuid, pharmacy_id uuid, pharmacy_name text, address text,
  region_name text, commune_name text, locality_name text, phone text, whatsapp text,
  latitude double precision, longitude double precision, is_open boolean, hours_verified boolean,
  offers_pickup boolean, offers_delivery boolean,
  catalog_id uuid, brand_name text, generic_name text, active_ingredient text, dosage text, form text, packaging text,
  requires_prescription boolean, price_xof int, freshness text, stock_updated_at timestamptz,
  distance_km double precision, relevance real, total_count bigint
) language plpgsql volatile security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare
  q text := public.normalize_text(p_query);
  lim int := least(greatest(coalesce(p_limit, 20), 1), 50);
  off int := least(greatest(coalesce(p_offset, 0), 0), 1000);
  n bigint;
begin
  if p_catalog is null and char_length(q) < 2 then return; end if;
  if char_length(q) > 100 then q := left(q, 100); end if;

  return query
  with matches as (
    select c.*, case when p_catalog is not null then 1
                     else greatest(similarity(c.search_text, q),
                                   case when c.search_text like '%' || q || '%' then 0.9 when public.all_words_match(c.search_text, q) then 0.7 else 0 end) end::real as rel
    from public.medicine_catalog c
    left join public.product_categories pc on pc.id = c.category_id
    where c.merged_into is null and c.review_status <> 'rejected' and coalesce(pc.is_authorized, true)
      and (case when p_catalog is not null then c.id = p_catalog
                else (c.search_text like '%' || q || '%' or c.search_text % q or public.all_words_match(c.search_text, q)) end)
  ), rows as (
    select i.id as inventory_id, ph.id as pharmacy_id, ph.name as pharmacy_name, ph.address,
           rg.name as region_name, cm.name as commune_name, lc.name as locality_name, ph.phone, ph.whatsapp,
           ph.latitude, ph.longitude, public.is_open_now(ph.opening_hours, ph.hours_verified) as is_open, ph.hours_verified,
           ph.offers_pickup, ph.offers_delivery,
           m.id as catalog_id, m.brand_name, m.generic_name, m.active_ingredient, m.dosage, m.form, m.packaging,
           m.requires_prescription, i.price_xof,
           public.stock_freshness(i.quantity, i.reserved_quantity, i.is_available, i.stock_updated_at) as freshness,
           i.stock_updated_at,
           public.distance_km(p_lat, p_lng, ph.latitude, ph.longitude) as distance_km,
           m.rel as relevance
    from matches m
    join public.pharmacy_inventory i on i.catalog_id = m.id
    join public.pharmacies ph on ph.id = i.pharmacy_id and ph.status = 'verified'
    join public.regions rg on rg.id = ph.region_id
    left join public.communes cm on cm.id = ph.commune_id
    left join public.localities lc on lc.id = ph.locality_id
    where (p_region is null or ph.region_id = p_region)
      and (p_commune is null or ph.commune_id = p_commune)
      and (p_locality is null or ph.locality_id = p_locality)
      and (p_max_price is null or (i.price_xof is not null and i.price_xof <= p_max_price))
  ), filtered as (
    select * from rows r
    where (not coalesce(p_open_only, false) or r.is_open is true)
      and (coalesce(p_include_unavailable, true) or r.freshness in ('available', 'to_confirm'))
      and (p_max_km is null or (r.distance_km is not null and r.distance_km <= p_max_km))
  )
  select f.*, count(*) over () as total_count
  from filtered f
  order by
    case when p_sort = 'distance' then coalesce(f.distance_km, 1e9) end asc,
    case when p_sort = 'price' then coalesce(f.price_xof, 2147483647) end asc,
    case f.freshness when 'available' then 0 when 'to_confirm' then 1 when 'stale' then 2 else 3 end asc,
    case when p_sort = 'freshness' then f.stock_updated_at end desc,
    f.relevance desc, f.stock_updated_at desc, f.inventory_id
  limit lim offset off;

  if off = 0 and p_catalog is null then
    get diagnostics n = row_count;
    insert into public.search_logs (query_normalized, region_id, commune_id, result_count)
    values (q, p_region, p_commune, n);
  end if;
end $$;

-- Suggestions (catalogue seul : ne dit rien de la disponibilité)
create or replace function public.suggest_medicines(p_query text, p_limit int default 8)
returns table (catalog_id uuid, label text, active_ingredient text)
language sql stable security definer set search_path = public, extensions as $$
  select c.id, c.brand_name || coalesce(' ' || c.dosage, '') || coalesce(' — ' || c.form, ''), c.active_ingredient
  from public.medicine_catalog c
  where char_length(public.normalize_text(p_query)) >= 2
    and c.merged_into is null and c.review_status <> 'rejected'
    and (c.search_text like '%' || public.normalize_text(p_query) || '%' or c.search_text % public.normalize_text(p_query)
         or public.all_words_match(c.search_text, public.normalize_text(p_query)))
  order by (c.search_text like public.normalize_text(p_query) || '%') desc, similarity(c.search_text, public.normalize_text(p_query)) desc
  limit least(greatest(coalesce(p_limit, 8), 1), 20)
$$;

-- Stock public d'une pharmacie (sans quantités exactes)
create or replace function public.pharmacy_public_inventory(p_pharmacy uuid, p_query text default null, p_limit int default 50, p_offset int default 0)
returns table (inventory_id uuid, catalog_id uuid, brand_name text, generic_name text, active_ingredient text, dosage text, form text,
               packaging text, requires_prescription boolean, delivery_allowed boolean, price_xof int, freshness text,
               stock_updated_at timestamptz, total_count bigint)
language sql stable security definer set search_path = public, extensions as $$
  select i.id, c.id, c.brand_name, c.generic_name, c.active_ingredient, c.dosage, c.form, c.packaging,
         c.requires_prescription or coalesce(pc.requires_prescription, false),
         coalesce(pc.delivery_allowed, false) and not (c.requires_prescription or coalesce(pc.requires_prescription, false)),
         i.price_xof, public.stock_freshness(i.quantity, i.reserved_quantity, i.is_available, i.stock_updated_at), i.stock_updated_at,
         count(*) over ()
  from public.pharmacy_inventory i
  join public.pharmacies ph on ph.id = i.pharmacy_id and ph.status = 'verified'
  join public.medicine_catalog c on c.id = i.catalog_id and c.merged_into is null
  left join public.product_categories pc on pc.id = c.category_id
  where i.pharmacy_id = p_pharmacy and coalesce(pc.is_authorized, true)
    and (p_query is null or char_length(trim(p_query)) = 0 or c.search_text like '%' || public.normalize_text(p_query) || '%')
  order by c.brand_name
  limit least(greatest(coalesce(p_limit, 50), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
$$;

-- ---------------------------------------------------------------------------
-- Commandes
-- ---------------------------------------------------------------------------
create or replace function public.create_order(
  p_pharmacy uuid, p_items jsonb, p_fulfillment public.fulfillment_mode, p_idempotency_key text,
  p_address_id uuid default null, p_note text default null, p_delivery_instructions text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_auth();
  existing uuid;
  ph public.pharmacies%rowtype;
  addr public.customer_addresses%rowtype;
  oid uuid;
  it jsonb;
  inv record;
  v_qty int;
  subtotal int := 0;
  fee int := 0;
  has_rx boolean := false;
  restricted boolean := false;
  max_items int := public.setting_int('max_items_per_order', 10);
  max_qty int := public.setting_int('max_quantity_per_item', 20);
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 then raise exception 'PP422: clé d''idempotence manquante'; end if;
  select id into existing from public.orders where customer_id = uid and idempotency_key = p_idempotency_key;
  if existing is not null then return existing; end if;

  if not public.setting_bool('orders_enabled', true) then raise exception 'PP503: les demandes de réservation sont momentanément désactivées'; end if;
  if exists (select 1 from public.profiles where id = uid and deleted_at is not null) then raise exception 'PP403: compte supprimé'; end if;

  select * into ph from public.pharmacies where id = p_pharmacy;
  if ph.id is null or ph.status <> 'verified' then raise exception 'PP422: pharmacie indisponible'; end if;
  if exists (select 1 from public.pharmacy_members where pharmacy_id = p_pharmacy and user_id = uid) then
    raise exception 'PP422: vous ne pouvez pas commander auprès de votre propre pharmacie';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'PP422: aucun produit sélectionné'; end if;
  if jsonb_array_length(p_items) > max_items then raise exception 'PP422: % produits maximum par commande', max_items; end if;

  if p_fulfillment = 'pickup' and not ph.offers_pickup then raise exception 'PP422: cette pharmacie ne propose pas le retrait'; end if;
  if p_fulfillment = 'delivery' then
    if not public.setting_bool('delivery_enabled', false) then
      raise exception 'PP422: la livraison n''est pas encore activée sur la plateforme';
    end if;
    if not ph.offers_delivery then raise exception 'PP422: cette pharmacie ne propose pas la livraison'; end if;
    select * into addr from public.customer_addresses where id = p_address_id and user_id = uid;
    if addr.id is null then raise exception 'PP422: adresse de livraison invalide'; end if;
    fee := public.setting_int('default_delivery_fee_xof', 1000);
  end if;

  insert into public.orders (customer_id, pharmacy_id, fulfillment, payment_method, delivery_fee_xof, idempotency_key, confirmation_expires_at)
  values (uid, p_pharmacy, p_fulfillment,
          case when p_fulfillment = 'delivery' then 'cash_on_delivery' else 'pay_at_pharmacy' end::public.payment_method,
          fee, p_idempotency_key, now() + make_interval(mins => public.setting_int('confirmation_ttl_minutes', 60)))
  returning id into oid;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it ->> 'quantity')::int;
    if v_qty is null or v_qty < 1 or v_qty > max_qty then raise exception 'PP422: quantité invalide (1 à %)', max_qty; end if;
    select i.id, i.catalog_id, i.price_xof, i.is_available, i.quantity, i.reserved_quantity,
           c.brand_name || coalesce(' ' || c.dosage, '') || coalesce(' (' || c.form || ')', '') as label,
           c.requires_prescription or coalesce(pc.requires_prescription, false) as rx,
           coalesce(pc.delivery_allowed, false) as delivery_ok
      into inv
      from public.pharmacy_inventory i
      join public.medicine_catalog c on c.id = i.catalog_id
      left join public.product_categories pc on pc.id = c.category_id
     where i.id = (it ->> 'inventory_id')::uuid and i.pharmacy_id = p_pharmacy;
    if inv.id is null then raise exception 'PP422: produit introuvable dans cette pharmacie'; end if;
    if not inv.is_available or inv.quantity - inv.reserved_quantity <= 0 then
      raise exception 'PP409: % est déclaré indisponible', inv.label;
    end if;
    if inv.price_xof is null then raise exception 'PP422: prix non renseigné pour %, contactez la pharmacie', inv.label; end if;
    has_rx := has_rx or inv.rx;
    restricted := restricted or inv.rx or not inv.delivery_ok;
    insert into public.order_items (order_id, inventory_id, catalog_id, product_label, quantity, unit_price_xof, requires_prescription)
    values (oid, inv.id, inv.catalog_id, inv.label, v_qty, inv.price_xof, inv.rx);
    subtotal := subtotal + v_qty * inv.price_xof;
  end loop;

  if p_fulfillment = 'delivery' and restricted then
    raise exception 'PP422: au moins un produit ne peut pas être livré (ordonnance ou catégorie non autorisée à la livraison). Choisissez le retrait en pharmacie.';
  end if;

  update public.orders set subtotal_xof = subtotal, has_prescription_items = has_rx where id = oid;

  if nullif(trim(p_note), '') is not null then
    insert into public.order_private_notes (order_id, customer_note) values (oid, left(trim(p_note), 500));
  end if;

  if p_fulfillment = 'delivery' then
    insert into public.deliveries (order_id, fee_xof, dropoff_address, dropoff_landmark, dropoff_contact_phone, dropoff_latitude, dropoff_longitude, instructions)
    values (oid, fee, addr.address_line, addr.landmark, addr.contact_phone, addr.latitude, addr.longitude, left(nullif(trim(p_delivery_instructions), ''), 300));
  end if;

  insert into public.order_status_history (order_id, from_status, to_status, actor_id) values (oid, null, 'pending_confirmation', uid);
  perform public.notify_pharmacy(p_pharmacy, 'order_new', 'Nouvelle demande',
    'Une demande de ' || case when p_fulfillment = 'delivery' then 'livraison' else 'retrait' end || ' attend votre confirmation.', oid, '/pharmacien/commandes/' || oid);
  return oid;
exception when unique_violation then
  select id into existing from public.orders where customer_id = uid and idempotency_key = p_idempotency_key;
  if existing is not null then return existing; end if;
  raise;
end $$;

-- Libération / consommation des réservations (interne)
create or replace function public._close_reservations(p_order uuid, p_mode text, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  -- verrouillage dans un ordre déterministe pour éviter les interblocages
  for r in
    select sr.*, i.quantity as inv_qty, i.reserved_quantity as inv_res
    from public.stock_reservations sr join public.pharmacy_inventory i on i.id = sr.inventory_id
    where sr.order_id = p_order and sr.status = 'active'
    order by sr.inventory_id
    for update of sr, i
  loop
    if p_mode = 'consume' then
      update public.pharmacy_inventory
         set quantity = quantity - r.quantity, reserved_quantity = reserved_quantity - r.quantity
       where id = r.inventory_id;
      update public.stock_reservations set status = 'consumed', closed_at = now() where id = r.id;
      insert into public.inventory_movements (inventory_id, pharmacy_id, kind, quantity_delta, reserved_delta, quantity_after, reserved_after, order_id, actor_id)
      select r.inventory_id, i.pharmacy_id, 'sale', -r.quantity, -r.quantity, i.quantity, i.reserved_quantity, p_order, p_actor
      from public.pharmacy_inventory i where i.id = r.inventory_id;
    else
      update public.pharmacy_inventory set reserved_quantity = reserved_quantity - r.quantity where id = r.inventory_id;
      update public.stock_reservations
         set status = case when p_mode = 'expire' then 'expired' else 'released' end::public.reservation_status, closed_at = now()
       where id = r.id;
      insert into public.inventory_movements (inventory_id, pharmacy_id, kind, reserved_delta, quantity_after, reserved_after, order_id, actor_id, note)
      select r.inventory_id, i.pharmacy_id, case when p_mode = 'return' then 'return' else 'release' end::public.movement_kind,
             -r.quantity, i.quantity, i.reserved_quantity, p_order, p_actor, p_mode
      from public.pharmacy_inventory i where i.id = r.inventory_id;
    end if;
  end loop;
end $$;
revoke execute on function public._close_reservations(uuid, text, uuid) from public, anon, authenticated;

-- Changement de statut (interne, sans contrôle de droits — appelé par les fonctions publiques)
create or replace function public._set_order_status(p_order uuid, p_to public.order_status, p_actor uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order;
  update public.orders set status = p_to,
         cancellation_reason = case when p_to = 'cancelled' then coalesce(p_note, cancellation_reason) else cancellation_reason end,
         cancelled_by = case when p_to = 'cancelled' then p_actor else cancelled_by end,
         rejection_reason = case when p_to = 'rejected' then p_note else rejection_reason end,
         payment_status = case when p_to in ('cancelled', 'expired', 'delivery_failed', 'rejected') and payment_status = 'paid' then 'refund_pending' else payment_status end
   where id = p_order;
  insert into public.order_status_history (order_id, from_status, to_status, actor_id, note) values (p_order, o.status, p_to, p_actor, p_note);

  -- Effets sur les stocks
  if p_to in ('completed', 'delivered') then
    perform public._close_reservations(p_order, 'consume', p_actor);
  elsif p_to = 'delivery_failed' then
    perform public._close_reservations(p_order, 'return', p_actor);
  elsif p_to = 'expired' then
    perform public._close_reservations(p_order, 'expire', p_actor);
  elsif p_to in ('cancelled', 'rejected') then
    perform public._close_reservations(p_order, 'release', p_actor);
  end if;

  -- Synchronisation de la livraison
  if o.fulfillment = 'delivery' then
    update public.deliveries set
      status = case p_to
        when 'awaiting_courier' then 'awaiting_courier'
        when 'courier_assigned' then 'assigned'
        when 'in_delivery' then 'picked_up'
        when 'delivered' then 'delivered'
        when 'delivery_failed' then 'failed'
        when 'cancelled' then 'cancelled' when 'rejected' then 'cancelled' when 'expired' then 'cancelled'
        else status end::public.delivery_status,
      picked_up_at = case when p_to = 'in_delivery' then now() else picked_up_at end,
      delivered_at = case when p_to = 'delivered' then now() else delivered_at end,
      failure_reason = case when p_to = 'delivery_failed' then p_note else failure_reason end
    where order_id = p_order;
    if public.is_terminal_status(p_to) then
      update public.delivery_assignments set is_active = false, ended_at = now(), end_reason = p_to::text
       where delivery_id = (select id from public.deliveries where order_id = p_order) and is_active;
    end if;
  end if;

  -- Notifications
  perform public.notify_user(o.customer_id, 'order_status', 'Commande ' || o.reference || ' : ' || public.order_status_label(p_to),
    coalesce(p_note, null), p_order, '/compte/commandes/' || p_order);
  if p_actor = o.customer_id and p_to = 'cancelled' then
    perform public.notify_pharmacy(o.pharmacy_id, 'order_cancelled', 'Demande annulée par le client', o.reference, p_order, '/pharmacien/commandes/' || p_order);
  end if;
end $$;
revoke execute on function public._set_order_status(uuid, public.order_status, uuid, text) from public, anon, authenticated;

-- Réponse de la pharmacie : acceptation (réservation transactionnelle) ou refus
create or replace function public.pharmacy_respond_order(p_order uuid, p_accept boolean, p_reason text default null)
returns public.order_status language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_auth();
  o public.orders%rowtype;
  it record;
  ttl int := public.setting_int('reservation_ttl_minutes', 240);
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null then raise exception 'PP404: commande introuvable'; end if;
  if not public.can_manage_pharmacy(o.pharmacy_id) then raise exception 'PP403: accès refusé'; end if;

  -- Idempotence : une réponse déjà enregistrée est renvoyée telle quelle
  if p_accept and o.status <> 'pending_confirmation' and o.status not in ('rejected', 'expired', 'cancelled') then return o.status; end if;
  if not p_accept and o.status = 'rejected' then return o.status; end if;
  if o.status <> 'pending_confirmation' then raise exception 'PP409: la commande n''est plus en attente (%)', public.order_status_label(o.status); end if;
  if o.confirmation_expires_at is not null and o.confirmation_expires_at < now() then
    perform public._set_order_status(p_order, 'expired', uid, 'Délai de confirmation dépassé');
    return 'expired';
  end if;

  if not p_accept then
    if coalesce(trim(p_reason), '') = '' then raise exception 'PP422: indiquez un motif de refus'; end if;
    perform public._set_order_status(p_order, 'rejected', uid, p_reason);
    return 'rejected';
  end if;

  -- Verrouillage des lignes de stock dans un ordre stable puis contrôle
  for it in
    select oi.id as item_id, oi.quantity, oi.product_label, i.id as inv_id, i.quantity as inv_qty, i.reserved_quantity as inv_res, i.is_available
    from public.order_items oi join public.pharmacy_inventory i on i.id = oi.inventory_id
    where oi.order_id = p_order
    order by i.id
    for update of i
  loop
    if not it.is_available or it.inv_qty - it.inv_res < it.quantity then
      raise exception 'PP409: stock insuffisant pour % (disponible : %, demandé : %)', it.product_label, greatest(it.inv_qty - it.inv_res, 0), it.quantity;
    end if;
    update public.pharmacy_inventory set reserved_quantity = reserved_quantity + it.quantity where id = it.inv_id;
    insert into public.stock_reservations (order_item_id, order_id, inventory_id, quantity, expires_at)
    values (it.item_id, p_order, it.inv_id, it.quantity, case when o.fulfillment = 'pickup' then now() + make_interval(mins => ttl) end);
    insert into public.inventory_movements (inventory_id, pharmacy_id, kind, reserved_delta, quantity_after, reserved_after, order_id, actor_id)
    values (it.inv_id, o.pharmacy_id, 'reservation', it.quantity, it.inv_qty, it.inv_res + it.quantity, p_order, uid);
  end loop;

  update public.orders set reservation_expires_at = case when o.fulfillment = 'pickup' then now() + make_interval(mins => ttl) end
   where id = p_order;
  perform public._set_order_status(p_order, 'confirmed', uid, p_reason);
  return 'confirmed';
end $$;

-- Transitions de statut avec matrice de droits
create or replace function public.advance_order(p_order uuid, p_to public.order_status, p_note text default null)
returns public.order_status language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_auth();
  o public.orders%rowtype;
  is_member boolean;
  is_customer boolean;
  is_courier boolean;
  admin boolean := public.is_admin();
  allowed boolean := false;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null then raise exception 'PP404: commande introuvable'; end if;
  if o.status = p_to then return o.status; end if; -- idempotent
  if public.is_terminal_status(o.status) then raise exception 'PP409: commande clôturée (%)', public.order_status_label(o.status); end if;

  is_member := public.can_manage_pharmacy(o.pharmacy_id);
  is_customer := o.customer_id = uid;
  is_courier := exists (
    select 1 from public.delivery_assignments a join public.deliveries d on d.id = a.delivery_id
    join public.couriers c on c.user_id = a.courier_id
    where d.order_id = p_order and a.courier_id = uid and a.is_active and c.status = 'verified');

  if p_to in ('confirmed', 'rejected') then
    raise exception 'PP422: utilisez la réponse de la pharmacie pour confirmer ou refuser';
  end if;

  allowed := case
    -- Pharmacie
    when is_member and o.status = 'confirmed' and p_to = 'preparing' then true
    when is_member and o.status = 'preparing' and p_to = 'ready_for_pickup' and o.fulfillment = 'pickup' then true
    when is_member and o.status = 'preparing' and p_to = 'awaiting_courier' and o.fulfillment = 'delivery' then true
    when is_member and o.status = 'ready_for_pickup' and p_to = 'completed' then true
    when is_member and p_to = 'cancelled' and o.status in ('confirmed', 'preparing', 'ready_for_pickup', 'awaiting_courier') then true
    -- Client
    when is_customer and p_to = 'cancelled' and o.status in ('pending_confirmation', 'confirmed', 'preparing', 'ready_for_pickup', 'awaiting_courier') then true
    -- Livreur affecté et vérifié
    when is_courier and o.status = 'courier_assigned' and p_to = 'in_delivery' then true
    when is_courier and o.status = 'in_delivery' and p_to in ('delivered', 'delivery_failed') then true
    -- Administration (supervision des incidents)
    when admin and p_to = 'cancelled' then true
    when admin and o.status = 'in_delivery' and p_to = 'delivery_failed' then true
    else false
  end;

  if not allowed then
    raise exception 'PP403: transition « % » vers « % » non autorisée', public.order_status_label(o.status), public.order_status_label(p_to);
  end if;
  if p_to in ('cancelled', 'delivery_failed') and not is_customer and coalesce(trim(p_note), '') = '' then
    raise exception 'PP422: un motif est obligatoire';
  end if;
  if p_to = 'awaiting_courier' and not public.setting_bool('delivery_enabled', false) then
    raise exception 'PP422: la livraison est désactivée ; contactez le client pour un retrait';
  end if;

  perform public._set_order_status(p_order, p_to, uid, p_note);
  if admin and not (is_member or is_customer or is_courier) then
    perform public.log_audit('order.status', 'order', p_order::text, jsonb_build_object('from', o.status, 'to', p_to, 'note', p_note));
  end if;
  return p_to;
end $$;

-- Confirmation d'un paiement réellement reçu (jamais automatique)
create or replace function public.confirm_payment(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); o public.orders%rowtype; ok boolean := false;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null then raise exception 'PP404: commande introuvable'; end if;
  if o.payment_status = 'paid' then return; end if;
  if o.payment_method = 'pay_at_pharmacy' then
    ok := public.can_manage_pharmacy(o.pharmacy_id) and o.status in ('ready_for_pickup', 'completed');
  else
    ok := o.status in ('in_delivery', 'delivered') and exists (
      select 1 from public.delivery_assignments a join public.deliveries d on d.id = a.delivery_id
      where d.order_id = p_order and a.courier_id = uid and (a.is_active or o.status = 'delivered'));
  end if;
  if not ok then raise exception 'PP403: vous ne pouvez pas confirmer ce paiement à ce stade'; end if;
  update public.orders set payment_status = 'paid', paid_confirmed_at = now(), paid_confirmed_by = uid where id = p_order;
  insert into public.order_status_history (order_id, from_status, to_status, actor_id, note) values (p_order, o.status, o.status, uid, 'Paiement reçu confirmé');
end $$;

create or replace function public.admin_mark_refunded(p_order uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if coalesce(trim(p_note), '') = '' then raise exception 'PP422: précisez la référence du remboursement'; end if;
  update public.orders set payment_status = 'refunded' where id = p_order and payment_status = 'refund_pending';
  if not found then raise exception 'PP409: aucun remboursement en attente'; end if;
  perform public.log_audit('order.refunded', 'order', p_order::text, jsonb_build_object('note', p_note));
end $$;

-- Expiration des demandes non traitées et des réservations non retirées
create or replace function public.expire_overdue_orders()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select id, status from public.orders
    where (status = 'pending_confirmation' and confirmation_expires_at < now())
       or (status in ('confirmed', 'preparing', 'ready_for_pickup') and fulfillment = 'pickup' and reservation_expires_at < now())
    order by id
    for update skip locked
  loop
    perform public._set_order_status(r.id, 'expired', null,
      case when r.status = 'pending_confirmation' then 'Pas de réponse de la pharmacie dans le délai' else 'Réservation non retirée dans le délai' end);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.expire_overdue_orders() from public, anon, authenticated;

create or replace function public.admin_expire_overdue_orders()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform public.require_admin();
  n := public.expire_overdue_orders();
  perform public.log_audit('orders.expire_run', 'order', null, jsonb_build_object('expired', n));
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Livreurs et livraisons
-- ---------------------------------------------------------------------------
create or replace function public.courier_apply(p_phone text, p_vehicle text, p_region uuid default null, p_commune uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth();
begin
  if not public.valid_phone(p_phone) then raise exception 'PP422: numéro de téléphone invalide (format +223XXXXXXXX)'; end if;
  insert into public.couriers (user_id, phone, vehicle, zone_region_id, zone_commune_id)
  values (uid, p_phone, p_vehicle, p_region, p_commune)
  on conflict (user_id) do update set phone = excluded.phone, vehicle = excluded.vehicle,
    zone_region_id = excluded.zone_region_id, zone_commune_id = excluded.zone_commune_id
  where public.couriers.status in ('pending', 'rejected');
  update public.couriers set status = 'pending' where user_id = uid and status = 'rejected';
end $$;

create or replace function public.admin_review_courier(p_user uuid, p_status public.courier_status, p_reason text default null, p_document_ref text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin();
begin
  if p_status in ('rejected', 'suspended') and coalesce(trim(p_reason), '') = '' then raise exception 'PP422: motif obligatoire'; end if;
  if p_status = 'verified' and coalesce(trim(p_document_ref), '') = '' and not exists (select 1 from public.couriers where user_id = p_user and id_document_ref is not null) then
    raise exception 'PP422: indiquez la référence de la pièce d''identité vérifiée';
  end if;
  update public.couriers set status = p_status,
    verified_at = case when p_status = 'verified' then now() else verified_at end,
    verified_by = case when p_status = 'verified' then uid else verified_by end,
    id_document_ref = coalesce(nullif(trim(p_document_ref), ''), id_document_ref)
  where user_id = p_user;
  if not found then raise exception 'PP404: candidature introuvable'; end if;
  if p_status = 'verified' then
    insert into public.user_roles (user_id, role, granted_by) values (p_user, 'courier', uid) on conflict do nothing;
  else
    delete from public.user_roles where user_id = p_user and role = 'courier';
  end if;
  perform public.log_audit('courier.review', 'courier', p_user::text, jsonb_build_object('status', p_status, 'reason', p_reason));
  perform public.notify_user(p_user, 'courier_review', 'Statut livreur : ' || p_status::text, p_reason, null, '/livraison');
end $$;

create or replace function public.assign_courier(p_order uuid, p_courier uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_admin();
  o public.orders%rowtype;
  d public.deliveries%rowtype;
  c public.couriers%rowtype;
begin
  if not public.setting_bool('delivery_enabled', false) then raise exception 'PP422: la livraison est désactivée'; end if;
  select * into o from public.orders where id = p_order for update;
  if o.id is null or o.fulfillment <> 'delivery' then raise exception 'PP404: livraison introuvable'; end if;
  if o.status not in ('awaiting_courier', 'courier_assigned') then raise exception 'PP409: la commande n''attend pas de livreur'; end if;
  select * into c from public.couriers where user_id = p_courier;
  if c.user_id is null or c.status <> 'verified' or not exists (select 1 from public.user_roles where user_id = p_courier and role = 'courier') then
    raise exception 'PP422: livreur non habilité';
  end if;
  if not c.is_available then raise exception 'PP422: livreur indisponible'; end if;
  if exists (
    select 1 from public.order_items oi join public.medicine_catalog mc on mc.id = oi.catalog_id
    left join public.product_categories pc on pc.id = mc.category_id
    where oi.order_id = p_order and (oi.requires_prescription or not coalesce(pc.delivery_allowed, false))
  ) then
    raise exception 'PP422: cette commande contient un produit dont la livraison n''est pas autorisée';
  end if;
  select * into d from public.deliveries where order_id = p_order;
  update public.delivery_assignments set is_active = false, ended_at = now(), end_reason = 'réaffectation' where delivery_id = d.id and is_active;
  insert into public.delivery_assignments (delivery_id, courier_id, assigned_by) values (d.id, p_courier, uid);
  if o.status = 'awaiting_courier' then
    perform public._set_order_status(p_order, 'courier_assigned', uid, null);
  end if;
  perform public.notify_user(p_courier, 'delivery_assigned', 'Nouvelle livraison ' || o.reference,
    'Collecte à la pharmacie puis remise au client.', p_order, '/livraison/' || d.id);
  perform public.log_audit('delivery.assign', 'order', p_order::text, jsonb_build_object('courier', p_courier));
end $$;

create or replace function public.report_delivery_incident(p_delivery uuid, p_kind text, p_description text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth();
begin
  if not (public.is_admin() or exists (select 1 from public.delivery_assignments where delivery_id = p_delivery and courier_id = uid and is_active)) then
    raise exception 'PP403: accès refusé';
  end if;
  insert into public.delivery_incidents (delivery_id, reported_by, kind, description) values (p_delivery, uid, p_kind, left(p_description, 500));
end $$;

-- ---------------------------------------------------------------------------
-- Administration
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_role(p_user uuid, p_role public.app_role, p_grant boolean)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin();
begin
  if p_user = uid and p_role = 'admin' and not p_grant then raise exception 'PP409: vous ne pouvez pas retirer votre propre rôle administrateur'; end if;
  if p_role = 'courier' then raise exception 'PP422: le rôle livreur est attribué via la validation des livreurs'; end if;
  if p_grant then
    insert into public.user_roles (user_id, role, granted_by) values (p_user, p_role, uid) on conflict do nothing;
  else
    delete from public.user_roles where user_id = p_user and role = p_role;
  end if;
  perform public.log_audit(case when p_grant then 'role.grant' else 'role.revoke' end, 'user', p_user::text, jsonb_build_object('role', p_role));
end $$;

create or replace function public.admin_update_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin(); old jsonb;
begin
  select value into old from public.platform_settings where key = p_key for update;
  if not found then raise exception 'PP404: paramètre inconnu'; end if;
  if jsonb_typeof(old) <> jsonb_typeof(p_value) then raise exception 'PP422: type de valeur invalide'; end if;
  if jsonb_typeof(p_value) = 'number' and (p_value #>> '{}')::numeric < 0 then raise exception 'PP422: valeur négative'; end if;
  update public.platform_settings set value = p_value, updated_at = now(), updated_by = uid where key = p_key;
  perform public.log_audit('setting.update', 'setting', p_key, jsonb_build_object('from', old, 'to', p_value));
end $$;

create or replace function public.admin_review_catalog_item(p_catalog uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if p_status not in ('approved', 'rejected', 'pending') then raise exception 'PP422: statut invalide'; end if;
  update public.medicine_catalog set review_status = p_status where id = p_catalog;
  perform public.log_audit('catalog.review', 'catalog', p_catalog::text, jsonb_build_object('status', p_status));
end $$;

create or replace function public.catalog_duplicate_candidates(p_threshold real default 0.55, p_limit int default 50)
returns table (a_id uuid, a_label text, b_id uuid, b_label text, score real)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_admin();
  return query
  select a.id, a.brand_name || coalesce(' ' || a.dosage, '') || coalesce(' ' || a.form, ''),
         b.id, b.brand_name || coalesce(' ' || b.dosage, '') || coalesce(' ' || b.form, ''),
         similarity(a.search_text, b.search_text)
  from public.medicine_catalog a
  join public.medicine_catalog b on a.id < b.id and a.search_text % b.search_text
  where a.merged_into is null and b.merged_into is null and a.review_status <> 'rejected' and b.review_status <> 'rejected'
    and similarity(a.search_text, b.search_text) >= p_threshold
    and public.normalize_text(coalesce(a.dosage, '')) = public.normalize_text(coalesce(b.dosage, ''))
  order by 5 desc
  limit least(greatest(p_limit, 1), 200);
end $$;

-- Fusion de doublons : déplace les stocks vers la fiche conservée
create or replace function public.admin_merge_catalog(p_keep uuid, p_remove uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record; kept record;
begin
  perform public.require_admin();
  if p_keep = p_remove then raise exception 'PP422: fiches identiques'; end if;
  if not exists (select 1 from public.medicine_catalog where id = p_keep and merged_into is null) then raise exception 'PP404: fiche de référence invalide'; end if;
  for r in select * from public.pharmacy_inventory where catalog_id = p_remove order by id for update loop
    if r.reserved_quantity > 0 then raise exception 'PP409: des réservations actives existent sur la fiche à fusionner'; end if;
    select * into kept from public.pharmacy_inventory where pharmacy_id = r.pharmacy_id and catalog_id = p_keep for update;
    if kept.id is null then
      update public.pharmacy_inventory set catalog_id = p_keep where id = r.id;
    else
      update public.pharmacy_inventory
         set quantity = kept.quantity + r.quantity,
             price_xof = coalesce(kept.price_xof, r.price_xof),
             stock_updated_at = greatest(kept.stock_updated_at, r.stock_updated_at)
       where id = kept.id;
      insert into public.inventory_movements (inventory_id, pharmacy_id, kind, quantity_delta, quantity_after, reserved_after, note, actor_id)
      values (kept.id, r.pharmacy_id, 'correction', r.quantity, kept.quantity + r.quantity, kept.reserved_quantity, 'Fusion de fiches catalogue', auth.uid());
      if exists (select 1 from public.order_items where inventory_id = r.id) then
        update public.pharmacy_inventory set quantity = 0, is_available = false where id = r.id;
      else
        delete from public.pharmacy_inventory where id = r.id;
      end if;
    end if;
  end loop;
  update public.medicine_identifiers set catalog_id = p_keep where catalog_id = p_remove
    and not exists (select 1 from public.medicine_identifiers x where x.catalog_id = p_keep and x.id_type = medicine_identifiers.id_type);
  update public.medicine_catalog set merged_into = p_keep where id = p_remove;
  perform public.log_audit('catalog.merge', 'catalog', p_remove::text, jsonb_build_object('into', p_keep));
end $$;

-- Statistiques calculées sur les données réelles
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
    'searches', (select count(*) from public.search_logs where created_at between p_from and p_to and (p_region is null or region_id = p_region)),
    'searches_no_result', (select count(*) from public.search_logs where result_count = 0 and created_at between p_from and p_to and (p_region is null or region_id = p_region)),
    'top_no_result_queries', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select query_normalized as query, count(*) as n from public.search_logs
        where result_count = 0 and created_at between p_from and p_to and (p_region is null or region_id = p_region)
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

-- Accès exceptionnel et journalisé à la note privée d'une commande
create or replace function public.admin_read_order_note(p_order uuid, p_justification text)
returns text language plpgsql security definer set search_path = public as $$
declare n text;
begin
  perform public.require_admin();
  if coalesce(char_length(trim(p_justification)), 0) < 15 then raise exception 'PP422: justification détaillée obligatoire (15 caractères minimum)'; end if;
  select customer_note into n from public.order_private_notes where order_id = p_order;
  perform public.log_audit('sensitive.order_note_read', 'order', p_order::text, jsonb_build_object('justification', p_justification));
  return n;
end $$;

-- Pharmacien : fiches utilisateurs des membres (nom du client pour une commande)
create or replace function public.order_customer_contact(p_order uuid)
returns table (full_name text, phone text) language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.orders o where o.id = p_order and (public.is_pharmacy_member(o.pharmacy_id) or exists (
      select 1 from public.delivery_assignments a join public.deliveries d on d.id = a.delivery_id where d.order_id = o.id and a.courier_id = auth.uid() and a.is_active))) then
    raise exception 'PP403: accès refusé';
  end if;
  return query select p.full_name, p.phone from public.orders o join public.profiles p on p.id = o.customer_id where o.id = p_order;
end $$;

-- ---------------------------------------------------------------------------
-- Compte : suppression (anonymisation ; l'historique des commandes est conservé)
-- ---------------------------------------------------------------------------
create or replace function public.request_account_deletion()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth();
begin
  if exists (select 1 from public.orders where customer_id = uid and not public.is_terminal_status(status)) then
    raise exception 'PP409: des commandes sont en cours ; annulez-les ou attendez leur clôture';
  end if;
  if exists (select 1 from public.pharmacy_members where user_id = uid) then
    raise exception 'PP409: compte professionnel : contactez l''administration pour clôturer la pharmacie';
  end if;
  delete from public.customer_addresses where user_id = uid;
  delete from public.notifications where user_id = uid;
  delete from public.user_roles where user_id = uid;
  update public.couriers set status = 'suspended', is_available = false where user_id = uid;
  update public.profiles set full_name = null, phone = null, preferred_region_id = null, preferred_commune_id = null,
         deletion_requested_at = now(), deleted_at = now() where id = uid;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id) values (uid, 'account.delete', 'user', uid::text);
end $$;

-- Premier administrateur : à exécuter depuis l'éditeur SQL Supabase (rôle postgres)
create or replace function public.bootstrap_admin(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then raise exception 'Utilisateur introuvable : créez d''abord le compte via l''inscription'; end if;
  insert into public.user_roles (user_id, role) values (uid, 'admin') on conflict do nothing;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id) values (null, 'role.bootstrap_admin', 'user', uid::text);
end $$;
revoke execute on function public.bootstrap_admin(text) from public, anon, authenticated;

-- Les fonctions internes ne sont pas exposées
revoke execute on function public.notify_user(uuid, text, text, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.notify_pharmacy(uuid, text, text, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
