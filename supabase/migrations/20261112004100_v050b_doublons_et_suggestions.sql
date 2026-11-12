-- v050b — Doublons d'écriture et classement des suggestions
--
-- Doublons : 4 présentations écrites autrement qu'en LNME (« 20 mg/120 mg »
-- contre « 20 mg + 120 mg », « 1 g » contre « 1000 mg »). Même DCI, même forme,
-- même dosage une fois les unités uniformisées : ce sont les mêmes produits.
-- La fiche LNME est conservée ; l'autre est rattachée par merged_into, comme le
-- fait admin_merge_catalog. Aucune des fiches absorbées n'avait de stock ni de
-- marque. Rien n'est supprimé. Aucun regroupement de formes ou de dosages
-- différents.
--
-- Suggestions : les fiches de démonstration passaient devant les vraies, et
-- « paracétamol 500 » ne mettait pas le comprimé 500 mg en tête.

with pairs(keep_id, remove_id, motif) as (values
  ('5f13ec1d-305e-4fa3-aa44-af052a38ff86'::uuid, 'c10d381b-e55c-4ea9-aa39-708a5d2f76cf'::uuid, 'Artéméther + Luméfantrine Comprimé : « 20 mg/120 mg » = « 20 mg + 120 mg »'),
  ('f8c5fa6a-42c6-469b-89f1-76593559951b'::uuid, '2cf217d2-5108-4c58-af0b-e79bc17158b1'::uuid, 'Artéméther + Luméfantrine Comprimé dispersible : « 20 mg/120 mg » = « 20 mg + 120 mg »'),
  ('00153eb7-afc7-4915-8164-64eb3278b5c9'::uuid, 'dc6f2458-5094-46dc-9dd5-8cf1be0ff07a'::uuid, 'Sulfadoxine + Pyriméthamine Comprimé : « 500 mg/25 mg » = « 500 mg + 25 mg »'),
  ('5c3d6b14-fd7b-4979-89ac-07f6d3206a6f'::uuid, '45a388e5-29ca-4def-84eb-f5b4a358d2d6'::uuid, 'Amoxicilline + Acide clavulanique Comprimé : « 1 g/125 mg » = « 1000 mg + 125 mg »')
),
ok as (
  select p.* from pairs p
  where not exists (select 1 from public.pharmacy_inventory i where i.catalog_id = p.remove_id)
    and exists (select 1 from public.medicine_catalog c where c.id = p.keep_id and c.merged_into is null)
),
moved as (
  update public.medicine_identifiers m set catalog_id = ok.keep_id
    from ok
   where m.catalog_id = ok.remove_id
     and not exists (select 1 from public.medicine_identifiers x where x.catalog_id = ok.keep_id and x.id_type = m.id_type)
  returning m.id
),
merged as (
  update public.medicine_catalog c
     set merged_into = ok.keep_id,
         catalog_note = left(concat_ws(' ', c.catalog_note, 'Doublon d''écriture fusionné (v050b) : ' || ok.motif), 300)
    from ok
   where c.id = ok.remove_id and c.merged_into is null
  returning c.id, ok.keep_id, ok.motif
)
insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
select null, 'catalog.merge', 'catalog', merged.id::text, jsonb_build_object('into', merged.keep_id, 'motif', merged.motif, 'migration', 'v050b')
from merged;

create or replace function public.suggest_medicines(p_query text, p_limit integer default 8)
returns table (catalog_id uuid, label text, active_ingredient text)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $fn$
  with q as (select public.normalize_text(p_query) as t)
  select c.id,
         c.brand_name || coalesce(' ' || c.dosage, '') || coalesce(' — ' || c.form, ''),
         c.active_ingredient
  from public.medicine_catalog c, q
  where char_length(q.t) >= 2
    and c.merged_into is null and c.review_status <> 'rejected'
    and (c.search_text like '%' || q.t || '%' or c.search_text % q.t
         or public.all_words_match(c.search_text, q.t))
  order by public.all_words_match(c.search_text, q.t) desc,
           c.is_demo asc,
           (public.normalize_text(c.generic_name) like q.t || '%'
            or public.normalize_text(c.brand_name) like q.t || '%') desc,
           c.lnme_2024 desc,
           similarity(c.search_text, q.t) desc,
           c.generic_name, c.dosage
  limit least(greatest(coalesce(p_limit, 8), 1), 20)
$fn$;
