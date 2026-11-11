/**
 * Questionnaire « Suis-je apte à donner mon sang ? » — version de travail établie à partir des lignes directrices de l'OMS
 * (Blood donor selection, 2012). Il n'est publié qu'après validation par le CNTS (enregistrée par l'administration).
 * Aucun diagnostic : trois résultats pédagogiques seulement. Les réponses ne quittent jamais le téléphone.
 */
export const QUESTIONNAIRE_VERSION = "2026-11-oms2012-v1";
export const SOURCE_OMS = { label: "OMS — Blood donor selection: guidelines on assessing donor suitability for blood donation (2012)", url: "https://www.who.int/publications/i/item/9789241548519" };
export const SOURCE_EFS = { label: "Établissement français du sang — Malaises et don de sang (2026)", url: "https://dondesang.efs.sante.fr/malaise-don-de-sang" };

export type Outcome = "ok" | "conseil" | "delai";
export const OUTCOMES: Record<Outcome, { title: string; text: string; className: string }> = {
  ok: { title: "Vous pouvez envisager de vous présenter dans un centre pour une évaluation médicale.", text: "Le jour du don, un professionnel de santé vous posera des questions et décidera avec vous. Venez bien hydraté et sans être à jeun.", className: "border-emerald-300 bg-emerald-50 text-emerald-950" },
  conseil: { title: "Certaines réponses nécessitent de demander conseil à un professionnel.", text: "Parlez-en au médecin ou à l'équipe du centre de collecte avant de venir : eux seuls peuvent dire si le don est possible pour vous.", className: "border-amber-300 bg-amber-50 text-amber-950" },
  delai: { title: "Un délai supplémentaire peut être nécessaire avant de vous présenter.", text: "Ce n'est pas un refus : le centre vous indiquera à partir de quand revenir. En cas de doute, demandez conseil.", className: "border-sky-300 bg-sky-50 text-sky-950" },
};
const rank: Record<Outcome, number> = { ok: 0, delai: 1, conseil: 2 };
export const worst = (a: Outcome, b: Outcome): Outcome => (rank[b] > rank[a] ? b : a);

export type Choice = { value: string; label: string; outcome: Outcome; why?: string };
export type Question = { id: string; text: string; help?: string; choices: Choice[]; showIf?: (a: Record<string, string>) => boolean };

export const QUESTIONS: Question[] = [
  { id: "age", text: "Quel âge avez-vous ?", help: "L'OMS indique un âge habituel de 18 à 65 ans ; chaque pays fixe ses règles.",
    choices: [{ value: "moins18", label: "Moins de 18 ans", outcome: "conseil", why: "Âge : les règles pour les moins de 18 ans sont fixées par le CNTS." },
      { value: "18_65", label: "De 18 à 65 ans", outcome: "ok" }, { value: "plus65", label: "Plus de 65 ans", outcome: "conseil", why: "Âge : au-delà de 65 ans, l'avis du centre est nécessaire." }] },
  { id: "poids", text: "Pesez-vous au moins 50 kg ?", help: "L'OMS recommande au moins 45 kg pour un don de 350 ml et 50 kg pour un don de 450 ml.",
    choices: [{ value: "oui", label: "Oui, 50 kg ou plus", outcome: "ok" }, { value: "45_50", label: "Entre 45 et 50 kg", outcome: "conseil", why: "Poids : le volume prélevé dépend du poids ; le centre décidera." },
      { value: "moins45", label: "Moins de 45 kg", outcome: "conseil", why: "Poids : en dessous de 45 kg, demandez conseil." }, { value: "nsp", label: "Je ne sais pas", outcome: "conseil", why: "Poids : faites-vous peser au centre." }] },
  { id: "dernier", text: "Avez-vous déjà donné votre sang ?", choices: [{ value: "jamais", label: "Jamais", outcome: "ok" }, { value: "oui", label: "Oui", outcome: "ok" }] },
  { id: "type", text: "Quel était le type de votre dernier don ?", showIf: (a) => a.dernier === "oui",
    choices: [{ value: "sang_total", label: "Sang total (le plus courant)", outcome: "ok" }, { value: "plasma", label: "Plasma", outcome: "ok" }, { value: "plaquettes", label: "Plaquettes", outcome: "ok" }, { value: "nsp", label: "Je ne sais pas", outcome: "ok" }] },
  { id: "quand", text: "Quand était votre dernier don ?", help: "OMS : au moins 12 semaines (hommes) et 16 semaines (femmes) entre deux dons de sang total ; 2 semaines après un don de plasma, 4 semaines après un don de plaquettes.", showIf: (a) => a.dernier === "oui",
    choices: [{ value: "moins2s", label: "Il y a moins de 2 semaines", outcome: "delai", why: "Dernier don trop récent." }, { value: "2_4s", label: "Il y a 2 à 4 semaines", outcome: "delai", why: "Dernier don récent : un délai peut être nécessaire selon le type de don." },
      { value: "1_3m", label: "Il y a 1 à 3 mois", outcome: "delai", why: "Dernier don récent : pour un don de sang total, il faut en général attendre 3 à 4 mois." },
      { value: "3_4m", label: "Il y a 3 à 4 mois", outcome: "delai", why: "Pour une femme, le délai indicatif après un don de sang total est de 4 mois." }, { value: "plus4m", label: "Il y a plus de 4 mois", outcome: "ok" }] },
  { id: "sexe", text: "Vous êtes…", help: "Sert seulement à appliquer le bon délai entre deux dons.", showIf: (a) => a.quand === "3_4m",
    choices: [{ value: "h", label: "Un homme", outcome: "ok" }, { value: "f", label: "Une femme", outcome: "delai", why: "Délai indicatif de 4 mois après un don de sang total pour une femme." }] },
  { id: "grossesse", text: "Êtes-vous enceinte, avez-vous accouché ou eu une fausse couche ou une interruption de grossesse il y a moins de 6 mois, ou allaitez-vous ?", help: "L'OMS recommande de ne pas donner pendant la grossesse, jusqu'à 6 mois après et pendant l'allaitement.",
    choices: [{ value: "non", label: "Non / ne me concerne pas", outcome: "ok" }, { value: "oui", label: "Oui", outcome: "delai", why: "Grossesse, accouchement récent ou allaitement : un délai est nécessaire." }] },
  { id: "sante", text: "Aujourd'hui, vous sentez-vous en bonne santé ?", help: "Question proposée, à valider par le CNTS.",
    choices: [{ value: "oui", label: "Oui", outcome: "ok" }, { value: "non", label: "Non, je suis malade, fiévreux ou fatigué", outcome: "delai", why: "État de santé du jour : attendez d'être rétabli et demandez conseil." }] },
  { id: "traitement", text: "Prenez-vous un traitement ou êtes-vous suivi pour une maladie ?", help: "Question proposée, à valider par le CNTS.",
    choices: [{ value: "non", label: "Non", outcome: "ok" }, { value: "oui", label: "Oui", outcome: "conseil", why: "Traitement ou maladie suivie : seul un professionnel peut dire si le don est possible." }] },
  { id: "effort", text: "Pourrez-vous éviter les efforts intenses dans les 24 heures après le don ?", help: "L'OMS et l'EFS conseillent d'éviter les activités physiques intenses dans les 24 heures qui suivent.",
    choices: [{ value: "oui", label: "Oui", outcome: "ok" }, { value: "non", label: "Non (travail physique, sport, conduite professionnelle…)", outcome: "conseil", why: "Activité dans les 24 h : choisissez un autre jour ou parlez-en au centre." }] },
];

export function evaluate(answers: Record<string, string>) {
  let outcome: Outcome = "ok";
  const reasons: string[] = [];
  for (const q of QUESTIONS) {
    if (q.showIf && !q.showIf(answers)) continue;
    const c = q.choices.find((x) => x.value === answers[q.id]);
    if (!c) continue;
    outcome = worst(outcome, c.outcome);
    if (c.why) reasons.push(c.why);
  }
  return { outcome, reasons };
}

/** Conseils avant et après le don (sources citées). */
export const BEFORE_TIPS = [
  { text: "Buvez bien dans les 24 heures avant le don et ne venez pas à jeun.", src: SOURCE_EFS },
  { text: "Si vous êtes à jeun, buvez au moins dans les 4 heures qui précèdent le don.", src: SOURCE_OMS },
];
export const AFTER_TIPS = [
  { title: "Hydratation", text: "Buvez suffisamment après le don : votre corps reconstitue le volume de sang grâce à l'eau que vous buvez. Une collation un peu salée aide aussi.", src: SOURCE_EFS },
  { title: "Repos", text: "Restez assis environ 20 minutes avant de partir, le temps de la collation.", src: SOURCE_EFS },
  { title: "Efforts", text: "Évitez les activités physiques intenses dans les 24 heures qui suivent le don, et évitez de fumer.", src: SOURCE_OMS },
  { title: "En cas de malaise", text: "Fatigue soudaine, « tête vide », bouffées de chaleur ou sensation de froid, nausées : asseyez-vous, ou allongez-vous les jambes surélevées, pour ne pas tomber.", src: SOURCE_EFS },
  { title: "Reprise des activités", text: "Reprenez vos activités progressivement ; ne conduisez pas si vous vous sentez faible.", src: SOURCE_EFS },
];
export const EVENT_KINDS: Record<string, string> = { malaise: "Malaise", vertiges: "Vertiges", fatigue: "Fatigue inhabituelle", point_prelevement: "Réaction au point de piqûre (bleu, douleur, gonflement)", autre: "Autre événement" };
