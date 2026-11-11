import { ModulePage, type Reference } from "@/components/health/module-page";
export const metadata = { title: "Nutrition", description: "Repères officiels de l'OMS pour une alimentation saine, fiches validées par des professionnels et professionnels de santé au Mali." };
export const revalidate = 600;

const OMS = { label: "OMS — Alimentation saine, aide-mémoire", url: "https://www.who.int/fr/news-room/fact-sheets/detail/healthy-diet", date: "mis à jour le 26 janvier 2026" };
const REFERENCES: Reference[] = [
  { title: "Les quatre principes d'une alimentation saine", source: OMS, points: [
    "Suffisance : couvrir, sans excès, les besoins de l'organisme.",
    "Équilibre : l'énergie apportée correspond à l'énergie dépensée.",
    "Modération : limiter ce qui peut nuire à la santé (sel, sucres libres, mauvaises graisses).",
    "Diversité : manger varié, au sein d'un groupe d'aliments et entre les groupes.",
  ] },
  { title: "Fruits, légumes, céréales et légumineuses", source: OMS, points: [
    "Au moins 400 g de fruits et légumes par jour à partir de 10 ans ; au moins 350 g de 6 à 9 ans ; au moins 250 g de 2 à 5 ans.",
    "Les glucides devraient venir surtout des céréales complètes (dont le maïs, le millet, le riz complet), des légumes, des fruits et des légumineuses (haricots, lentilles, pois).",
    "Les jus de fruits, même sans sucre ajouté, contiennent beaucoup de sucres libres : à limiter.",
  ] },
  { title: "Sel", source: OMS, points: [
    "Adultes : moins de 5 g de sel par jour (soit 2 g de sodium).",
    "Une forte consommation de sel est associée à une hausse de la tension artérielle.",
    "Pour en consommer moins : limiter le sel et les bouillons ou cubes ajoutés pendant la cuisson, ne pas resaler à table, limiter les en-cas salés.",
  ] },
  { title: "Sucres et graisses", source: OMS, points: [
    "Sucres libres : moins de 10 % des apports énergétiques, soit environ 50 g (12 cuillères à café rases) pour 2 000 calories par jour ; moins de 5 % apporte des bienfaits supplémentaires.",
    "Ne pas remplacer le sucre par des édulcorants.",
    "Préférer les graisses insaturées (poisson, avocat, huiles de tournesol, de soja, d'olive) aux graisses saturées (viande grasse, beurre, huile de palme, beurre clarifié).",
    "Cuire à la vapeur ou à l'eau plutôt que frire permet de réduire les graisses.",
  ] },
  { title: "Nourrissons et jeunes enfants", source: OMS, points: [
    "Allaitement exclusif au sein pendant les six premiers mois.",
    "Poursuivre l'allaitement jusqu'à deux ans ou au-delà.",
    "À partir de six mois, compléter le lait maternel par des aliments variés, adaptés, sûrs et riches en nutriments, sans ajouter de sel ni de sucre.",
    "De 6 à 23 mois : une alimentation diversifiée avec des aliments d'origine animale (viande, poisson, œufs), des fruits et des légumes ; éviter les boissons sucrées.",
  ] },
];

export default function Page() {
  return <ModulePage slug="nutrition" title="Nutrition" checkedOn="11 novembre 2026" references={REFERENCES}
    intro="Repères officiels pour bien manger au quotidien, et fiches adaptées aux plats et habitudes du Mali dès leur validation par des professionnels de la nutrition."
    links={[["/medecins", "Trouver un médecin ou un nutritionniste"], ["/ma-sante/mesures", "Noter ma tension et ma glycémie"], ["/prevention", "Campagnes de prévention"], ["/questions-pharmacien", "Poser une question à un pharmacien"]]} />;
}
