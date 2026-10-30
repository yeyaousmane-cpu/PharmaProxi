/**
 * Contenus pédagogiques généraux de PharmaProxi Femme.
 * Ils résument des recommandations publiques (OMS) et des repères médicaux courants ;
 * ils ne sont pas présentés comme « validés par un professionnel PharmaProxi » tant qu'un
 * validateur ne les a pas relus dans la bibliothèque santé.
 */
export const SOURCES = [
  { title: "Recommandations de l'OMS concernant les soins prénatals pour que la grossesse soit une expérience positive", org: "Organisation mondiale de la Santé", year: "2016", url: "https://www.who.int/publications/i/item/9789241549912" },
  { title: "Recommandations de l'OMS sur les soins maternels et néonatals pour une expérience postnatale positive", org: "Organisation mondiale de la Santé", year: "2022", url: "https://www.who.int/publications/i/item/9789240045989" },
];

export const PREGNANCY_DANGER = [
  "Saignement par le vagin",
  "Convulsions (crises)",
  "Maux de tête violents avec vision trouble",
  "Fièvre élevée, grande faiblesse",
  "Forte douleur au ventre",
  "Respiration rapide ou difficile",
  "Perte de liquide par le vagin avant le terme",
  "Le bébé bouge beaucoup moins ou ne bouge plus",
  "Gonflement brutal du visage et des mains",
];

export const POSTPARTUM_DANGER = [
  "Saignement abondant (une serviette trempée en moins d'une heure)",
  "Fièvre ou frissons",
  "Convulsions, maux de tête violents, vision trouble",
  "Pertes qui sentent mauvais",
  "Difficulté à respirer, douleur dans la poitrine",
  "Mollet douloureux, rouge ou gonflé",
  "Tristesse profonde, envie de se faire du mal ou de faire du mal au bébé",
];

export const CONSULT_CYCLE = [
  "Pas de règles depuis plus de 3 mois (en dehors d'une grossesse) ou pas de premières règles à 15 ans",
  "Règles si abondantes qu'il faut changer de protection toutes les heures, pendant plusieurs heures",
  "Saignements entre les règles, après un rapport ou après la ménopause",
  "Douleurs de règles qui empêchent d'aller à l'école ou au travail, ou qui augmentent",
  "Cycles régulièrement plus courts que 21 jours ou plus longs que 35 jours",
  "Pertes inhabituelles avec odeur, démangeaisons ou fièvre",
];

export const TRIMESTERS: Record<1 | 2 | 3, { title: string; baby: string; mother: string; todo: string[] }> = {
  1: {
    title: "1er trimestre (jusqu'à 13 semaines)",
    baby: "Les organes du bébé se forment. Le cœur commence à battre très tôt et peut être vu à l'échographie.",
    mother: "Nausées, fatigue, seins sensibles et envies fréquentes d'uriner sont courants. Ils diminuent souvent après le 3e mois.",
    todo: [
      "Faire la première consultation prénatale le plus tôt possible (au plus tard vers 12 semaines)",
      "Prendre le fer et l'acide folique prescrits par la sage-femme ou le médecin",
      "Dormir sous une moustiquaire imprégnée chaque nuit",
      "Ne prendre aucun médicament sans avis du pharmacien ou du médecin",
    ],
  },
  2: {
    title: "2e trimestre (14 à 27 semaines)",
    baby: "Le bébé grandit vite. La plupart des femmes sentent les premiers mouvements entre 16 et 25 semaines (souvent plus tard lors d'une première grossesse).",
    mother: "Souvent la période la plus confortable. Le ventre s'arrondit ; des douleurs de dos ou des crampes peuvent apparaître.",
    todo: [
      "Faire au moins une échographie avant 24 semaines (recommandation de l'OMS)",
      "Demander à la consultation le traitement préventif du paludisme pendant la grossesse",
      "Continuer le fer et l'acide folique, manger varié",
      "Faire les examens demandés (tension, urines, sang)",
    ],
  },
  3: {
    title: "3e trimestre (28 semaines jusqu'à l'accouchement)",
    baby: "Le bébé prend du poids et se prépare à naître. Il bouge chaque jour : un changement net de ses mouvements doit faire consulter.",
    mother: "Fatigue, essoufflement, jambes lourdes, sommeil difficile. Les consultations deviennent plus rapprochées.",
    todo: [
      "Choisir la maternité ou le centre de santé où accoucher et prévoir le transport",
      "Préparer le sac : pagnes, habits du bébé, carnet de santé, pièces, argent pour les frais",
      "Repérer les signes du travail (contractions régulières, perte des eaux) et partir à la maternité",
      "Penser à l'allaitement : mettre le bébé au sein dès la première heure",
    ],
  },
};

export const POSTPARTUM_INFO = [
  "Les saignements (lochies) durent souvent plusieurs semaines en diminuant.",
  "L'OMS recommande l'allaitement exclusif (seulement le lait maternel) pendant les 6 premiers mois.",
  "Parlez de contraception avec la sage-femme : une nouvelle grossesse peut survenir avant le retour des règles.",
  "Fatigue et émotions changeantes sont fréquentes les premiers jours ; si la tristesse dure plus de 2 semaines, parlez-en à un professionnel.",
];

export const MENOPAUSE_INFO = [
  "La ménopause est confirmée après 12 mois sans règles ; elle survient le plus souvent autour de 50 ans.",
  "Avant, la préménopause peut durer plusieurs années : cycles irréguliers, bouffées de chaleur, sommeil perturbé, sécheresse intime.",
  "Tout saignement après la ménopause doit faire consulter.",
  "Activité physique, alimentation riche en calcium et suivi de la tension aident à protéger les os et le cœur.",
];

export const FERTILITY_INFO = [
  "L'ovulation a lieu en général environ 14 jours avant les règles suivantes, pas forcément au 14e jour du cycle.",
  "Les jours les plus fertiles sont les 5 jours avant l'ovulation et le jour de l'ovulation.",
  "Une glaire claire, glissante et étirable (comme du blanc d'œuf) et une légère hausse de la température au réveil après l'ovulation sont des signes utiles.",
  "Il est conseillé de consulter après 12 mois d'essais sans grossesse (6 mois après 35 ans), ou plus tôt en cas de cycles très irréguliers.",
];

export const DAILY_TIPS = [
  "Boire de l'eau régulièrement, surtout pendant les fortes chaleurs et les règles.",
  "Les feuilles vertes, le haricot, le poisson et la viande apportent du fer, utile pour éviter l'anémie.",
  "Dormir sous une moustiquaire imprégnée protège du paludisme, particulièrement pendant la grossesse.",
  "Une bouillotte ou une marche douce peut soulager les crampes de règles.",
  "Changer de serviette ou de protection au moins toutes les 4 à 6 heures.",
  "Ne jamais acheter de médicaments dans la rue : demandez conseil au pharmacien.",
  "Noter vos symptômes aide le médecin à comprendre ce qui se passe.",
  "Une toilette intime à l'eau claire suffit ; les produits parfumés peuvent irriter.",
  "Le dépistage du cancer du col de l'utérus se demande à la sage-femme ou au médecin.",
  "Vous avez le droit de poser toutes vos questions pendant une consultation.",
];

export const PARTNER_CONTENT: Record<string, string[]> = {
  general: [
    "La santé des femmes passe par des consultations régulières, même sans être malade.",
    "Écouter sans juger et accompagner aux rendez-vous quand elle le souhaite est un vrai soutien.",
  ],
  cycle: [
    "Un cycle dure en moyenne 21 à 35 jours ; les règles durent en général 2 à 7 jours.",
    "Des douleurs, de la fatigue ou des changements d'humeur sont fréquents avant ou pendant les règles.",
    "Des règles très douloureuses ou très abondantes ne sont pas « normales » : elles justifient une consultation.",
  ],
  fertilite: FERTILITY_INFO,
  grossesse: [
    "L'OMS recommande au moins 8 consultations prénatales pendant la grossesse.",
    "Aider aux tâches lourdes, veiller au repos et à la moustiquaire, et prévoir le transport vers la maternité.",
    "Signes qui imposent d'aller immédiatement au centre de santé : saignement, convulsions, fièvre, maux de tête violents, perte de liquide, bébé qui ne bouge plus.",
  ],
  postpartum: POSTPARTUM_INFO,
  menopause: MENOPAUSE_INFO,
};

export const LIBRARY: { title: string; topics: string[] }[] = [
  { title: "Cycle menstruel", topics: ["Premières règles", "Règles douloureuses", "Retard de règles", "Règles irrégulières", "Absence de règles", "Saignements inhabituels"] },
  { title: "Gynécologie", topics: ["Endométriose", "Syndrome des ovaires polykystiques", "Fibromes utérins", "Kystes ovariens", "Infections vaginales", "Infection urinaire", "Santé intime"] },
  { title: "Fertilité", topics: ["Ovulation", "Difficultés à concevoir", "Bilan de fertilité", "Préparer une grossesse"] },
  { title: "Contraception", topics: ["Pilule", "Implant", "Stérilet", "Préservatif", "Contraception d'urgence", "Méthodes contraceptives"] },
  { title: "Grossesse", topics: ["Début de grossesse", "Développement du bébé", "Consultation prénatale", "Complications de la grossesse", "Accouchement", "Post-partum", "Allaitement"] },
  { title: "Ménopause", topics: ["Préménopause", "Bouffées de chaleur", "Changements hormonaux", "Ménopause"] },
];
