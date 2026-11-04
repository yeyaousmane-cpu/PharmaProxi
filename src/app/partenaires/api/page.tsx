import Link from "next/link";
import { Code2 } from "lucide-react";

export const metadata = { title: "API pour les partenaires", description: "API publique en lecture seule de PharmaProxi : annuaire des pharmacies, gardes, laboratoires et examens." };

const EP = [
  ["/api/v1/pharmacies", "Annuaire des pharmacies", "q (nom), region, commune (identifiants), lat et lng (tri par distance), inscrites=1, limit (≤ 100), offset"],
  ["/api/v1/garde", "Pharmacies de garde maintenant", "region, commune, lat, lng, semaine=1 pour les 7 prochains jours"],
  ["/api/v1/laboratoires", "Laboratoires, analyses et prix", "q, region, examen (identifiant d'une analyse : renvoie le prix déclaré par chaque laboratoire), limit, offset"],
  ["/api/v1/examens", "Catalogue des analyses et examens", "aucun"],
];

export default function ApiDoc() {
  return (
    <div className="container-page max-w-3xl space-y-5 py-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><Code2 className="size-7 text-brand-blue" aria-hidden /> API pour les partenaires</h1>
      <p className="text-muted-foreground">Une API REST en lecture seule permet aux partenaires (structures de santé, assureurs, applications, chercheurs) de réutiliser les données publiques de l&apos;annuaire : pharmacies, gardes, laboratoires, analyses et prix déclarés.</p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li>Sans clé, réponses en JSON, 60 requêtes par minute et par adresse.</li>
        <li><strong>Aucune donnée personnelle ni de santé</strong> : pas de comptes, pas de commandes, pas de dossier santé, pas de recherches individuelles.</li>
        <li>Chaque établissement porte un identifiant PharmaProxi stable (PP-PH-…, PP-LB-…, PP-ET-…, PP-MD-…). Il ne remplace pas les identifiants des référentiels officiels ; une correspondance pourra être ajoutée avec les autorités.</li>
        <li>Réutilisation autorisée en citant « PharmaProxi » et la date de consultation. Les disponibilités et prix doivent être confirmés auprès de l&apos;établissement.</li>
      </ul>
      <div className="space-y-3">{EP.map(([path, title, params]) => (
        <section key={path} className="rounded-2xl border bg-white p-4 text-sm">
          <p className="font-semibold text-brand-deep">{title}</p>
          <p className="mt-1 font-mono text-xs"><span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">GET</span> {path}</p>
          <p className="mt-1 text-muted-foreground">Paramètres : {params}</p>
        </section>))}</div>
      <pre className="overflow-x-auto rounded-xl bg-brand-deep p-4 text-xs text-white">{`curl "https://pharma-proxi.vercel.app/api/v1/garde"`}</pre>
      <p className="text-sm text-muted-foreground">Description lisible par machine : <Link prefetch={false} href="/api/v1" className="text-primary underline">/api/v1</Link>. Les échanges de données de santé entre systèmes (dossiers, résultats d&apos;analyses) suivront la norme HL7 FHIR lorsqu&apos;un partenaire officiel le demandera ; ils ne passent pas par cette API publique. Pour un accès étendu ou une convention, écrivez-nous depuis la page <Link prefetch={false} href="/infos/contact" className="text-primary underline">Contact</Link>.</p>
    </div>
  );
}
