-- =============================================================================
-- SantéProxi 0.42 — Les 8 programmes de prévention
-- Paludisme ; vaccination ; grossesse et nouveau-né ; nutrition de l'enfant ; hypertension et diabète ;
-- VIH, IST et hépatites ; tuberculose ; eau, hygiène et choléra.
-- * Chaque programme est une page qui rassemble : les fiches VALIDÉES par un professionnel de santé (circuit
--   existant /redaction-sante), les campagnes et dépistages publiés avec leur source, et les lieux de soins.
-- * Aucun message médical n'est publié par cette migration : 8 fiches de départ sont créées « en relecture »
--   (invisibles du public), rédigées d'après les aide-mémoire de l'OMS cités, pour validation par un professionnel.
-- * Le nom officiel du programme national n'est affiché que lorsqu'il est renseigné avec sa source.
-- Migration additive. Retour arrière : drop table prevention_programs ; colonnes program_slug sans effet.
-- =============================================================================

create table if not exists public.prevention_programs (
  slug text primary key check (slug ~ '^[a-z0-9-]{3,60}$'),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  audience text not null check (char_length(btrim(audience)) between 3 and 200),
  icon text not null default 'shield-check',
  sort_order int not null default 0,
  category_slug text not null,
  focus_code text,
  national_program text check (char_length(coalesce(national_program, '')) <= 200),
  national_program_url text check (national_program_url is null or national_program_url ~ '^https://'),
  reference_title text not null,
  reference_url text not null check (reference_url ~ '^https://'),
  reference_date text,
  is_published boolean not null default true,
  updated_at timestamptz not null default now(),
  check (national_program is null or national_program_url is not null)
);
alter table public.prevention_programs enable row level security;
drop policy if exists "pp_prevention_programs_read" on public.prevention_programs;
create policy "pp_prevention_programs_read" on public.prevention_programs for select to anon, authenticated using (is_published or public.is_admin());
revoke all on public.prevention_programs from anon, authenticated;
grant select on public.prevention_programs to anon, authenticated;

alter table public.health_articles add column if not exists program_slug text references public.prevention_programs(slug) on delete set null;
alter table public.prevention_events add column if not exists program_slug text references public.prevention_programs(slug) on delete set null;

insert into public.prevention_programs (slug, title, audience, icon, sort_order, category_slug, focus_code, reference_title, reference_url, reference_date) values
  ('paludisme', 'Paludisme', 'Toute la famille, surtout les enfants de moins de 5 ans et les femmes enceintes', 'bug', 1, 'maladies-infectieuses', null, 'OMS — Paludisme, aide-mémoire', 'https://www.who.int/fr/news-room/fact-sheets/detail/malaria', '4 décembre 2025'),
  ('vaccination', 'Vaccination', 'Nourrissons, enfants, adolescentes, femmes enceintes, adultes', 'syringe', 2, 'depistage-prevention', 'vaccination', 'OMS — Couverture vaccinale, aide-mémoire', 'https://www.who.int/fr/news-room/fact-sheets/detail/immunization-coverage', '15 juillet 2026'),
  ('grossesse-nouveau-ne', 'Grossesse et nouveau-né', 'Femmes enceintes, jeunes mères, entourage', 'baby', 3, 'grossesse-enfant', 'maternite', 'OMS — Mortalité maternelle, aide-mémoire', 'https://www.who.int/fr/news-room/fact-sheets/detail/maternal-mortality', '7 avril 2025'),
  ('nutrition-enfant', 'Nutrition de l''enfant', 'Parents d''enfants de 0 à 5 ans, femmes allaitantes', 'apple', 4, 'vie-saine', 'pediatrie', 'OMS — Malnutrition, aide-mémoire', 'https://www.who.int/fr/news-room/fact-sheets/detail/malnutrition', '1er mars 2024'),
  ('hypertension-diabete', 'Hypertension et diabète', 'Adultes, en particulier après 40 ans, personnes en surpoids, familles concernées', 'activity', 5, 'maladies-chroniques', 'hypertension_coeur', 'OMS — Hypertension artérielle, aide-mémoire', 'https://www.who.int/fr/news-room/fact-sheets/detail/hypertension', '25 septembre 2025'),
  ('vih-ist-hepatites', 'VIH, IST et hépatites', 'Adolescents et adultes, couples, femmes enceintes', 'heart-handshake', 6, 'maladies-infectieuses', 'vih', 'OMS — Principaux repères sur le VIH/sida', 'https://www.who.int/fr/news-room/fact-sheets/detail/hiv-aids', '15 juillet 2025'),
  ('tuberculose', 'Tuberculose', 'Toute personne qui tousse depuis plus de deux semaines, entourage d''un malade', 'wind', 7, 'maladies-infectieuses', 'tuberculose', 'OMS — Tuberculose, aide-mémoire', 'https://www.who.int/fr/news-room/fact-sheets/detail/tuberculosis', '24 mars 2026'),
  ('eau-hygiene-cholera', 'Eau, hygiène et choléra', 'Toute la famille, écoles, marchés, lieux de rassemblement', 'droplets', 8, 'vie-saine', null, 'OMS — Choléra, aide-mémoire', 'https://www.who.int/fr/news-room/fact-sheets/detail/cholera', '29 septembre 2026')
on conflict (slug) do nothing;

-- Fiches de départ : EN RELECTURE (jamais visibles du public avant validation par un professionnel de santé)
create or replace function public._v042_draft(p_slug text, p_program text, p_title text, p_summary text, p_keywords text, p_audiences text[], p_body jsonb) returns void language plpgsql as $$
declare cat uuid; aid uuid; pr public.prevention_programs;
begin
  select * into pr from public.prevention_programs where slug = p_program;
  select id into cat from public.health_categories where slug = pr.category_slug;
  if cat is null then return; end if;
  insert into public.health_articles (slug, category_id, kind, lang, title, summary, keywords, audiences, recommendation, body, status, author_name, review_note, program_slug)
  values (p_slug, cat, 'prevention', 'fr', p_title, p_summary, p_keywords, p_audiences, 'recommande', p_body, 'in_review',
    'Brouillon préparé par l''équipe SantéProxi', 'Brouillon rédigé d''après l''aide-mémoire OMS cité. À vérifier, adapter au protocole national malien et valider par un professionnel de santé avant publication.', p_program)
  on conflict (slug) do nothing returning id into aid;
  if aid is not null then
    insert into public.health_sources (article_id, title, organization, url, published_on, accessed_on, sort_order)
    values (aid, pr.reference_title, 'Organisation mondiale de la Santé', pr.reference_url, pr.reference_date, date '2026-11-12', 0);
  end if;
end $$;

select public._v042_draft('prevention-paludisme', 'paludisme', 'Se protéger du paludisme',
  'Le paludisme se transmet par la piqûre de moustiques infectés. Dormir sous moustiquaire imprégnée et consulter vite en cas de fièvre sauvent des vies.',
  'palu, paludisme, moustique, moustiquaire, fièvre, sumaya', array['tous', 'enfant', 'femme_enceinte'],
  jsonb_build_object(
    'definition', 'Le paludisme est une maladie due à un parasite transmis par la piqûre de moustiques anophèles infectés, surtout la nuit.',
    'importance', 'Les jeunes enfants et les femmes enceintes sont les plus exposés aux formes graves. Une prise en charge rapide évite les complications.',
    'prevention', 'Dormir chaque nuit sous une moustiquaire imprégnée d''insecticide, y compris les enfants et les femmes enceintes. Éliminer les eaux stagnantes autour de la maison. Suivre les campagnes de chimioprévention saisonnière et la vaccination antipaludique des enfants lorsqu''elles sont proposées par les services de santé. Femme enceinte : suivre le traitement préventif proposé en consultation prénatale.',
    'quand_consulter', 'Toute fièvre doit faire consulter rapidement au centre de santé pour un test de dépistage, surtout chez un enfant. Ne pas prendre de médicament sans test ni avis d''un soignant.',
    'urgence', 'Convulsions, somnolence ou perte de connaissance, vomissements répétés, respiration difficile, enfant qui ne peut plus boire ni téter : aller immédiatement aux urgences.',
    'ou_au_mali', 'Le CSCom le plus proche fait le test de dépistage rapide.'));

select public._v042_draft('prevention-vaccination', 'vaccination', 'Faire vacciner son enfant à temps',
  'Les vaccins protègent contre des maladies graves comme la rougeole, la poliomyélite, la diphtérie, le tétanos ou la coqueluche. Suivre le calendrier et rattraper les doses manquées.',
  'vaccin, vaccination, PEV, carnet, rougeole, polio', array['enfant', 'femme_enceinte', 'tous'],
  jsonb_build_object(
    'definition', 'La vaccination apprend au corps à se défendre contre une maladie avant de la rencontrer.',
    'importance', 'Les vaccins du calendrier protègent notamment contre la rougeole, la poliomyélite, la diphtérie, le tétanos, la coqueluche, l''hépatite B, la méningite, les infections à pneumocoque et à rotavirus, la fièvre jaune et le papillomavirus. Un enfant non vacciné ou incomplètement vacciné reste exposé.',
    'prevention', 'Faire vacciner l''enfant aux âges prévus par le calendrier national, garder le carnet de vaccination et l''apporter à chaque visite. En cas de retard, il n''est pas trop tard : demander un rattrapage au centre de santé.',
    'quand_consulter', 'Une fièvre légère ou une douleur au point d''injection peuvent survenir et passent généralement vite. Consulter si l''enfant va mal ou si cela dure.',
    'ou_au_mali', 'Les CSCom et CSRéf vaccinent selon le calendrier national ; les campagnes publiées apparaissent sur cette page.'));

select public._v042_draft('prevention-grossesse-suivi', 'grossesse-nouveau-ne', 'Bien suivre sa grossesse et accoucher en sécurité',
  'Les consultations prénatales, l''accouchement avec un personnel qualifié et les soins après l''accouchement réduisent les risques pour la mère et le bébé.',
  'grossesse, CPN, consultation prénatale, accouchement, nouveau-né, sage-femme', array['femme_enceinte', 'couple'],
  jsonb_build_object(
    'importance', 'Les principales causes de décès maternels sont les hémorragies graves, surtout après l''accouchement, les infections, l''hypertension pendant la grossesse (prééclampsie, éclampsie), les complications de l''accouchement et l''avortement non sécurisé. La plupart peuvent être évitées ou traitées.',
    'prevention', 'Commencer les consultations prénatales dès le début de la grossesse et y aller régulièrement. Préparer à l''avance le lieu d''accouchement, le transport et l''argent. Accoucher dans une structure de santé avec une sage-femme ou un médecin. Revenir en consultation après l''accouchement pour la mère et le bébé.',
    'urgence', 'Saignement, maux de tête violents ou troubles de la vue, convulsions, fièvre, perte des eaux sans contractions, bébé qui ne bouge plus : aller immédiatement à la maternité.',
    'ou_au_mali', 'Maternités des CSCom et CSRéf ; les cas compliqués sont orientés vers l''hôpital.'));

select public._v042_draft('prevention-nutrition-enfant', 'nutrition-enfant', 'Bien nourrir son enfant de 0 à 5 ans',
  'L''allaitement et une alimentation variée protègent l''enfant de la dénutrition (maigreur, retard de croissance) et des carences en vitamines et minéraux.',
  'nutrition, malnutrition, allaitement, bouillie, retard de croissance, maigreur', array['enfant', 'femme_enceinte'],
  jsonb_build_object(
    'definition', 'La dénutrition de l''enfant comprend l''émaciation (maigreur), le retard de croissance (enfant trop petit pour son âge) et l''insuffisance pondérale. Les carences en micronutriments sont le manque de vitamines et de minéraux essentiels.',
    'importance', 'La dénutrition affaiblit l''enfant face aux infections et peut freiner son développement.',
    'prevention', 'Mettre le bébé au sein dès la naissance et l''allaiter de façon exclusive pendant les six premiers mois, puis continuer l''allaitement en ajoutant des aliments variés adaptés à son âge. Faire peser et mesurer l''enfant régulièrement au centre de santé.',
    'quand_consulter', 'Enfant qui maigrit, ne grandit plus, refuse de manger, a des diarrhées répétées ou des pieds gonflés : consulter.',
    'ou_au_mali', 'Les CSCom suivent la croissance des enfants et orientent vers la prise en charge nutritionnelle.'));

select public._v042_draft('prevention-hypertension-diabete', 'hypertension-diabete', 'Tension et sucre : se faire contrôler',
  'L''hypertension ne donne souvent aucun signe : la seule façon de la connaître est de mesurer sa tension. Une vie plus active, moins de sel, pas de tabac protègent le cœur.',
  'tension, hypertension, diabète, sucre, sel, cœur, AVC', array['adulte', 'senior'],
  jsonb_build_object(
    'definition', 'L''hypertension correspond à une pression trop élevée dans les vaisseaux sanguins. Le diabète est un excès de sucre dans le sang.',
    'importance', 'Non traitées, elles peuvent abîmer le cœur, le cerveau (AVC), les reins et les yeux, souvent sans signe avant les complications.',
    'prevention', 'Faire mesurer sa tension régulièrement, surtout après 40 ans ou en cas de surpoids ou d''antécédents familiaux. Manger moins salé, plus de légumes et de fruits, bouger chaque jour, ne pas fumer, limiter l''alcool. Une personne traitée doit suivre son traitement sans l''arrêter seule et revenir en contrôle.',
    'urgence', 'Visage qui se déforme, bras ou jambe qui ne répond plus, difficulté soudaine à parler, douleur forte dans la poitrine : urgence, aller immédiatement à l''hôpital.',
    'ou_au_mali', 'La tension se mesure au CSCom, en pharmacie ou au cabinet médical.'));

select public._v042_draft('prevention-vih-ist', 'vih-ist-hepatites', 'VIH, IST et hépatites : se protéger et se faire dépister',
  'Le dépistage permet de connaître son statut et d''être soigné tôt. Le traitement antirétroviral permet de vivre longtemps et de ne pas transmettre le virus.',
  'VIH, sida, IST, hépatite B, préservatif, dépistage, PrEP', array['adolescent', 'adulte', 'couple', 'femme_enceinte'],
  jsonb_build_object(
    'definition', 'Le VIH affaiblit le système immunitaire. Il se transmet par les rapports sexuels non protégés, le sang (aiguilles, objets coupants partagés) et de la mère à l''enfant pendant la grossesse, l''accouchement ou l''allaitement.',
    'prevention', 'Utiliser un préservatif. Se faire dépister, seul ou en couple, et faire dépister la femme enceinte pour protéger le bébé. Ne pas partager les objets coupants. Demander au soignant si la prophylaxie préexposition (PrEP) est adaptée. Se faire vacciner contre l''hépatite B.',
    'examens', 'Le test de dépistage est simple et confidentiel.',
    'quand_consulter', 'Écoulement, plaie ou douleur au niveau des parties intimes, ou rapport à risque récent : consulter rapidement.',
    'ou_au_mali', 'Dépistage dans les centres de santé et les structures de prise en charge du VIH.'));

select public._v042_draft('prevention-tuberculose', 'tuberculose', 'Une toux qui dure : penser à la tuberculose',
  'La tuberculose se transmet par l''air quand un malade tousse. Elle se guérit avec un traitement pris jusqu''au bout.',
  'tuberculose, TB, toux, crachats, BCG', array['tous', 'adulte'],
  jsonb_build_object(
    'definition', 'La tuberculose est une infection qui touche le plus souvent les poumons. Elle se transmet par voie aérienne, quand une personne malade tousse ou éternue.',
    'situations', 'Toux depuis plus de deux semaines, fièvre, sueurs la nuit, perte de poids, fatigue, parfois du sang dans les crachats.',
    'prevention', 'Faire examiner toute personne qui tousse longtemps. Tousser dans son coude, aérer la maison. Vacciner les nouveau-nés par le BCG selon le calendrier. Les proches d''un malade doivent être examinés.',
    'importance', 'La tuberculose se guérit si le traitement est pris tous les jours, jusqu''à la fin, même quand on se sent mieux.',
    'ou_au_mali', 'Les centres de santé orientent vers les structures qui font le diagnostic et suivent le traitement.'));

select public._v042_draft('prevention-eau-hygiene-cholera', 'eau-hygiene-cholera', 'Eau propre et mains lavées contre le choléra',
  'Le choléra se transmet par l''eau ou les aliments contaminés. Eau potable, latrines, lavage des mains et aliments bien cuits le préviennent. La réhydratation sauve des vies.',
  'choléra, diarrhée, eau potable, lavage des mains, SRO, hygiène', array['tous', 'enfant'],
  jsonb_build_object(
    'definition', 'Le choléra est une infection diarrhéique aiguë due à l''ingestion d''eau ou d''aliments contaminés.',
    'prevention', 'Boire de l''eau potable ou traitée, conserver l''eau dans un récipient propre et couvert. Utiliser des latrines. Se laver les mains au savon après les toilettes et avant de manger ou de préparer à manger. Bien cuire les aliments et les manger chauds. Se faire vacciner lors des campagnes organisées par les autorités.',
    'gestes', 'En cas de diarrhée, commencer à boire tout de suite une solution de réhydratation orale (SRO) et aller au centre de santé.',
    'urgence', 'Diarrhée très abondante comme de l''eau de riz, vomissements, grande soif, yeux creux, personne très faible : aller immédiatement au centre de santé.',
    'ou_au_mali', 'Les SRO sont disponibles en pharmacie et dans les centres de santé.'));

drop function public._v042_draft(text, text, text, text, text, text[], jsonb);

-- Page programme : fiches publiées seulement, campagnes publiées, comptage des fiches en attente de validation
create or replace function public.prevention_program_overview(p_slug text) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'fiches_publiees', (select coalesce(jsonb_agg(jsonb_build_object('slug', a.slug, 'title', a.title, 'summary', a.summary, 'validator_name', a.validator_name, 'validated_at', a.validated_at) order by a.title), '[]'::jsonb)
                          from public.health_articles a where a.program_slug = p_slug and a.status = 'published'),
    'fiches_en_validation', (select count(*) from public.health_articles a where a.program_slug = p_slug and a.status in ('draft', 'in_review', 'changes_requested', 'validated')),
    'evenements', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'kind', e.kind, 'starts_on', e.starts_on, 'ends_on', e.ends_on, 'place', e.place, 'organizer', e.organizer, 'source_name', e.source_name, 'source_url', e.source_url) order by e.starts_on), '[]'::jsonb)
                    from public.prevention_events e where e.program_slug = p_slug and e.status = 'publie' and coalesce(e.ends_on, e.starts_on) >= current_date));
$$;
grant execute on function public.prevention_program_overview(text) to anon, authenticated;

create or replace function public.admin_prevention_program(p_slug text, p_national text, p_url text) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.prevention_programs set national_program = nullif(btrim(coalesce(p_national, '')), ''), national_program_url = nullif(btrim(coalesce(p_url, '')), ''), updated_at = now() where slug = p_slug;
  if not found then raise exception 'PP404: programme introuvable'; end if;
  perform public.log_audit('prevention.program', 'prevention_program', p_slug);
exception when check_violation then raise exception 'PP422: le nom du programme national doit être accompagné du lien vers sa source officielle (https)';
end $$;
revoke execute on function public.admin_prevention_program(text, text, text) from public, anon;
grant execute on function public.admin_prevention_program(text, text, text) to authenticated;

create or replace function public.admin_link_prevention(p_kind text, p_id uuid, p_program text) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if p_program is not null and not exists (select 1 from public.prevention_programs where slug = p_program) then raise exception 'PP404: programme introuvable'; end if;
  if p_kind = 'event' then update public.prevention_events set program_slug = p_program where id = p_id;
  elsif p_kind = 'article' then update public.health_articles set program_slug = p_program where id = p_id;
  else raise exception 'PP422: type inconnu'; end if;
  if not found then raise exception 'PP404: élément introuvable'; end if;
end $$;
revoke execute on function public.admin_link_prevention(text, uuid, text) from public, anon;
grant execute on function public.admin_link_prevention(text, uuid, text) to authenticated;
