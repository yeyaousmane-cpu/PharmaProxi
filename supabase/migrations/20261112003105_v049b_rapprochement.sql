-- v049b — rapprochement, enrichissement et création des présentations


-- Rapprochement avec les fiches existantes (hors démo, hors fusionnées).
update public.import_catalogue_2026 i
   set catalog_id = c.id, action = 'enrichie'
  from public.medicine_catalog c
 where i.catalog_id is null and i.source = 'LNME Mali 2024 (annexe de l''arrêté n° 2024-4004/MSDS-SG du 28/10/2024), liste niveau hôpital'
   and not c.is_demo and c.merged_into is null
   and public.geo_key(coalesce(c.generic_name, c.brand_name)) = public.geo_key(i.dci)
   and public.catalog_dosage_key(c.dosage) = public.catalog_dosage_key(i.dosage)
   and public.geo_key(c.form) = public.geo_key(i.forme);

update public.medicine_catalog c
   set therapeutic_family = i.family,
       therapeutic_families = i.families,
       therapeutic_subfamily = i.subfamily,
       regulatory_class = i.regulation,
       priority_tier = i.tier,
       cold_chain = i.cold_chain,
       lnme_2024 = true,
       lnme_reference = i.lnme_ref,
       catalog_source = left(i.source, 200),
       catalog_note = coalesce(c.catalog_note, i.note)
  from public.import_catalogue_2026 i
 where i.action = 'enrichie' and i.catalog_id = c.id;

-- Nouvelles présentations.
with ins as (
  insert into public.medicine_catalog
    (brand_name, generic_name, active_ingredient, dosage, form, category_id, regulatory_class,
     review_status, therapeutic_family, therapeutic_families, therapeutic_subfamily, priority_tier,
     cold_chain, lnme_2024, lnme_reference, catalog_source, catalog_note)
  select i.dci, i.dci, i.dci, i.dosage, i.forme,
         (select id from public.product_categories where name = case i.regulation
            when 'libre' then 'Médicaments sans ordonnance'
            when 'dispositif' then 'Dispositifs médicaux'
            when 'controle' then 'Produits stupéfiants et psychotropes'
            else 'Médicaments sur ordonnance' end),
         i.regulation, 'approved', i.family, i.families, i.subfamily, i.tier, i.cold_chain, true,
         i.lnme_ref, left(i.source, 200), i.note
    from public.import_catalogue_2026 i
   where i.catalog_id is null and i.source = 'LNME Mali 2024 (annexe de l''arrêté n° 2024-4004/MSDS-SG du 28/10/2024), liste niveau hôpital'
  on conflict do nothing
  returning id, generic_name, dosage, form
)
update public.import_catalogue_2026 i
   set catalog_id = ins.id, action = 'creee'
  from ins
 where i.catalog_id is null and i.source = 'LNME Mali 2024 (annexe de l''arrêté n° 2024-4004/MSDS-SG du 28/10/2024), liste niveau hôpital'
   and i.dci = ins.generic_name
   and coalesce(i.dosage, '') = coalesce(ins.dosage, '')
   and coalesce(i.forme, '') = coalesce(ins.form, '');

-- Les fiches enrichies gardent leur catégorie si elle est cohérente ; sinon on
-- l'aligne sur le classement (un stupéfiant n'est jamais « sans ordonnance »).
update public.medicine_catalog c
   set category_id = (select id from public.product_categories where name = case c.regulatory_class
            when 'libre' then 'Médicaments sans ordonnance'
            when 'dispositif' then 'Dispositifs médicaux'
            when 'controle' then 'Produits stupéfiants et psychotropes'
            else 'Médicaments sur ordonnance' end)
 where c.lnme_2024 and not c.is_demo;
