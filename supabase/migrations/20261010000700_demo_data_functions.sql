-- ============================================================================
-- PharmaProxi — Migration 0007 : installation / suppression des données de
-- démonstration. Toutes les lignes créées portent is_demo = true et les
-- pharmacies sont nommées « Pharmacie DÉMO … ». Aucune ne correspond à une
-- pharmacie réelle ; les prix et quantités sont fictifs.
-- Fonctions exécutables uniquement par service_role (script npm run demo:*).
-- ============================================================================

create or replace function public.demo_install(p_users jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u_admin uuid := (p_users ->> 'admin')::uuid;
  u_ph1 uuid := (p_users ->> 'pharmacist1')::uuid;
  u_ph2 uuid := (p_users ->> 'pharmacist2')::uuid;
  u_cust uuid := (p_users ->> 'customer')::uuid;
  u_cour uuid := (p_users ->> 'courier')::uuid;
  r_bko uuid; c3 uuid; c4 uuid; c6 uuid; r_seg uuid; c_seg uuid;
  l1 uuid; l2 uuid; l3 uuid; l4 uuid;
  ph1 uuid; ph2 uuid; ph3 uuid;
  cat_otc uuid; cat_rx uuid; cat_para uuid;
  m record; inv1 uuid; o1 uuid; addr uuid;
  hours jsonb := '{"mon":[["08:00","22:00"]],"tue":[["08:00","22:00"]],"wed":[["08:00","22:00"]],"thu":[["08:00","22:00"]],"fri":[["08:00","22:00"]],"sat":[["08:00","22:00"]],"sun":[["09:00","13:00"]]}';
begin
  if exists (select 1 from public.pharmacies where is_demo) then
    raise exception 'Les données de démonstration sont déjà installées';
  end if;

  update public.profiles set is_demo = true where id in (u_admin, u_ph1, u_ph2, u_cust, u_cour);
  update public.profiles set full_name = 'Admin Démo' where id = u_admin;
  update public.profiles set full_name = 'Pharmacien Démo 1', phone = '+22370000001' where id = u_ph1;
  update public.profiles set full_name = 'Pharmacien Démo 2', phone = '+22370000002' where id = u_ph2;
  update public.profiles set full_name = 'Client Démo', phone = '+22370000003' where id = u_cust;
  update public.profiles set full_name = 'Livreur Démo', phone = '+22370000004' where id = u_cour;
  insert into public.user_roles (user_id, role) values (u_admin, 'admin'), (u_ph1, 'pharmacist'), (u_ph2, 'pharmacist'), (u_cour, 'courier')
  on conflict do nothing;

  -- Géographie de test (quartiers fictifs ; région de démonstration distincte)
  select id into r_bko from public.regions where name = 'District de Bamako';
  select id into c3 from public.communes where region_id = r_bko and name = 'Commune III';
  select id into c4 from public.communes where region_id = r_bko and name = 'Commune IV';
  select id into c6 from public.communes where region_id = r_bko and name = 'Commune VI';
  insert into public.localities (commune_id, name, is_demo) values (c3, 'Quartier Démo A', true) returning id into l1;
  insert into public.localities (commune_id, name, is_demo) values (c4, 'Quartier Démo B', true) returning id into l2;
  insert into public.localities (commune_id, name, is_demo) values (c6, 'Quartier Démo C', true) returning id into l3;
  select id into r_seg from public.regions where name = 'Ségou';
  insert into public.communes (region_id, name, is_demo, source) values (r_seg, 'Commune Démo de Ségou', true, 'DÉMO') returning id into c_seg;
  insert into public.localities (commune_id, name, is_demo) values (c_seg, 'Quartier Démo D', true) returning id into l4;

  -- Pharmacies fictives (coordonnées approximatives, uniquement pour la démonstration)
  insert into public.pharmacies (name, status, address, region_id, commune_id, locality_id, latitude, longitude, phone, opening_hours, hours_verified, offers_pickup, offers_delivery, verified_at, is_demo, created_by)
  values ('Pharmacie DÉMO du Fleuve', 'verified', 'Adresse de démonstration n°1', r_bko, c3, l1, 12.6450, -8.0000, '+22370000101', hours, true, true, true, now(), true, u_ph1)
  returning id into ph1;
  insert into public.pharmacies (name, status, address, region_id, commune_id, locality_id, latitude, longitude, phone, opening_hours, hours_verified, offers_pickup, offers_delivery, verified_at, is_demo, created_by)
  values ('Pharmacie DÉMO des Collines', 'verified', 'Adresse de démonstration n°2', r_bko, c4, l2, 12.6300, -8.0300, '+22370000102', hours, false, true, false, now(), true, u_ph2)
  returning id into ph2;
  insert into public.pharmacies (name, status, address, region_id, commune_id, locality_id, latitude, longitude, phone, opening_hours, hours_verified, offers_pickup, offers_delivery, is_demo, created_by)
  values ('Pharmacie DÉMO en attente', 'pending', 'Adresse de démonstration n°3', r_seg, c_seg, l4, null, null, '+22370000103', '{}'::jsonb, false, true, false, true, u_ph2)
  returning id into ph3;

  insert into public.pharmacy_private (pharmacy_id, pharmacist_in_charge, license_number) values
    (ph1, 'Pharmacien Démo 1', 'DEMO-0001'), (ph2, 'Pharmacien Démo 2', 'DEMO-0002'), (ph3, 'Pharmacien Démo 2', 'DEMO-0003');
  insert into public.pharmacy_members (pharmacy_id, user_id, member_role) values (ph1, u_ph1, 'owner'), (ph2, u_ph2, 'owner'), (ph3, u_ph2, 'owner');
  insert into public.pharmacy_verifications (pharmacy_id, decision, reason, reviewer_id) values
    (ph1, 'verified', 'Données de démonstration', u_admin), (ph2, 'verified', 'Données de démonstration', u_admin),
    (ph3, 'pending', 'Données de démonstration', u_ph2);

  select id into cat_otc from public.product_categories where name = 'Médicaments sans ordonnance';
  select id into cat_rx from public.product_categories where name = 'Médicaments sur ordonnance';
  select id into cat_para from public.product_categories where name = 'Parapharmacie et hygiène';
  update public.product_categories set delivery_allowed = true where id in (cat_otc, cat_para) and delivery_allowed = false;
  insert into public.platform_settings (key, value, description)
  values ('demo_enabled_delivery', 'true', 'Livraison activée par le script de démonstration ; remise à false à la désinstallation.')
  on conflict (key) do nothing;
  update public.platform_settings set value = 'true' where key = 'delivery_enabled';

  -- Produits de démonstration (dénominations génériques ; prix et stocks fictifs)
  for m in select * from (values
      ('DÉMO Paracétamol', 'Paracétamol', 'Paracétamol', '500 mg', 'Comprimé', 'Boîte de 16', cat_otc, false, 600, 40, 30),
      ('DÉMO Ibuprofène', 'Ibuprofène', 'Ibuprofène', '400 mg', 'Comprimé', 'Boîte de 20', cat_otc, false, 1200, 8, 0),
      ('DÉMO Amoxicilline', 'Amoxicilline', 'Amoxicilline', '500 mg', 'Gélule', 'Boîte de 12', cat_rx, true, 2500, 15, 10),
      ('DÉMO Solution de réhydratation orale', 'SRO', 'Sels de réhydratation', '20,5 g', 'Poudre', 'Sachet', cat_otc, false, 150, 100, 3),
      ('DÉMO Gel hydroalcoolique', null, null, '100 ml', 'Gel', 'Flacon', cat_para, false, 1000, 0, 25),
      ('DÉMO Artéméther-Luméfantrine', 'Artéméther + Luméfantrine', 'Artéméther, Luméfantrine', '20/120 mg', 'Comprimé', 'Boîte de 24', cat_rx, true, 3000, 5, 0)
    ) as t(brand, generic, active, dosage, form, pack, cat, rx, price, q1, q2)
  loop
    insert into public.medicine_catalog (brand_name, generic_name, active_ingredient, dosage, form, packaging, category_id, requires_prescription, review_status, is_demo)
    values (m.brand, m.generic, m.active, m.dosage, m.form, m.pack, m.cat, m.rx, 'approved', true)
    returning id into inv1;
    insert into public.pharmacy_inventory (pharmacy_id, catalog_id, price_xof, quantity, is_available, stock_updated_at, is_demo)
    values (ph1, inv1, m.price, m.q1, m.q1 > 0, now() - interval '2 hours', true);
    -- Deuxième pharmacie : stock plus ancien pour illustrer les niveaux de fraîcheur
    insert into public.pharmacy_inventory (pharmacy_id, catalog_id, price_xof, quantity, is_available, stock_updated_at, is_demo)
    values (ph2, inv1, m.price + 100, m.q2, m.q2 > 0,
            now() - case when m.q2 = 0 then interval '5 days' when m.q2 > 20 then interval '36 hours' else interval '1 hour' end, true);
  end loop;

  -- Livreur vérifié de démonstration
  insert into public.couriers (user_id, status, phone, vehicle, zone_region_id, id_document_ref, verified_at, verified_by, is_demo)
  values (u_cour, 'verified', '+22370000004', 'moto', r_bko, 'DEMO-PIECE', now(), u_admin, true)
  on conflict (user_id) do update set status = 'verified', is_demo = true;

  -- Adresse et commande de test
  insert into public.customer_addresses (user_id, label, region_id, commune_id, locality_id, address_line, landmark, contact_phone, is_default)
  values (u_cust, 'Démo', r_bko, c3, l1, 'Adresse client de démonstration', 'Repère de démonstration', '+22370000003', true)
  returning id into addr;

  select i.id into inv1 from public.pharmacy_inventory i join public.medicine_catalog c on c.id = i.catalog_id
   where i.pharmacy_id = ph1 and c.brand_name = 'DÉMO Paracétamol';
  insert into public.orders (customer_id, pharmacy_id, fulfillment, payment_method, subtotal_xof, idempotency_key, confirmation_expires_at, is_demo)
  values (u_cust, ph1, 'pickup', 'pay_at_pharmacy', 1200, 'demo-order-0001', now() + interval '1 day', true)
  returning id into o1;
  insert into public.order_items (order_id, inventory_id, catalog_id, product_label, quantity, unit_price_xof)
  select o1, inv1, catalog_id, 'DÉMO Paracétamol 500 mg (Comprimé)', 2, 600 from public.pharmacy_inventory where id = inv1;
  insert into public.order_status_history (order_id, to_status, actor_id, note) values (o1, 'pending_confirmation', u_cust, 'Commande de démonstration');
  insert into public.notifications (user_id, kind, title, body, order_id, link)
  select user_id, 'order_new', 'Nouvelle demande (démo)', 'Commande de démonstration à confirmer.', o1, '/pharmacien/commandes/' || o1
  from public.pharmacy_members where pharmacy_id = ph1;

  return jsonb_build_object('pharmacies', jsonb_build_array(ph1, ph2, ph3), 'order', o1);
end $$;

create or replace function public.demo_uninstall()
returns jsonb language plpgsql security definer set search_path = public as $$
declare demo_users uuid[]; n_orders int; n_pharm int;
begin
  select coalesce(array_agg(id), '{}') into demo_users from public.profiles where is_demo;

  delete from public.notifications where user_id = any(demo_users)
    or order_id in (select id from public.orders where is_demo or pharmacy_id in (select id from public.pharmacies where is_demo) or customer_id = any(demo_users));
  with d as (
    delete from public.orders
    where is_demo or pharmacy_id in (select id from public.pharmacies where is_demo) or customer_id = any(demo_users)
    returning 1)
  select count(*) into n_orders from d;
  delete from public.reports where pharmacy_id in (select id from public.pharmacies where is_demo) or reporter_id = any(demo_users);
  delete from public.inventory_movements where pharmacy_id in (select id from public.pharmacies where is_demo);
  delete from public.pharmacy_inventory where is_demo or pharmacy_id in (select id from public.pharmacies where is_demo);
  with d as (delete from public.pharmacies where is_demo returning 1) select count(*) into n_pharm from d;
  delete from public.medicine_catalog where is_demo and not exists (select 1 from public.pharmacy_inventory i where i.catalog_id = medicine_catalog.id)
    and not exists (select 1 from public.order_items oi where oi.catalog_id = medicine_catalog.id);
  delete from public.customer_addresses where user_id = any(demo_users);
  delete from public.couriers where is_demo or user_id = any(demo_users);
  delete from public.localities where is_demo;
  delete from public.communes where is_demo;
  delete from public.user_roles where user_id = any(demo_users);

  if exists (select 1 from public.platform_settings where key = 'demo_enabled_delivery') then
    update public.platform_settings set value = 'false' where key = 'delivery_enabled';
    update public.product_categories set delivery_allowed = false;
    delete from public.platform_settings where key = 'demo_enabled_delivery';
  end if;

  return jsonb_build_object('orders_deleted', n_orders, 'pharmacies_deleted', n_pharm, 'demo_users', to_jsonb(demo_users));
end $$;

revoke execute on function public.demo_install(jsonb) from public, anon, authenticated;
revoke execute on function public.demo_uninstall() from public, anon, authenticated;
grant execute on function public.demo_install(jsonb) to service_role;
grant execute on function public.demo_uninstall() to service_role;
grant execute on function public.expire_overdue_orders() to service_role;
