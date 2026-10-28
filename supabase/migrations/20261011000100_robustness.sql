-- ============================================================================
-- PharmaProxi — Migration 0010 : robustesse
--  1. Limites anti-abus imposées en base (indépendantes de l'application)
--  2. Limitation de débit partagée entre instances (clé de service uniquement)
--  3. Concurrence optimiste sur les modifications de stock
--  4. Contrôle et réparation d'intégrité
--  5. Maintenance planifiée (expirations, purges)
--  6. Équipe d'une pharmacie (ajout / retrait de membres)
--  7. Garde-fous : longueurs de texte, délais d'exécution
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Limites anti-abus en base
-- ---------------------------------------------------------------------------
create or replace function public.enforce_order_rate()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from public.orders
   where customer_id = new.customer_id and created_at > now() - interval '10 minutes';
  if n >= 10 then
    raise exception 'PP429: trop de demandes en peu de temps, patientez quelques minutes';
  end if;
  select count(*) into n from public.orders
   where customer_id = new.customer_id and status = 'pending_confirmation';
  if n >= 15 then
    raise exception 'PP429: trop de demandes en attente ; attendez les réponses des pharmacies ou annulez-en';
  end if;
  return new;
end $$;
create trigger orders_rate before insert on public.orders
  for each row when (new.is_demo = false) execute function public.enforce_order_rate();

create or replace function public.enforce_report_rate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.reporter_id is not null and (
    select count(*) from public.reports where reporter_id = new.reporter_id and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'PP429: trop de signalements, réessayez plus tard';
  end if;
  return new;
end $$;
create trigger reports_rate before insert on public.reports
  for each row execute function public.enforce_report_rate();

create or replace function public.enforce_catalog_rate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null and not public.is_admin() and (
    select count(*) from public.medicine_catalog where created_by = new.created_by and created_at > now() - interval '1 day') >= 3000 then
    raise exception 'PP429: nombre maximal de nouvelles fiches catalogue atteint pour aujourd''hui';
  end if;
  return new;
end $$;
create trigger catalog_rate before insert on public.medicine_catalog
  for each row execute function public.enforce_catalog_rate();

create or replace function public.enforce_address_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.customer_addresses where user_id = new.user_id) >= 10 then
    raise exception 'PP429: 10 adresses maximum';
  end if;
  return new;
end $$;
create trigger addresses_limit before insert on public.customer_addresses
  for each row execute function public.enforce_address_limit();

-- ---------------------------------------------------------------------------
-- 2. Limitation de débit partagée (connexion, recherche…) — appelée par le
--    serveur avec la clé de service ; jamais exposée aux visiteurs.
-- ---------------------------------------------------------------------------
create unlogged table public.rate_limit_events (
  key text not null check (char_length(key) <= 200),
  at timestamptz not null default now()
);
create index rate_limit_events_key_idx on public.rate_limit_events (key, at desc);
alter table public.rate_limit_events enable row level security; -- aucune politique : inaccessible hors service_role
revoke all on public.rate_limit_events from anon, authenticated;

-- Retourne true si l'opération est autorisée ; p_record = enregistre la tentative.
create or replace function public.rate_limit_hit(p_key text, p_limit int, p_window_seconds int, p_record boolean default true)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from public.rate_limit_events
   where key = p_key and at > now() - make_interval(secs => p_window_seconds);
  if n >= p_limit then return false; end if;
  if p_record then insert into public.rate_limit_events (key) values (p_key); end if;
  return true;
end $$;
revoke execute on function public.rate_limit_hit(text, int, int, boolean) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Concurrence optimiste sur les lignes de stock
-- ---------------------------------------------------------------------------
alter table public.pharmacy_inventory add column row_version integer not null default 0;

create or replace function public.inventory_bump_version()
returns trigger language plpgsql as $$
begin
  if new.quantity is distinct from old.quantity or new.price_xof is distinct from old.price_xof
     or new.is_available is distinct from old.is_available then
    new.row_version := old.row_version + 1;
  end if;
  return new;
end $$;
create trigger inventory_version before update on public.pharmacy_inventory
  for each row execute function public.inventory_bump_version();

-- Le garde-fou empêche aussi de toucher à row_version directement
create or replace function public.inventory_guard()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and current_user in ('authenticated', 'anon') then
    if new.quantity is distinct from old.quantity or new.reserved_quantity is distinct from old.reserved_quantity
       or new.price_xof is distinct from old.price_xof or new.pharmacy_id is distinct from old.pharmacy_id
       or new.catalog_id is distinct from old.catalog_id or new.stock_updated_at is distinct from old.stock_updated_at
       or new.is_demo is distinct from old.is_demo or new.row_version is distinct from old.row_version then
      raise exception 'PP403: utilisez la mise à jour de stock dédiée';
    end if;
  end if;
  return new;
end $$;

-- Mise à jour d'une ligne depuis le formulaire : refuse si la ligne a changé
-- depuis l'affichage (autre membre de l'équipe, vente, import…).
create or replace function public.update_inventory_line(
  p_inventory uuid, p_expected_version int, p_quantity int, p_price int, p_available boolean, p_threshold int default null)
returns int language plpgsql security definer set search_path = public as $$
declare r public.pharmacy_inventory%rowtype;
begin
  perform public.require_auth();
  select * into r from public.pharmacy_inventory where id = p_inventory for update;
  if r.id is null or not public.can_manage_pharmacy(r.pharmacy_id) then raise exception 'PP403: accès refusé'; end if;
  if p_expected_version is not null and r.row_version <> p_expected_version then
    raise exception 'PP409: cette ligne a été modifiée entre-temps (quantité actuelle : %, réservé : %). Vérifiez puis enregistrez à nouveau.',
      r.quantity, r.reserved_quantity;
  end if;
  perform public.set_inventory(r.pharmacy_id, r.catalog_id, p_quantity, p_price, p_available, p_threshold, null, 'adjustment');
  return (select row_version from public.pharmacy_inventory where id = p_inventory);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Intégrité
-- ---------------------------------------------------------------------------
create or replace function public.integrity_issues()
returns table (check_name text, severity text, entity_id text, details text)
language sql stable security definer set search_path = public as $$
  -- Réservé déclaré différent de la somme des réservations actives
  select 'reserved_mismatch', 'critique', i.id::text,
         format('réservé %s, réservations actives %s', i.reserved_quantity, coalesce(sum(sr.quantity), 0))
  from public.pharmacy_inventory i
  left join public.stock_reservations sr on sr.inventory_id = i.id and sr.status = 'active'
  group by i.id having i.reserved_quantity <> coalesce(sum(sr.quantity), 0)
  union all
  -- Réservation encore active sur une commande clôturée
  select 'active_reservation_on_closed_order', 'critique', o.id::text, format('commande %s (%s)', o.reference, o.status)
  from public.orders o join public.stock_reservations sr on sr.order_id = o.id and sr.status = 'active'
  where public.is_terminal_status(o.status)
  union all
  -- Commande confirmée sans réservation active
  select 'confirmed_order_without_reservation', 'critique', o.id::text, format('commande %s (%s)', o.reference, o.status)
  from public.orders o
  where o.status in ('confirmed', 'preparing', 'ready_for_pickup', 'awaiting_courier', 'courier_assigned', 'in_delivery')
    and not exists (select 1 from public.stock_reservations sr where sr.order_id = o.id and sr.status = 'active')
  union all
  -- Total incohérent avec les lignes
  select 'order_total_mismatch', 'critique', o.id::text, format('sous-total %s, lignes %s', o.subtotal_xof, coalesce(sum(oi.quantity * oi.unit_price_xof), 0))
  from public.orders o left join public.order_items oi on oi.order_id = o.id
  group by o.id having o.subtotal_xof <> coalesce(sum(oi.quantity * oi.unit_price_xof), 0)
  union all
  -- Livraison affectée à un livreur qui n'est plus habilité
  select 'assignment_to_unverified_courier', 'critique', a.id::text, 'livreur non vérifié ou suspendu'
  from public.delivery_assignments a join public.couriers c on c.user_id = a.courier_id
  where a.is_active and c.status <> 'verified'
  union all
  -- Demandes dont le délai est dépassé (la tâche d'expiration ne tourne pas ?)
  select 'overdue_not_expired', 'avertissement', o.id::text, format('commande %s en retard depuis %s min', o.reference,
         round(extract(epoch from now() - coalesce(o.confirmation_expires_at, o.reservation_expires_at)) / 60))
  from public.orders o
  where (o.status = 'pending_confirmation' and o.confirmation_expires_at < now() - interval '30 minutes')
     or (o.status in ('confirmed', 'preparing', 'ready_for_pickup') and o.fulfillment = 'pickup' and o.reservation_expires_at < now() - interval '30 minutes')
  union all
  -- Pharmacie vérifiée sans aucun justificatif (hors démonstration)
  select 'verified_without_documents', 'avertissement', p.id::text, p.name
  from public.pharmacies p
  where p.status = 'verified' and not p.is_demo and not exists (select 1 from public.pharmacy_documents d where d.pharmacy_id = p.id)
$$;
revoke execute on function public.integrity_issues() from public, anon, authenticated;

create or replace function public.admin_integrity_report()
returns table (check_name text, severity text, entity_id text, details text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return query select * from public.integrity_issues();
end $$;

-- Réparation sûre et idempotente : recalcule les quantités réservées à partir
-- des réservations actives et libère les réservations des commandes clôturées.
create or replace function public.admin_repair_reservations()
returns jsonb language plpgsql security definer set search_path = public as $$
declare released int; fixed int;
begin
  perform public.require_admin();
  with r as (
    update public.stock_reservations sr set status = 'released', closed_at = now()
    from public.orders o
    where sr.order_id = o.id and sr.status = 'active' and public.is_terminal_status(o.status)
    returning 1)
  select count(*) into released from r;
  with f as (
    update public.pharmacy_inventory i
       set reserved_quantity = least(i.quantity, coalesce((select sum(quantity) from public.stock_reservations sr where sr.inventory_id = i.id and sr.status = 'active'), 0))
     where i.reserved_quantity <> coalesce((select sum(quantity) from public.stock_reservations sr where sr.inventory_id = i.id and sr.status = 'active'), 0)
    returning 1)
  select count(*) into fixed from f;
  perform public.log_audit('integrity.repair_reservations', 'inventory', null, jsonb_build_object('released', released, 'fixed', fixed));
  return jsonb_build_object('released', released, 'fixed', fixed);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Maintenance planifiée (pg_cron ou /api/cron)
-- ---------------------------------------------------------------------------
create or replace function public.run_maintenance()
returns jsonb language plpgsql security definer set search_path = public as $$
declare expired int; rl int; logs int; notifs int; outbox int; issues int;
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
  select count(*) into issues from public.integrity_issues() where severity = 'critique';
  insert into public.maintenance_runs (expired, purged, critical_issues)
  values (expired, jsonb_build_object('rate_limits', rl, 'search_logs', logs, 'notifications', notifs, 'outbox', outbox), issues);
  delete from public.maintenance_runs where ran_at < now() - interval '30 days';
  return jsonb_build_object('expired', expired, 'purged', jsonb_build_object('rate_limits', rl, 'search_logs', logs, 'notifications', notifs, 'outbox', outbox), 'critical_issues', issues);
end $$;

create table public.maintenance_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  expired int not null default 0,
  purged jsonb not null default '{}'::jsonb,
  critical_issues int not null default 0
);
alter table public.maintenance_runs enable row level security;
create policy "admin lit" on public.maintenance_runs for select using (public.is_admin());
revoke insert, update, delete on public.maintenance_runs from anon, authenticated;

revoke execute on function public.run_maintenance() from public, anon, authenticated;
grant execute on function public.run_maintenance() to service_role;

create or replace function public.admin_run_maintenance()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  perform public.require_admin();
  r := public.run_maintenance();
  perform public.log_audit('maintenance.run', 'system', null, r);
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Équipe d'une pharmacie
-- ---------------------------------------------------------------------------
create or replace function public.is_pharmacy_owner(p_pharmacy uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pharmacy_members where pharmacy_id = p_pharmacy and user_id = auth.uid() and member_role = 'owner')
$$;

create or replace function public.pharmacy_team(p_pharmacy uuid)
returns table (user_id uuid, full_name text, email text, member_role text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_pharmacy_member(p_pharmacy) or public.is_admin()) then raise exception 'PP403: accès refusé'; end if;
  return query
  select m.user_id, p.full_name, u.email::text, m.member_role, m.created_at
  from public.pharmacy_members m join public.profiles p on p.id = m.user_id join auth.users u on u.id = m.user_id
  where m.pharmacy_id = p_pharmacy order by m.member_role desc, m.created_at;
end $$;

-- Ajoute un collaborateur (compte déjà créé sur PharmaProxi) — propriétaire uniquement
create or replace function public.pharmacy_add_member(p_pharmacy uuid, p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); target uuid;
begin
  if not public.is_pharmacy_owner(p_pharmacy) or not public.can_manage_pharmacy(p_pharmacy) then
    raise exception 'PP403: seul le propriétaire peut gérer l''équipe';
  end if;
  select u.id into target from auth.users u join public.profiles p on p.id = u.id
   where lower(u.email) = lower(trim(p_email)) and p.deleted_at is null;
  if target is null then
    raise exception 'PP404: aucun compte PharmaProxi avec cette adresse ; la personne doit d''abord créer son compte';
  end if;
  if (select count(*) from public.pharmacy_members where pharmacy_id = p_pharmacy) >= 20 then
    raise exception 'PP422: 20 membres maximum';
  end if;
  insert into public.pharmacy_members (pharmacy_id, user_id, member_role) values (p_pharmacy, target, 'staff')
  on conflict do nothing;
  insert into public.user_roles (user_id, role, granted_by) values (target, 'pharmacist', uid) on conflict do nothing;
  perform public.log_audit('pharmacy.member_add', 'pharmacy', p_pharmacy::text, jsonb_build_object('user', target));
  perform public.notify_user(target, 'pharmacy_member', 'Vous avez rejoint une équipe',
    (select name from public.pharmacies where id = p_pharmacy), null, '/pharmacien');
  return target;
end $$;

create or replace function public.pharmacy_remove_member(p_pharmacy uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth();
begin
  if not public.is_pharmacy_owner(p_pharmacy) and not public.is_admin() then
    raise exception 'PP403: seul le propriétaire peut gérer l''équipe';
  end if;
  if exists (select 1 from public.pharmacy_members where pharmacy_id = p_pharmacy and user_id = p_user and member_role = 'owner') then
    raise exception 'PP409: le propriétaire ne peut pas être retiré de l''équipe';
  end if;
  delete from public.pharmacy_members where pharmacy_id = p_pharmacy and user_id = p_user;
  if not found then raise exception 'PP404: membre introuvable'; end if;
  -- Retire le rôle pharmacien s'il n'appartient plus à aucune pharmacie
  if not exists (select 1 from public.pharmacy_members where user_id = p_user) then
    delete from public.user_roles where user_id = p_user and role = 'pharmacist';
  end if;
  perform public.log_audit('pharmacy.member_remove', 'pharmacy', p_pharmacy::text, jsonb_build_object('user', p_user));
end $$;

-- Les justificatifs et l'équipe restent réservés au propriétaire
drop policy "membres déposent" on public.pharmacy_documents;
create policy "propriétaire dépose" on public.pharmacy_documents for insert
  with check (public.can_manage_pharmacy(pharmacy_id) and public.is_pharmacy_owner(pharmacy_id)
              and uploaded_by = auth.uid() and storage_path like pharmacy_id::text || '/%');

-- ---------------------------------------------------------------------------
-- 7. Garde-fous
-- ---------------------------------------------------------------------------
alter table public.medicine_catalog
  add constraint catalog_text_lengths check (
    char_length(coalesce(generic_name, '')) <= 150 and char_length(coalesce(active_ingredient, '')) <= 200
    and char_length(coalesce(dosage, '')) <= 60 and char_length(coalesce(form, '')) <= 60
    and char_length(coalesce(packaging, '')) <= 80 and char_length(coalesce(manufacturer, '')) <= 120);
alter table public.pharmacy_private
  add constraint private_text_lengths check (
    char_length(coalesce(legal_name, '')) <= 200 and char_length(coalesce(license_number, '')) <= 100
    and char_length(pharmacist_in_charge) between 2 and 120 and char_length(coalesce(order_registration, '')) <= 100
    and char_length(coalesce(tax_id, '')) <= 50 and char_length(coalesce(rccm, '')) <= 80 and char_length(coalesce(notes, '')) <= 2000);
alter table public.content_pages add constraint content_lengths check (char_length(title) <= 200 and char_length(body) <= 20000);
alter table public.delivery_incidents alter column description type text;
alter table public.reports add constraint resolution_length check (char_length(coalesce(resolution_note, '')) <= 1000);

-- Délais maximum d'exécution des requêtes (déjà configurés sur Supabase hébergé ;
-- appliqués ici pour les autres environnements). Ignoré si le rôle n'est pas modifiable.
do $$ begin
  execute 'alter role anon set statement_timeout = ''5s''';
  execute 'alter role authenticated set statement_timeout = ''10s''';
exception when insufficient_privilege then null;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Catalogue et imports sûrs en concurrence
--    • création de fiche : si une autre transaction crée la même fiche au même
--      moment, on relit celle-ci au lieu d'échouer ;
--    • import : lignes traitées dans un ordre stable (par fiche) pour que deux
--      imports simultanés ne s'interbloquent pas.
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

  for attempt in 1..3 loop
    select id into cid from public.medicine_catalog
     where merged_into is null and review_status <> 'rejected'
       and public.normalize_text(brand_name) = public.normalize_text(v_brand)
       and public.normalize_text(coalesce(dosage, '')) = public.normalize_text(coalesce(p ->> 'dosage', ''))
       and public.normalize_text(coalesce(form, '')) = public.normalize_text(coalesce(p ->> 'form', ''))
       and public.normalize_text(coalesce(packaging, '')) = public.normalize_text(coalesce(p ->> 'packaging', ''));
    if cid is not null then return cid; end if;
    begin
      insert into public.medicine_catalog (brand_name, generic_name, active_ingredient, dosage, form, packaging, manufacturer,
                                           category_id, requires_prescription, review_status, created_by)
      values (v_brand, nullif(trim(p ->> 'generic_name'), ''), nullif(trim(p ->> 'active_ingredient'), ''),
              nullif(trim(p ->> 'dosage'), ''), nullif(trim(p ->> 'form'), ''), nullif(trim(p ->> 'packaging'), ''),
              nullif(trim(p ->> 'manufacturer'), ''), v_category,
              coalesce((p ->> 'requires_prescription')::boolean, false) or coalesce(cat_rx, false),
              case when admin then 'approved' else 'pending' end, uid)
      returning id into cid;
      return cid;
    exception when unique_violation then
      null; -- créée en parallèle par une autre transaction : relecture au tour suivant
    end;
  end loop;
  raise exception 'PP409: fiche catalogue en cours de création, réessayez';
end $$;

create or replace function public.import_inventory(p_pharmacy uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  rec record; ok int := 0; errors jsonb := '[]'::jsonb; cid uuid;
begin
  perform public.require_auth();
  if not public.can_manage_pharmacy(p_pharmacy) then raise exception 'PP403: vous ne gérez pas cette pharmacie'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'PP422: 2000 lignes maximum par import';
  end if;
  for rec in
    select value as r, ordinality as line
    from jsonb_array_elements(p_rows) with ordinality
    order by public.normalize_text(value ->> 'brand_name'), public.normalize_text(coalesce(value ->> 'dosage', '')),
             public.normalize_text(coalesce(value ->> 'form', '')), public.normalize_text(coalesce(value ->> 'packaging', '')), ordinality
  loop
    begin
      cid := public.upsert_catalog_item(rec.r);
      perform public.set_inventory(p_pharmacy, cid, (rec.r ->> 'quantity')::int, nullif(rec.r ->> 'price_xof', '')::int,
                                   coalesce((rec.r ->> 'is_available')::boolean, true), null, 'Import CSV', 'import');
      ok := ok + 1;
    exception when others then
      errors := errors || jsonb_build_object('row', rec.line, 'error', regexp_replace(sqlerrm, '^PP[0-9]+: ', ''));
    end;
  end loop;
  select coalesce(jsonb_agg(e order by (e ->> 'row')::int), '[]'::jsonb) into errors from jsonb_array_elements(errors) e;
  return jsonb_build_object('imported', ok, 'failed', jsonb_array_length(errors), 'errors', errors);
end $$;
