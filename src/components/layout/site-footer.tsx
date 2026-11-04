import Link from "next/link";
import { SimpleToggle } from "@/components/simple/simple-toggle";
import { ProOnly } from "@/components/pro/pro-only";

export function SiteFooter({ simple = false }: { simple?: boolean }) {
  return (
    <footer className="mt-16 border-t bg-white pb-20 md:pb-0 print:hidden">
      <div className="container-page grid gap-6 py-8 text-sm sm:grid-cols-3">
        <div>
          <p className="font-bold text-brand-deep">PharmaProxi</p>
          <p className="mt-1 text-muted-foreground">Votre pharmacie, plus proche de vous.</p>
          <p className="mt-3 text-xs text-muted-foreground">
            Service de mise en relation. Ne remplace pas l&apos;avis d&apos;un professionnel de santé. En cas d&apos;urgence, contactez les services d&apos;urgence.
          </p>
          <SimpleToggle on={simple} className="mt-3" />
        </div>
        <nav aria-label="Informations" className="flex flex-col gap-2">
          <Link prefetch={false} href="/pharmacies" className="hover:underline">Annuaire des pharmacies</Link>
          <Link prefetch={false} href="/sante" className="hover:underline">Santé essentielle</Link>
          <Link prefetch={false} href="/assistant" className="hover:underline">Assistant santé</Link>
          <Link prefetch={false} href="/questions-pharmacien" className="hover:underline">Questions à un pharmacien</Link>
          <Link prefetch={false} href="/premiers-secours" className="hover:underline">Premiers secours</Link>
          <Link prefetch={false} href="/comparer" className="hover:underline">Génériques et prix</Link>
          <Link prefetch={false} href="/femme" className="hover:underline">PharmaProxi Femme</Link>
          <Link prefetch={false} href="/infirmiers" className="hover:underline">Infirmiers et soins à domicile</Link>
          <Link prefetch={false} href="/garde" className="hover:underline">Pharmacies de garde</Link>
          <Link prefetch={false} href="/amo" className="hover:underline">AMO : médicaments pris en charge</Link>
          <Link prefetch={false} href="/amo/guide" className="hover:underline">AMO et INPS : le guide</Link>
          <Link prefetch={false} href="/droits" className="hover:underline">Vos droits et votre santé</Link>
          <Link prefetch={false} href="/assurances" className="hover:underline">Assurances santé : réseaux de soins</Link>
          <Link prefetch={false} href="/ma-sante" className="hover:underline">Ma santé : vaccins, traitements, tension</Link>
          <Link prefetch={false} href="/ma-sante/dossier" className="hover:underline">Mon dossier santé</Link>
          <Link prefetch={false} href="/signaler" className="hover:underline">Signaler un médicament suspect</Link>
          <Link prefetch={false} href="/avis" className="hover:underline">Donner mon avis</Link>
          <Link prefetch={false} href="/don-de-sang" className="hover:underline">Don de sang</Link>
          <Link prefetch={false} href="/alertes" className="hover:underline">Alertes sanitaires</Link>
          <Link prefetch={false} href="/laboratoires" className="hover:underline">Laboratoires et examens</Link>
          <Link prefetch={false} href="/urgences" className="hover:underline">Urgences</Link>
          <Link prefetch={false} href="/carte" className="hover:underline">Carte</Link>
          <Link prefetch={false} href="/infos/securite" className="hover:underline">Bon usage et sécurité</Link>
          <Link prefetch={false} href="/infos/confidentialite" className="hover:underline">Confidentialité</Link>
          <Link prefetch={false} href="/infos/conditions" className="hover:underline">Conditions d&apos;utilisation</Link>
          <Link prefetch={false} href="/infos/contact" className="hover:underline">Contact</Link>
        </nav>
        <nav aria-label="Professionnels" className="flex flex-col gap-2">
          <ProOnly>
            <p className="font-semibold text-brand-deep">Professionnels de santé</p>
            <Link prefetch={false} href="/pharmacien/inscription" className="hover:underline">Inscrire ma pharmacie</Link>
            <Link prefetch={false} href="/medecin/inscription" className="hover:underline">Référencer ma pratique (médecins)</Link>
            <Link prefetch={false} href="/clinique/inscription" className="hover:underline">Inscrire une clinique</Link>
            <Link prefetch={false} href="/laboratoire/inscription" className="hover:underline">Espace laboratoire</Link>
            <Link prefetch={false} href="/livraison" className="hover:underline">Devenir livreur</Link>
            <Link prefetch={false} href="/autorites" className="hover:underline">Espace Autorités</Link>
            <Link prefetch={false} href="/partenaires/api" className="hover:underline">API pour les partenaires</Link>
          </ProOnly>
          <Link prefetch={false} href="/fonctionnement" className="hover:underline">Comment ça marche ?</Link>
        </nav>
      </div>
      <div className="border-t">
        <p className="container-page py-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} PharmaProxi · Projet porté et édité par{" "}
          <span className="font-semibold text-brand-deep">Yéya Ousmane Touré</span>
        </p>
      </div>
      <div className="mali-stripe h-1" aria-hidden />
    </footer>
  );
}
