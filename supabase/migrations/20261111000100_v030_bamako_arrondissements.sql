-- =============================================================================
-- SantéProxi 0.30 — District de Bamako : sept Arrondissements (remplacent les six communes)
-- Source : loi n°2023-005 du 13 mars 2023 portant statut particulier du District de Bamako et son annexe
--          (Journal officiel de la République du Mali du 14 avril 2023) — arrondissements 01 à 07, quartiers codés.
-- Chaque ancienne « Commune N » est entièrement comprise dans le « Nᵉ Arrondissement » : la ligne est donc
-- renommée (ancien nom conservé dans former_name) ; toutes les pharmacies, adresses et alertes restent rattachées.
-- Retour arrière : update public.communes set name = former_name where former_name is not null;
-- =============================================================================
alter table public.communes add column if not exists official_code text;
alter table public.communes add column if not exists former_name text;
alter table public.localities add column if not exists official_code text;

do $$
declare r_bko uuid; a record; q record; cid uuid; lid uuid; src text := 'Loi n°2023-005 du 13 mars 2023 (JO du 14 avril 2023)';
begin
  select id into r_bko from public.regions where is_district or name ilike '%bamako%' order by is_district desc limit 1;
  if r_bko is null then raise notice 'District de Bamako absent : rien à faire'; return; end if;
  for a in select * from (values ('01', 'Commune I', 'Premier Arrondissement'), ('02', 'Commune II', 'Deuxième Arrondissement'), ('03', 'Commune III', 'Troisième Arrondissement'),
      ('04', 'Commune IV', 'Quatrième Arrondissement'), ('05', 'Commune V', 'Cinquième Arrondissement'), ('06', 'Commune VI', 'Sixième Arrondissement'),
      ('07', null, 'Septième Arrondissement')) v(code, old_name, new_name) loop
    select id into cid from public.communes where region_id = r_bko and (name = a.new_name or name = a.old_name) order by (name = a.new_name) desc limit 1;
    if cid is null then
      insert into public.communes (region_id, name, source, official_code) values (r_bko, a.new_name, src, a.code);
    else
      update public.communes set name = a.new_name, official_code = a.code, former_name = coalesce(former_name, a.old_name), source = coalesce(source, src) where id = cid;
    end if;
  end loop;
  for q in select * from (values
    ('01', '00010001', 'Boulkassoumbougou'),
    ('01', '00010002', 'Banconi'),
    ('01', '00010003', 'Djelibougou'),
    ('01', '00010004', 'Djoumanzana'),
    ('01', '00010005', 'Fadjiguila'),
    ('01', '00010006', 'Korofina Nord'),
    ('01', '00010007', 'Korofina Sud'),
    ('01', '00010008', 'Sotuba'),
    ('01', '00010009', 'Sangarébougou'),
    ('01', '00010010', 'Sarambougou'),
    ('01', '00010011', 'Seydoubougou'),
    ('01', '00010012', 'Dialakorodji'),
    ('01', '00010013', 'N''Teguedo-Samassébougou'),
    ('01', '00010014', 'N''Teguedo-Sirakoro'),
    ('01', '00010015', 'Moribabougou'),
    ('01', '00010016', 'Dogobala'),
    ('01', '00010017', 'Souleymanebougou'),
    ('01', '00010018', 'Fombabougou'),
    ('01', '00010019', 'N''Gabacoro Droit'),
    ('01', '00010020', 'Titibougou'),
    ('01', '00010021', 'Sikoroni'),
    ('02', '00020001', 'Bagadadji'),
    ('02', '00020002', 'Bakarybougou'),
    ('02', '00020003', 'Bougouba'),
    ('02', '00020004', 'Bozola'),
    ('02', '00020005', 'Hippodrome'),
    ('02', '00020006', 'Konébougou'),
    ('02', '00020007', 'Medina-Coura'),
    ('02', '00020008', 'Missira'),
    ('02', '00020009', 'N''Gomi'),
    ('02', '00020010', 'Niarela'),
    ('02', '00020011', 'Quinzambougou'),
    ('02', '00020012', 'Sans-Fils'),
    ('02', '00020013', 'Zone Industrielle'),
    ('03', '00030001', 'Badialan I'),
    ('03', '00030002', 'Badialan II'),
    ('03', '00030003', 'Badialan III'),
    ('03', '00030004', 'Bamako-Coura'),
    ('03', '00030005', 'Bamako-Coura Bolibana'),
    ('03', '00030006', 'Centre Commercial'),
    ('03', '00030007', 'Darsalam'),
    ('03', '00030008', 'Dravela'),
    ('03', '00030009', 'Dravela Bolibana'),
    ('03', '00030010', 'Kodabougou'),
    ('03', '00030011', 'Koulouba'),
    ('03', '00030012', 'Niomirambougou'),
    ('03', '00030013', 'N''Tomikorobougou'),
    ('03', '00030014', 'Ouolofobougou'),
    ('03', '00030015', 'Ouolofobougou Bolibana'),
    ('03', '00030016', 'Point G'),
    ('03', '00030017', 'Same'),
    ('03', '00030018', 'Sirakoro-Dounfing'),
    ('03', '00030019', 'Koulouniko'),
    ('03', '00030020', 'Sogonafing'),
    ('03', '00030021', 'Sanankoro'),
    ('03', '00030022', 'Diagoni'),
    ('04', '00040001', 'Hamdallaye'),
    ('04', '00040002', 'Lafiabougou'),
    ('04', '00040003', 'Lassa'),
    ('04', '00040004', 'Djicoroni Para'),
    ('04', '00040005', 'Sébéninkoro'),
    ('04', '00040006', 'Sibiribougou'),
    ('04', '00040007', 'Kalabanbougou'),
    ('04', '00040008', 'Dogodouman'),
    ('04', '00040009', 'Gringoume'),
    ('04', '00040010', 'Taliko'),
    ('04', '00040011', 'Ouezindougou'),
    ('04', '00040012', 'Mamaribougou'),
    ('04', '00040013', 'Kanadjiguila'),
    ('04', '00040014', 'Kabalabougou'),
    ('05', '00050001', 'Bacodjicoroni'),
    ('05', '00050002', 'Badalabougou'),
    ('05', '00050003', 'Daoudabougou'),
    ('05', '00050004', 'Garantiguibougou'),
    ('05', '00050005', 'Kalabancoura'),
    ('05', '00050006', 'Quartier Mali'),
    ('05', '00050007', 'Sabalibougou'),
    ('05', '00050008', 'Sema'),
    ('05', '00050009', 'Torokorobougou'),
    ('06', '00060001', 'Banankabougou'),
    ('06', '00060002', 'Dianéguela'),
    ('06', '00060003', 'Faladié'),
    ('06', '00060004', 'Magnambougou'),
    ('06', '00060005', 'Niamakoro'),
    ('06', '00060006', 'Sénou'),
    ('06', '00060007', 'Sogoninko'),
    ('06', '00060008', 'Sokorodji'),
    ('06', '00060009', 'Yirimadio'),
    ('06', '00060010', 'Missabougou'),
    ('06', '00060011', 'Diatoula'),
    ('06', '00060012', 'Niamana'),
    ('06', '00060013', 'Sirakoro-Méguétana'),
    ('06', '00060014', 'N''Tabacoro'),
    ('06', '00060015', 'Dramanebougou-Tellem'),
    ('06', '00060016', 'Sabalibougou Kourani'),
    ('07', '00070001', 'Gouana'),
    ('07', '00070002', 'Kabala'),
    ('07', '00070003', 'Kalabancoro'),
    ('07', '00070004', 'Kouralé'),
    ('07', '00070005', 'Missala'),
    ('07', '00070006', 'Missalabougou'),
    ('07', '00070007', 'N''Golobougou')
  ) v(arr, code, name) loop
    select id into cid from public.communes where region_id = r_bko and official_code = q.arr;
    select id into lid from public.localities where commune_id = cid and public.normalize_text(name) = public.normalize_text(q.name) limit 1;
    if lid is null then insert into public.localities (commune_id, name, kind, source, official_code) values (cid, q.name, 'quartier', src, q.code);
    else update public.localities set official_code = q.code where id = lid; end if;
  end loop;
end $$;

-- Reconnaissance des anciennes et nouvelles écritures : « Commune IV », « C4 », « 4e arrondissement », « Quatrième Arrondissement »…
create or replace function public.resolve_commune(p_region uuid, p text)
returns uuid language plpgsql stable set search_path = public as $$
declare t text := public.normalize_text(p); r uuid; n text;
begin
  if p_region is null or t = '' then return null; end if;
  select id into r from public.communes where region_id = p_region and (public.normalize_text(name) = t or public.normalize_text(coalesce(former_name, '')) = t) limit 1;
  if r is not null then return r; end if;
  n := substring(t from '^(?:commune|com\.?|c|arrondissement|arr\.?)\s*([1-7]|i{1,3}|iv|v|vi|vii)$');
  if n is null then n := substring(t from '^([1-7])\s*(?:er|e|eme|ieme)?\s*(?:arrondissement|arr\.?)$'); end if;
  if n is null then return null; end if;
  n := case n when 'i' then '1' when 'ii' then '2' when 'iii' then '3' when 'iv' then '4' when 'v' then '5' when 'vi' then '6' when 'vii' then '7' else n end;
  select id into r from public.communes where region_id = p_region and official_code = '0' || n limit 1;
  return r;
end $$;

-- Fonctions existantes qui cherchaient une commune de Bamako par son ancien nom : mise à jour ciblée de leur texte
do $$
declare f record; def text; new_def text;
begin
  for f in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f' and (p.prosrc like '%name = ''Commune %' or p.prosrc like '%public.normalize_text(name) = public.normalize_text(v_area)%') loop
    def := pg_get_functiondef(f.oid);
    new_def := def;
    new_def := replace(new_def, 'name = ''Commune III''', 'official_code = ''03''');
    new_def := replace(new_def, 'name = ''Commune II''', 'official_code = ''02''');
    new_def := replace(new_def, 'name = ''Commune IV''', 'official_code = ''04''');
    new_def := replace(new_def, 'name = ''Commune VI''', 'official_code = ''06''');
    new_def := replace(new_def, 'name = ''Commune V''', 'official_code = ''05''');
    new_def := replace(new_def, 'name = ''Commune I''', 'official_code = ''01''');
    new_def := replace(new_def, 'select id, name into v_commune, v_area from public.communes where region_id = v_region and public.normalize_text(name) = public.normalize_text(v_area);',
                                'select id, name into v_commune, v_area from public.communes where id = public.resolve_commune(v_region, v_area);');
    if new_def <> def then execute new_def; raise notice 'fonction mise à jour : %', f.proname; end if;
  end loop;
end $$;
