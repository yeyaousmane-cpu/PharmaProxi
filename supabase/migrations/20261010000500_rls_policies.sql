-- ============================================================================
-- PharmaProxi — Migration 0005 : Row Level Security
-- Principe : tout est fermé par défaut. Les lectures publiques sont limitées
-- aux données non sensibles des pharmacies vérifiées. Les écritures sensibles
-- (commandes, statuts, réservations, vérifications) passent exclusivement par
-- les fonctions de la migration 0004 : aucune politique INSERT/UPDATE directe
-- n'est accordée sur ces tables.
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'platform_settings','regions','circles','communes','localities','profiles','user_roles','audit_logs','content_pages',
    'pharmacies','pharmacy_private','pharmacy_members','pharmacy_documents','pharmacy_verifications',
    'product_categories','medicine_catalog','medicine_identifiers','pharmacy_inventory','inventory_batches','inventory_movements',
    'customer_addresses','couriers','orders','order_private_notes','order_items','stock_reservations','order_status_history',
    'deliveries','delivery_assignments','delivery_incidents','notifications','notification_outbox','reports','search_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Helpers supplémentaires
create or replace function public.is_assigned_courier_for_order(p_order uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.delivery_assignments a join public.deliveries d on d.id = a.delivery_id
    where d.order_id = p_order and a.courier_id = auth.uid()
      and (a.is_active or a.ended_at > now() - interval '24 hours'))
$$;

create or replace function public.can_see_order(p_order uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.orders o where o.id = p_order and (
      o.customer_id = auth.uid() or public.is_pharmacy_member(o.pharmacy_id) or public.is_admin()
      or public.is_assigned_courier_for_order(o.id)))
$$;

-- ---------------------------------------------------------------------------
-- Référentiels publics
-- ---------------------------------------------------------------------------
create policy "lecture publique" on public.platform_settings for select using (true);

create policy "lecture publique" on public.regions for select using (true);
create policy "admin écrit" on public.regions for all using (public.is_admin()) with check (public.is_admin());
create policy "lecture publique" on public.circles for select using (true);
create policy "admin écrit" on public.circles for all using (public.is_admin()) with check (public.is_admin());
create policy "lecture publique" on public.communes for select using (true);
create policy "admin écrit" on public.communes for all using (public.is_admin()) with check (public.is_admin());
create policy "lecture publique" on public.localities for select using (true);
create policy "admin écrit" on public.localities for all using (public.is_admin()) with check (public.is_admin());

create policy "lecture publique" on public.content_pages for select using (published or public.is_admin());
create policy "admin écrit" on public.content_pages for all using (public.is_admin()) with check (public.is_admin());

create policy "lecture publique" on public.product_categories for select using (true);
create policy "admin écrit" on public.product_categories for all using (public.is_admin()) with check (public.is_admin());

create policy "lecture catalogue" on public.medicine_catalog for select
  using (review_status <> 'rejected' or public.is_admin() or created_by = auth.uid());
create policy "admin met à jour" on public.medicine_catalog for update using (public.is_admin()) with check (public.is_admin());

create policy "lecture publique" on public.medicine_identifiers for select using (true);
create policy "admin écrit" on public.medicine_identifiers for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Profils et rôles
-- ---------------------------------------------------------------------------
create policy "soi-même ou admin" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "mise à jour de soi" on public.profiles for update
  using (id = auth.uid() and deleted_at is null)
  with check (id = auth.uid() and deleted_at is null); -- is_demo et deleted_at protégés par profiles_guard

-- Empêche un utilisateur de modifier les champs de suppression ou de démo
create or replace function public.profiles_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    new.deleted_at := old.deleted_at;
    new.deletion_requested_at := old.deletion_requested_at;
    new.is_demo := old.is_demo;
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function public.profiles_guard();

create policy "soi-même ou admin" on public.user_roles for select using (user_id = auth.uid() or public.is_admin());

create policy "admin lit" on public.audit_logs for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Pharmacies
-- ---------------------------------------------------------------------------
create policy "lecture publique des pharmacies vérifiées" on public.pharmacies for select
  using (status = 'verified' or public.is_pharmacy_member(id) or public.is_admin());
create policy "membres mettent à jour" on public.pharmacies for update
  using (public.can_manage_pharmacy(id) or public.is_admin())
  with check (public.can_manage_pharmacy(id) or public.is_admin());

create policy "membres et admin" on public.pharmacy_private for select using (public.is_pharmacy_member(pharmacy_id) or public.is_admin());
create policy "membres mettent à jour" on public.pharmacy_private for update
  using (public.can_manage_pharmacy(pharmacy_id)) with check (public.can_manage_pharmacy(pharmacy_id));

create policy "membres et admin" on public.pharmacy_members for select using (user_id = auth.uid() or public.is_pharmacy_member(pharmacy_id) or public.is_admin());

create policy "membres et admin" on public.pharmacy_documents for select using (public.is_pharmacy_member(pharmacy_id) or public.is_admin());
create policy "membres déposent" on public.pharmacy_documents for insert
  with check (public.can_manage_pharmacy(pharmacy_id) and uploaded_by = auth.uid()
              and storage_path like pharmacy_id::text || '/%');
create policy "membres retirent si en attente" on public.pharmacy_documents for delete
  using (public.is_pharmacy_member(pharmacy_id) and exists (select 1 from public.pharmacies p where p.id = pharmacy_id and p.status in ('pending', 'rejected')));

create policy "membres et admin" on public.pharmacy_verifications for select using (public.is_pharmacy_member(pharmacy_id) or public.is_admin());

-- ---------------------------------------------------------------------------
-- Stocks : réservés aux membres de la pharmacie et à l'administration.
-- Le public passe par search_inventory / pharmacy_public_inventory (sans quantités).
-- ---------------------------------------------------------------------------
create policy "membres et admin" on public.pharmacy_inventory for select using (public.is_pharmacy_member(pharmacy_id) or public.is_admin());
-- Mise à jour directe limitée au seuil d'alerte ; quantités et prix via set_inventory()
create policy "membres mettent à jour" on public.pharmacy_inventory for update
  using (public.can_manage_pharmacy(pharmacy_id)) with check (public.can_manage_pharmacy(pharmacy_id));

create or replace function public.inventory_guard()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and current_user in ('authenticated', 'anon') then
    if new.quantity is distinct from old.quantity or new.reserved_quantity is distinct from old.reserved_quantity
       or new.price_xof is distinct from old.price_xof or new.pharmacy_id is distinct from old.pharmacy_id
       or new.catalog_id is distinct from old.catalog_id or new.stock_updated_at is distinct from old.stock_updated_at
       or new.is_demo is distinct from old.is_demo then
      raise exception 'PP403: utilisez la mise à jour de stock dédiée';
    end if;
  end if;
  return new;
end $$;
create trigger inventory_guard before update on public.pharmacy_inventory for each row execute function public.inventory_guard();

create policy "membres et admin" on public.inventory_batches for select
  using (exists (select 1 from public.pharmacy_inventory i where i.id = inventory_id and (public.is_pharmacy_member(i.pharmacy_id) or public.is_admin())));
create policy "membres gèrent" on public.inventory_batches for all
  using (exists (select 1 from public.pharmacy_inventory i where i.id = inventory_id and public.can_manage_pharmacy(i.pharmacy_id)))
  with check (exists (select 1 from public.pharmacy_inventory i where i.id = inventory_id and public.can_manage_pharmacy(i.pharmacy_id)));

create policy "membres et admin" on public.inventory_movements for select using (public.is_pharmacy_member(pharmacy_id) or public.is_admin());

-- ---------------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------------
create policy "propriétaire" on public.customer_addresses for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Commandes (lecture seule ; écriture via fonctions)
-- ---------------------------------------------------------------------------
create policy "parties prenantes" on public.orders for select
  using (customer_id = auth.uid() or public.is_pharmacy_member(pharmacy_id) or public.is_admin() or public.is_assigned_courier_for_order(id));

-- Note privée : client et pharmacie uniquement (l'admin passe par admin_read_order_note, journalisé)
create policy "client et pharmacie" on public.order_private_notes for select
  using (exists (select 1 from public.orders o where o.id = order_id and (o.customer_id = auth.uid() or public.is_pharmacy_member(o.pharmacy_id))));

create policy "parties prenantes" on public.order_items for select using (public.can_see_order(order_id));
create policy "parties prenantes" on public.order_status_history for select using (public.can_see_order(order_id));
create policy "pharmacie et admin" on public.stock_reservations for select
  using (exists (select 1 from public.orders o where o.id = order_id and (public.is_pharmacy_member(o.pharmacy_id) or public.is_admin())));

-- ---------------------------------------------------------------------------
-- Livraison
-- ---------------------------------------------------------------------------
create policy "soi-même ou admin" on public.couriers for select using (user_id = auth.uid() or public.is_admin());
create policy "disponibilité" on public.couriers for update
  using (user_id = auth.uid() and status = 'verified') with check (user_id = auth.uid() and status = 'verified');

create or replace function public.couriers_guard()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.status is distinct from old.status or new.verified_at is distinct from old.verified_at
       or new.verified_by is distinct from old.verified_by or new.id_document_ref is distinct from old.id_document_ref
       or new.is_demo is distinct from old.is_demo then
      if current_user in ('authenticated', 'anon') then raise exception 'PP403: champ réservé à l''administration'; end if;
    end if;
  end if;
  return new;
end $$;
create trigger couriers_guard before update on public.couriers for each row execute function public.couriers_guard();

create policy "parties prenantes" on public.deliveries for select using (public.can_see_order(order_id));
create policy "livreur et admin" on public.delivery_assignments for select
  using (courier_id = auth.uid() or public.is_admin()
         or exists (select 1 from public.deliveries d join public.orders o on o.id = d.order_id
                    where d.id = delivery_id and (o.customer_id = auth.uid() or public.is_pharmacy_member(o.pharmacy_id))));
create policy "livreur et admin" on public.delivery_incidents for select
  using (reported_by = auth.uid() or public.is_admin()
         or exists (select 1 from public.deliveries d join public.orders o on o.id = d.order_id
                    where d.id = delivery_id and public.is_pharmacy_member(o.pharmacy_id)));

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create policy "destinataire" on public.notifications for select using (user_id = auth.uid());
create policy "destinataire marque comme lu" on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "destinataire supprime" on public.notifications for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Signalements
-- ---------------------------------------------------------------------------
create policy "auteur, pharmacie concernée, admin" on public.reports for select
  using (reporter_id = auth.uid() or public.is_admin() or (pharmacy_id is not null and public.is_pharmacy_member(pharmacy_id)));
create policy "utilisateur connecté signale" on public.reports for insert
  with check (auth.uid() is not null and reporter_id = auth.uid() and status = 'open' and handled_by is null and resolution_note is null);
create policy "admin traite" on public.reports for update using (public.is_admin()) with check (public.is_admin());

-- search_logs, notification_outbox : aucun accès direct (fonctions uniquement)
create policy "admin lit" on public.search_logs for select using (public.is_admin());
create policy "admin lit" on public.notification_outbox for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Privilèges : l'anonyme ne peut que lire. Les tables écrites par fonctions
-- n'accordent aucune écriture directe.
-- ---------------------------------------------------------------------------
revoke insert, update, delete, truncate on all tables in schema public from anon;
revoke truncate on all tables in schema public from authenticated;
revoke insert, update, delete on public.orders, public.order_items, public.stock_reservations, public.order_status_history,
  public.deliveries, public.delivery_assignments, public.delivery_incidents, public.inventory_movements, public.audit_logs,
  public.search_logs, public.notification_outbox, public.pharmacy_verifications, public.user_roles, public.order_private_notes,
  public.platform_settings, public.pharmacy_members
from authenticated;
revoke insert, delete on public.pharmacies, public.pharmacy_private, public.pharmacy_inventory, public.couriers, public.profiles from authenticated;
revoke insert, delete on public.medicine_catalog from authenticated;
revoke all on public.pharmacy_private, public.customer_addresses, public.notifications, public.audit_logs from anon;
