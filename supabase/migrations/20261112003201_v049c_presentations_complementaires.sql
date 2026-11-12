-- v049c lot 1 — présentations complémentaires (DCI « première nécessité » absentes de la LNME)
-- Chaque présentation est déduite de spécialités ayant un visa valide dans la
-- nomenclature DPM 2024 : dosage et forme lus dans la désignation officielle.
insert into public.import_catalogue_2026
  (dci, forme, dosage, family, families, subfamily, lnme_ref, regulation, tier, cold_chain, source)
select v.dci, v.forme, v.dosage, v.family, array[v.family], v.sub, null, v.reg, 'premiere_necessite', false, 'Nomenclature nationale des médicaments autorisés au Mali, DPM, février 2024'
from (values
('Kétoprofène','Comprimé','100 mg','analgesiques','Anti-inflammatoires non stéroïdiens','prescription'),
('Cétirizine','Comprimé','10 mg','antiallergiques','Antihistaminiques','libre'),
('Cétirizine','Solution buvable','1 mg/ml','antiallergiques','Antihistaminiques','libre'),
('Desloratadine','Comprimé','5 mg','antiallergiques','Antihistaminiques','libre'),
('Desloratadine','Solution buvable','0.5 mg/ml','antiallergiques','Antihistaminiques','libre'),
('Dextrométhorphane','Solution buvable','1.5 mg/ml','respiratoires','Antitussifs','prescription'),
('Ambroxol','Sirop','6 mg/ml','respiratoires','Mucolytiques','libre'),
('Ambroxol','Sirop','15 mg/5 ml','respiratoires','Mucolytiques','libre'),
('Diosmectite','Suspension buvable','3 g','digestifs','Antidiarrhéiques','libre'),
('Pantoprazole','Injectable','40 mg','digestifs','Antiulcéreux','prescription'),
('Ésoméprazole','Comprimé','40 mg','digestifs','Antiulcéreux','prescription'),
('Ésoméprazole','Comprimé','20 mg','digestifs','Antiulcéreux','prescription'),
('Ésoméprazole','Injectable','40 mg','digestifs','Antiulcéreux','prescription')
) as v(dci, forme, dosage, family, sub, reg)
where not exists (select 1 from public.import_catalogue_2026 i where i.dci = v.dci
  and coalesce(i.forme,'') = coalesce(v.forme,'') and coalesce(i.dosage,'') = coalesce(v.dosage,''));

-- fiche existante identique : enrichie ; sinon créée
update public.import_catalogue_2026 i
   set catalog_id = c.id, action = 'enrichie'
  from public.medicine_catalog c
 where i.catalog_id is null and i.source = 'Nomenclature nationale des médicaments autorisés au Mali, DPM, février 2024'
   and not c.is_demo and c.merged_into is null
   and public.geo_key(coalesce(c.generic_name, c.brand_name)) = public.geo_key(i.dci)
   and public.catalog_dosage_key(c.dosage) = public.catalog_dosage_key(i.dosage)
   and public.geo_key(c.form) = public.geo_key(i.forme);

update public.medicine_catalog c
   set therapeutic_family = i.family, therapeutic_families = i.families, therapeutic_subfamily = i.subfamily,
       regulatory_class = i.regulation, priority_tier = i.tier, catalog_source = left(i.source, 200)
  from public.import_catalogue_2026 i
 where i.action = 'enrichie' and i.catalog_id = c.id and i.source = 'Nomenclature nationale des médicaments autorisés au Mali, DPM, février 2024';

with ins as (
  insert into public.medicine_catalog
    (brand_name, generic_name, active_ingredient, dosage, form, category_id, regulatory_class, review_status,
     therapeutic_family, therapeutic_families, therapeutic_subfamily, priority_tier, catalog_source)
  select i.dci, i.dci, i.dci, i.dosage, i.forme,
         (select id from public.product_categories where name = case i.regulation
            when 'libre' then 'Médicaments sans ordonnance' else 'Médicaments sur ordonnance' end),
         i.regulation, 'approved', i.family, i.families, i.subfamily, i.tier, left(i.source, 200)
    from public.import_catalogue_2026 i
   where i.catalog_id is null and i.source = 'Nomenclature nationale des médicaments autorisés au Mali, DPM, février 2024'
  on conflict do nothing
  returning id, generic_name, dosage, form
)
update public.import_catalogue_2026 i
   set catalog_id = ins.id, action = 'creee'
  from ins
 where i.catalog_id is null and i.source = 'Nomenclature nationale des médicaments autorisés au Mali, DPM, février 2024' and i.dci = ins.generic_name
   and coalesce(i.dosage,'') = coalesce(ins.dosage,'') and coalesce(i.forme,'') = coalesce(ins.form,'');
