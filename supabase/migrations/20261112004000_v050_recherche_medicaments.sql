-- v050 — Recherche des médicaments par dosage, forme et nom courant
--
-- 1. La recherche ne portait que sur les noms : « paracétamol 500 » ou
--    « amoxicilline sirop » ne trouvaient rien. search_text couvre désormais
--    le dosage, la forme, la sous-famille et les noms courants.
-- 2. Noms courants : marques connues des patients mais ABSENTES de la
--    nomenclature DPM 2024 (Augmentin, Doliprane, Ventoline…). Elles servent
--    uniquement à retrouver la DCI ; la fiche précise qu'elles ne sont pas
--    inscrites. Elles ne sont jamais enregistrées comme marques autorisées.
--    Correspondance exacte de DCI : Doliprane n'est rattaché ni à
--    « Paracétamol + Codéine », ni Clamoxyl à l'association avec l'acide
--    clavulanique.
-- Source des correspondances : liste transmise par l'utilisateur le 12/11/2026.

alter table public.medicine_catalog
  add column if not exists common_names text not null default '';

do $c$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.medicine_catalog'::regclass
                  and conname = 'medicine_catalog_common_names_len') then
    alter table public.medicine_catalog
      add constraint medicine_catalog_common_names_len check (char_length(common_names) <= 1000);
  end if;
end $c$;

comment on column public.medicine_catalog.common_names is
  'Noms commerciaux courants, absents de la nomenclature DPM 2024 : servent à la recherche, jamais présentés comme spécialités autorisées au Mali.';

drop index if exists public.medicine_catalog_search_trgm;
alter table public.medicine_catalog drop column if exists search_text;
alter table public.medicine_catalog add column search_text text generated always as (
  public.normalize_text(
    coalesce(brand_name, '') || ' ' || coalesce(generic_name, '') || ' ' ||
    coalesce(active_ingredient, '') || ' ' || coalesce(dosage, '') || ' ' ||
    coalesce(form, '') || ' ' || coalesce(therapeutic_subfamily, '') || ' ' ||
    coalesce(brand_aliases, '') || ' ' || coalesce(common_names, '')
  )
) stored;
create index medicine_catalog_search_trgm on public.medicine_catalog using gin (search_text gin_trgm_ops);

with map(nom, dci_key, forme_like) as (values
  ('Doliprane', 'paracetamol', null), ('Advil', 'ibuprofene', null), ('Nurofen', 'ibuprofene', null),
  ('Aspirine', 'acideacetylsalicylique', null), ('Voltarène', 'diclofenac', null),
  ('Profénid', 'ketoprofene', null), ('Zyrtec', 'cetirizine', null), ('Clarityne', 'loratadine', null),
  ('Aerius', 'desloratadine', null), ('Mucosolvan', 'ambroxol', null), ('Primpéran', 'metoclopramide', null),
  ('Motilium', 'domperidone', null), ('Mopral', 'omeprazole', null), ('Inipomp', 'pantoprazole', null),
  ('ASAQ', 'artesunateamodiaquine', null), ('Eurartesim', 'dihydroartemisininepiperaquine', null),
  ('Zentel', 'albendazole', null), ('Flagyl', 'metronidazole', null), ('Biltricide', 'praziquantel', null),
  ('Cortapaisyl', 'hydrocortisone', 'cr'), ('Canesten', 'clotrimazole', 'cr'),
  ('Gyno-Canesten', 'clotrimazole', 'vaginal'), ('Pevaryl', 'econazole', null),
  ('Lamisil', 'terbinafine', null), ('Bétadine', 'povidoneiodee', null), ('Biseptine', 'chlorhexidine', null),
  ('Nix', 'permethrine', null), ('Clamoxyl', 'amoxicilline', null),
  ('Augmentin', 'amoxicillineacideclavulanique', null), ('Zithromax', 'azithromycine', null),
  ('Ciflox', 'ciprofloxacine', null), ('Oroken', 'cefixime', null), ('Zinnat', 'cefuroxime', null),
  ('Vibramycine', 'doxycycline', null), ('Bactrim', 'cotrimoxazole', null), ('Rocéphine', 'ceftriaxone', null),
  ('Amlor', 'amlodipine', null), ('Lopril', 'captopril', null), ('Renitec', 'enalapril', null),
  ('Cozaar', 'losartan', null), ('Esidrex', 'hydrochlorothiazide', null), ('Lasilix', 'furosemide', null),
  ('Tahor', 'atorvastatine', null), ('Zocor', 'simvastatine', null), ('Actrapid', 'insulinerapide', null),
  ('Ventoline', 'salbutamol', null), ('Spéciafoldine', 'acidefolique', null), ('Tardyferon', 'selferreux', null),
  ('NorLevo', 'levonorgestrel', null), ('Uvedose', 'cholecalciferol', null),
  ('Adiaril', 'selsderehydratationoralesro', null), ('Adiaril', 'selsderehydratationoraleafaibleosmolarite', null)
),
agg as (
  select c.id, string_agg(distinct m.nom, ' ' order by m.nom) noms
  from public.medicine_catalog c
  join map m on public.geo_key(c.generic_name) = m.dci_key
            and (m.forme_like is null or public.normalize_text(c.form) like '%' || m.forme_like || '%')
  where not c.is_demo and c.merged_into is null
  group by c.id
)
update public.medicine_catalog c
   set common_names = left(agg.noms, 1000)
  from agg
 where agg.id = c.id;
