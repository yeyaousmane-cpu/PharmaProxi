export const metadata = { title: "Méthode — Autorités", robots: { index: false } };

export default function Methode() {
  const rules = [
    ["Chiffres agrégés uniquement", "Aucun nom, aucun numéro, aucune recherche individuelle. Une case qui compte moins de 10 recherches ou personnes n'est pas affichée (« moins de 10 »), pour qu'aucune personne ne puisse être reconnue, même dans une petite ville."],
    ["Jamais de données personnelles de santé", "Le dossier santé, le suivi Femme, les traitements, les mesures de tension et de glycémie, les carnets de vaccination et la croissance des enfants n'entrent jamais dans les statistiques, même de façon anonyme. Les utilisateurs en sont les seuls lecteurs."],
    ["D'où viennent les chiffres", "Des recherches de médicaments (enregistrées sans identité), des pharmacies vérifiées (stocks, prix, gardes), des questions posées aux pharmaciens (comptées par catégorie), des lectures de fiches (compteur par jour) et des inscriptions volontaires au don de sang."],
    ["Accès réservé et journalisé", "Seules les personnes désignées par l'administration de SantéProxi, dans le cadre d'une convention écrite, ont accès à cet espace. Chaque consultation est enregistrée (qui, quand, quel tableau, quels filtres)."],
    ["Signalements de médicaments", "Réservés au ministère, à la DPM et à l'Ordre des pharmaciens. L'identité de la personne qui signale n'est jamais affichée ; son téléphone seulement si elle a accepté d'être recontactée. Rien n'est publié."],
    ["Limites", "Les utilisateurs de SantéProxi ne représentent pas toute la population (surtout des utilisateurs de smartphone, plutôt en ville). « Sans résultat » ne veut pas forcément dire « en rupture » : stocks non mis à jour, faute de frappe… Ce sont des signaux à vérifier, qui complètent le système national d'information sanitaire (DHIS2) sans le remplacer."],
  ];
  return (
    <div className="max-w-3xl space-y-3">
      {rules.map(([t, d]) => <section key={t} className="rounded-2xl border bg-white p-4"><h2 className="font-bold text-brand-deep">{t}</h2><p className="mt-1 text-sm">{d}</p></section>)}
    </div>
  );
}
