-- v049c lot 4 — statut AMM des présentations, à partir des marques rattachées
update public.medicine_catalog c
   set amm_status = 'verifiee',
       amm_reference = left('Au moins une spécialité à visa valide (nomenclature DPM 2024)', 80)
 where exists (select 1 from public.medicine_brands b where b.catalog_id = c.id and b.status = 'nomenclature_2024');
