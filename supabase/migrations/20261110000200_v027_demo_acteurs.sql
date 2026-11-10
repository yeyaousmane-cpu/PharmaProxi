-- =============================================================================
-- SantéProxi 0.27 — Démonstration : acteurs supplémentaires (laboratoire, institution, validateur médical,
-- auditeur conformité) et données fictives associées.
-- Ces fonctions ne font rien en production : elles refusent de s'exécuter si le réglage
-- « demo_environment » n'est pas activé, et ce réglage n'existe que dans le projet de démonstration.
-- Réservées au rôle service (aucun utilisateur ne peut les appeler).
-- =============================================================================

create or replace function public.demo_guard() returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce((select value from public.platform_settings where key = 'demo_environment'), 'false'::jsonb) <> 'true'::jsonb then
    raise exception 'PP403: fonction réservée à l''environnement de démonstration';
  end if;
end $$;
revoke execute on function public.demo_guard() from public, anon, authenticated;

create or replace function public.demo_extra_install(p_users jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare lab_id uuid; v_region uuid; n_exams int; v_patient uuid := (p_users ->> 'customer')::uuid;
begin
  perform public.demo_guard();
  select id into v_region from public.regions order by (name ilike '%bamako%') desc, name limit 1;

  -- Laboratoire fictif et son responsable
  select id into lab_id from public.facility_listings where source = 'démonstration' and kind = 'laboratoire' limit 1;
  if lab_id is null then
    insert into public.facility_listings (name, kind, category_label, region_id, city_label, address, latitude, longitude, source, is_published)
    values ('Laboratoire Démo Hamdallaye (démonstration)', 'laboratoire', 'Laboratoire d''analyses', v_region, 'Bamako', 'Adresse fictive — Hamdallaye ACI', 12.6330, -8.0270, 'démonstration', true)
    returning id into lab_id;
  end if;
  if p_users ? 'lab' then
    insert into public.facility_members (facility_id, user_id, role) values (lab_id, (p_users ->> 'lab')::uuid, 'responsable') on conflict do nothing;
  end if;
  insert into public.facility_exams (facility_id, exam_id, price_xof, price_note, delay, source, verified_at)
  select lab_id, e.id, (array[3000, 5000, 7500, 10000, 12500, 15000])[1 + (row_number() over (order by e.name))::int % 6], 'Tarif fictif de démonstration', '24 h', 'démonstration', now()
  from (select id, name from public.medical_exams where is_active order by name limit 8) e
  on conflict do nothing;
  get diagnostics n_exams = row_count;

  -- Institution sanitaire fictive
  if p_users ? 'institution' then
    insert into public.authority_members (user_id, scope, organisation, title)
    values ((p_users ->> 'institution')::uuid, 'ministere', 'Direction de démonstration (fictive)', 'Chargé(e) de suivi — compte de démonstration')
    on conflict (user_id) do nothing;
  end if;

  -- Validateur médical et rédactrice (bibliothèque santé)
  if p_users ? 'validator' then
    insert into public.health_staff (user_id, role, display_name, credentials)
    values ((p_users ->> 'validator')::uuid, 'validator', 'Dr Démo Validatrice (fictive)', 'Compte de démonstration — aucune qualification réelle')
    on conflict do nothing;
  end if;

  -- Auditeur conformité (lecture seule)
  if p_users ? 'auditor' then
    insert into public.compliance_members (user_id, role) values ((p_users ->> 'auditor')::uuid, 'auditeur') on conflict (user_id) do nothing;
  end if;

  -- Calendrier de prévention : exemples clairement fictifs
  if not exists (select 1 from public.prevention_events where source_name = 'Donnée fictive de démonstration') then
    insert into public.prevention_events (kind, title, description, starts_on, ends_on, region_id, place, organizer, source_name, public_concerned, is_free, status)
    values
      ('depistage', '(Démonstration) Journée fictive de dépistage du diabète', 'Exemple fictif pour découvrir le calendrier de prévention.', current_date + 7, current_date + 7, v_region, 'Lieu fictif', 'Organisme fictif', 'Donnée fictive de démonstration', 'Adultes', true, 'publie'),
      ('vaccination', '(Démonstration) Semaine fictive de vaccination', 'Exemple fictif : aucune campagne réelle n''est annoncée ici.', current_date + 14, current_date + 20, v_region, null, 'Organisme fictif', 'Donnée fictive de démonstration', 'Enfants de 0 à 5 ans', true, 'publie'),
      ('journee_mondiale', '(Démonstration) Journée mondiale — exemple', 'Exemple de journée de sensibilisation.', current_date + 30, null, null, null, 'Organisme fictif', 'Donnée fictive de démonstration', null, null, 'publie');
  end if;

  -- Notifications d'exemple pour le patient
  if v_patient is not null and not exists (select 1 from public.notifications where user_id = v_patient and title like '(Démo)%') then
    insert into public.notifications (user_id, kind, title, body, link) values
      (v_patient, 'info', '(Démo) Bienvenue dans la démonstration', 'Toutes les données de ce compte sont fictives.', '/demo'),
      (v_patient, 'info', '(Démo) Une journée de dépistage approche', 'Consultez le calendrier de prévention.', '/prevention');
  end if;

  return jsonb_build_object('laboratoire', lab_id, 'analyses_tarifees', n_exams);
end $$;
revoke execute on function public.demo_extra_install(jsonb) from public, anon, authenticated;
grant execute on function public.demo_extra_install(jsonb) to service_role;

create or replace function public.demo_extra_uninstall()
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform public.demo_guard();
  delete from public.prevention_events where source_name = 'Donnée fictive de démonstration';
  delete from public.notifications where title like '(Démo)%';
  delete from public.facility_listings where source = 'démonstration';
  get diagnostics n = row_count;
  return jsonb_build_object('etablissements_supprimes', n);
end $$;
revoke execute on function public.demo_extra_uninstall() from public, anon, authenticated;
grant execute on function public.demo_extra_uninstall() to service_role;
