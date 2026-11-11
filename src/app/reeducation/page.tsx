import { ModulePage, type Reference } from "@/components/health/module-page";
export const metadata = { title: "Rééducation", description: "Réadaptation : repères officiels de l'OMS, structures d'appareillage au Mali, fiches validées et professionnels." };
export const revalidate = 600;

const OMS = { label: "OMS — Réadaptation, aide-mémoire", url: "https://www.who.int/fr/news-room/fact-sheets/detail/rehabilitation", date: "22 avril 2024" };
const CICR = { label: "CICR — Mali : le CESOP, un pas vers l'autonomisation en matière de réadaptation physique", url: "https://www.icrc.org/fr/article/mali-le-cesop-un-pas-vers-lautonomisation-en-matiere-de-readaptation-physique", date: "27 mai 2025" };
const REFERENCES: Reference[] = [
  { title: "Qu'est-ce que la réadaptation ?", source: OMS, points: [
    "Elle aide un enfant, un adulte ou une personne âgée à être aussi indépendant que possible dans les activités quotidiennes : étudier, travailler, avoir des loisirs, s'occuper de sa famille.",
    "Tout le monde peut en avoir besoin un jour : après une blessure, une opération, une maladie, ou quand les capacités diminuent avec l'âge.",
    "Elle ne s'adresse pas seulement aux personnes handicapées et n'est pas un service de luxe : elle doit commencer dès que le problème est détecté.",
  ] },
  { title: "Quelques exemples", source: OMS, points: [
    "Orthophonie pour retrouver la parole après une lésion du cerveau.",
    "Exercices pour la force, les mouvements et l'équilibre après un AVC.",
    "Aménagement du domicile d'une personne âgée pour éviter les chutes.",
    "Préparation à une prothèse après une amputation, puis fabrication, pose et ajustement de la prothèse.",
    "Apprentissage de la canne blanche après une perte de la vue.",
  ] },
  { title: "Qui assure la réadaptation ?", source: OMS, points: [
    "Kinésithérapeutes, ergothérapeutes, orthophonistes, audiologistes, prothésistes et orthésistes, psychologues cliniciens, médecins de médecine physique et de réadaptation, personnel infirmier.",
    "Le médecin généraliste et les agents de santé communautaires jouent aussi un rôle, notamment pour orienter.",
    "Elle se fait à l'hôpital, en centre, ou au sein de la communauté : à l'école, à domicile, au travail.",
  ] },
  { title: "Appareillage orthopédique au Mali", source: CICR, points: [
    "Le Centre National d'Appareillage Orthopédique du Mali (CNAOM) et ses antennes régionales assurent l'appareillage (orthèses, prothèses).",
    "Selon le CNAOM, cité par le CICR, le pays compte huit centres d'appareillage, dont cinq fonctionnels, et une quinzaine d'orthoprothésistes.",
    "Depuis 2022, une licence professionnelle en sciences des orthèses et prothèses forme des orthoprothésistes au Mali ; le Centre d'Excellence en Sciences des Orthèses et Prothèses (CESOP) a été inauguré le 25 avril 2025.",
  ] },
];

export default function Page() {
  return <ModulePage slug="reeducation" title="Rééducation" checkedOn="11 novembre 2026" references={REFERENCES}
    intro="Kinésithérapie, réadaptation après un accident ou une opération, orthophonie, appareillage et accompagnement du handicap."
    links={[["/medecins", "Trouver un professionnel"], ["/cliniques", "Cliniques et centres"], ["/centres-specialises", "Centres spécialisés"], ["/infirmiers", "Soins à domicile"]]} />;
}
