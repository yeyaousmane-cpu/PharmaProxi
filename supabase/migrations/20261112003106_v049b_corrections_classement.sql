-- v049b — Corrections de classement réglementaire (appliquée le 12/11/2026)
-- Ibuprofène 600 mg : délivré sur prescription. Acétylcystéine en usage antidote :
-- sur prescription, en milieu de soins.
update public.import_catalogue_2026 set regulation='prescription', note=left(concat_ws(' ', note, 'Dosage 600 mg : delivre sur prescription.'),300) where public.geo_key(dci)='ibuprofene' and public.catalog_dosage_key(dosage)='600mg';
update public.import_catalogue_2026 set regulation='prescription', note=left(concat_ws(' ', note, 'Usage antidote (intoxication au paracetamol) : sur prescription, en milieu de soins.'),300) where public.geo_key(dci)='acetylcysteine' and family='antidotes';
-- Idempotent, quel que soit l'ordre d'application par rapport au rapprochement :
update public.medicine_catalog set regulatory_class='prescription' where merged_into is null and public.geo_key(generic_name)='ibuprofene' and public.catalog_dosage_key(dosage)='600mg' and regulatory_class <> 'prescription';
update public.medicine_catalog set regulatory_class='prescription' where merged_into is null and public.geo_key(generic_name)='acetylcysteine' and therapeutic_family='antidotes' and regulatory_class <> 'prescription';
