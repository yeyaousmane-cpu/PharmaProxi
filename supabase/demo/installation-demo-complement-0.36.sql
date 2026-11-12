-- SantéProxi — complément 0.36 pour le projet de démonstration (après le complément 0.35).
-- Après exécution : importer le référentiel avec select public.referentiel_import(<contenu de supabase/data/referentiel-sante-mali-2022.json>).
-- =============================================================================
-- SantéProxi 0.36 — Référentiel national des établissements de santé
-- 1. Découpage administratif : 159 cercles (OCHA COD-AB v03, découpage de 2023) rattachés aux 19 régions ;
--    position du chef-lieu (localise le cercle, jamais un établissement) ; Kati disponible partout.
-- 2. Fiches enrichies : cercle, localité, WhatsApp, autres appellations, code CANAM, statut d'activité,
--    niveau de source (officielle, recoupée, secondaire, éditeur), statut des contacts (publiés par une source /
--    confirmés par l'établissement / à confirmer).
-- 3. Offre de soins sourcée (services, spécialités, examens, équipements), relations entre établissements
--    (jamais supposées), historique des sources, demandes de correction modérées.
-- 4. Import contrôlé et sans écrasement : un champ déjà renseigné n'est jamais remplacé ; chaque information
--    importée garde sa source ; les noms proches ne sont jamais fusionnés (signalés comme doublons possibles).
-- Migration additive. Retour arrière : drop des tables facility_sources, facility_offers, facility_links,
-- facility_corrections, facility_name_aliases, facility_duplicate_candidates ; colonnes ajoutées sans effet sur l'existant.
-- =============================================================================

-- 1. Cercles ------------------------------------------------------------------
alter table public.circles add column if not exists official_code text;
alter table public.circles add column if not exists name_alt text;
alter table public.circles add column if not exists chief_town text;
alter table public.circles add column if not exists center_lat double precision;
alter table public.circles add column if not exists center_lng double precision;
create unique index if not exists circles_official_code on public.circles (official_code) where official_code is not null;

insert into public.circles (region_id, name, source, official_code, name_alt, chief_town, center_lat, center_lng)
select r.id, v.name, 'OCHA COD-AB Mali v03 (découpage administratif 2023, valide au 04/09/2025)', v.code, v.alt, v.chief, v.lat, v.lng
from (values
  ('ML0101', 'Kayes', 'Kayes', 'Kayes', 'Kayes', 14.44852, -11.4389),
  ('ML0102', 'Bafoulabé', 'Bafoulebe', 'Kayes', 'Bafoulebe', 13.80342, -10.8323),
  ('ML0103', 'Yélimané', 'Yelimane', 'Kayes', 'Yelimane', 15.11802, -10.57548),
  ('ML0104', 'Kéniéba', 'Kenieba', 'Kayes', 'Kenieba', 12.84001, -11.23917),
  ('ML0105', 'Ambidédi', 'Ambididi', 'Kayes', 'Ambididi', 14.58993, -11.79345),
  ('ML0106', 'Aourou', 'Aourou', 'Kayes', 'Aourou', 14.9609, -11.5891),
  ('ML0107', 'Diamou', 'Diamou', 'Kayes', 'Diamou', 14.08576, -11.26133),
  ('ML0108', 'Oussoubidiagna', 'Oussoubidiagna', 'Kayes', 'Oussoubidiagna', 14.24424, -10.46241),
  ('ML0109', 'Ségala', 'Segala', 'Kayes', 'Segala', 14.55926, -10.97162),
  ('ML0110', 'Sadiola', 'Sadiola', 'Kayes', 'Sadiola', 13.89004, -11.69046),
  ('ML0201', 'Koulikoro', 'Koulikoro', 'Koulikoro', null, null, null),
  ('ML0202', 'Banamba', 'Banamba', 'Koulikoro', 'Banamba', 13.54852, -7.44653),
  ('ML0203', 'Kangaba', 'Kangaba', 'Koulikoro', 'Kangaba', 11.93972, -8.41123),
  ('ML0204', 'Kati', 'Kati', 'Koulikoro', 'Kati', 12.73827, -8.07181),
  ('ML0205', 'Kolokani', 'Kolokani', 'Koulikoro', 'Kolokani', 13.57118, -8.03472),
  ('ML0206', 'Nyamina', 'Nyamina', 'Koulikoro', 'Nyamina', 13.31748, -7.03739),
  ('ML0207', 'Siby', 'Siby', 'Koulikoro', 'Siby', 12.37579, -8.3338),
  ('ML0208', 'Néguéla', 'Neguela', 'Koulikoro', 'Neguela', 12.84833, -8.46261),
  ('ML0301', 'Sikasso', 'Sikasso', 'Sikasso', 'Sikasso', 11.31186, -5.66916),
  ('ML0302', 'Kadiolo', 'Kadiolo', 'Sikasso', 'Kadiolo', 10.55218, -5.76211),
  ('ML0303', 'Danderesso', 'Danderesso', 'Sikasso', 'Danderesso', 11.48453, -5.4825),
  ('ML0304', 'Kignan', 'Kignan', 'Sikasso', 'Kignan', 11.84861, -6.01404),
  ('ML0305', 'Kléla', 'Klela', 'Sikasso', 'Klela', 11.68813, -5.66504),
  ('ML0306', 'Lobougoula', 'Lobougoula', 'Sikasso', 'Lobougoula', 11.03445, -5.98135),
  ('ML0307', 'Loulouni', 'Loulouni', 'Sikasso', 'Loulouni', 10.88866, -5.60567),
  ('ML0308', 'Niéna', 'Niena', 'Sikasso', 'Niena', 11.4244, -6.35137),
  ('ML0401', 'Ségou', 'Segou', 'Ségou', 'Segou', 13.38392, -6.27232),
  ('ML0402', 'Bla', 'Bla', 'Ségou', 'Bla', 12.94426, -5.76067),
  ('ML0403', 'Barouéli', 'Baraoueli', 'Ségou', 'Baraoueli', 13.0705, -6.8353),
  ('ML0404', 'Niono', 'Niono', 'Ségou', 'Niono', 14.24425, -5.99327),
  ('ML0405', 'Macina', 'Macina', 'Ségou', 'Macina', 13.95717, -5.36223),
  ('ML0406', 'Dioro', 'Dioro', 'Ségou', 'Dioro', 13.63662, -5.83),
  ('ML0407', 'Farako', 'Farako', 'Ségou', 'Farako', 13.81745, -6.56451),
  ('ML0408', 'Nampala', 'Nampala', 'Ségou', 'Nampala', 15.27344, -5.55354),
  ('ML0409', 'Sokolo', 'Sokolo', 'Ségou', 'Sokolo', 14.73287, -6.12216),
  ('ML0410', 'Markala', 'Markala', 'Ségou', 'Markala', 13.67391, -6.07498),
  ('ML0411', 'Sarro', 'Sarro', 'Ségou', 'Sarro', 13.71648, -5.24215),
  ('ML0501', 'Mopti', 'Mopti', 'Mopti', 'Mopti', 14.48775, -4.19409),
  ('ML0502', 'Djenné', 'Djenne', 'Mopti', 'Djenne', 13.90577, -4.55728),
  ('ML0503', 'Ténenkou', 'Tenenkou', 'Mopti', 'Tenenkou', 14.44783, -4.92191),
  ('ML0504', 'Youwarou', 'Youwarou', 'Mopti', 'Youwarou', 15.36615, -4.26332),
  ('ML0505', 'Konna', 'Konna', 'Mopti', 'Konna', 14.9436, -3.89216),
  ('ML0506', 'Korientzé', 'Korientze', 'Mopti', 'Korientze', 15.3921, -3.78711),
  ('ML0507', 'Sofara', 'Sofara', 'Mopti', 'Sofara', 14.01258, -4.23145),
  ('ML0508', 'Togueré-Koumbé', 'Togueré-Coumbé', 'Mopti', 'Togueré-Coumbé', 14.91473, -4.59369),
  ('ML0601', 'Tombouctou', 'Timbuktu', 'Tombouctou', 'Timbuktu', 16.76619, -3.00777),
  ('ML0602', 'Goundam', 'Goundam', 'Tombouctou', 'Goundam', 16.41205, -3.66401),
  ('ML0603', 'Diré', 'Dire', 'Tombouctou', 'Dire', 16.25671, -3.40014),
  ('ML0604', 'Soumpi', 'Soumpi', 'Tombouctou', 'Soumpi', 15.92734, -3.99356),
  ('ML0605', 'Gourma-Rharous', 'Rharous', 'Tombouctou', 'Rharous', 16.87329, -1.92074),
  ('ML0606', 'Bintagoungou', 'Bintagoungou', 'Tombouctou', 'Bintagoungou', 16.73516, -3.7331),
  ('ML0607', 'Saraféré', 'Sarafere', 'Tombouctou', 'Sarafere', 15.8203, -3.69919),
  ('ML0608', 'Bambara-Maoundé', 'Bambara-Maoude', 'Tombouctou', 'Bambara-Maoude', 15.84738, -2.78624),
  ('ML0609', 'Léré', 'Lere', 'Tombouctou', 'Lere', 15.70742, -4.90979),
  ('ML0610', 'Gossi', 'Gossi', 'Tombouctou', 'Gossi', 15.8169, -1.28779),
  ('ML0611', 'Tonka', 'Tonka', 'Tombouctou', 'Tonka', 16.13132, -3.74924),
  ('ML0612', 'Ber', 'Ber', 'Tombouctou', 'Ber', 16.83748, -2.52525),
  ('ML0613', 'Gargando', 'Gargando', 'Tombouctou', 'Gargando', 16.4581, -4.1737),
  ('ML0701', 'Gao', 'Gao', 'Gao', 'Gao', 16.26849, -0.05022),
  ('ML0702', 'Bourem', 'Bourem', 'Gao', 'Bourem', 16.94972, -0.35203),
  ('ML0703', 'Ansongo', 'Ansongo', 'Gao', 'Ansongo', 15.6616, 0.50014),
  ('ML0704', 'Almoustrat', 'Almoustrat', 'Gao', 'Almoustrat', 17.35621, 0.15077),
  ('ML0705', 'Bamba', 'Bamba', 'Gao', 'Bamba', 17.02948, -1.4014),
  ('ML0706', 'Ouattagouna', 'Ouattagouna', 'Gao', 'Ouattagouna', 15.18163, 0.7213),
  ('ML0707', 'Sony Aliber', 'Sony Aliber', 'Gao', 'Sony Aliber', 16.50458, -0.0752),
  ('ML0708', 'Djebock', 'Djebock', 'Gao', 'Djebock', 16.34113, 0.29771),
  ('ML0709', 'Talataye', 'Talataye', 'Gao', 'Talataye', 16.16582, 1.34101),
  ('ML0710', 'Tessit', 'Tessit', 'Gao', 'Tessit', 15.22117, 0.30682),
  ('ML0711', 'Ntillit', 'Ntillit', 'Gao', 'Ntillit', 15.5282, -0.48465),
  ('ML0712', 'Gabero', 'Gabero', 'Gao', 'Gabero', 16.05671, 0.1166),
  ('ML0713', 'Ersane', 'Ersane', 'Gao', 'Ersane', 17.8647, 0.15083),
  ('ML0714', 'Tabankort', 'Tabankort', 'Gao', 'Tabankort', 17.84778, 0.32256),
  ('ML0715', 'Tin-Aouker', 'Tin-Aouker', 'Gao', 'Tin-Aouker', 16.9779, 0.46994),
  ('ML0716', 'Kassambere', 'Kassambere', 'Gao', null, null, null),
  ('ML0801', 'Kidal', 'Kidal', 'Kidal', 'Kidal', 18.43769, 1.40157),
  ('ML0802', 'Abelbara', 'Abelbara', 'Kidal', 'Abelbara', 19.28785, 1.82545),
  ('ML0803', 'Tin-Essako', 'Tin-Essako', 'Kidal', 'Tin-Essako', 18.44404, 2.49306),
  ('ML0804', 'Tessalit', 'Tessalit', 'Kidal', 'Tessalit', 20.19751, 1.01896),
  ('ML0805', 'Achibogho', 'Achibogho', 'Kidal', 'Achibogho', 18.13381, 3.04602),
  ('ML0806', 'Anefi', 'Anefi', 'Kidal', 'Anefi', 18.04259, 0.60307),
  ('ML0807', 'Timetrine', 'Timetrine', 'Kidal', 'Timetrine', 19.66862, -0.73141),
  ('ML0808', 'Aguelhoc', 'Aguelhoc', 'Kidal', 'Aguelhoc', 19.44678, 0.85515),
  ('ML0809', 'Takalote', 'Takalote', 'Kidal', 'Takalote', 18.1525, 1.391),
  ('ML0901', 'Taoudénit', 'Taoudenni', 'Taoudénit', 'Taoudeni', 22.67555, -3.97656),
  ('ML0902', 'Araouane', 'Araouane', 'Taoudénit', 'Araouane', 18.90763, -3.52322),
  ('ML0903', 'Foum-Elba', 'Foum-Elba', 'Taoudénit', 'Foum-Elba', 20.6082, -3.6021),
  ('ML0904', 'Bou-Djebeha', 'Bou-Djebeha', 'Taoudénit', 'Bou-Djebeha', 18.53851, -2.66993),
  ('ML0905', 'Al-Ourche', 'Al-Ourche', 'Taoudénit', 'Al-Ourche', 17.64546, -3.15896),
  ('ML0906', 'Achouratt', 'Achouratt', 'Taoudénit', 'Achouratt', 21.46283, -1.24929),
  ('ML1001', 'Ménaka', 'Menaka', 'Ménaka', 'Menaka', 15.67942, 1.85915),
  ('ML1002', 'Tidermène', 'Tidermene', 'Ménaka', 'Tidermene', 16.48664, 2.1829),
  ('ML1003', 'Inekar', 'Inekar', 'Ménaka', 'Inekar', 15.93898, 3.15777),
  ('ML1004', 'Anderamboukane', 'Anderamboukane', 'Ménaka', 'Anderamboukane', 15.42345, 3.02272),
  ('ML1005', 'Anouzagrene', 'Anouzagrene', 'Ménaka', 'Anouzagrene', 15.63208, 2.8927),
  ('ML1006', 'Inlamawane (Fanfi)', 'Inlamawane (Fanfi)', 'Ménaka', 'Inlamawane (Fanfi)', 16.42627, 3.6922),
  ('ML1101', 'Nioro', 'Nioro', 'Nioro', 'Nioro', 15.2276, -9.5903),
  ('ML1102', 'Diéma', 'Diema', 'Nioro', 'Diema', 14.53863, -9.18884),
  ('ML1103', 'Diangounté Camara', 'Diangounte Camara', 'Nioro', 'Diangounte Camara', 14.54097, -9.51604),
  ('ML1104', 'Sandaré', 'Sandare', 'Nioro', 'Sandare', 14.70074, -10.3053),
  ('ML1105', 'Troungoumbé', 'Troungoumbe', 'Nioro', 'Troungoumbe', 15.26472, -9.22917),
  ('ML1106', 'Béma', 'Bema', 'Nioro', 'Bema', 15.03957, -9.35124),
  ('ML1201', 'Kita', 'Kita', 'Kita', 'Kita', 13.03483, -9.48778),
  ('ML1202', 'Sagabari', 'Sagabari', 'Kita', 'Sagabari', 12.58304, -9.80382),
  ('ML1203', 'Sébékoro', 'Sebekoro', 'Kita', 'Sebekoro', 12.95838, -8.9904),
  ('ML1204', 'Toukoto', 'Toukoto', 'Kita', 'Toukoto', 13.44019, -9.87173),
  ('ML1205', 'Séféto', 'Sefeto', 'Kita', 'Sefeto', 14.13763, -9.82733),
  ('ML1206', 'Sirakoro', 'Sirakoro', 'Kita', 'Sirakoro', 12.67969, -9.22695),
  ('ML1301', 'Dioïla', 'Dioila', 'Dioïla', 'Dioila', 12.48126, -6.79381),
  ('ML1302', 'Banco', 'Banco', 'Dioïla', 'Banco', 12.09917, -6.52449),
  ('ML1303', 'Béléko', 'Beleko', 'Dioïla', 'Beleko', 12.47506, -6.40794),
  ('ML1304', 'Fana', 'Fana', 'Dioïla', 'Fana', 12.77709, -6.95922),
  ('ML1305', 'Massigui', 'Massigui', 'Dioïla', 'Massigui', 11.85776, -6.77305),
  ('ML1306', 'Ména', 'Mena', 'Dioïla', 'Mena', 12.21256, -6.20781),
  ('ML1401', 'Nara', 'Nara', 'Nara', 'Nara', 15.16082, -7.28854),
  ('ML1402', 'Ballé', 'Balle', 'Nara', 'Balle', 15.33883, -8.5866),
  ('ML1403', 'Dilly', 'Dilly', 'Nara', 'Dilly', 14.99858, -7.67033),
  ('ML1404', 'Mourdiah', 'Mourdiah', 'Nara', 'Mourdiah', 14.4687, -7.47157),
  ('ML1405', 'Guiré', 'Guire', 'Nara', 'Guire', 14.63768, -6.69316),
  ('ML1406', 'Fallou', 'Fallou', 'Nara', 'Fallou', 14.59353, -7.93017),
  ('ML1501', 'Bougouni', 'Bougouni', 'Bougouni', 'Bougouni', 11.40817, -7.48435),
  ('ML1502', 'Yanfolila', 'Yanfolila', 'Bougouni', 'Yanfolila', 11.17473, -8.15222),
  ('ML1503', 'Kolondiéba', 'Kolondieba', 'Bougouni', 'Kolondieba', 11.08354, -6.89283),
  ('ML1504', 'Garalo', 'Garalo', 'Bougouni', 'Garalo', 10.97479, -7.43959),
  ('ML1505', 'Koumantou', 'Koumantou', 'Bougouni', 'Koumantou', 11.40317, -6.84566),
  ('ML1506', 'Sélingué', 'Selingue', 'Bougouni', 'Selingue', 11.64124, -8.20105),
  ('ML1507', 'Ouéléssébougou', 'Ouelessebougou', 'Bougouni', 'Ouelessebougou', 11.99165, -7.91317),
  ('ML1508', 'Kadiana', 'Kadiana', 'Bougouni', 'Kadiana', 10.75022, -6.50426),
  ('ML1509', 'Fakola', 'Fakola', 'Bougouni', 'Fakola', 10.54443, -6.91909),
  ('ML1510', 'Dogo', 'Dogo', 'Bougouni', 'Dogo', 11.88639, -7.33335),
  ('ML1601', 'Koutiala', 'Koutiala', 'Koutiala', 'Koutiala', 12.38948, -5.46392),
  ('ML1602', 'Yorosso', 'Yorosso', 'Koutiala', 'Yorosso', 12.35282, -4.77678),
  ('ML1603', 'M''Pessoba', 'M’Pessoba', 'Koutiala', 'M’Pessoba', 12.66625, -5.7219),
  ('ML1604', 'Molobala', 'Molobala', 'Koutiala', 'Molobala', 12.17145, -5.32828),
  ('ML1605', 'Koury', 'Koury', 'Koutiala', 'Koury', 12.18271, -4.81431),
  ('ML1606', 'Konséguéla', 'Konseguel a', 'Koutiala', 'Konseguel a', 12.39865, -5.88016),
  ('ML1607', 'Kouniana', 'Kouniana', 'Koutiala', 'Kouniana', 12.57259, -5.1274),
  ('ML1608', 'Zangasso', 'Zangasso', 'Koutiala', 'Zangasso', 12.15598, -5.62273),
  ('ML1701', 'San', 'San', 'San', 'San', 13.2993, -4.89701),
  ('ML1702', 'Tominian', 'Tominian', 'San', 'Tominian', 13.28365, -4.59313),
  ('ML1703', 'Kimparana', 'Kimparana', 'San', 'Kimparana', 12.83695, -4.92576),
  ('ML1704', 'Yangasso', 'Yangasso', 'San', 'Yangasso', 13.07119, -5.32266),
  ('ML1705', 'Fangasso', 'Fangasso', 'San', 'Fangasso', 13.52193, -4.44537),
  ('ML1706', 'Mandiakuy', 'Mandiakuy', 'San', 'Mandiakuy', 13.01702, -4.46476),
  ('ML1707', 'Sy', 'Sy', 'San', 'Sy', 13.59854, -4.98017),
  ('ML1801', 'Douentza', 'Douentza', 'Douentza', 'Douentza', 14.99235, -2.9512),
  ('ML1802', 'Boré', 'Bore', 'Douentza', 'Bore', 15.12913, -3.48725),
  ('ML1803', 'Hombori', 'Hombori', 'Douentza', 'Hombori', 15.27671, -1.70012),
  ('ML1804', 'Ngouna', 'Ngouna', 'Douentza', 'Ngouna', 15.63486, -3.37151),
  ('ML1805', 'Mondoro', 'Mondoro', 'Douentza', 'Mondoro', 14.67406, -1.94806),
  ('ML1806', 'Boni', 'Boni', 'Douentza', 'Boni', 15.07132, -2.22262),
  ('ML1901', 'Bandiagara', 'Bandiagara', 'Bandiagara', 'Bandiagara', 14.339, -3.60801),
  ('ML1902', 'Koro', 'Koro', 'Bandiagara', 'Koro', 14.05917, -3.0773),
  ('ML1903', 'Bankass', 'Bankass', 'Bandiagara', 'Bankass', 14.07297, -3.51499),
  ('ML1904', 'Kendié', 'Kendie', 'Bandiagara', 'Kendie', 14.67345, -3.50959),
  ('ML1905', 'Ningari', 'Ningari', 'Bandiagara', 'Ningari', 14.68496, -3.29106),
  ('ML1906', 'Diallassagou', 'Diallassagou', 'Bandiagara', 'Diallassagou', 13.73738, -3.62479),
  ('ML1907', 'Sangha', 'Sangha', 'Bandiagara', 'Sangha', 14.47013, -3.3082),
  ('ML1908', 'Kani', 'Kani', 'Bandiagara', 'Kani', 14.56215, -3.39303),
  ('ML1909', 'Sokoura', 'Sokoura', 'Bandiagara', 'Sokoura', 13.47866, -3.70203)
) v(code, name, alt, region, chief, lat, lng)
join public.regions r on r.name = v.region
where not exists (select 1 from public.circles c where c.official_code = v.code or (c.region_id = r.id and public.normalize_text(c.name) = public.normalize_text(v.name)));

-- Communes du District de Bamako rattachées au « cercle » de Bamako n'existent pas : le District n'a pas de cercle.
-- Commune urbaine de Kati (chef-lieu du cercle), absente jusqu'ici des listes de lieux.
insert into public.communes (region_id, circle_id, name, source)
select c.region_id, c.id, 'Kati', 'Chef-lieu du cercle de Kati (OCHA COD-AB v03)' from public.circles c
where c.official_code = 'ML0204' and not exists (select 1 from public.communes m where m.circle_id = c.id and public.normalize_text(m.name) = 'kati');

-- 2. Fiches -------------------------------------------------------------------
alter table public.facility_listings add column if not exists circle_id uuid references public.circles(id) on delete set null;
alter table public.facility_listings add column if not exists locality text check (char_length(coalesce(locality, '')) <= 160);
alter table public.facility_listings add column if not exists whatsapp text check (whatsapp is null or public.valid_phone(whatsapp));
alter table public.facility_listings add column if not exists alt_names text[] not null default '{}';
alter table public.facility_listings add column if not exists official_code text check (char_length(coalesce(official_code, '')) <= 40);
alter table public.facility_listings add column if not exists operating_status text not null default 'non_confirme'
  check (operating_status in ('actif_confirme', 'signale_actif', 'non_confirme', 'ferme'));
alter table public.facility_listings add column if not exists source_level text not null default 'secondaire'
  check (source_level in ('officielle', 'etablissement', 'recoupee', 'secondaire', 'editeur'));
alter table public.facility_listings add column if not exists contacts_status text not null default 'a_confirmer'
  check (contacts_status in ('source_officielle', 'confirme_etablissement', 'a_confirmer'));
alter table public.facility_listings add column if not exists source_date date;
alter table public.facility_listings add column if not exists match_key text;
alter table public.facility_listings add column if not exists search_text text;
create index if not exists facility_listings_circle on public.facility_listings (circle_id);
-- Deux villages de cercles différents peuvent avoir un CSCOM du même nom : l'unicité tient compte du cercle et de la commune
drop index if exists public.facility_listings_dedup;
create unique index facility_listings_dedup on public.facility_listings (search_name, coalesce(region_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(circle_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(commune_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists facility_listings_match on public.facility_listings (match_key, region_id);
create index if not exists facility_listings_search_trgm on public.facility_listings using gin (search_text extensions.gin_trgm_ops);

-- Les listes de l'éditeur déjà importées restent « transmises par l'éditeur »
update public.facility_listings set source_level = 'editeur' where source ilike 'Liste transmise par l''éditeur%' and source_level = 'secondaire';
update public.facility_listings set source_level = 'officielle' where (source ilike 'Liste DPM%' or source ilike '[0.33] Minist%' or source ilike '[0.33] ORTM%') and source_level = 'secondaire';

-- Appellations équivalentes (recoupement manuel documenté : un seul hôpital régional par ville)
create table if not exists public.facility_name_aliases (
  alias_key text primary key,
  canonical_key text not null,
  justification text not null
);
alter table public.facility_name_aliases enable row level security;
revoke all on public.facility_name_aliases from anon, authenticated;
insert into public.facility_name_aliases (alias_key, canonical_key, justification) values
  ('hopital:fousseyni daou kayes', 'hopital:kayes', 'Hôpital régional Fousseyni Daou de Kayes = « Hôpital de Kayes » (CANAM)'),
  ('hopital:fousseyni daou', 'hopital:kayes', 'Hôpital régional Fousseyni Daou de Kayes'),
  ('hopital:nianankoro fomba segou', 'hopital:segou', 'Hôpital Nianankoro Fomba de Ségou = « Hôpital de Ségou » (CANAM)'),
  ('hopital:nianankoro fomba', 'hopital:segou', 'Hôpital Nianankoro Fomba de Ségou'),
  ('hopital:somine dolo mopti', 'hopital:mopti', 'Hôpital Sominé Dolo de Mopti = « Hôpital de Mopti » (CANAM)'),
  ('hopital:somine dolo', 'hopital:mopti', 'Hôpital Sominé Dolo de Mopti'),
  ('hopital:hangadoumbo moulaye toure', 'hopital:gao', 'Hôpital Hangadoumbo Moulaye Touré = Hôpital de Gao'),
  ('hopital:regional koulikoro', 'hopital:koulikoro', 'Hôpital régional de Koulikoro'),
  ('hopital:sikasso', 'hopital:sikasso', 'Hôpital de Sikasso'),
  ('hopital:chu kati', 'hopital:kati', 'CHU de Kati (carte sanitaire) = « Hôpital de Kati » (CANAM)'),
  ('hopital:chu point g', 'hopital:point g', 'CHU du Point G'),
  ('hopital:chu gabriel toure', 'hopital:gabriel toure', 'CHU Gabriel Touré'),
  ('hopital:chu iota', 'hopital:iota', 'CHU IOTA'),
  ('hopital:centre hospitalier universitaire iota', 'hopital:iota', 'CHU IOTA'),
  ('hopital:chu iota institut ophtalmologie tropicale afrique', 'hopital:iota', 'CHU IOTA'),
  ('hopital:chu cnos', 'hopital:cnos', 'CHU CNOS (odonto-stomatologie)'),
  ('hopital:chu cnos centre national odontostomatologie', 'hopital:cnos', 'CHU CNOS'),
  ('hopital:centre hospitalier universitaire odontostomatologie', 'hopital:cnos', 'CHU CNOS'),
  ('hopital:mere enfant luxembourg', 'hopital:mere enfant luxembourg', 'Hôpital mère-enfant Le Luxembourg'),
  ('hopital:centre hospitalier mere enfant luxembourg', 'hopital:mere enfant luxembourg', 'Hôpital mère-enfant Le Luxembourg'),
  ('centre_specialise:centre recherche lutte contre drepanocytose crld', 'centre_specialise:crld', 'CRLD'),
  ('centre_specialise:centre recherche et lutte contre drepanocytose crld', 'centre_specialise:crld', 'CRLD'),
  ('centre_specialise:centre national appareillage orthopedique mali cnaom', 'centre_specialise:cnaom', 'CNAOM'),
  ('centre_specialise:centre national appareillage orthopedique du mali cnaom', 'centre_specialise:cnaom', 'CNAOM'),
  ('clinique:perinatale mohammed vi', 'hopital:clinique perinatale mohammed vi', 'Clinique périnatale Mohammed VI'),
  ('hopital:clinique perinatale mohammed vi', 'hopital:clinique perinatale mohammed vi', 'Clinique périnatale Mohammed VI'),
  ('laboratoire:diafounou', 'laboratoire:diafounou', 'Laboratoire Diafounou (DPM, carte sanitaire)'),
  ('csref:oueles', 'csref:ouelessebougou', 'CSRéf de Ouéléssébougou (abrégé « Ouéles » dans la liste CANAM)'),
  ('hopital:mere enfant', 'hopital:mere enfant luxembourg', 'Hôpital mère-enfant Le Luxembourg'),
  ('hopital:iota institut ophtalmologie tropicale afrique', 'hopital:iota', 'CHU IOTA'),
  ('hopital:cnos centre national odontostomatologie', 'hopital:cnos', 'CHU CNOS'),
  ('hopital:odontostomatologie', 'hopital:cnos', 'CHU CNOS (« Centre hospitalier universitaire odontostomatologie », CANAM)')
on conflict (alias_key) do nothing;

-- Clé de rapprochement : famille d'établissement + nom sans mots génériques
create or replace function public.facility_match_key(p_name text, p_kind text) returns text language sql stable set search_path = public, extensions as $$
  with k as (
    select case when p_kind in ('hopital', 'chu') then 'hopital' when p_kind in ('cscom', 'centre_sante') then 'cscom' else p_kind end fam,
      btrim(regexp_replace(regexp_replace(' ' || regexp_replace(public.normalize_text(p_name), '[^a-z0-9]+', ' ', 'g') || ' ',
        ' (hopital|hospital|chu|cscom|csref|csrefs|centre de sante de reference|centre hospitalier universitaire|centre hospitalier|hospitalier|universitaire|centre de sante communautaire|centre de sante|laboratoire|labo|clinique|polyclinique|medicale|medical|medico|chirurgicale|cabinet|sarl|sa|suarl|regional|de|du|des|la|le|les|l|d|a|au|et) ', ' ', 'g'),
        ' (hopital|hospital|chu|cscom|csref|centre|laboratoire|clinique|medicale|medical|de|du|des|la|le|les|l|d|a|et) ', ' ', 'g')) core
  )
  select coalesce((select canonical_key from public.facility_name_aliases where alias_key = fam || ':' || core), fam || ':' || core) from k;
$$;

create or replace function public.facility_listing_refresh() returns trigger language plpgsql set search_path = public as $$
begin
  new.match_key := public.facility_match_key(new.name, new.kind);
  new.search_text := public.normalize_text(concat_ws(' ', new.name, array_to_string(new.alt_names, ' '), new.locality, new.quarter, new.city_label, new.official_code));
  return new;
end $$;
drop trigger if exists facility_listing_refresh on public.facility_listings;
create trigger facility_listing_refresh before insert or update of name, kind, alt_names, locality, quarter, city_label, official_code on public.facility_listings
  for each row execute function public.facility_listing_refresh();
update public.facility_listings set name = name;  -- calcule match_key et search_text des fiches existantes

-- 3. Sources, offre de soins, relations, corrections --------------------------
create table if not exists public.facility_sources (
  id bigint generated always as identity primary key,
  facility_id uuid not null references public.facility_listings(id) on delete cascade,
  source text not null check (char_length(source) between 3 and 300),
  source_url text check (source_url is null or source_url ~ '^https?://'),
  source_level text not null check (source_level in ('officielle', 'etablissement', 'recoupee', 'secondaire', 'editeur')),
  document_date text,
  page int,
  record_ref text,
  data jsonb not null default '{}'::jsonb,   -- valeurs telles que publiées par la source (y compris celles non retenues)
  collected_at timestamptz not null default now()
);
create index if not exists facility_sources_facility on public.facility_sources (facility_id);
create unique index if not exists facility_sources_once on public.facility_sources (facility_id, source, coalesce(record_ref, ''));
alter table public.facility_sources enable row level security;
drop policy if exists "pp_facility_sources_read" on public.facility_sources;
create policy "pp_facility_sources_read" on public.facility_sources for select to anon, authenticated
  using (exists (select 1 from public.facility_listings f where f.id = facility_id and f.is_published) or public.is_admin());
revoke all on public.facility_sources from anon, authenticated;
grant select (id, facility_id, source, source_url, source_level, document_date, page, collected_at) on public.facility_sources to anon, authenticated;

create table if not exists public.facility_offers (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facility_listings(id) on delete cascade,
  offer_type text not null check (offer_type in ('service', 'specialite', 'examen', 'equipement')),
  code text not null check (code ~ '^[a-z0-9_]{2,60}$'),
  label text not null check (char_length(label) between 2 and 160),
  status text not null default 'a_confirmer' check (status in ('confirme', 'a_confirmer', 'indisponible')),
  source text not null check (char_length(source) between 3 and 300),
  source_url text check (source_url is null or source_url ~ '^https?://'),
  verified_at date,
  created_at timestamptz not null default now(),
  unique (facility_id, offer_type, code)
);
create index if not exists facility_offers_code on public.facility_offers (code, offer_type);
alter table public.facility_offers enable row level security;
drop policy if exists "pp_facility_offers_read" on public.facility_offers;
create policy "pp_facility_offers_read" on public.facility_offers for select to anon, authenticated
  using (exists (select 1 from public.facility_listings f where f.id = facility_id and f.is_published) or public.is_admin());
revoke all on public.facility_offers from anon, authenticated;
grant select on public.facility_offers to anon, authenticated;

create table if not exists public.facility_links (
  facility_id uuid not null references public.facility_listings(id) on delete cascade,
  related_id uuid not null references public.facility_listings(id) on delete cascade,
  relation text not null check (relation in ('laboratoire_integre', 'imagerie_integree', 'pharmacie_integree', 'laboratoire_partenaire', 'imagerie_partenaire', 'reference_vers')),
  source text not null check (char_length(source) between 3 and 300),
  source_url text check (source_url is null or source_url ~ '^https?://'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (facility_id, related_id, relation),
  check (facility_id <> related_id)
);
alter table public.facility_links enable row level security;
drop policy if exists "pp_facility_links_read" on public.facility_links;
create policy "pp_facility_links_read" on public.facility_links for select to anon, authenticated
  using (exists (select 1 from public.facility_listings f where f.id = facility_id and f.is_published) and exists (select 1 from public.facility_listings f where f.id = related_id and f.is_published));
revoke all on public.facility_links from anon, authenticated;
grant select (facility_id, related_id, relation, source, source_url, created_at) on public.facility_links to anon, authenticated;

create table if not exists public.facility_duplicate_candidates (
  facility_id uuid not null references public.facility_listings(id) on delete cascade,
  other_id uuid not null references public.facility_listings(id) on delete cascade,
  similarity real not null,
  decision text check (decision in ('distincts', 'fusionnes')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  primary key (facility_id, other_id),
  check (facility_id < other_id)
);
alter table public.facility_duplicate_candidates enable row level security;
revoke all on public.facility_duplicate_candidates from anon, authenticated;

create table if not exists public.facility_corrections (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facility_listings(id) on delete cascade,
  reporter_id uuid references public.profiles(id) on delete set null,
  reporter_role text not null check (reporter_role in ('usager', 'etablissement')),
  kind text not null check (kind in ('ferme', 'telephone', 'adresse', 'position', 'services', 'horaires', 'nom', 'autre')),
  message text not null check (char_length(btrim(message)) between 5 and 1000),
  proposed jsonb not null default '{}'::jsonb,
  contact text check (char_length(coalesce(contact, '')) <= 160),
  status text not null default 'nouvelle' check (status in ('nouvelle', 'acceptee', 'refusee')),
  review_note text check (char_length(coalesce(review_note, '')) <= 500),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists facility_corrections_open on public.facility_corrections (status, created_at);
alter table public.facility_corrections enable row level security;
drop policy if exists "pp_facility_corrections_read" on public.facility_corrections;
create policy "pp_facility_corrections_read" on public.facility_corrections for select to authenticated using (reporter_id = auth.uid() or public.is_admin());
revoke all on public.facility_corrections from anon, authenticated;
grant select on public.facility_corrections to authenticated;

-- 4. Import contrôlé ----------------------------------------------------------
-- Une seule fonction pour toutes les sources : sans écrasement (seuls les champs vides sont complétés),
-- avec une ligne d'historique par source et par fiche.
create or replace function public.referentiel_upsert(r jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare reg uuid; cir uuid; com uuid; key text; fid uuid; lvl text := coalesce(r ->> 'source_level', 'secondaire'); lat double precision := nullif(r ->> 'lat', '')::double precision;
  lng double precision := nullif(r ->> 'lng', '')::double precision; o jsonb; created boolean := false; nm text := btrim(r ->> 'name');
begin
  select id into reg from public.regions where name = r ->> 'region';
  if r ->> 'cercle' is not null then
    select id into cir from public.circles where region_id = reg and public.normalize_text(name) = public.normalize_text(r ->> 'cercle');
    if cir is null then select id into cir from public.circles where region_id = reg and public.normalize_text(coalesce(name_alt, '')) = public.normalize_text(r ->> 'cercle'); end if;
  end if;
  if r ->> 'commune' is not null then
    select id into com from public.communes where region_id = reg and public.normalize_text(name) = public.normalize_text(r ->> 'commune') limit 1;
  end if;
  key := public.facility_match_key(nm, r ->> 'kind');
  -- même établissement : même clé, même région (ou région inconnue sur la fiche existante), même cercle s'il est connu des deux côtés
  select f.id into fid from public.facility_listings f
   where f.match_key = key and (f.region_id = reg or f.region_id is null)
     and (cir is null or f.circle_id is null or f.circle_id = cir) and (com is null or f.commune_id is null or f.commune_id = com)
   order by (f.region_id = reg) desc nulls last limit 1;
  if fid is null then
    insert into public.facility_listings (name, kind, category_label, region_id, circle_id, commune_id, quarter, locality, address, phone, phone2,
      latitude, longitude, hours, emergency_24h, ownership, official_code, source, source_url, source_level, contacts_status, operating_status, source_date,
      reliability, is_published, to_verify)
    values (left(nm, 160), r ->> 'kind', r ->> 'category_label', reg, cir, com, r ->> 'quarter', r ->> 'locality', left(r ->> 'address', 300),
      case when public.valid_phone(r ->> 'phone') then r ->> 'phone' end, case when public.valid_phone(r ->> 'phone2') then r ->> 'phone2' end,
      case when lat between 9.5 and 25.5 and lng between -12.8 and 4.8 then lat end, case when lat between 9.5 and 25.5 and lng between -12.8 and 4.8 then lng end,
      left(r ->> 'hours', 300), coalesce((r ->> 'emergency_24h')::boolean, false), r ->> 'ownership', r ->> 'official_code', left(r ->> 'source', 200), r ->> 'source_url', lvl,
      case when r ->> 'phone' is not null and lvl = 'officielle' then 'source_officielle' else 'a_confirmer' end,
      case when lvl = 'officielle' then 'signale_actif' else 'non_confirme' end, nullif(r ->> 'source_date', '')::date,
      case when reg is null then 'incomplet' else 'a_confirmer' end, coalesce((r ->> 'publish')::boolean, true), r ->> 'to_verify')
    returning id into fid;
    created := true;
  else
    update public.facility_listings f set
      circle_id = coalesce(f.circle_id, cir), commune_id = coalesce(f.commune_id, com), region_id = coalesce(f.region_id, reg),
      quarter = coalesce(f.quarter, r ->> 'quarter'), locality = coalesce(f.locality, r ->> 'locality'), address = coalesce(f.address, left(r ->> 'address', 300)),
      phone = coalesce(f.phone, case when public.valid_phone(r ->> 'phone') then r ->> 'phone' end),
      phone2 = coalesce(f.phone2, case when public.valid_phone(r ->> 'phone') and f.phone is not null and f.phone <> r ->> 'phone' then r ->> 'phone'
                                       when public.valid_phone(r ->> 'phone2') then r ->> 'phone2' end),
      latitude = coalesce(f.latitude, case when lat between 9.5 and 25.5 and lng between -12.8 and 4.8 then lat end),
      longitude = coalesce(f.longitude, case when lat between 9.5 and 25.5 and lng between -12.8 and 4.8 then lng end),
      hours = coalesce(f.hours, left(r ->> 'hours', 300)), emergency_24h = f.emergency_24h or coalesce((r ->> 'emergency_24h')::boolean, false),
      ownership = coalesce(f.ownership, r ->> 'ownership'), official_code = coalesce(f.official_code, r ->> 'official_code'),
      category_label = coalesce(f.category_label, r ->> 'category_label'),
      alt_names = case when public.normalize_text(f.name) <> public.normalize_text(nm) and not (nm = any(f.alt_names)) then f.alt_names || nm else f.alt_names end,
      source_level = case when lvl = 'officielle' and f.source_level in ('secondaire', 'editeur') then 'recoupee' when lvl = 'officielle' and f.source_level = 'officielle'
                          and not exists (select 1 from public.facility_sources s where s.facility_id = f.id and s.source = r ->> 'source') then 'recoupee' else f.source_level end,
      operating_status = case when lvl = 'officielle' and f.operating_status = 'non_confirme' then 'signale_actif' else f.operating_status end,
      contacts_status = case when f.contacts_status = 'a_confirmer' and lvl = 'officielle' and r ->> 'phone' is not null and (f.phone is null or f.phone = r ->> 'phone') then 'source_officielle' else f.contacts_status end,
      updated_at = now()
    where f.id = fid;
  end if;
  insert into public.facility_sources (facility_id, source, source_url, source_level, document_date, page, record_ref, data)
  values (fid, r ->> 'source', r ->> 'source_url', lvl, r ->> 'document_date', nullif(r ->> 'page', '')::int, r ->> 'record_ref',
    jsonb_strip_nulls(jsonb_build_object('nom', nm, 'nom_source', r ->> 'name_source', 'telephone', r ->> 'phone', 'telephone2', r ->> 'phone2', 'adresse', r ->> 'address',
      'region', r ->> 'region', 'region_source', r ->> 'region_source', 'cercle', r ->> 'cercle', 'commune', r ->> 'commune', 'localite', r ->> 'locality', 'quartier', r ->> 'quarter',
      'latitude', lat, 'longitude', lng, 'horaires', r ->> 'hours', 'code', r ->> 'official_code', 'convention', r ->> 'convention_date_raw', 'urgences', r ->> 'emergency_24h')))
  on conflict (facility_id, source, coalesce(record_ref, '')) do nothing;
  for o in select * from jsonb_array_elements(coalesce(r -> 'offers', '[]'::jsonb)) loop
    insert into public.facility_offers (facility_id, offer_type, code, label, status, source, source_url, verified_at)
    values (fid, o ->> 'type', o ->> 'code', o ->> 'label', case when lvl = 'officielle' then 'confirme' else 'a_confirmer' end, r ->> 'source', r ->> 'source_url',
      case when lvl = 'officielle' then nullif(r ->> 'source_date', '')::date end)
    on conflict (facility_id, offer_type, code) do update set status = case when excluded.status = 'confirme' then 'confirme' else facility_offers.status end;
  end loop;
  return fid;
end $$;
revoke execute on function public.referentiel_upsert(jsonb) from public, anon, authenticated;

-- Import d'un jeu complet (format du fichier supabase/data/referentiel-sante-mali-2022.json)
create or replace function public.referentiel_import(p jsonb) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare e jsonb; d jsonb; n_canam int := 0; n_msds int := 0; n_editeur int := 0; before int; after int;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'PP403: réservé à l''administration' using errcode = '42501'; end if;
  select count(*) into before from public.facility_listings;
  for e in select * from jsonb_array_elements(p -> 'etablissements') loop
    d := p -> 'documents' -> (e ->> 'doc');
    perform public.referentiel_upsert(e || jsonb_build_object('source', coalesce(d ->> 'titre', 'CANAM — liste des structures conventionnées'), 'source_url', d ->> 'url',
      'source_level', 'officielle', 'document_date', coalesce(d ->> 'mise_en_ligne', '2022'), 'page', e ->> 'source_page', 'record_ref', coalesce(e ->> 'official_code', e ->> 'id'),
      'source_date', d ->> 'mise_en_ligne'));
    n_canam := n_canam + 1;
  end loop;
  for e in select * from jsonb_array_elements(p -> 'carte_sanitaire') loop
    perform public.referentiel_upsert(e || jsonb_build_object('source', e ->> 'source', 'source_level', 'officielle', 'document_date', 'consulté le 2026-11-11',
      'record_ref', 'msds-' || (e ->> 'msds_id'), 'emergency_24h', (e ->> 'hours') ilike '%24h%', 'source_date', '2026-11-11',
      'ownership', case when e ->> 'kind' in ('hopital', 'csref') then 'public' when e ->> 'kind' = 'cscom' then 'communautaire' end));
    n_msds := n_msds + 1;
  end loop;
  for e in select * from jsonb_array_elements(coalesce(p -> 'editeur', '[]'::jsonb)) loop
    perform public.referentiel_upsert(e || jsonb_build_object('source', 'Nom transmis par l''éditeur de SantéProxi (à vérifier)', 'source_level', 'editeur', 'publish', false,
      'record_ref', 'editeur-' || public.normalize_text(e ->> 'name'), 'to_verify', 'Établissement cité par l''éditeur, introuvable dans les listes officielles consultées : identité, adresse et activité à confirmer.'));
    n_editeur := n_editeur + 1;
  end loop;
  -- Doublons possibles : noms proches dans la même région, jamais fusionnés automatiquement
  insert into public.facility_duplicate_candidates (facility_id, other_id, similarity)
  select least(a.id, b.id), greatest(a.id, b.id), similarity(a.search_text, b.search_text)
    from public.facility_listings a join public.facility_listings b on a.id < b.id and a.region_id = b.region_id
     and (a.kind = b.kind or (a.kind in ('hopital', 'chu') and b.kind in ('hopital', 'chu')))
   where a.match_key <> b.match_key and similarity(a.search_text, b.search_text) >= 0.72
  on conflict do nothing;
  select count(*) into after from public.facility_listings;
  perform public.log_audit('referentiel.import', 'facility_listings', null, jsonb_build_object('canam', n_canam, 'carte_sanitaire', n_msds, 'editeur', n_editeur, 'nouvelles_fiches', after - before));
  return jsonb_build_object('lignes_canam', n_canam, 'lignes_carte_sanitaire', n_msds, 'lignes_editeur', n_editeur, 'fiches_avant', before, 'fiches_apres', after);
end $$;
revoke execute on function public.referentiel_import(jsonb) from public, anon;
grant execute on function public.referentiel_import(jsonb) to authenticated;

-- 5. Recherche publique de l'annuaire national ---------------------------------
-- Recherche tolérante (accents, fautes de frappe : similarité trigramme), filtres hiérarchiques, pagination.
create or replace function public.directory_search(p_q text default null, p_region uuid default null, p_circle uuid default null, p_commune uuid default null,
  p_kind text default null, p_service text default null, p_has_phone boolean default null, p_level text default null, p_geo boolean default null,
  p_limit int default 20, p_offset int default 0)
returns table (id uuid, name text, kind text, category_label text, ownership text, region text, circle text, commune text, locality text, quarter text, address text,
  phone text, phone2 text, whatsapp text, email text, website text, latitude double precision, longitude double precision, emergency_24h boolean,
  source_level text, operating_status text, contacts_status text, reliability text, verified_at date, offers jsonb, score real, total bigint)
language sql stable security definer set search_path = public, extensions as $$
  with q as (select nullif(public.normalize_text(btrim(coalesce(p_q, ''))), '') t),
  -- mots significatifs de la recherche (les mots génériques comme « clinique » ou « centre » n'empêchent pas de trouver)
  w as (select coalesce(array_agg(x), '{}') ws from (select x from q, unnest(regexp_split_to_array(regexp_replace(coalesce(q.t, ''), '[^a-z0-9]+', ' ', 'g'), ' ')) x
        where char_length(x) >= 2 and x not in ('clinique', 'polyclinique', 'policlinique', 'polyclinik', 'clinik', 'cscom', 'csref', 'centre', 'sante', 'de', 'du', 'la', 'le', 'les', 'des', 'medical', 'medicale', 'hopital', 'cabinet', 'a', 'au', 'et')) y),
  base as (
    select f.*, (select t from q) qt from public.facility_listings f
    where f.is_published and f.claimed_clinic_id is null and f.kind <> 'ambulance' and f.operating_status <> 'ferme'
      and (p_region is null or f.region_id = p_region) and (p_circle is null or f.circle_id = p_circle) and (p_commune is null or f.commune_id = p_commune)
      and (p_kind is null or f.kind = p_kind or (p_kind = 'hopital' and f.kind = 'chu') or (p_kind = 'polyclinique' and f.category_label = 'Polyclinique'))
      and (p_has_phone is not true or f.phone is not null) and (p_geo is not true or f.latitude is not null)
      and (p_level is null or (p_level = 'verifie' and f.reliability = 'verifie') or (p_level = 'officielle' and f.source_level in ('officielle', 'recoupee', 'etablissement'))
           or (p_level = 'a_confirmer' and f.source_level in ('secondaire', 'editeur')))
      and (p_service is null or exists (select 1 from public.facility_offers o where o.facility_id = f.id and o.code = p_service and o.status = 'confirme')
           or (p_service = 'laboratoire' and f.kind = 'laboratoire') or (p_service = 'imagerie' and f.kind = 'imagerie') or (p_service = 'urgences' and f.emergency_24h))
  ),
  scored as (
    select b.*, case when b.qt is null then 0::real else greatest(similarity(b.search_text, b.qt), word_similarity(b.qt, b.search_text),
        (select avg(word_similarity(x, b.search_text)) from w, unnest(w.ws) x)::real) end sc
    from base b, w
    where b.qt is null or b.search_text like '%' || b.qt || '%' or b.qt <% b.search_text
       or (cardinality(w.ws) > 0 and not exists (select 1 from unnest(w.ws) x where not (b.search_text like '%' || x || '%' or word_similarity(x, b.search_text) >= 0.55)))
       or exists (select 1 from public.circles c where c.id = b.circle_id and public.normalize_text(c.name) = b.qt)
       or exists (select 1 from public.communes m where m.id = b.commune_id and public.normalize_text(m.name) = b.qt)
  )
  select s.id, s.name, s.kind, s.category_label, s.ownership, r.name, c.name, m.name, s.locality, s.quarter, s.address, s.phone, s.phone2, s.whatsapp, s.email, s.website,
    s.latitude, s.longitude, s.emergency_24h, s.source_level, s.operating_status, s.contacts_status, s.reliability, s.verified_at,
    (select coalesce(jsonb_agg(jsonb_build_object('code', o.code, 'label', o.label, 'type', o.offer_type) order by o.offer_type, o.label), '[]'::jsonb)
       from public.facility_offers o where o.facility_id = s.id and o.status = 'confirme'),
    s.sc, count(*) over ()
  from scored s left join public.regions r on r.id = s.region_id left join public.circles c on c.id = s.circle_id left join public.communes m on m.id = s.commune_id
  order by s.sc desc, (s.reliability = 'verifie') desc, (s.source_level in ('officielle', 'recoupee', 'etablissement')) desc, (s.latitude is not null) desc,
    case s.kind when 'chu' then 0 when 'hopital' then 1 when 'csref' then 2 when 'clinique' then 3 when 'cscom' then 4 else 5 end, s.name
  limit greatest(1, least(coalesce(p_limit, 20), 100)) offset greatest(0, coalesce(p_offset, 0));
$$;
grant execute on function public.directory_search(text, uuid, uuid, uuid, text, text, boolean, text, boolean, int, int) to anon, authenticated;

-- Filtres hiérarchiques : régions, cercles et communes avec le nombre de fiches publiées
create or replace function public.directory_places()
returns table (level text, id uuid, parent_id uuid, name text, n bigint) language sql stable security definer set search_path = public as $$
  select 'region', r.id, null::uuid, r.name, (select count(*) from public.facility_listings f where f.region_id = r.id and f.is_published and f.claimed_clinic_id is null)
    from public.regions r
  union all
  select 'cercle', c.id, c.region_id, c.name, (select count(*) from public.facility_listings f where f.circle_id = c.id and f.is_published and f.claimed_clinic_id is null)
    from public.circles c
  union all
  select 'commune', m.id, coalesce(m.circle_id, m.region_id), m.name, (select count(*) from public.facility_listings f where f.commune_id = m.id and f.is_published and f.claimed_clinic_id is null)
    from public.communes m
  order by 1, 4;
$$;
grant execute on function public.directory_places() to anon, authenticated;

-- Synthèse chiffrée calculée sur les fiches réellement présentes (aucun chiffre saisi à la main)
create or replace function public.directory_stats() returns jsonb language sql stable security definer set search_path = public as $$
  with f as (select * from public.facility_listings where is_published and claimed_clinic_id is null and kind <> 'ambulance')
  select jsonb_build_object(
    'total', (select count(*) from f),
    'par_type', (select jsonb_object_agg(k, n) from (select case when category_label = 'Polyclinique' then 'polyclinique' else kind end k, count(*) n from f group by 1) x),
    'par_region', (select jsonb_agg(jsonb_build_object('region', r.name, 'n', (select count(*) from f where f.region_id = r.id),
        'cscom', (select count(*) from f where f.region_id = r.id and f.kind = 'cscom'), 'geolocalises', (select count(*) from f where f.region_id = r.id and f.latitude is not null)) order by r.name)
      from public.regions r),
    'par_statut', (select jsonb_object_agg(coalesce(ownership, 'non_renseigne'), n) from (select ownership, count(*) n from f group by 1) x),
    'par_source', (select jsonb_object_agg(source_level, n) from (select source_level, count(*) n from f group by 1) x),
    'avec_telephone', (select count(*) from f where phone is not null),
    'telephones_source_officielle', (select count(*) from f where phone is not null and contacts_status = 'source_officielle'),
    'telephones_confirmes', (select count(*) from f where phone is not null and contacts_status = 'confirme_etablissement'),
    'avec_adresse', (select count(*) from f where address is not null or quarter is not null),
    'geolocalises', (select count(*) from f where latitude is not null),
    'verifies', (select count(*) from f where reliability = 'verifie'),
    'avec_offre_confirmee', (select count(distinct o.facility_id) from public.facility_offers o join f on f.id = o.facility_id where o.status = 'confirme'),
    'cercles_couverts', (select count(distinct circle_id) from f where circle_id is not null),
    'cercles_total', (select count(*) from public.circles),
    'non_publiees_a_verifier', (select count(*) from public.facility_listings where not is_published),
    'doublons_possibles', (select count(*) from public.facility_duplicate_candidates where decision is null),
    'calcule_le', now());
$$;
grant execute on function public.directory_stats() to anon, authenticated;

-- Couverture par cercle (carte : position du chef-lieu du cercle, pas des établissements)
create or replace function public.directory_coverage()
returns table (circle_id uuid, circle text, region text, lat double precision, lng double precision, n bigint, cscom bigint, csref bigint, hopitaux bigint, prives bigint, geolocalises bigint)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, r.name, c.center_lat, c.center_lng, count(f.id), count(f.id) filter (where f.kind = 'cscom'), count(f.id) filter (where f.kind = 'csref'),
    count(f.id) filter (where f.kind in ('hopital', 'chu')), count(f.id) filter (where f.ownership = 'prive'), count(f.id) filter (where f.latitude is not null)
  from public.circles c join public.regions r on r.id = c.region_id
  left join public.facility_listings f on f.circle_id = c.id and f.is_published and f.claimed_clinic_id is null
  group by c.id, c.name, r.name, c.center_lat, c.center_lng order by r.name, c.name;
$$;
grant execute on function public.directory_coverage() to anon, authenticated;

-- 6. Corrections ---------------------------------------------------------------
create or replace function public.facility_correction_submit(p_facility uuid, p_kind text, p_message text, p_role text default 'usager', p_contact text default null, p_proposed jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); v_id uuid;
begin
  if not exists (select 1 from public.facility_listings where facility_listings.id = p_facility and is_published) then raise exception 'PP404: fiche introuvable'; end if;
  if (select count(*) from public.facility_corrections where reporter_id = uid and created_at > now() - interval '1 day') >= 5 then raise exception 'PP429: 5 signalements par jour au plus'; end if;
  insert into public.facility_corrections (facility_id, reporter_id, reporter_role, kind, message, contact, proposed)
  values (p_facility, uid, coalesce(p_role, 'usager'), p_kind, btrim(p_message), nullif(btrim(coalesce(p_contact, '')), ''), coalesce(p_proposed, '{}'::jsonb))
  returning facility_corrections.id into v_id;
  insert into public.notifications (user_id, kind, title, body, link)
  select ur.user_id, 'annuaire', 'Correction de fiche à examiner', (select name from public.facility_listings where facility_listings.id = p_facility), '/admin/referentiel#corrections'
    from public.user_roles ur where ur.role = 'admin';
  return v_id;
exception when check_violation then raise exception 'PP422: choisissez le type de correction et décrivez-la (5 caractères au moins)';
end $$;
revoke execute on function public.facility_correction_submit(uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function public.facility_correction_submit(uuid, text, text, text, text, jsonb) to authenticated;

create or replace function public.admin_review_correction(p_id uuid, p_decision text, p_note text default null) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin(); c public.facility_corrections;
begin
  if p_decision not in ('acceptee', 'refusee') then raise exception 'PP422: décision invalide'; end if;
  update public.facility_corrections set status = p_decision, review_note = nullif(btrim(coalesce(p_note, '')), ''), reviewed_by = uid, reviewed_at = now()
   where id = p_id and status = 'nouvelle' returning * into c;
  if c.id is null then raise exception 'PP404: correction introuvable ou déjà traitée'; end if;
  -- Une fermeture acceptée retire la fiche de la recherche (conservée pour l'historique)
  if p_decision = 'acceptee' and c.kind = 'ferme' then update public.facility_listings set operating_status = 'ferme', updated_at = now() where id = c.facility_id; end if;
  perform public.log_audit('facility.correction.' || p_decision, 'facility_listing', c.facility_id::text, jsonb_build_object('correction', p_id));
  if c.reporter_id is not null then
    insert into public.notifications (user_id, kind, title, body, link)
    values (c.reporter_id, 'annuaire', 'Votre signalement : ' || case p_decision when 'acceptee' then 'pris en compte' else 'non retenu' end, coalesce(p_note, ''), '/etablissements/' || c.facility_id);
  end if;
end $$;
revoke execute on function public.admin_review_correction(uuid, text, text) from public, anon;
grant execute on function public.admin_review_correction(uuid, text, text) to authenticated;

-- 7. Administration de la fiche --------------------------------------------------
create or replace function public.admin_set_facility_status(p_id uuid, p_operating text, p_contacts text, p_note text) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin();
begin
  if char_length(btrim(coalesce(p_note, ''))) < 5 then raise exception 'PP422: indiquez comment l''information a été obtenue (ex. appel à l''établissement le …)'; end if;
  update public.facility_listings set operating_status = coalesce(p_operating, operating_status), contacts_status = coalesce(p_contacts, contacts_status),
    source_level = case when p_contacts = 'confirme_etablissement' and source_level in ('secondaire', 'editeur') then 'etablissement' else source_level end, updated_at = now()
   where id = p_id;
  if not found then raise exception 'PP404: établissement introuvable'; end if;
  insert into public.facility_sources (facility_id, source, source_level, record_ref, data)
  values (p_id, left('Vérification par l''administration SantéProxi : ' || btrim(p_note), 300), 'etablissement', 'admin-' || extract(epoch from now())::bigint,
    jsonb_build_object('statut_activite', p_operating, 'statut_contacts', p_contacts, 'par', uid));
  perform public.log_audit('facility.status', 'facility_listing', p_id::text, jsonb_build_object('operating', p_operating, 'contacts', p_contacts));
exception when check_violation then raise exception 'PP422: statut invalide';
end $$;
revoke execute on function public.admin_set_facility_status(uuid, text, text, text) from public, anon;
grant execute on function public.admin_set_facility_status(uuid, text, text, text) to authenticated;

create or replace function public.admin_set_offer(p_facility uuid, p_type text, p_code text, p_label text, p_status text, p_source text, p_url text default null) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if p_status = 'supprimer' then delete from public.facility_offers where facility_id = p_facility and offer_type = p_type and code = p_code; return; end if;
  insert into public.facility_offers (facility_id, offer_type, code, label, status, source, source_url, verified_at)
  values (p_facility, p_type, p_code, btrim(p_label), p_status, btrim(p_source), nullif(btrim(coalesce(p_url, '')), ''), case when p_status = 'confirme' then current_date end)
  on conflict (facility_id, offer_type, code) do update set label = excluded.label, status = excluded.status, source = excluded.source, source_url = excluded.source_url, verified_at = excluded.verified_at;
  perform public.log_audit('facility.offer', 'facility_listing', p_facility::text, jsonb_build_object('code', p_code, 'status', p_status));
exception when check_violation then raise exception 'PP422: vérifiez le type, le code (minuscules), le libellé et la source';
end $$;
revoke execute on function public.admin_set_offer(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.admin_set_offer(uuid, text, text, text, text, text, text) to authenticated;

create or replace function public.admin_link_facilities(p_facility uuid, p_related uuid, p_relation text, p_source text, p_url text default null, p_remove boolean default false) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin();
begin
  if p_remove then delete from public.facility_links where facility_id = p_facility and related_id = p_related and relation = p_relation; return; end if;
  if char_length(btrim(coalesce(p_source, ''))) < 3 then raise exception 'PP422: une relation doit citer sa source'; end if;
  insert into public.facility_links (facility_id, related_id, relation, source, source_url, created_by) values (p_facility, p_related, p_relation, btrim(p_source), nullif(btrim(coalesce(p_url, '')), ''), uid)
  on conflict do nothing;
  perform public.log_audit('facility.link', 'facility_listing', p_facility::text, jsonb_build_object('related', p_related, 'relation', p_relation));
exception when check_violation then raise exception 'PP422: relation invalide';
end $$;
revoke execute on function public.admin_link_facilities(uuid, uuid, text, text, text, boolean) from public, anon;
grant execute on function public.admin_link_facilities(uuid, uuid, text, text, text, boolean) to authenticated;

-- Doublon possible : « distincts » (aucun changement) ou « fusionnés » (la seconde fiche est dépubliée,
-- son nom, ses sources et son offre sont rattachés à la première ; rien n'est supprimé)
create or replace function public.admin_decide_duplicate(p_a uuid, p_b uuid, p_decision text, p_keep uuid default null) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin(); keep uuid := coalesce(p_keep, least(p_a, p_b)); drop_id uuid;
begin
  if p_decision not in ('distincts', 'fusionnes') then raise exception 'PP422: décision invalide'; end if;
  update public.facility_duplicate_candidates set decision = p_decision, decided_by = uid, decided_at = now() where facility_id = least(p_a, p_b) and other_id = greatest(p_a, p_b);
  if not found then raise exception 'PP404: paire introuvable'; end if;
  if p_decision = 'fusionnes' then
    drop_id := case when keep = p_a then p_b else p_a end;
    update public.facility_listings k set alt_names = k.alt_names || d.name, phone = coalesce(k.phone, d.phone), phone2 = coalesce(k.phone2, d.phone2), address = coalesce(k.address, d.address),
      latitude = coalesce(k.latitude, d.latitude), longitude = coalesce(k.longitude, d.longitude), circle_id = coalesce(k.circle_id, d.circle_id), updated_at = now()
      from public.facility_listings d where k.id = keep and d.id = drop_id;
    update public.facility_sources set facility_id = keep where facility_id = drop_id and not exists (select 1 from public.facility_sources s where s.facility_id = keep and s.source = facility_sources.source and coalesce(s.record_ref, '') = coalesce(facility_sources.record_ref, ''));
    update public.facility_offers set facility_id = keep where facility_id = drop_id and not exists (select 1 from public.facility_offers o where o.facility_id = keep and o.offer_type = facility_offers.offer_type and o.code = facility_offers.code);
    update public.facility_listings set is_published = false, to_verify = left('Fusionnée avec la fiche ' || keep || coalesce(' — ' || to_verify, ''), 500), updated_at = now() where id = drop_id;
  end if;
  perform public.log_audit('facility.duplicate.' || p_decision, 'facility_listing', keep::text, jsonb_build_object('autre', case when keep = p_a then p_b else p_a end));
end $$;
revoke execute on function public.admin_decide_duplicate(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.admin_decide_duplicate(uuid, uuid, text, uuid) to authenticated;

-- Liste des doublons possibles (administration)
create or replace function public.admin_duplicate_candidates(p_limit int default 50)
returns table (a uuid, a_name text, b uuid, b_name text, region text, similarity real) language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return query select d.facility_id, fa.name, d.other_id, fb.name, r.name, d.similarity from public.facility_duplicate_candidates d
    join public.facility_listings fa on fa.id = d.facility_id join public.facility_listings fb on fb.id = d.other_id left join public.regions r on r.id = fa.region_id
   where d.decision is null order by d.similarity desc limit greatest(1, least(p_limit, 200));
end $$;
revoke execute on function public.admin_duplicate_candidates(int) from public, anon;
grant execute on function public.admin_duplicate_candidates(int) to authenticated;

-- L'enregistrement de la fiche par l'administration gère aussi les nouveaux champs
create or replace function public.admin_save_facility_extra(p_id uuid, p jsonb) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.facility_listings set
    whatsapp = nullif(p ->> 'whatsapp', ''), locality = nullif(btrim(coalesce(p ->> 'locality', '')), ''),
    circle_id = coalesce(nullif(p ->> 'circle_id', '')::uuid, circle_id), commune_id = coalesce(nullif(p ->> 'commune_id', '')::uuid, commune_id),
    alt_names = coalesce((select array_agg(btrim(x)) from unnest(string_to_array(coalesce(p ->> 'alt_names', ''), ';')) x where btrim(x) <> ''), '{}'),
    is_published = coalesce((p ->> 'is_published')::boolean, is_published), updated_at = now()
  where id = p_id;
  if not found then raise exception 'PP404: établissement introuvable'; end if;
  perform public.log_audit('facility.details', 'facility_listing', p_id::text, jsonb_build_object('extra', true));
exception when check_violation then raise exception 'PP422: vérifiez le numéro WhatsApp (format +223…)';
end $$;
revoke execute on function public.admin_save_facility_extra(uuid, jsonb) from public, anon;
grant execute on function public.admin_save_facility_extra(uuid, jsonb) to authenticated;
