-- ============================================================================
-- PharmaProxi — Migration 0006 : stockage privé des justificatifs et
-- données de référence (géographie officielle de premier niveau, catégories,
-- pages d'information).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Bucket privé « pharmacy-documents » : chemin = <pharmacy_id>/<fichier>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pharmacy-documents', 'pharmacy-documents', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "pp_docs_member_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'pharmacy-documents'
              and public.can_manage_pharmacy(((storage.foldername(name))[1])::uuid));
create policy "pp_docs_member_or_admin_select" on storage.objects for select to authenticated
  using (bucket_id = 'pharmacy-documents'
         and (public.is_pharmacy_member(((storage.foldername(name))[1])::uuid) or public.is_admin()));
create policy "pp_docs_member_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'pharmacy-documents'
         and public.is_pharmacy_member(((storage.foldername(name))[1])::uuid)
         and exists (select 1 from public.pharmacies p where p.id = ((storage.foldername(name))[1])::uuid and p.status in ('pending', 'rejected')));

-- ---------------------------------------------------------------------------
-- Régions du Mali — Loi n°2023-006 du 13 mars 2023 (19 régions + District de Bamako).
-- À confronter à la nomenclature officielle à jour avant le lancement.
-- Les cercles, communes et quartiers sont importés par l'administration
-- (aucune donnée inventée), à l'exception des six communes du District de
-- Bamako, établies de longue date.
-- ---------------------------------------------------------------------------
insert into public.regions (country_code, name, code, is_district, source) values
  ('ML', 'District de Bamako', 'BKO', true,  'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Kayes',       null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Koulikoro',   null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Sikasso',     null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Ségou',       null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Mopti',       null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Tombouctou',  null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Gao',         null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Kidal',       null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Taoudénit',   null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Ménaka',      null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Bougouni',    null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Dioïla',      null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Nioro',       null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Koutiala',    null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Kita',        null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Nara',        null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Bandiagara',  null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'San',         null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Douentza',    null, false, 'Loi n°2023-006 du 13 mars 2023')
on conflict (country_code, name) do nothing;

insert into public.communes (region_id, circle_id, name, source)
select r.id, null, c.name, 'Communes du District de Bamako'
from public.regions r
cross join (values ('Commune I'), ('Commune II'), ('Commune III'), ('Commune IV'), ('Commune V'), ('Commune VI')) as c(name)
where r.name = 'District de Bamako'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Catégories de produits — livraison désactivée par défaut pour toutes.
-- L'administration active la livraison catégorie par catégorie après
-- vérification réglementaire.
-- ---------------------------------------------------------------------------
insert into public.product_categories (name, description, is_authorized, delivery_allowed, requires_prescription) values
  ('Médicaments sans ordonnance', 'Spécialités disponibles sans prescription (liste à valider selon la réglementation malienne).', true, false, false),
  ('Médicaments sur ordonnance', 'Retrait en pharmacie uniquement, sur présentation de l''ordonnance. Jamais livrés automatiquement.', true, false, true),
  ('Parapharmacie et hygiène', 'Produits d''hygiène, soins, puériculture.', true, false, false),
  ('Dispositifs médicaux', 'Thermomètres, pansements, tensiomètres…', true, false, false),
  ('Produits stupéfiants et psychotropes', 'Non référencés sur la plateforme.', false, false, true)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Pages d'information (éditables par l'administration)
-- ---------------------------------------------------------------------------
insert into public.content_pages (slug, title, body) values
('securite', 'Bon usage et sécurité',
'PharmaProxi aide à localiser des pharmacies et à connaître les disponibilités qu''elles déclarent. La plateforme ne pose aucun diagnostic et ne recommande aucun médicament.

- Demandez toujours conseil à un pharmacien ou à un médecin avant de prendre un médicament.
- Les médicaments soumis à ordonnance ne sont délivrés qu''en pharmacie, sur présentation de l''ordonnance.
- Méfiez-vous des médicaments vendus hors des pharmacies (marchés, vendeurs ambulants) : ils peuvent être falsifiés ou mal conservés.
- Une disponibilité affichée est une déclaration de la pharmacie à une date donnée. Vérifiez la date d''actualisation et demandez confirmation avant de vous déplacer.
- En cas d''urgence, contactez immédiatement les services d''urgence ou rendez-vous au centre de santé le plus proche.'),
('confidentialite', 'Politique de confidentialité',
'Version provisoire — à faire valider par un juriste au regard de la loi malienne sur la protection des données à caractère personnel et des exigences de l''autorité de protection des données (APDP).

Données collectées : nom, téléphone, adresse e-mail, adresses de livraison, historique des commandes. Aucune donnée médicale n''est demandée ; ne saisissez pas d''informations de santé dans les notes.
Finalités : mise en relation avec les pharmacies, suivi des commandes, sécurité de la plateforme.
Destinataires : la pharmacie choisie et, en cas de livraison, le livreur affecté reçoivent uniquement les informations nécessaires.
Les recherches sont enregistrées de manière anonyme à des fins statistiques.
Conservation : les commandes sont conservées pour la durée légale applicable ; la suppression du compte anonymise le profil.
Droits : accès, rectification, suppression depuis votre espace « Mon compte » ou en écrivant au contact de la plateforme.'),
('conditions', 'Conditions d''utilisation',
'Version provisoire — à faire valider juridiquement avant le lancement.

PharmaProxi est un service de mise en relation. Les pharmacies restent seules responsables des informations qu''elles publient (stocks, prix, horaires) et de la dispensation des médicaments.
Une demande de réservation n''engage la pharmacie qu''après sa confirmation. Le paiement s''effectue directement à la pharmacie ou au livreur ; la plateforme n''encaisse aucun paiement dans cette version.
Tout usage frauduleux, toute tentative d''obtenir un médicament sans ordonnance lorsque celle-ci est requise, ou toute fausse déclaration entraîne la suspension du compte.'),
('contact', 'Contact',
'Pour toute question, signalement ou demande relative à vos données : renseignez ici l''adresse e-mail et le numéro de téléphone officiels de PharmaProxi (à compléter par l''administration).')
on conflict (slug) do nothing;
