/**
 * Rubrique « Vos droits et votre santé » (Mali uniquement).
 * Chaque fiche cite ses sources ; rien n'est affirmé sans texte ou organisme de référence.
 * Syntaxe des textes : **gras**. Vérifié en octobre 2026.
 */
export type Block =
  | { h: string }
  | { p: string }
  | { ul: string[] }
  | { ol: string[] }
  | { note: string }
  | { table: { head: string[]; rows: string[][] } };

export type Topic = {
  slug: string;
  group: "famille" | "enfants" | "travail" | "sante";
  icon: "baby" | "heart" | "users" | "file" | "syringe" | "gift" | "hardhat" | "thermo" | "calendar" | "landmark" | "hand" | "pill";
  title: string;
  summary: string;
  keyFacts: string[];
  blocks: Block[];
  sources: { label: string; url?: string }[];
};

export const DROITS_CHECKED = "octobre 2026";

export const GROUPS: { key: Topic["group"]; label: string }[] = [
  { key: "famille", label: "Grossesse et famille" },
  { key: "enfants", label: "Enfants" },
  { key: "travail", label: "Travail et protection sociale" },
  { key: "sante", label: "Santé au quotidien" },
];

const S = {
  codeTravail: { label: "Code du travail du Mali (loi n° 92-020 du 23 septembre 1992)", url: "https://sgg-mali.ml/codes/mali-code-du-itravail-1992.pdf" },
  codePrevoyance: { label: "Code de prévoyance sociale du Mali (loi n° 99-041, mise à jour 2006)", url: "https://sgg-mali.ml/codes/mali-code-prevoyance-sociale-1999-maj-2006.pdf" },
  cleiss: { label: "Cleiss — Le régime malien de sécurité sociale", url: "https://www.cleiss.fr/docs/regimes/regime_mali.html" },
  ssa: { label: "Social Security Administration (États-Unis) — Mali, programmes de sécurité sociale, 2019", url: "https://www.ssa.gov/policy/docs/progdesc/ssptw/2018-2019/africa/mali.html" },
  appm: { label: "Groupe APPM — La maternité au Mali (synthèse des textes)", url: "https://www.groupeappm.com/en/resources/maternite-40" },
  vaccins: { label: "Ministère de la Santé du Mali — Calendrier vaccinal", url: "https://www.sante.gov.ml/index.php?option=com_content&view=category&id=43&Itemid=106" },
  cesarienne: { label: "Santé tropicale — Gratuité de la césarienne (décret n° 05-350/PRM du 4 août 2005)", url: "https://www.santetropicale.com/sites_pays/actus.asp?id=1062&action=lire&rep=mali" },
  amap: { label: "AMAP — Campagne de chimioprévention du paludisme saisonnier (août 2025)", url: "https://amap.ml/2025/08/12/restitution-des-resultats-de-la-campagne-chimio-prevention-du-paludisme-saisonnier-cps/" },
  etatCivil: { label: "Un enfant par la main — L'état civil au Mali", url: "https://www.unenfantparlamain.org/files/drupal/unenfantparlamain-etatcivil-mali.pdf" },
  demarcheInps: { label: "Démarches administratives du Mali — Carte d'assuré social INPS", url: "https://demarchesadministratives.gouv.ml/demarches/afficher/Obtenir-une-carte-d-assure-social-INPS" },
};

export const TOPICS: Topic[] = [
  {
    slug: "conge-maternite", group: "famille", icon: "baby",
    title: "Congé de maternité",
    summary: "14 semaines payées à 100 %, pauses d'allaitement, protection de votre emploi.",
    keyFacts: ["14 semaines : 6 avant, 8 après l'accouchement", "Salaire intégral payé par l'INPS", "1 heure par jour pour allaiter pendant 15 mois"],
    blocks: [
      { h: "Combien de temps ?" },
      { ul: [
        "**14 semaines** au total : le congé commence **6 semaines avant** la date prévue de l'accouchement et se termine **8 semaines après** (Code du travail, art. L.179).",
        "Si le bébé arrive plus tôt que prévu, le congé est prolongé pour atteindre quand même 14 semaines.",
        "Il est **interdit** à l'employeur de vous faire travailler pendant 7 semaines de suite, dont 3 avant l'accouchement (art. L.180).",
        "En cas de **maladie due à la grossesse ou à l'accouchement**, avec certificat médical : **3 semaines de plus** (art. L.181).",
      ] },
      { h: "Qui paie votre salaire ?" },
      { ul: [
        "Pendant le congé, l'**INPS** verse une indemnité journalière égale à **l'intégralité de votre salaire**, sans plafond, pendant les 14 semaines (et les 3 semaines de prolongation le cas échéant) — Code de prévoyance sociale, art. 28 et 30.",
        "Condition : **9 mois d'activité salariée consécutifs** avant l'accouchement, une grossesse constatée par un médecin ou une sage-femme, et les attestations de l'employeur (arrêt de travail, salaire).",
        "Beaucoup d'employeurs continuent à verser le salaire et se font ensuite rembourser par l'INPS (art. 31) : renseignez-vous auprès de votre service du personnel.",
        "Vous gardez aussi les soins gratuits et vos avantages en nature (art. L.182).",
      ] },
      { h: "Votre emploi est protégé" },
      { ul: [
        "Pendant toute la suspension du contrat (congé, prolongation, maladie qui suit le congé), l'employeur **ne peut pas rompre votre contrat** (art. L.183).",
        "En dehors de ces périodes, un licenciement ne peut jamais être motivé par la grossesse ou la maternité.",
        "Une femme enceinte peut, de son côté, **quitter son emploi** en prévenant l'employeur **24 heures à l'avance**, sans payer d'indemnité de préavis (art. L.178).",
        "Le congé de maternité compte comme du temps de travail pour le calcul de vos **congés payés** (art. 149).",
      ] },
      { h: "Au retour : l'allaitement" },
      { p: "Pendant **15 mois** après la naissance, vous avez droit à **1 heure par jour** pour allaiter, payée comme du travail, en général en deux pauses de 30 minutes (une le matin, une l'après-midi) — art. L.184 et D.189-11." },
      { h: "Les démarches, dans l'ordre" },
      { ol: [
        "Faites constater la grossesse et **déclarez-la avant la fin du 3e mois** (INPS pour les allocations prénatales, AMO pour la prise en charge des soins).",
        "Faites les **consultations prénatales** et le vaccin **Td** dès la première visite (voir la fiche vaccination).",
        "Prévenez votre employeur de la date prévue du congé, certificat médical à l'appui.",
        "Après la naissance : **déclarez l'enfant à l'état civil dans les 30 jours**, puis à l'INPS et à l'AMO.",
      ] },
      { note: "Ces règles concernent les salariées du privé (Code du travail). Les fonctionnaires relèvent du statut de la fonction publique : renseignez-vous auprès de votre administration." },
    ],
    sources: [S.codeTravail, S.codePrevoyance, S.appm, S.cleiss],
  },
  {
    slug: "allocations-grossesse-naissance", group: "famille", icon: "gift",
    title: "Allocations de grossesse et de naissance (INPS)",
    summary: "Allocations prénatales et prime de naissance pour les assurées de l'INPS.",
    keyFacts: ["Déclarer la grossesse avant la fin du 3e mois", "3 examens prénatals obligatoires", "Prime de naissance versée en 3 fois"],
    blocks: [
      { p: "Si vous ou votre conjoint êtes salarié(e) déclaré(e) à l'INPS (ou assuré volontaire depuis au moins 2 trimestres), l'INPS verse deux aides en plus du congé de maternité." },
      { h: "Les allocations prénatales" },
      { ul: [
        "Elles commencent **dès la déclaration de la grossesse**. Si vous la déclarez, avec un certificat médical, **dans les 3 premiers mois**, elles sont dues pour les **9 mois** de grossesse (Code de prévoyance sociale, art. 14).",
        "Elles dépendent de **3 examens médicaux** : avant la fin du **3e mois**, vers le **6e mois** et vers le **8e mois** (art. 16). Gardez bien les certificats.",
      ] },
      { h: "L'allocation de maternité (prime de naissance)" },
      { ul: [
        "Versée en **3 fois** : la moitié à la naissance, un quart quand l'enfant a **6 mois**, le dernier quart à **1 an** (art. 19).",
        "L'accouchement doit avoir lieu sous surveillance médicale (maternité, centre de santé).",
      ] },
      { h: "Combien ?" },
      { table: { head: ["Aide", "Montant publié en 2019"], rows: [
        ["Allocations prénatales", "12 285 FCFA au total, en 3 versements (2 730 + 5 460 + 4 095)"],
        ["Prime de naissance", "16 380 FCFA au total (8 190 à la naissance, 4 095 à 6 mois, 4 095 à 1 an)"],
      ] } },
      { note: "Les montants sont fixés par décret et peuvent avoir été revalorisés depuis 2019 : faites-les confirmer par l'INPS." },
    ],
    sources: [S.codePrevoyance, S.ssa, S.cleiss],
  },
  {
    slug: "allocations-familiales", group: "famille", icon: "users",
    title: "Allocations familiales",
    summary: "Une aide mensuelle de l'INPS pour chaque enfant à charge.",
    keyFacts: ["Pour chaque enfant de 1 à 14 ans", "Jusqu'à 18 ans en apprentissage, 21 ans aux études", "Sans limite du nombre d'enfants"],
    blocks: [
      { h: "Qui y a droit ?" },
      { ul: [
        "Les **salariés déclarés à l'INPS** : il faut en général **9 mois d'emploi consécutifs** et travailler au moins 18 jours (ou 120 heures) par mois, avec un salaire au moins égal au SMIG.",
        "Les **assurés volontaires** (commerçants, artisans, indépendants) après **2 trimestres** consécutifs d'affiliation.",
      ] },
      { h: "Pour quels enfants ?" },
      { ul: [
        "Chaque enfant **à charge**, âgé de **plus d'un an et de moins de 14 ans** (Code de prévoyance sociale, art. 23-24).",
        "Jusqu'à **18 ans** s'il est en apprentissage, **21 ans** s'il fait des études ou s'il est infirme ou malade.",
        "L'enfant d'âge scolaire doit être **inscrit et assidu** à l'école ; les plus petits doivent passer les **visites médicales** demandées.",
        "Le texte ne limite pas le nombre d'enfants.",
      ] },
      { h: "Combien ?" },
      { p: "En 2019, l'allocation était de **3 500 FCFA par mois et par enfant** (4 000 FCFA pour un enfant handicapé). Le montant est fixé par décret : demandez le montant actuel à l'INPS." },
      { h: "Comment faire ?" },
      { ol: [
        "Déclarez chaque enfant à l'INPS avec son **acte de naissance** (en même temps que votre immatriculation, puis à chaque naissance).",
        "Chaque année scolaire, fournissez un **certificat de scolarité** (ou d'apprentissage) pour les enfants en âge d'aller à l'école.",
        "Signalez tout changement (mariage, nouvel enfant, fin d'études) au centre INPS de votre commune.",
      ] },
    ],
    sources: [S.codePrevoyance, S.ssa, S.demarcheInps],
  },
  {
    slug: "declaration-naissance", group: "enfants", icon: "file",
    title: "Déclarer une naissance",
    summary: "30 jours pour déclarer, c'est gratuit — et indispensable pour l'AMO, l'école et les examens.",
    keyFacts: ["Délai : 30 jours", "Gratuit", "Après le délai : jugement supplétif au tribunal"],
    blocks: [
      { h: "Pourquoi c'est important" },
      { p: "Sans acte de naissance, l'enfant n'a pas d'existence légale : pas d'inscription aux examens, pas de carte d'identité ni de passeport plus tard, et pas de déclaration comme ayant droit à l'AMO ou aux allocations familiales." },
      { h: "Comment faire" },
      { ul: [
        "Déclarez l'enfant **dans les 30 jours** qui suivent la naissance, au **centre d'état civil** (mairie) du lieu de naissance.",
        "Si l'enfant est né à la maternité ou au centre de santé, apportez le **carnet ou certificat d'accouchement**. La sage-femme ou la matrone peut aussi faire la déclaration.",
        "Si l'enfant est né à la maison, ce sont les **parents** (ou une personne présente à l'accouchement) qui vont le déclarer.",
        "La déclaration et le premier acte sont **gratuits**.",
      ] },
      { h: "Si le délai est dépassé" },
      { p: "Il faut un **jugement supplétif** : la demande se fait à la mairie, qui la transmet au tribunal ; le tribunal convoque les parents avec l'enfant, puis renvoie le jugement à la mairie qui enregistre l'enfant. Cette procédure est plus longue et payante : mieux vaut déclarer à temps." },
      { h: "Ensuite" },
      { ul: [
        "Demandez plusieurs **extraits d'acte de naissance** : ils sont demandés par l'INPS, l'AMO, l'école.",
        "Ajoutez l'enfant comme **ayant droit** à votre AMO et à vos allocations familiales.",
      ] },
    ],
    sources: [S.etatCivil, S.demarcheInps],
  },
  {
    slug: "vaccination", group: "enfants", icon: "syringe",
    title: "Calendrier de vaccination",
    summary: "Les vaccins du programme national, de la naissance à 23 mois, et pendant la grossesse.",
    keyFacts: ["Premiers vaccins dès la naissance", "5 rendez-vous avant 1 an", "Td pour la femme enceinte"],
    blocks: [
      { p: "Le Programme élargi de vaccination (PEV) protège les enfants contre les maladies graves (tuberculose, polio, diphtérie, tétanos, coqueluche, hépatite B, rougeole, fièvre jaune, méningite, pneumonies, diarrhées à rotavirus…). Gardez le **carnet de vaccination** et apportez-le à chaque visite." },
      { h: "Calendrier de l'enfant" },
      { table: { head: ["Âge", "Vaccins"], rows: [
        ["Naissance", "BCG, polio oral (VPO 0)"],
        ["6 semaines", "Pentavalent 1, VPO 1, pneumocoque (PCV13) 1, rotavirus 1"],
        ["10 semaines", "Pentavalent 2, VPO 2, PCV13 2, rotavirus 2"],
        ["14 semaines", "Pentavalent 3, VPO 3, PCV13 3, rotavirus 3, polio injectable (VPI) 1"],
        ["9 mois", "Rougeole-rubéole (RR) 1, fièvre jaune (VAA), méningite (MenAfriVac), VPI 2"],
        ["15 à 23 mois", "RR 2, albendazole (déparasitage)"],
      ] } },
      { h: "Autres vaccins du programme" },
      { ul: [
        "**Paludisme** : 1re dose à 6 mois, 2e à 7 mois, 3e à 8 mois, puis deux rappels.",
        "**HPV** (contre le cancer du col de l'utérus), pour les **filles** : 1re dose à 10 ans, 2e dose 6 mois après.",
        "**Femme enceinte — Td** (tétanos-diphtérie) : 1re dose dès la première consultation de grossesse, 2e dose 30 jours après, puis les rappels indiqués par l'agent de santé.",
      ] },
      { note: "Un rendez-vous manqué ? Il n'est pas trop tard : allez au centre de santé (CSCom) avec le carnet, l'agent reprendra là où l'enfant s'est arrêté." },
    ],
    sources: [S.vaccins],
  },
  {
    slug: "soins-gratuits", group: "sante", icon: "heart",
    title: "Soins gratuits",
    summary: "Césarienne, traitements du VIH, moustiquaires, prévention du paludisme, RAMED.",
    keyFacts: ["Césarienne gratuite depuis 2005", "Antirétroviraux gratuits", "RAMED : 100 % pour les personnes démunies"],
    blocks: [
      { ul: [
        "**Césarienne** : gratuite pour les femmes qui en ont besoin à l'accouchement, depuis le **décret n° 05-350/PRM du 4 août 2005**. Certains produits ou pansements peuvent rester à la charge de la famille.",
        "**VIH** : les **antirétroviraux** (ARV) sont gratuits pour toutes les personnes vivant avec le VIH.",
        "**Paludisme** : distribution gratuite de **moustiquaires imprégnées** et de kits de prise en charge pour les **femmes enceintes** et les **enfants de moins de 5 ans**. Pendant la saison des pluies, des campagnes de **chimioprévention (CPS)** passent de maison en maison pour les enfants de **3 à 59 mois**.",
        "**Vaccins** du programme national (PEV) : voir la fiche vaccination.",
        "**RAMED** : pour les personnes **sans ressources**, prise en charge à **100 %** dans les structures publiques et communautaires conventionnées, sur certificat d'indigence délivré par la mairie et inscription à l'ANAM (voir le guide AMO).",
      ] },
      { note: "Les conditions pratiques varient selon les structures : demandez au CSCom ou à l'hôpital ce qui est gratuit avant les soins, et gardez vos reçus." },
    ],
    sources: [S.cesarienne, S.amap, S.cleiss],
  },
  {
    slug: "accident-travail", group: "travail", icon: "hardhat",
    title: "Accident du travail",
    summary: "Déclaration en 48 heures, soins pris en charge, salaire maintenu par l'INPS.",
    keyFacts: ["Déclaration par l'employeur sous 48 h", "Soins payés par l'INPS", "Accident de trajet couvert"],
    blocks: [
      { h: "Ce qui est couvert" },
      { p: "L'accident survenu **pendant le travail**, ou sur le **trajet** entre votre domicile et votre lieu de travail, ainsi que les **maladies professionnelles**. Il faut être salarié déclaré à l'INPS (l'assurance volontaire ne couvre pas ce risque)." },
      { h: "Les 48 heures qui comptent" },
      { ul: [
        "L'**employeur** doit déclarer l'accident **immédiatement ou au plus tard dans les 48 heures**, et en envoyer un exemplaire à l'**INPS** (Code de prévoyance sociale, art. 71).",
        "Pour un **accident de trajet**, c'est à **vous** (ou à votre famille) de prévenir l'employeur **dans les 48 heures**.",
        "Faites établir un **certificat médical** décrivant les blessures, et gardez-en une copie.",
      ] },
      { h: "Vos droits" },
      { ul: [
        "**Soins** : médecin, chirurgie, médicaments, hospitalisation, prothèses, transport et rééducation pris en charge par l'INPS ; les **premiers secours** sont à la charge de l'employeur (art. 85-86).",
        "**Salaire** : une indemnité journalière est versée **dès le lendemain** de l'arrêt de travail, calculée sur votre salaire du mois précédent (1/30 du salaire mensuel par jour), jusqu'à la guérison (art. 114-115).",
        "En cas de **séquelles durables**, une rente d'incapacité ; en cas de **décès**, des rentes pour le conjoint et les enfants (voir la fiche veuves et orphelins).",
      ] },
    ],
    sources: [S.codePrevoyance, S.ssa],
  },
  {
    slug: "arret-maladie", group: "travail", icon: "thermo",
    title: "Arrêt maladie",
    summary: "Votre contrat est protégé jusqu'à 6 mois, avec maintien du salaire au début.",
    keyFacts: ["Certificat médical obligatoire", "Contrat suspendu, pas rompu, jusqu'à 6 mois", "Salaire maintenu puis demi-salaire"],
    blocks: [
      { ul: [
        "Une absence pour **maladie ou accident non professionnel**, constatée par un **certificat médical**, **suspend** votre contrat de travail (il n'est pas rompu) pendant **6 mois au maximum** (Code du travail, art. 34).",
        "**Salaire** : l'employeur vous verse une indemnité égale à votre salaire pendant une durée égale à votre **préavis** ; après **un an d'ancienneté**, il s'y ajoute **un mois à demi-salaire** (art. 37). Votre convention collective peut prévoir mieux.",
        "Prévenez votre employeur **le plus tôt possible** et remettez-lui le certificat.",
        "Les soins sont remboursés par l'**AMO** (70 % en ambulatoire, 80 % à l'hôpital) si vous êtes assuré.",
      ] },
    ],
    sources: [S.codeTravail, S.ssa],
  },
  {
    slug: "conges-payes", group: "travail", icon: "calendar",
    title: "Congés payés et permissions",
    summary: "30 jours par an, et des jours en plus pour les événements familiaux.",
    keyFacts: ["2,5 jours par mois travaillé", "30 jours par an", "Jusqu'à 10 jours de permissions familiales"],
    blocks: [
      { ul: [
        "Vous gagnez **2,5 jours de congé par mois travaillé**, soit **30 jours par an** (jours non ouvrables compris) — Code du travail, art. 151.",
        "Le droit au congé s'ouvre après **12 mois de service** (art. 148).",
        "Les **permissions exceptionnelles** pour des événements familiaux qui touchent directement votre foyer ne sont pas retirées de vos congés, dans la limite de **10 jours par an** (art. 146).",
        "Les périodes de **congé de maternité** comptent comme du temps de travail pour calculer vos congés (art. 149).",
      ] },
    ],
    sources: [S.codeTravail],
  },
  {
    slug: "retraite", group: "travail", icon: "landmark",
    title: "Retraite INPS",
    summary: "À quel âge, après combien d'années, et ce qu'on touche.",
    keyFacts: ["Salarié : 58 ans et 13 ans d'assurance", "Assuré volontaire : 60 ans et 15 ans", "Moins d'années : allocation de solidarité"],
    blocks: [
      { table: { head: ["", "Salarié", "Assuré volontaire"], rows: [
        ["Pension à taux plein", "58 ans et 13 ans d'assurance", "60 ans et 15 ans d'assurance"],
        ["Pension anticipée", "dès 53 ans, réduite de 5 % par année d'avance", "dès 55 ans (avec 15 ans), réduite de 5 % par an"],
        ["Pas assez d'années", "allocation de solidarité à 58 ans (6 à 13 ans d'assurance)", "à 60 ans (10 à 15 ans d'assurance)"],
      ] } },
      { h: "Combien ?" },
      { p: "Pour un salarié : **26 % du salaire moyen des 8 dernières années**, plus **2 % par année** cotisée au-delà de 10 ans, dans la limite de **80 %**. Exemple : 20 ans de cotisations → 26 % + 10 × 2 % = **46 %** du salaire moyen." },
      { h: "Préparer son départ" },
      { ul: [
        "Vérifiez régulièrement que votre employeur **déclare bien vos salaires** : demandez votre relevé au centre INPS.",
        "Gardez vos **bulletins de paie**, certificats de travail et votre **carte d'assuré**.",
        "Déposez votre **demande de pension** au centre INPS quelques mois avant la date de départ ; l'INPS vous indiquera les pièces à fournir (état civil, relevé de carrière, attestation de cessation d'activité…).",
      ] },
      { note: "Âges et taux publiés par le Cleiss et la Social Security Administration (2019) ; ils peuvent être modifiés par une réforme. Faites confirmer votre situation par l'INPS." },
    ],
    sources: [S.cleiss, S.ssa],
  },
  {
    slug: "veuves-orphelins", group: "travail", icon: "hand",
    title: "Veuves, veufs et orphelins",
    summary: "Ce que la famille touche au décès d'un assuré de l'INPS.",
    keyFacts: ["Conjoint : 50 % de la pension", "Orphelins : 10 % chacun", "Mariage depuis au moins 2 ans"],
    blocks: [
      { h: "Si l'assuré était retraité ou avait droit à une pension" },
      { ul: [
        "**Conjoint survivant** : **50 %** de la pension du défunt, s'il était marié depuis **au moins 2 ans**. En cas de plusieurs veuves, la part est partagée à égalité.",
        "**Orphelins** à charge : **10 % chacun**, jusqu'à 14 ans (18 ans en apprentissage, 21 ans aux études ou en cas de handicap). Le total pour les orphelins est plafonné à 50 %.",
        "Si l'assuré avait **moins de 13 ans** d'assurance (15 ans pour un volontaire), la famille reçoit une **allocation de survivant** versée en une fois.",
      ] },
      { h: "Si le décès est dû à un accident du travail" },
      { ul: [
        "Conjoint : rente de **30 % du salaire annuel** de la victime (mariage antérieur à l'accident) — Code de prévoyance sociale, art. 126.",
        "Enfants : 15 % pour un enfant, 30 % pour deux, 40 % pour trois, puis 10 % de plus par enfant ; parents à charge : 10 % chacun (30 % au plus).",
        "Le total des rentes ne peut pas dépasser **85 %** du salaire annuel (art. 127).",
      ] },
      { h: "Démarches" },
      { ul: [
        "Prévenez le **centre INPS** et l'employeur du défunt le plus vite possible.",
        "Préparez : **acte de décès**, **acte de mariage**, **actes de naissance** des enfants, certificats de scolarité, carte d'assuré du défunt.",
        "La famille reste couverte par l'**AMO pendant 1 an** après le décès (si elle ne touche pas de pension de survivant).",
      ] },
    ],
    sources: [S.ssa, S.codePrevoyance, S.cleiss],
  },
  {
    slug: "medicaments-de-la-rue", group: "sante", icon: "pill",
    title: "Médicaments de la rue : attention",
    summary: "Pourquoi acheter ses médicaments en pharmacie, et comment se protéger.",
    keyFacts: ["Faux ou mal conservés", "Pas de conseil, pas de recours", "Une vraie pharmacie près de chez vous"],
    blocks: [
      { p: "Les médicaments vendus au marché, au bord de la route ou de porte à porte (« pharmacie par terre ») peuvent être **faux**, **périmés** ou **abîmés par la chaleur et le soleil**. Un faux antipaludique ou un faux antibiotique ne soigne pas : la maladie s'aggrave et les microbes deviennent résistants." },
      { h: "Les bons réflexes" },
      { ul: [
        "Achetez vos médicaments dans une **pharmacie** ou un **dépôt** de centre de santé.",
        "Vérifiez la **date de péremption**, que la boîte est **intacte** et que la **notice** est présente.",
        "Ne prenez pas d'antibiotique ou d'antipaludique sans avis d'un **agent de santé**, et suivez le traitement **jusqu'au bout**.",
        "Gardez vos médicaments à l'abri de la chaleur et hors de portée des enfants.",
        "Un médicament qui a un aspect inhabituel (couleur, goût, boîte différente) ? Montrez-le au pharmacien.",
      ] },
    ],
    sources: [],
  },
];

export const topicBySlug = (slug: string) => TOPICS.find((t) => t.slug === slug);
